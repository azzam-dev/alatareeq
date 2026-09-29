import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { EngineMode, Priority, Reminder } from '../../../src/core/types';
import { useEngine } from '../services/engine';
import { store, useStore } from '../state/store';
import { formatWhen, isLater, isOverdue, placeWithBranch, PRIORITY_LABEL, reminderMeta } from './format';
import { Btn, ScreenHeader, SectionHead, Seg } from './parts';
import { draftFromReminder, type Draft } from './ReminderEditor';
import { addSamples } from './samples';
import { C, ROW, S } from './theme';

const MODE_TEXT: Record<EngineMode, string> = {
  driving: 'نراقب طريقك',
  approaching: 'نقيّم مكان قدامك',
  cooldown: 'بعد تنبيه',
  stationary: 'ننتظر تتحرك',
  idle: 'ما فيه تذاكير مكانية',
};

type SortBy = 'priority' | 'deadline';

const RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };
const PRIORITY_COLOR: Record<Priority, string> = { high: C.bad, normal: C.warn, low: C.mute };

const byPriority = (a: Reminder, b: Reminder) => RANK[a.priority ?? 'normal'] - RANK[b.priority ?? 'normal'];
// بدون موعد آخر شي
const byDeadline = (a: Reminder, b: Reminder) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity);
const newest = (a: Reminder, b: Reminder) => b.createdAt - a.createdAt;
const SORTS: Record<SortBy, (a: Reminder, b: Reminder) => number> = {
  priority: (a, b) => byPriority(a, b) || byDeadline(a, b) || newest(a, b),
  deadline: (a, b) => byDeadline(a, b) || byPriority(a, b) || newest(a, b),
};

/** «مذكرة»: التذاكير اللي بتسويها */
export function NotesScreen({ onEdit, onSettings }: { onEdit: (d: Draft) => void; onSettings: () => void }) {
  const reminders = useStore((s) => s.reminders);
  const status = useEngine();
  const [sortBy, setSortBy] = useState<SortBy>('priority');

  const { now, later } = useMemo(() => {
    const active = reminders.filter((r) => r.status === 'active');
    const sort = SORTS[sortBy];
    return {
      now: active.filter((r) => !isLater(r)).sort(sort),
      later: active.filter((r) => isLater(r)).sort(sort),
    };
  }, [reminders, sortBy]);

  const watching = status.source !== 'none';
  const statusText = status.source === 'test' ? `مشوار تجريبي · ${MODE_TEXT[status.mode]}`
    : status.source === 'gps' ? (status.waitingFix ? 'ننتظر موقعك' : MODE_TEXT[status.mode])
      : 'المراقبة متوقفة';
  const open = (r: Reminder) => onEdit(draftFromReminder(r));

  return (
    <ScrollView contentContainerStyle={S.scroll}>
      <ScreenHeader
        title="مذكرة" onSettings={onSettings}
        sub={<Text style={[S.sub, watching && { color: C.brand, fontWeight: '600' }]}>● {statusText}</Text>}
      />

      {status.gpsError && <Text style={S.note}>{status.gpsError}</Text>}

      {now.length + later.length === 0 ? (
        <View style={[S.card, { alignItems: 'stretch' }]}>
          <Text style={S.h2}>ما عندك تذاكير</Text>
          <Text style={S.sub}>اضغط + وأضف أول تذكير</Text>
          <Btn title="أضف أمثلة" onPress={addSamples} />
        </View>
      ) : (
        <>
          <Seg<SortBy> options={[['priority', 'الأولوية'], ['deadline', 'الموعد']]} value={sortBy} onChange={setSortBy} />
          <Section title="مهم الحين" items={now} onOpen={open} empty="ما فيه شيء حاليًا." />
          {later.length > 0 && <Section title="لاحقًا" items={later} onOpen={open} />}
        </>
      )}
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

function Row({ r, first, onOpen }: { r: Reminder; first: boolean; onOpen: () => void }) {
  const markDone = () => store.updateReminder(r.id, { status: 'done', doneAt: Date.now(), notFoundAt: undefined });
  const overdue = isOverdue(r);
  return (
    <View style={[S.row, styles.row, !first && { borderTopWidth: 1, borderTopColor: C.line }]}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={`تم ${r.title}`}
        onPress={markDone} hitSlop={8} style={styles.check} />
      <Pressable accessibilityRole="button" onPress={onOpen} style={{ flex: 1 }}>
        <View style={[S.row, { gap: 8 }]}>
          <View
            style={[styles.dot, { backgroundColor: PRIORITY_COLOR[r.priority ?? 'normal'] }]}
            accessibilityLabel={`أولوية ${PRIORITY_LABEL[r.priority ?? 'normal']}`}
          />
          <Text style={[S.text, { fontWeight: '600', flex: 1 }]}>{r.title || 'تذكير'}</Text>
        </View>
        {r.notFoundAt && (
          <Text style={[S.sub, { color: C.warn, fontWeight: '600' }]}>
            ما حصلته في {placeWithBranch(r.notFoundAt.place)} · {formatWhen(r.notFoundAt.at)}
          </Text>
        )}
        <Text style={[S.sub, overdue && { color: C.bad, fontWeight: '600' }]}>
          {reminderMeta(r).join(' · ')}
        </Text>
      </Pressable>
      {overdue && (
        // فات موعده وما جبته: ينتقل لـ«تمت» تحت «انتهى موعدها»، وقبلها يبقى هنا وينبّه لو مريت
        <Pressable
          accessibilityRole="button" accessibilityLabel={`انتهى ${r.title}`} hitSlop={8}
          onPress={() => store.updateReminder(r.id, { status: 'done', expiredAt: Date.now(), notFoundAt: undefined })}
          style={({ pressed }) => [styles.expire, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.expireText}>انتهى</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 14, paddingVertical: 12, alignItems: 'flex-start', flexDirection: ROW },
  dot: { width: 10, height: 10, borderRadius: 5 },
  expire: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: C.badSoft },
  expireText: { color: C.bad, fontWeight: '700', fontSize: 13 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: C.line, marginTop: 2 },
});
