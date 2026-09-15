import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { setupNotifications } from './src/services/device';
import { engine, useEngine } from './src/services/engine';
import { store, useStore } from './src/state/store';
import { AlertCard } from './src/ui/AlertCard';
import { GoCheckCard, GoResultToast } from './src/ui/GoCheckCard';
import { LogScreen } from './src/ui/LogScreen';
import { Onboarding } from './src/ui/Onboarding';
import { SettingsScreen } from './src/ui/SettingsScreen';
import { C, ROW, S } from './src/ui/theme';
import { TodayScreen } from './src/ui/TodayScreen';

type Tab = 'today' | 'log' | 'settings';

const TABS: [Tab, string][] = [['today', 'اليوم'], ['log', 'السجل'], ['settings', 'الإعدادات']];

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
  const { alerts } = useEngine();
  const [tab, setTab] = useState<Tab>('today');

  // رسالة «حصلت / باقي» تحت الشاشة وتختفي لحالها. ما تشارك مكان التنبيه فوق،
  // لأن تنبيه فرع ثاني عن الغرض الباقي يطلع غالبًا فورًا وورا بعض، فكانت تنحجب
  const resultVisible = !!goResult && !pendingGo;
  useEffect(() => {
    if (!resultVisible) return;
    const t = setTimeout(() => store.setGoResult(null), 8000);
    return () => clearTimeout(t);
  }, [resultVisible, goResult]);

  useEffect(() => {
    void store.hydrate();
    engine.init();
    return setupNotifications((alertId, action) => engine.respond(alertId, action));
  }, []);

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

  return (
    <SafeAreaView style={S.screen} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1 }}>
        {tab === 'today' && <TodayScreen />}
        {tab === 'log' && <LogScreen />}
        {tab === 'settings' && <SettingsScreen />}
        {resultVisible && goResult && (
          <View style={styles.resultWrap}>
            <GoResultToast key={goResult.at} result={goResult} />
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

      <SafeAreaView edges={['bottom']} style={styles.tabs}>
        <View style={{ flexDirection: ROW }}>
          {TABS.map(([id, label]) => (
            <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: tab === id }} onPress={() => setTab(id)} style={styles.tab}>
              <Text style={[styles.tabText, tab === id && { color: C.brand, fontWeight: '700' }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  alertWrap: { position: 'absolute', top: 8, left: 12, right: 12, pointerEvents: 'box-none' },
  resultWrap: { position: 'absolute', bottom: 8, left: 12, right: 12, pointerEvents: 'box-none' },
  tabs: { borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.card },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 15, color: C.sub },
});
