import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { expiredReminders, groupDone, groupDoneBy, type DoneGroup, type DoneSort } from '../../../src/core/doneGroups';
import type { Reminder } from '../../../src/core/types';
import { placeCategories } from '../services/places';
import { store, useStore } from '../state/store';
import { formatClock, formatDeadline, formatWhen, placeWithBranch } from './format';
import { ScreenHeader, SectionHead, Seg } from './parts';
import { draftFromReminder, type Draft } from './ReminderEditor';
import { C, S } from './theme';

type SortBy = 'date' | DoneSort;

/**
 * «تمت» بخانتين: «جبتها» مقسّمة «اليوم / أمس» والأقدم بزر، واللي خلص من نفس المكان بنفس الزيارة صف واحد
 * («خبز، صامولي · بنده»)، وتنفرز بالفئة أو بالمكان؛ و«انتهى موعدها وما جبتها» بزر «رجّعها» بالأحدث دائمًا.
 */
export function DoneScreen({ onEdit, onSettings }: { onEdit: (d: Draft) => void; onSettings: () => void }) {
  const reminders = useStore((s) => s.reminders);
  const [showOlder, setShowOlder] = useState(false);
  // ما ينحفظ: كل ما تفتح «تمت» يبدأ بالتاريخ
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const days = useMemo(() => groupDone(reminders, Date.now()), [reminders]);
  const sections = useMemo(() => (sortBy === 'date' ? [] : groupDoneBy(reminders, sortBy, placeCategories)), [reminders, sortBy]);
  const expired = useMemo(() => expiredReminders(reminders), [reminders]);
  const count = days.today.length + days.yesterday.length + days.older.length;
  const open = (r: Reminder) => onEdit(draftFromReminder(r));

  return (
    <ScrollView contentContainerStyle={S.scroll}>
      <ScreenHeader title="تمت" onSettings={onSettings} />
      <SectionHead title="جبتها" count={count || undefined} />
      {count === 0 ? (
        <View style={S.card}>
          <Text style={S.sub}>اللي تخلّصه يطلع هنا.</Text>
        </View>
      ) : (
        <>
          <Seg<SortBy> options={[['date', 'التاريخ'], ['category', 'الفئة'], ['place', 'المكان']]} value={sortBy} onChange={setSortBy} />
          {sortBy === 'date' ? (
            <View style={[S.card, { padding: 0, gap: 0 }]}>
              <DoneDay label="اليوم" groups={days.today} onOpen={open} />
              <DoneDay label="أمس" groups={days.yesterday} onOpen={open} />
              {days.older.length > 0 && (showOlder ? (
                <DoneDay label="الأقدم" groups={days.older} onOpen={open} />
              ) : (
                <Pressable accessibilityRole="button" onPress={() => setShowOlder(true)} style={styles.more}>
                  <Text style={[S.sub, { color: C.brand, fontWeight: '600' }]}>عرض الأقدم ({days.older.length})</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            // بالفئة والمكان تطلع كل الأغراض، وتحت كل صف اليوم والساعة لأن الأقسام مو بالأيام
            <View style={[S.card, { padding: 0, gap: 0 }]}>
              {sections.map((s) => (
                <View key={s.key}>
                  <Text style={[S.sub, styles.dayLabel]}>{s.place ? placeWithBranch(s.place) : s.title}</Text>
                  {s.groups.map((g) => (
                    <DoneRow
                      key={g.key} g={g} onOpen={open}
                      meta={[sortBy === 'category' ? g.place?.name : '', g.at ? formatWhen(g.at) : ''].filter(Boolean).join(' · ')}
                    />
                  ))}
                </View>
              ))}
            </View>
          )}
        </>
      )}
      {expired.length > 0 && (
        <>
          <SectionHead title="انتهى موعدها وما جبتها" count={expired.length} />
          <View style={[S.card, { padding: 0, gap: 0 }]}>
            {expired.map((r, i) => <ExpiredRow key={r.id} r={r} first={i === 0} onOpen={() => open(r)} />)}
          </View>
        </>
      )}
    </ScrollView>
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

function DoneRow({ g, onOpen, meta: metaText }: { g: DoneGroup; onOpen: (r: Reminder) => void; meta?: string }) {
  const undo = () => store.updateReminders(g.reminders.map((r) => r.id), () => ({ status: 'active', doneAt: undefined, donePlace: undefined }));
  const meta = metaText ?? [g.place?.name, g.at ? formatClock(g.at) : ''].filter(Boolean).join(' · ');
  return (
    <View style={[S.row, styles.row]}>
      <Pressable
        accessibilityRole="checkbox" accessibilityState={{ checked: true }} accessibilityLabel={`رجّع ${g.title}`}
        onPress={undo} hitSlop={10} style={styles.check}
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

function ExpiredRow({ r, first, onOpen }: { r: Reminder; first: boolean; onOpen: () => void }) {
  // يرجع لـ«مذكرة» بنفس الموعد، فيطلع أحمر لين يعدّل الموعد أو يشيله
  const restore = () => store.updateReminder(r.id, { status: 'active', expiredAt: undefined });
  const meta = [r.deadline ? `موعدها ${formatDeadline(r.deadline)}` : '', r.expiredAt ? `انتهت ${formatWhen(r.expiredAt)}` : '']
    .filter(Boolean).join(' · ');
  return (
    <View style={[S.row, styles.row, first && { borderTopWidth: 0 }]}>
      <Pressable accessibilityRole="button" onPress={onOpen} style={{ flex: 1 }}>
        <Text style={[S.text, { color: C.sub }]} numberOfLines={1}>{r.title || 'تذكير'}</Text>
        {!!meta && <Text style={[S.sub, { fontSize: 12 }]} numberOfLines={1}>{meta}</Text>}
      </Pressable>
      <Pressable
        accessibilityRole="button" accessibilityLabel={`رجّع ${r.title}`} hitSlop={8} onPress={restore}
        style={({ pressed }) => [styles.restore, pressed && { opacity: 0.6 }]}
      >
        <Text style={{ color: C.brand, fontWeight: '700', fontSize: 13 }}>رجّعها</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  restore: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: C.brandSoft },
  check: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  dayLabel: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 2, fontWeight: '700' },
  row: { paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line },
  more: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line },
});
