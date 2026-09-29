import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { engine, type ActiveAlert } from '../services/engine';
import { C, ROW } from './theme';

interface Action { action: string; label: string }

const ACTIONS: Action[] = [{ action: 'go', label: 'اذهب' }, { action: 'done', label: 'تم' }, { action: 'no', label: 'لا' }];
/** «لا» تفرّق بين إنك ما تبي هالمحل، وإنك ما تبي تخلّص الغرض بهالمشوار أصلًا */
const NO_ACTIONS: Action[] = [
  { action: 'notHere', label: 'مو هذا المحل' }, { action: 'later', label: 'مو بهالمشوار' }, { action: 'back', label: 'رجوع' },
];

export function AlertCard({ alert, queued = 0 }: { alert: ActiveAlert; queued?: number }) {
  const [why, setWhy] = useState(false);
  const [no, setNo] = useState(false);
  const bg = C.sign;
  const press = (action: string) => {
    if (action === 'no' || action === 'back') setNo(action === 'no');
    else engine.respond(alert.id, action);
  };
  return (
    <View style={[styles.sign, { backgroundColor: bg }]} accessibilityRole="alert" accessibilityLabel={`${alert.label}: ${alert.title}`}>
      <View style={[styles.line, { justifyContent: 'space-between' }]}>
        <Text style={styles.label}>{alert.label}{queued > 0 ? ` · +${queued} بالانتظار` : ''}</Text>
        {alert.why && (
          <Pressable accessibilityRole="button" onPress={() => setWhy((v) => !v)} hitSlop={10}>
            <Text style={[styles.label, { textDecorationLine: 'underline' }]}>ليش؟</Text>
          </Pressable>
        )}
      </View>
      <View style={[styles.line, { justifyContent: 'space-between', alignItems: 'baseline' }]}>
        <Text style={styles.name}>{alert.title}</Text>
        {alert.distanceText && <Text style={styles.dist}>{alert.distanceText}</Text>}
      </View>
      <Text style={styles.sub}>{alert.sub}</Text>
      {why && alert.why && <Text style={styles.why}>{alert.why}</Text>}
      <View style={[styles.line, styles.actions]}>
        {(no ? NO_ACTIONS : ACTIONS).map((a, i) => (
          <Pressable key={a.action} accessibilityRole="button" onPress={() => press(a.action)}
            style={({ pressed }) => [styles.action, i === 0 && styles.actionMain, pressed && { opacity: 0.8 }]}>
            <Text style={[styles.actionText, i === 0 && { color: bg }]}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const rtl = { textAlign: 'right', writingDirection: 'rtl' } as const;

const styles = StyleSheet.create({
  sign: { borderRadius: 16, padding: 14, gap: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  line: { flexDirection: ROW, gap: 10 },
  label: { ...rtl, color: '#FFFFFF', opacity: 0.9, fontSize: 13 },
  name: { ...rtl, color: '#FFFFFF', fontSize: 25, fontWeight: '700', flexShrink: 1 },
  dist: { color: '#FFFFFF', fontSize: 25, fontWeight: '700' },
  sub: { ...rtl, color: '#FFFFFF', fontSize: 15, marginBottom: 6 },
  why: { ...rtl, color: '#FFFFFF', fontSize: 13, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 8, overflow: 'hidden', marginBottom: 6 },
  actions: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)', paddingTop: 10 },
  action: { flex: 1, minHeight: 52, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  actionMain: { backgroundColor: '#FFFFFF' },
  actionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
