import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { reminderItems } from '../../../src/core/items';
import { engine } from '../services/engine';
import { store, useStore, type GoResult, type PendingGo } from '../state/store';
import { placeWithBranch } from './format';
import { Btn, HelpTitle } from './parts';
import { C, S } from './theme';

interface Row { key: string; reminderId: string; item: string }

/**
 * بعد «اذهب»: لما يرجع للتطبيق نسأله «خلصت؟» عن كل غرض، حتى لو كانت أغراض داخل تذكير واحد
 * («أشتري خبز وصامولي وزبادي»). اللي ما حصله يرجع للتنبيهات مثل ما كان.
 */
export function GoCheckCard({ pending }: { pending: PendingGo }) {
  const reminders = useStore((s) => s.reminders);
  const rows = useMemo<Row[]>(
    () => reminders
      .filter((r) => pending.reminderIds.includes(r.id) && r.status === 'active')
      .flatMap((r) => reminderItems(r.title).map((item, i) => ({ key: `${r.id}#${i}`, reminderId: r.id, item }))),
    [reminders, pending],
  );
  // يبدأ بدون ولا صح: لو ضغط «حفظ» بسرعة ما ينحسب شيء «حصلته» وهو ما حصله
  const [checked, setChecked] = useState<string[]>([]);

  // خلّصها كلها يدويًا من القائمة، أو انحذفت: ما فيه شيء نسأل عنه
  useEffect(() => {
    if (!rows.length) store.setPendingGo(null);
  }, [rows.length]);

  if (!rows.length) return null;
  const toggle = (key: string) => setChecked((c) => (c.includes(key) ? c.filter((x) => x !== key) : [...c, key]));
  const foundFor = (keys: string[]) => {
    const found: Record<string, string[]> = {};
    for (const r of rows) if (keys.includes(r.key)) (found[r.reminderId] ??= []).push(r.item);
    return found;
  };

  return (
    <View style={styles.card} accessibilityRole="alert">
      <HelpTitle title="رحت له؟" help="اللي ما حصلته يبقى، وننبهك فيه بأي فرع." style={S.sub} />
      <Text style={[S.h2, { fontSize: 21 }]}>{placeWithBranch(pending.place)}</Text>

      {rows.length === 1 ? (
        <>
          <Text style={S.text}>حصلت: {rows[0].item}؟</Text>
          <View style={S.row}>
            <Btn title="تم" kind="primary" flex onPress={() => engine.confirmGo(foundFor([rows[0].key]))} />
            <Btn title="ما تم" flex onPress={() => engine.confirmGo({})} />
          </View>
          <ClosedLink />
        </>
      ) : (
        <>
          <Text style={S.text}>علّم اللي حصلته:</Text>
          {rows.map((r) => {
            const on = checked.includes(r.key);
            return (
              <Pressable key={r.key} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(r.key)}
                style={[S.row, { paddingVertical: 4 }]}>
                <View style={[styles.check, on && styles.checkOn]}>{on && <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>✓</Text>}</View>
                <Text style={[S.text, { flex: 1 }]}>{r.item}</Text>
              </Pressable>
            );
          })}
          <Btn title="حفظ" kind="primary" onPress={() => engine.confirmGo(foundFor(checked))} />
          <ClosedLink />
        </>
      )}
    </View>
  );
}

/** لقى المحل مسكّر نهائيًا: الأغراض تبقى وتنبه عند غيره، والمحل ما ينبه أبد */
function ClosedLink() {
  return (
    <Pressable accessibilityRole="button" hitSlop={8} onPress={() => engine.confirmGo({}, true)} style={{ alignSelf: 'center', paddingTop: 2 }}>
      <Text style={[S.sub, { textDecorationLine: 'underline' }]}>المحل مقفل نهائيًا</Text>
    </Pressable>
  );
}

/** بعد الجواب: وش حصلت ووش باقي */
export function GoResultToast({ result }: { result: GoResult }) {
  return (
    <View style={styles.card} accessibilityRole="alert">
      <Text style={S.sub}>{placeWithBranch(result.place)}</Text>
      {result.done.length > 0 && (
        <Text style={[S.text, { color: C.brand, fontWeight: '700' }]}>✓ حصلت: {result.done.join('، ')}</Text>
      )}
      {result.notDone.length > 0 && (
        <Text style={[S.text, { color: C.warn, fontWeight: '700' }]}>⏳ باقي: {result.notDone.join('، ')}</Text>
      )}
      <Btn title="تمام" onPress={() => store.setGoResult(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: 16, borderWidth: 2, borderColor: C.brand, padding: 14, gap: 8,
    boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
  },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: C.brand, borderColor: C.brand },
});
