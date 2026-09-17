import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { requestNotifications } from '../services/device';
import { engine } from '../services/engine';
import { store } from '../state/store';
import { AlertCard } from './AlertCard';
import { Btn, HelpTitle } from './parts';
import { addSamples } from './samples';
import { S } from './theme';

const DEMO = {
  id: 'demo', kind: 'pass' as const, label: 'على طريقك', title: 'صيدلية', distanceText: '700 م',
  sub: '+2 د · عندك: دواء، شامبو', reminderIds: [], createdAt: 0,
};

export function Onboarding() {
  const [step, setStep] = useState(0);

  const finish = async (samples: boolean) => {
    if (samples && store.get().reminders.length === 0) addSamples();
    store.set((s) => ({ ...s, onboarded: true }));
  };

  const askPermissions = async () => {
    await requestNotifications();
    await engine.startGps();
    setStep(2);
  };

  return (
    <ScrollView contentContainerStyle={[S.scroll, { paddingTop: 24 }]}>
      <Text style={S.h1}>عالطريق</Text>

      {step === 0 && (
        <>
          <Text style={[S.h2, { fontSize: 20 }]}>ننبهك لما يكون محل تحتاجه على طريقك.</Text>
          <View style={{ pointerEvents: 'none' }}><AlertCard alert={DEMO} /></View>
          <Btn title="التالي" kind="primary" onPress={() => setStep(1)} />
        </>
      )}

      {step === 1 && (
        <>
          <HelpTitle
            title="نحتاج صلاحيتين" style={[S.h2, { fontSize: 20 }]}
            help="هذي نسخة تجريبية داخل Expo Go: التنبيه يشتغل والتطبيق مفتوح. التشغيل بالخلفية يجي في المرحلة الجاية."
          />
          <Text style={S.text}>• الموقع: عشان نعرف وش قدامك على الطريق.</Text>
          <Text style={S.text}>• الإشعارات: عشان يوصلك التنبيه ومعه أزرار «اذهب / تم / لاحقًا».</Text>
          <Btn title="اسمح بالصلاحيات" kind="primary" onPress={() => void askPermissions()} />
          <Btn title="بعدين" kind="ghost" onPress={() => setStep(2)} />
        </>
      )}

      {step === 2 && (
        <>
          <Text style={[S.h2, { fontSize: 20 }]}>جرّب بدون ما تسوق</Text>
          <Text style={S.text}>ضيف أمثلة، وشغّل «المشوار التجريبي» من الإعدادات. نمشّيك على شارع العليا بأماكن حقيقية.</Text>
          <Btn title="أضف أمثلة وابدأ" kind="primary" onPress={() => void finish(true)} />
          <Btn title="أبدأ بتذاكيري" onPress={() => void finish(false)} />
        </>
      )}
    </ScrollView>
  );
}
