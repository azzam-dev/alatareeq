import { useState } from 'react';
import { requestNotifications } from '../services/device';
import { store } from '../state/store';
import { AlertSign } from './AlertSign';
import { Icon } from './icons';
import { addSamples } from './samples';

const DEMO = {
  id: 'demo', kind: 'pass' as const, label: 'على طريقك', title: 'صيدلية', distanceText: '700 م',
  sub: '+2 د · عندك: دواء، شامبو', reminderIds: [], createdAt: 0,
};

export function Onboarding({ onDone }: { onDone: (goDrive: boolean) => void }) {
  const [step, setStep] = useState(0);
  const finish = (samples: boolean) => {
    if (samples && store.get().reminders.length === 0) addSamples();
    store.set((s) => ({ ...s, onboarded: true }));
    onDone(samples);
  };

  return (
    <div className="onb" role="dialog" aria-modal="true" aria-label="مرحبا بك في عالطريق">
      <div className="onb-inner">
        <div className="brand">
          <span className="brand-mark"><Icon.drive size={20} /></span>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 22, margin: 0 }}>عالطريق</h1>
        </div>

        {step === 0 && (
          <>
            <h2>مو تطبيق تذكير. يجاوب على سؤال واحد: هل يستاهل أوقف الحين؟</h2>
            <p>تكتب «ذكرني إذا مريت على صيدلية أشتري دواء»، وإحنا ننبهك <strong>بس</strong> لما تكون صيدلية قدامك على طريقك والتحويلة ما تتعدى ٣ دقائق.</p>
            <div className="onb-visual"><AlertSign alert={DEMO} demo /></div>
          </>
        )}

        {step === 1 && (
          <>
            <h2>ما نزعجك</h2>
            <ul>
              <li>نحسب <strong>الوقت الإضافي</strong> الحقيقي، مو المسافة. الصيدلية اللي في الجهة الثانية وتحتاج U-turn ما ننبهك عليها.</li>
              <li>ما نتجاوز <strong>٣ تنبيهات</strong> في المشوار، ونجمع أغراض المكان الواحد في تنبيه واحد.</li>
              <li>كل تنبيه فيه زر <strong>«ليش؟»</strong>، وكل قرار ينحفظ في السجل.</li>
            </ul>
            <p><strong>خصوصيتك:</strong> تذاكيرك على جهازك، بدون حساب ولا سيرفر.</p>
          </>
        )}

        {step === 2 && (
          <>
            <h2>خلّ الصفحة مفتوحة وأنت تسوق</h2>
            <p>هذي نسخة الويب من الـ MVP. تشتغل والصفحة مفتوحة على حامل الجوال، ونبقي الشاشة شغالة وننطق التنبيه.</p>
            <p>تبي تجرب الحين بدون ما تسوق؟ ضيف أمثلة وشغّل <strong>محاكاة مشوار</strong> على شارع العليا بأماكن حقيقية.</p>
            <button className="btn" onClick={() => void requestNotifications()} style={{ alignSelf: 'flex-start' }}>فعّل الإشعارات (اختياري)</button>
          </>
        )}

        <div className="onb-dots" aria-hidden="true">
          {[0, 1, 2].map((i) => <span key={i} className={i === step ? 'on' : ''} />)}
        </div>
        {step < 2 ? (
          <div className="btn-row">
            <button className="btn primary" onClick={() => setStep(step + 1)}>التالي</button>
            <button className="btn ghost" onClick={() => finish(false)}>تخطَّ</button>
          </div>
        ) : (
          <div className="btn-row" style={{ flexDirection: 'column' }}>
            <button className="btn primary block" onClick={() => finish(true)}>أضف أمثلة وجرّب المحاكاة</button>
            <button className="btn block" onClick={() => finish(false)}>أبدأ بتذاكيري</button>
          </div>
        )}
      </div>
    </div>
  );
}
