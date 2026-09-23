import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { targetLabel } from '../src/core/compose';
import { deadlineAlerts } from '../src/core/deadline';
import { joinItems } from '../src/core/items';
import type { Reminder } from '../src/core/types';
import { setupNotifications, syncDeadlineNotifications } from './src/services/device';
import { engine, useEngine } from './src/services/engine';
import { store, useStore } from './src/state/store';
import { AddSheet } from './src/ui/AddSheet';
import { AlertCard } from './src/ui/AlertCard';
import { DoneScreen } from './src/ui/DoneScreen';
import { GoCheckCard, GoResultToast } from './src/ui/GoCheckCard';
import { NotesScreen } from './src/ui/NotesScreen';
import { Onboarding } from './src/ui/Onboarding';
import { deadlineNotification } from './src/ui/format';
import { draftFromReminder, ReminderEditor, type Draft } from './src/ui/ReminderEditor';
import { SettingsScreen } from './src/ui/SettingsScreen';
import { C, ROW, S } from './src/ui/theme';

type Tab = 'notes' | 'done';
type Screen = Tab | 'settings';

export function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  const hydrated = useStore((s) => s.hydrated);
  const onboarded = useStore((s) => s.onboarded);
  const pendingGo = useStore((s) => s.pendingGo);
  const goResult = useStore((s) => s.goResult);
  const reminders = useStore((s) => s.reminders);
  const { alerts } = useEngine();
  const [screen, setScreen] = useState<Screen>('notes');
  // الإعدادات ترجع للتبويب اللي انفتحت منه
  const [lastTab, setLastTab] = useState<Tab>('notes');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [adding, setAdding] = useState(false);
  // `learned`: فيها غرض محله من تفضيل المستخدم
  const [added, setAdded] = useState<{ rs: Reminder[]; learned: boolean } | null>(null);
  const learnNotice = useStore((s) => s.learnNotice);

  // رسالة «حصلت / باقي» تحت الشاشة وتختفي لحالها. ما تشارك مكان التنبيه فوق،
  // لأن تنبيه فرع ثاني عن الغرض الباقي يطلع غالبًا فورًا وورا بعض، فكانت تنحجب
  const resultVisible = !!goResult && !pendingGo;
  useEffect(() => {
    if (!resultVisible) return;
    const t = setTimeout(() => store.setGoResult(null), 8000);
    return () => clearTimeout(t);
  }, [resultVisible, goResult]);

  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(null), 5000);
    return () => clearTimeout(t);
  }, [added]);

  // «بنتذكر» بعد ما تعلّمنا تفضيل، وتختفي لحالها
  useEffect(() => {
    if (!learnNotice) return;
    const t = setTimeout(() => store.setLearnNotice(null), 6000);
    return () => clearTimeout(t);
  }, [learnNotice]);

  useEffect(() => {
    void store.hydrate();
    engine.init();
    return setupNotifications(
      (alertId, action) => engine.respond(alertId, action),
      // إشعار الموعد يفتح «مذكرة»
      () => { setScreen('notes'); setLastTab('notes'); },
    );
  }, []);

  // تنبيهات قبل الموعد تُجدول من جديد بعد ثانية من آخر تغيير في التذاكير
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      void syncDeadlineNotifications(deadlineAlerts(reminders, Date.now()).map(deadlineNotification));
    }, 1000);
    return () => clearTimeout(t);
  }, [hydrated, reminders]);

  // بدون زر «ابدأ مشوار»: أول ما يفتح التطبيق نراقب الموقع لو الصلاحية موجودة
  useEffect(() => {
    if (hydrated && onboarded) void engine.resumeGps();
  }, [hydrated, onboarded]);

  if (!hydrated) {
    return <View style={[S.screen, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={C.brand} /></View>;
  }

  if (!onboarded) {
    return <SafeAreaView style={S.screen}><Onboarding /></SafeAreaView>;
  }

  const openTab = (t: Tab) => { setScreen(t); setLastTab(t); };
  const openSettings = () => setScreen('settings');

  return (
    <SafeAreaView style={S.screen} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1 }}>
        {screen === 'notes' && <NotesScreen onEdit={setDraft} onSettings={openSettings} />}
        {screen === 'done' && <DoneScreen onEdit={setDraft} onSettings={openSettings} />}
        {screen === 'settings' && <SettingsScreen onBack={() => setScreen(lastTab)} />}
        {resultVisible && goResult ? (
          <View style={styles.bottomWrap}>
            <GoResultToast key={goResult.at} result={goResult} />
          </View>
        ) : learnNotice ? (
          <View style={styles.bottomWrap}>
            <View style={styles.toast} accessibilityRole="alert">
              <Text style={[S.text, { color: '#FFFFFF', flex: 1 }]} numberOfLines={2}>
                ✓ بنتذكر: {learnNotice.place.item} ← {targetLabel(learnNotice.place.target)}
              </Text>
              <Pressable
                accessibilityRole="button" hitSlop={10}
                onPress={() => { store.setLearned(learnNotice.key, learnNotice.prev); store.setLearnNotice(null); }}
              >
                <Text style={styles.toastAction}>تراجع</Text>
              </Pressable>
            </View>
          </View>
        ) : added && (
          <View style={styles.bottomWrap}>
            <View style={styles.toast} accessibilityRole="alert">
              <Text style={[S.text, { color: '#FFFFFF', flex: 1 }]} numberOfLines={2}>
                ✓ انضاف: {addedText(added.rs)}{added.learned ? ' · حسب تفضيلك' : ''}
              </Text>
              <Pressable accessibilityRole="button" hitSlop={10} onPress={() => { setDraft(draftFromReminder(added.rs[0])); setAdded(null); }}>
                <Text style={styles.toastAction}>تعديل</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {alerts[0] ? (
        <View style={styles.alertWrap}>
          <AlertCard key={alerts[0].id} alert={alerts[0]} queued={alerts.length - 1} />
        </View>
      ) : pendingGo && (
        // سؤال «خلصت؟» ينتظر لين ما يكون فيه تنبيه وأنت تسوق
        <View style={styles.alertWrap}>
          <GoCheckCard key={pendingGo.alertId} pending={pendingGo} />
        </View>
      )}

      <SafeAreaView edges={['bottom']} style={styles.bar}>
        <View style={{ flexDirection: ROW, alignItems: 'center' }}>
          <TabButton label="مذكرة" glyph="☰" on={screen === 'notes'} onPress={() => openTab('notes')} />
          <View style={styles.plusSlot}>
            <Pressable
              accessibilityRole="button" accessibilityLabel="أضف تذكير" onPress={() => setAdding(true)}
              style={({ pressed }) => [styles.plus, pressed && { transform: [{ scale: 0.94 }] }]}
            >
              <Text style={styles.plusText}>+</Text>
            </Pressable>
          </View>
          <TabButton label="تمت" glyph="✓" on={screen === 'done'} onPress={() => openTab('done')} />
        </View>
      </SafeAreaView>

      {adding && (
        <AddSheet
          onClose={() => setAdding(false)}
          onAdded={(rs, learned) => { setAdding(false); store.setLearnNotice(null); setAdded({ rs, learned }); }}
          onNeedPlace={(d) => { setAdding(false); setDraft(d); }}
        />
      )}
      {draft && <ReminderEditor draft={draft} onClose={() => setDraft(null)} />}
    </SafeAreaView>
  );
}

/** غرض واحد مع محله («خبز · بقالة»)، وأكثر من غرض بأسمائهم بس («خبز، بنادول») */
function addedText(rs: Reminder[]): string {
  return rs.length === 1 ? `${rs[0].title} · ${targetLabel(rs[0].target)}` : joinItems(rs.map((r) => r.title));
}

function TabButton({ label, glyph, on, onPress }: { label: string; glyph: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={onPress} style={styles.tab}>
      <Text style={[styles.tabGlyph, on && { color: C.brand }]}>{glyph}</Text>
      <Text style={[styles.tabText, on && { color: C.brand, fontWeight: '700' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  alertWrap: { position: 'absolute', top: 8, left: 12, right: 12, pointerEvents: 'box-none' },
  // فوق زر + المرفوع عن الشريط
  bottomWrap: { position: 'absolute', bottom: 40, left: 12, right: 12, pointerEvents: 'box-none' },
  bar: { borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.card },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 },
  tabGlyph: { fontSize: 18, color: C.sub, lineHeight: 22 },
  tabText: { fontSize: 13, color: C.sub },
  plusSlot: { width: 84, alignItems: 'center' },
  plus: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center',
    marginTop: -26, borderWidth: 4, borderColor: C.bg, boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
  },
  plusText: { color: '#FFFFFF', fontSize: 32, lineHeight: 36, fontWeight: '600' },
  toast: {
    flexDirection: ROW, alignItems: 'center', gap: 12, backgroundColor: C.ink, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  toastAction: { color: '#FFFFFF', fontWeight: '700', fontSize: 15, textDecorationLine: 'underline' },
});
