import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatDetour, formatDistance } from '../../../src/core/compose';
import { store, useStore, type LogEntry, type LogKind, type Outcome, type Response } from '../state/store';
import { formatWhen } from './format';
import { Btn, Chip, Chips } from './parts';
import { C, S } from './theme';

const KIND: Record<LogKind, { text: string; color: string; bg: string }> = {
  alert: { text: 'نبّه', color: C.brand, bg: C.brandSoft },
  suppressed: { text: 'ما نبّه', color: C.bad, bg: C.badSoft },
  missed: { text: 'مرّينا بدون تنبيه', color: C.sub, bg: C.soft },
  arrive: { text: 'وصول', color: C.brand, bg: C.brandSoft },
  time: { text: 'وقت', color: C.brand, bg: C.brandSoft },
  passed: { text: 'تجاوزت المكان', color: C.warn, bg: C.warnSoft },
  trip: { text: 'مشوار', color: C.sub, bg: C.soft },
};

const RESPONSE: Record<Response, string> = {
  go: 'رحت له', done: 'تم', later: 'لاحقًا', ignored: 'تجاهلته', return: 'ذكرني بالرجعة', no: 'لا',
};

const OUTCOME: Record<Outcome, string> = { done: 'خلصته', partial: 'خلصت بعضه', notDone: 'ما تم' };

type Filter = 'all' | 'alert' | 'no' | 'missed';

export function LogScreen() {
  const log = useStore((s) => s.log);
  const [filter, setFilter] = useState<Filter>('all');

  const shown = useMemo(() => log.filter((e) => {
    if (filter === 'alert') return e.kind === 'alert' || e.kind === 'arrive' || e.kind === 'time';
    if (filter === 'no') return e.kind === 'suppressed';
    if (filter === 'missed') return e.kind === 'missed';
    return true;
  }), [log, filter]);

  // مقاييس البيتا من الخطة
  const m = useMemo(() => {
    const alerts = log.filter((e) => e.kind === 'alert');
    const answered = alerts.filter((e) => e.response);
    const useful = answered.filter((e) => e.response === 'go' || e.response === 'done').length;
    const ignored = answered.filter((e) => e.response === 'ignored').length;
    const missed = log.filter((e) => e.kind === 'missed').length;
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
    return { useful: pct(useful, answered.length), ignored: pct(ignored, answered.length), missed: pct(missed, missed + alerts.length) };
  }, [log]);

  const clear = () => Alert.alert('نمسح السجل كله؟', undefined, [
    { text: 'لا', style: 'cancel' },
    { text: 'امسح', style: 'destructive', onPress: () => store.clearLog() },
  ]);

  return (
    <ScrollView contentContainerStyle={S.scroll}>
      <View style={[S.row, { justifyContent: 'space-between' }]}>
        <Text style={S.h1}>سجل القرارات</Text>
        {log.length > 0 && <Btn title="امسح" kind="ghost" onPress={clear} />}
      </View>
      <Text style={S.sub}>كل مرة قررنا ننبهك أو لا، مع السبب. منه نضبط العتبات: ليش نبهني، وليش ما نبهني.</Text>

      <View style={[S.row, { alignItems: 'stretch' }]}>
        <Metric value={m.useful} label="انتهت بـ «اذهب» أو «تم»" target="الهدف: ٥٠٪ أو أكثر" ok={m.useful !== null && m.useful >= 50} />
        <Metric value={m.ignored} label="تنبيهات تجاهلتها" target="الهدف: ٢٠٪ أو أقل" ok={m.ignored !== null && m.ignored <= 20} />
        <Metric value={m.missed} label="مرور بدون تنبيه" target="الهدف: ٣٠٪ أو أقل" ok={m.missed !== null && m.missed <= 30} />
      </View>

      <Chips>
        {([['all', 'الكل'], ['alert', 'نبّه'], ['no', 'ما نبّه'], ['missed', 'مرّينا بدون تنبيه']] as [Filter, string][]).map(([id, label]) => (
          <Chip key={id} label={label} on={filter === id} onPress={() => setFilter(id)} />
        ))}
      </Chips>

      {shown.length === 0 ? (
        <View style={S.card}>
          <Text style={S.h2}>السجل فاضي</Text>
          <Text style={S.sub}>شغّل المشوار التجريبي من «اليوم» وبتشوف هنا كل قرار وسببه.</Text>
        </View>
      ) : (
        shown.map((e) => <Entry key={e.id} e={e} />)
      )}
    </ScrollView>
  );
}

function Metric({ value, label, target, ok }: { value: number | null; label: string; target: string; ok: boolean }) {
  return (
    <View style={[S.card, { flex: 1, padding: 10, gap: 4 }]}>
      <Text style={[S.h2, { fontSize: 20 }]}>{value === null ? '—' : `${value}%`}</Text>
      <Text style={S.sub}>{label}</Text>
      <Text style={[S.sub, { fontSize: 11, color: value === null ? C.sub : ok ? C.brand : C.bad }]}>{target}</Text>
    </View>
  );
}

function Entry({ e }: { e: LogEntry }) {
  const k = KIND[e.kind];
  const details = [
    e.reminderTitles.length ? `عندك: ${e.reminderTitles.join('، ')}` : '',
    e.detourSeconds != null ? `تحويلة ${formatDetour(e.detourSeconds)}${e.approximate ? ' (تقديري)' : ''}` : '',
    e.distance != null ? (e.kind === 'missed' ? `أقرب مسافة ${formatDistance(e.distance)}` : `على بعد ${formatDistance(e.distance)}`) : '',
  ].filter(Boolean).join(' · ');
  return (
    <View style={[S.card, { gap: 6 }]}>
      <View style={[S.row, { flexWrap: 'wrap', gap: 6 }]}>
        <Text style={[styles.tag, { color: k.color, backgroundColor: k.bg }]}>{k.text}</Text>
        {e.placeName && <Text style={[S.text, { fontWeight: '700', flexShrink: 1 }]}>{e.placeName}</Text>}
        {e.sim && <Text style={[styles.tag, { color: C.sub, backgroundColor: C.soft }]}>تجريبي</Text>}
        <Text style={[S.sub, { marginStart: 'auto' }]}>{formatWhen(e.t)}</Text>
      </View>
      <Text style={S.text}>{e.text}</Text>
      {details ? <Text style={S.sub}>{details}</Text> : null}
      {e.response && (
        <Text style={S.sub}>
          ردك: <Text style={{ fontWeight: '700', color: C.ink }}>{RESPONSE[e.response]}{e.outcome ? ` · ${OUTCOME[e.outcome]}` : ''}</Text>
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', writingDirection: 'rtl' },
});
