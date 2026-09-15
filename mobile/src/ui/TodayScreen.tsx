import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatDetour, formatDistance } from '../../../src/core/compose';
import { groupDone, type DoneGroup } from '../../../src/core/doneGroups';
import { cleanTitle } from '../../../src/core/items';
import { parseReminder } from '../../../src/core/parser';
import type { EngineMode, Reminder } from '../../../src/core/types';
import { engine, useEngine, type CandView } from '../services/engine';
import { store, useStore } from '../state/store';
import { formatClock, formatWhen, isLater, placeWithBranch, reminderMeta } from './format';
import { Btn, Chip, Chips, SectionHead } from './parts';
import { draftFromReminder, ReminderEditor, type Draft } from './ReminderEditor';
import { addSamples, EXAMPLES } from './samples';
import { C, ROW, S } from './theme';

const MODE_TEXT: Record<EngineMode, string> = {
  driving: 'نراقب طريقك',
  approaching: 'نقيّم مكان قدامك',
  cooldown: 'بعد تنبيه',
  stationary: 'ننتظر تتحرك',
  idle: 'ما فيه تذاكير مكانية',
};

const CAND_STATUS: Record<CandView['status'], string> = {
  pending: 'نقيّمه',
  alerted: 'نبّهناك',
  rejected: 'ما يستاهل',
  blocked: 'ما نبّهنا',
  passed: 'تجاوزته',
};

const SPEEDS = [1, 5, 10];

export function TodayScreen() {
  const reminders = useStore((s) => s.reminders);
  const status = useEngine();
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mult, setMult] = useState(5);

  const { now, later, done } = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86_400_000;
    const active = reminders.filter((r) => r.status === 'active');
    const byDue = (a: Reminder, b: Reminder) =>
      (a.at ?? a.deadline ?? Infinity) - (b.at ?? b.deadline ?? Infinity) || b.createdAt - a.createdAt;
    return {
      now: active.filter((r) => !isLater(r)).sort(byDue),
      later: active.filter((r) => isLater(r)).sort(byDue),
      done: reminders.filter((r) => r.status === 'done' && (r.doneAt ?? 0) > weekAgo).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)),
    };
  }, [reminders]);

  const submit = () => {
    const raw = text.trim();
    if (!raw) return;
    const p = parseReminder(raw);
    // العنوان بالأغراض بس، والكلام الأصلي يبقى في raw
    setDraft({ title: cleanTitle(p.title), trigger: p.trigger, target: p.target, at: p.at, notBefore: p.notBefore, deadline: p.deadline, raw, parsed: p });
    setText('');
  };

  const pill = status.source === 'test' ? `مشوار تجريبي · ${MODE_TEXT[status.mode]}`
    : status.source === 'gps' ? MODE_TEXT[status.mode]
      : 'المراقبة متوقفة';

  return (
    <ScrollView contentContainerStyle={S.scroll} keyboardShouldPersistTaps="handled">
      <View style={[S.row, { justifyContent: 'space-between' }]}>
        <View>
          <Text style={S.h1}>عالطريق</Text>
          <Text style={S.sub}>هل يستاهل أوقف الحين؟</Text>
        </View>
        <View style={[styles.pill, status.source !== 'none' && { backgroundColor: C.brandSoft }]}>
          <Text style={[styles.pillText, status.source !== 'none' && { color: C.brand }]}>{pill}</Text>
        </View>
      </View>

      {status.gpsError && <Text style={S.note}>{status.gpsError}</Text>}

      <View style={S.card}>
        <Text style={S.h2}>وش تبي تتذكر؟</Text>
        <View style={S.row}>
          <TextInput
            style={[S.input, { flex: 1 }]} value={text} onChangeText={setText} onSubmitEditing={submit}
            returnKeyType="send" placeholder={EXAMPLES[0]} placeholderTextColor={C.sub}
          />
          <Btn title="أضف" kind="primary" onPress={submit} disabled={!text.trim()} />
        </View>
        <Text style={S.sub}>اكتبها زي ما تقولها. وتقدر تضغط المايك في لوحة المفاتيح وتقولها بصوتك.</Text>
        <Text style={[S.sub, { color: C.warn, fontWeight: '600' }]}>
          أكثر من غرض؟ اكتبها كذا: خبز وحليب وبيض
        </Text>
      </View>

      <View style={S.card}>
        <Text style={S.h2}>مشوار تجريبي</Text>
        <Text style={S.sub}>
          نمشّيك على شارع العليا (٧ كم) بأماكن حقيقية، عشان تجرّب التنبيهات وأنت جالس.
          الأماكن حاليًا تجريبية على هالشارع بس، وربط Google يجي بعدين.
        </Text>
        <Chips>
          {SPEEDS.map((s) => (
            <Chip key={s} label={`×${s}`} on={(status.test?.multiplier ?? mult) === s}
              onPress={() => { setMult(s); engine.setTestSpeed(s); }} />
          ))}
        </Chips>
        {status.source === 'test' && status.test ? (
          <>
            <View style={[S.row, { justifyContent: 'space-between' }]}>
              <Text style={S.text}>{Math.round(status.test.progress * 100)}% من المسار</Text>
              <Text style={S.text}>{Math.round(status.speed * 3.6)} كم/س</Text>
              <Text style={S.text}>{status.trip ? `${status.trip.alerts} تنبيهات` : '—'}</Text>
            </View>
            <Btn title="أوقف المشوار التجريبي" kind="danger" onPress={() => engine.stopTest()} />
            {status.candidates.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={[S.sub, { fontWeight: '700' }]}>قدامك</Text>
                {status.candidates.map((c) => (
                  <View key={c.id} style={[S.row, { justifyContent: 'space-between' }]}>
                    <Text style={[S.text, { flex: 1 }]} numberOfLines={1}>{c.name}</Text>
                    <Text style={S.sub}>
                      {formatDistance(c.distance)}{c.detourSeconds != null ? ` · ${formatDetour(c.detourSeconds)}` : ''} · {CAND_STATUS[c.status]}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <Btn title="ابدأ المشوار التجريبي" kind="primary" onPress={() => engine.startTest(mult)} />
        )}
      </View>

      {reminders.length === 0 ? (
        <View style={[S.card, { alignItems: 'stretch' }]}>
          <Text style={S.h2}>ما عندك تذاكير</Text>
          <Text style={S.sub}>اكتب أول تذكير فوق، أو جرّب بأمثلة جاهزة وشغّل المشوار التجريبي.</Text>
          <Btn title="أضف أمثلة" kind="primary" onPress={addSamples} />
        </View>
      ) : (
        <>
          <Section title="مهم الحين" items={now} onOpen={(r) => setDraft(draftFromReminder(r))} empty="ما فيه شيء حاليًا." />
          {later.length > 0 && <Section title="لاحقًا" items={later} onOpen={(r) => setDraft(draftFromReminder(r))} />}
          {done.length > 0 && <DoneSection reminders={done} onOpen={(r) => setDraft(draftFromReminder(r))} />}
        </>
      )}

      {draft && <ReminderEditor draft={draft} onClose={() => setDraft(null)} />}
    </ScrollView>
  );
}

function Section({ title, items, onOpen, empty }: { title: string; items: Reminder[]; onOpen: (r: Reminder) => void; empty?: string }) {
  return (
    <View style={{ gap: 8 }}>
      <SectionHead title={title} count={items.length} />
      {items.length === 0 ? (
        <Text style={S.sub}>{empty}</Text>
      ) : (
        <View style={[S.card, { padding: 0, gap: 0 }]}>
          {items.map((r, i) => <Row key={r.id} r={r} first={i === 0} onOpen={() => onOpen(r)} />)}
        </View>
      )}
    </View>
  );
}

/**
 * «تم» مطوي دائمًا: سطر واحد بالعدد، ولما ينفتح صفوف مختصرة مقسّمة «اليوم / أمس»، والأقدم بزر.
 * اللي خلص من نفس المكان بنفس الزيارة صف واحد («خبز، صامولي · بنده»).
 */
function DoneSection({ reminders, onOpen }: { reminders: Reminder[]; onOpen: (r: Reminder) => void }) {
  const [open, setOpen] = useState(false);
  const [showOlder, setShowOlder] = useState(false);
  const days = useMemo(() => groupDone(reminders, Date.now()), [reminders]);
  const count = days.today.length + days.yesterday.length + days.older.length;
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}
        style={[S.row, { justifyContent: 'space-between', marginTop: 6 }]}
      >
        <Text style={[S.h2, { color: C.sub }]}>✓ تم</Text>
        <Text style={S.sub}>{count} {open ? '▴' : '▾'}</Text>
      </Pressable>
      {open && (
        <View style={[S.card, { padding: 0, gap: 0 }]}>
          <DoneDay label="اليوم" groups={days.today} onOpen={onOpen} />
          <DoneDay label="أمس" groups={days.yesterday} onOpen={onOpen} />
          {days.older.length > 0 && (showOlder ? (
            <DoneDay label="الأقدم" groups={days.older} onOpen={onOpen} />
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setShowOlder(true)} style={styles.doneMore}>
              <Text style={[S.sub, { color: C.brand, fontWeight: '600' }]}>عرض الأقدم ({days.older.length})</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function DoneDay({ label, groups, onOpen }: { label: string; groups: DoneGroup[]; onOpen: (r: Reminder) => void }) {
  if (!groups.length) return null;
  return (
    <>
      <Text style={[S.sub, styles.dayLabel]}>{label}</Text>
      {groups.map((g) => <DoneRow key={g.key} g={g} onOpen={onOpen} />)}
    </>
  );
}

function DoneRow({ g, onOpen }: { g: DoneGroup; onOpen: (r: Reminder) => void }) {
  const undo = () => store.updateReminders(g.reminders.map((r) => r.id), () => ({ status: 'active', doneAt: undefined, donePlace: undefined }));
  const meta = [g.place?.name, g.at ? formatClock(g.at) : ''].filter(Boolean).join(' · ');
  return (
    <View style={[S.row, styles.doneRow]}>
      <Pressable
        accessibilityRole="checkbox" accessibilityState={{ checked: true }} accessibilityLabel={`رجّع ${g.title}`}
        onPress={undo} hitSlop={10} style={[styles.check, styles.checkOn, styles.checkSmall]}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>✓</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => onOpen(g.reminders[0])} style={[S.row, { flex: 1, justifyContent: 'space-between' }]}>
        <Text style={[S.text, { color: C.sub, flexShrink: 1 }]} numberOfLines={1}>{g.title}</Text>
        {!!meta && <Text style={[S.sub, { fontSize: 12 }]} numberOfLines={1}>{meta}</Text>}
      </Pressable>
    </View>
  );
}

function Row({ r, first, onOpen }: { r: Reminder; first: boolean; onOpen: () => void }) {
  const isDone = r.status === 'done';
  const toggle = () => store.updateReminder(r.id, isDone
    ? { status: 'active', doneAt: undefined, donePlace: undefined }
    : { status: 'done', doneAt: Date.now(), notFoundAt: undefined });
  const overdue = r.trigger === 'time' && !isDone && (r.at ?? Infinity) < Date.now();
  return (
    <View style={[S.row, styles.row, !first && { borderTopWidth: 1, borderTopColor: C.line }]}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: isDone }} accessibilityLabel={isDone ? 'رجّعه' : 'تم'}
        onPress={toggle} hitSlop={8} style={[styles.check, isDone && styles.checkOn]}>
        {isDone && <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>✓</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onOpen} style={{ flex: 1 }}>
        <Text style={[S.text, { fontWeight: '600' }, isDone && { textDecorationLine: 'line-through', color: C.sub }]}>{r.title || 'تذكير'}</Text>
        {isDone && r.donePlace && (
          <Text style={[S.sub, { color: C.brand, fontWeight: '600' }]}>
            من {placeWithBranch(r.donePlace)}{r.doneAt ? ` · ${formatWhen(r.doneAt)}` : ''}
          </Text>
        )}
        {!isDone && r.notFoundAt && (
          <Text style={[S.sub, { color: C.warn, fontWeight: '600' }]}>
            ما حصلته في {placeWithBranch(r.notFoundAt.place)} · {formatWhen(r.notFoundAt.at)}
          </Text>
        )}
        <Text style={S.sub}>
          {reminderMeta(r).join(' · ')}
          {overdue ? ' · فات موعده' : ''}
          {r.remindOnReturn && !isDone ? ' · بنذكرك بالرجعة' : ''}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: C.soft, maxWidth: '55%' },
  pillText: { fontSize: 12, color: C.sub, writingDirection: 'rtl', textAlign: 'center' },
  row: { paddingHorizontal: 14, paddingVertical: 12, alignItems: 'flex-start', flexDirection: ROW },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkOn: { backgroundColor: C.brand, borderColor: C.brand },
  checkSmall: { width: 20, height: 20, borderRadius: 10, marginTop: 0 },
  dayLabel: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 2, fontWeight: '700' },
  doneRow: { paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center', borderTopWidth: 1, borderTopColor: C.line },
  doneMore: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line },
});
