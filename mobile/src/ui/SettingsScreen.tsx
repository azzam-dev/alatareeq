import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { formatDetour, formatDistance, targetLabel } from '../../../src/core/compose';
import { DEFAULT_SETTINGS, type Settings } from '../../../src/core/types';
import { confirmDelete, notificationPermission, notify, requestNotifications, showNotice } from '../services/device';
import { TRIALS, type TrialId } from '../mock/trials';
import { engine, useEngine, type CandView } from '../services/engine';
import { undoClosed, useMyClosed } from '../services/closedPlaces';
import { setTripLogOn, useTripLogOn } from '../services/tripLog';
import { store, useStore } from '../state/store';
import { formatClock } from './format';
import { Btn, Chip, Chips, HelpDot, HelpTitle, ScreenHeader, Seg, Stepper, ToggleRow } from './parts';
import { addSamples } from './samples';
import { C, ROW, S } from './theme';

type Perm = 'granted' | 'denied' | 'undetermined';
const PERM_TEXT: Record<Perm, string> = { granted: '✓ مسموح', denied: '✗ مرفوض', undetermined: 'ما انطلب بعد' };
const PERM_COLOR: Record<Perm, string> = { granted: C.brand, denied: C.bad, undetermined: C.sub };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const minutes = (n: number) => (n === 1 ? 'دقيقة' : n === 2 ? 'دقيقتين' : n <= 10 ? `${n} دقائق` : `${n} دقيقة`);
const alerts = (n: number) => (n === 1 ? 'تنبيه واحد' : n === 2 ? 'تنبيهين' : n <= 10 ? `${n} تنبيهات` : `${n} تنبيه`);

/** «23:00» ← الساعة */
const hourOf = (hhmm: string) => Number(hhmm.split(':')[0]) || 0;
const hhmm = (h: number) => `${String((h + 24) % 24).padStart(2, '0')}:00`;
const clock = (hhmmText: string) => formatClock(new Date(2026, 0, 1, hourOf(hhmmText)).getTime());

/** «قدامك» بثلاث خيارات بدل الدرجات */
type Ahead = 'narrow' | 'normal' | 'wide';
const AHEAD_DEG: Record<Ahead, number> = { narrow: 45, normal: 60, wide: 80 };
const AHEAD_HINT: Record<Ahead, string> = {
  narrow: 'ضيّق: اللي قدامك مباشرة بس. تنبيهات أقل.',
  normal: 'عادي: اللي قدامك وقريب من خطك.',
  wide: 'واسع: حتى اللي على جنب شوي. تنبيهات أكثر.',
};
const aheadOf = (deg: number): Ahead => (deg <= 52 ? 'narrow' : deg <= 70 ? 'normal' : 'wide');

const HOW_IT_WORKS = 'تكتب وش تبي («ابي اشتري خبز وحليب»)، ولما يكون محل مناسب على طريقك وما ياخذ من وقتك كثير ننبهك، وتضغط «اذهب» ونفتح لك الخرائط على المحل.';

export function SettingsScreen({ onBack, onTrip }: { onBack: () => void; onTrip: () => void }) {
  const s = useStore((st) => st.settings);
  const set = (patch: Partial<Settings>) => store.setSettings(patch);
  const [notif, setNotif] = useState<Perm>('undetermined');
  const [geo, setGeo] = useState<Perm>('undetermined');
  const [advanced, setAdvanced] = useState(false);

  const refresh = useCallback(async () => {
    setNotif(await notificationPermission());
    try { setGeo((await Location.getForegroundPermissionsAsync()).status as Perm); } catch { /* تجاهل */ }
  }, []);

  useEffect(() => {
    void refresh();
    // لو رجع من إعدادات الجوال نحدّث حالة الصلاحيات
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') void refresh(); });
    return () => sub.remove();
  }, [refresh]);

  const askGeo = async () => {
    if (geo === 'denied') { Linking.openSettings().catch(() => undefined); return; }
    await engine.startGps();
    await refresh();
  };

  const askNotif = async () => {
    if (notif === 'denied') { Linking.openSettings().catch(() => undefined); return; }
    setNotif(await requestNotifications());
  };

  const testNotification = () => {
    void notify({ alertId: 'test', title: 'على طريقك: أسواق التميمي · ٧٠٠ م', body: '+٢ د · عندك: حليب', category: 'pass', forceShow: true }, 5);
    showNotice('بعد ٥ ثواني يطلع إشعار تجريبي', 'تقدر تقفل الشاشة وتشوفه. اسحبه لتحت أو اضغط عليه مطوّل عشان تشوف الأزرار.');
  };

  const reset = () => confirmDelete('نحذف كل التذاكير والإعدادات من هالجوال؟', 'ما تقدر ترجعها بعدين.', () => {
    engine.stop();
    store.resetAll();
  });

  const ahead = aheadOf(s.aheadAngleDeg);

  return (
    <ScrollView contentContainerStyle={S.scroll}>
      <ScreenHeader title="الإعدادات" onBack={onBack} help={HOW_IT_WORKS} />

      <Text style={S.h2}>الصلاحيات</Text>
      <View style={S.card}>
        <PermRow
          label="الموقع" perm={geo} onAsk={() => void askGeo()}
          hint="عشان نعرف وش قدامك على الطريق. يشتغل والتطبيق مفتوح بس حاليًا."
        />
        <PermRow
          label="الإشعارات" perm={notif} onAsk={() => void askNotif()}
          hint="عشان يوصلك التنبيه ومعه أزرار «اذهب / تم / لاحقًا»."
        />
        <Btn title="جرّب إشعار بعد ٥ ثواني" onPress={testNotification} disabled={notif !== 'granted'} />
      </View>

      <Text style={S.h2}>متى ننبهك</Text>
      <View style={S.card}>
        <Stepper
          label="كم دقيقة تتأخر عشان تمر؟" show={`${s.maxDetourMin} د`}
          hint={`لو المحل ياخذ من وقتك أكثر من ${minutes(s.maxDetourMin)} ما ننبهك.`}
          onMinus={() => set({ maxDetourMin: clamp(s.maxDetourMin - 1, 1, 10) })}
          onPlus={() => set({ maxDetourMin: clamp(s.maxDetourMin + 1, 1, 10) })}
        />
        <Stepper
          label="كم تنبيه بالمشوار الواحد؟" show={String(s.maxAlertsPerTrip)}
          hint={`بعد ${alerts(s.maxAlertsPerTrip)} نسكت لين تبدأ مشوار جديد.`}
          onMinus={() => set({ maxAlertsPerTrip: clamp(s.maxAlertsPerTrip - 1, 1, 6) })}
          onPlus={() => set({ maxAlertsPerTrip: clamp(s.maxAlertsPerTrip + 1, 1, 6) })}
        />
      </View>

      <Text style={S.h2}>وقت الراحة</Text>
      <View style={S.card}>
        <ToggleRow
          label="لا تنبهني في وقت معيّن"
          hint={`ما يجيك تنبيه من ${clock(s.quietStart)} إلى ${clock(s.quietEnd)}. المشوار التجريبي ما يتأثر.`}
          value={s.quietEnabled} onChange={(v) => set({ quietEnabled: v })}
        />
        {s.quietEnabled && (
          <>
            <Stepper
              label="يبدأ الساعة" show={clock(s.quietStart)}
              onMinus={() => set({ quietStart: hhmm(hourOf(s.quietStart) - 1) })}
              onPlus={() => set({ quietStart: hhmm(hourOf(s.quietStart) + 1) })}
            />
            <Stepper
              label="ينتهي الساعة" show={clock(s.quietEnd)}
              onMinus={() => set({ quietEnd: hhmm(hourOf(s.quietEnd) - 1) })}
              onPlus={() => set({ quietEnd: hhmm(hourOf(s.quietEnd) + 1) })}
            />
          </>
        )}
      </View>

      <Text style={S.h2}>وقت التنبيه</Text>
      <View style={S.card}>
        <ToggleRow label="اقرأ التنبيه بصوت" value={s.speak} onChange={(v) => set({ speak: v })} />
        <ToggleRow label="اهتزاز" value={s.sound} onChange={(v) => set({ sound: v })} />
      </View>

      <Preferences />
      <ClosedPlaces />

      <TrialTrip />
      <TripLogCard onOpen={onTrip} />

      <Pressable
        accessibilityRole="button" accessibilityState={{ expanded: advanced }} onPress={() => setAdvanced(!advanced)}
        style={[S.row, { justifyContent: 'space-between' }]}
      >
        <Text style={S.h2}>إعدادات متقدمة</Text>
        <Text style={S.sub}>{advanced ? 'إخفاء ▴' : 'عرض ▾'}</Text>
      </Pressable>
      {advanced && (
        <View style={S.card}>
          <View style={{ gap: 6 }}>
            <HelpTitle title="وش يعتبر «قدامك»؟" help={AHEAD_HINT[ahead]} style={S.text} />
            <Seg<Ahead>
              options={[['narrow', 'ضيّق'], ['normal', 'عادي'], ['wide', 'واسع']]}
              value={ahead} onChange={(v) => set({ aheadAngleDeg: AHEAD_DEG[v] })}
            />
          </View>
          <Btn title="رجّع الإعدادات الأصلية" onPress={() => set(DEFAULT_SETTINGS)} />
        </View>
      )}

      <Text style={S.h2}>بياناتك</Text>
      <View style={S.card}>
        <Text style={S.sub}>
          تذاكيرك محفوظة على جوالك بس. وأنت تسوق نرسل لسيرفرنا منطقتك التقريبية (مربع ١٫٥ كم) وأنواع المحلات اللي تحتاجها
          (مثل صيدلية)، مو التذاكير نفسها، عشان نجيب المحلات القريبة. واسم البراند اللي تكتبه يروح للسيرفر عشان نصححه.
        </Text>
        <Btn title="أضف تذاكير أمثلة" onPress={addSamples} />
        <Btn title="احذف كل بياناتي" kind="danger" onPress={reset} />
      </View>

      <Text style={[S.sub, { textAlign: 'center' }]}>عالطريق · تطبيق الجوال · نسخة تجريبية</Text>
    </ScrollView>
  );
}

/** مؤقت للاختبار: يسجّل المشاوير (`services/tripLog.ts`)، وتنعرض في «تفاصيل المشوار» وترتفع لحالها بعد كل مشوار */
function TripLogCard({ onOpen }: { onOpen: () => void }) {
  const on = useTripLogOn();
  return (
    <View style={S.card}>
      <ToggleRow
        label="سجّل مشاويري (للاختبار)"
        hint="نسجّل مسارك والمحلات والتنبيهات عشان تشوفها في «تفاصيل المشوار»، وترتفع لنا بعد كل مشوار عشان نراجعها."
        value={on} onChange={setTripLogOn}
      />
      <Btn title="تفاصيل المشوار" onPress={onOpen} />
    </View>
  );
}

/** محلات بلّغت إنها مقفلة نهائيًا (`services/closedPlaces.ts`)، وترجّعها لو غلطت */
function ClosedPlaces() {
  const mine = useMyClosed();
  const list = useMemo(() => Object.entries(mine).sort((a, b) => b[1].at - a[1].at), [mine]);
  if (!list.length) return null;
  return (
    <>
      <HelpTitle
        title="محلات بلّغت إنها مقفلة"
        help="ما ننبهك عليها. ولما يبلّغ عن المحل ٣ أشخاص ينشال عند الكل. لو غلطت اضغط ✕ ويرجع."
      />
      <View style={S.card}>
        {list.map(([id, r]) => (
          <View key={id} style={[S.row, { justifyContent: 'space-between', gap: 12 }]}>
            <Text style={[S.text, { flex: 1 }]}>{r.name}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`رجّع ${r.name}`} hitSlop={10} onPress={() => undoClosed(id)}>
              <Text style={{ color: C.sub, fontSize: 18, fontWeight: '700' }}>✕</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </>
  );
}

/** «الغرض ← المحل» اللي تعلّمناه من تعديلات المستخدم، ويرجع للافتراضي منها (`src/core/learned.ts`) */
function Preferences() {
  const learned = useStore((st) => st.learned);
  const prefs = useMemo(() => Object.entries(learned).sort((a, b) => b[1].at - a[1].at), [learned]);
  const resetAll = () => confirmDelete('نرجّع كل تفضيلاتك للافتراضي؟', 'الأغراض ترجع لمحلاتها من اختيارنا.', () => store.clearLearned());
  return (
    <>
      <HelpTitle
        title="تفضيلاتك"
        help="لما تغيّر محل غرض في التذكير، نحفظه ونستخدمه المرة الجاية بدل اختيارنا. المحل اللي تكتبه في الجملة («إذا مريت على صيدلية») يغلبه."
      />
      <View style={S.card}>
        {prefs.length === 0 ? (
          <Text style={S.sub}>ما فيه تفضيلات للحين. غيّر محل أي غرض ونحفظه هنا.</Text>
        ) : prefs.map(([key, p]) => (
          <View key={key} style={[S.row, { justifyContent: 'space-between', gap: 12 }]}>
            <Text style={[S.text, { flex: 1 }]}>{p.item} ← {targetLabel(p.target)}</Text>
            <Pressable
              accessibilityRole="button" accessibilityLabel={`رجّع ${p.item} للافتراضي`} hitSlop={10}
              onPress={() => store.setLearned(key, null)}
            >
              <Text style={{ color: C.sub, fontSize: 18, fontWeight: '700' }}>✕</Text>
            </Pressable>
          </View>
        ))}
        {prefs.length > 0 && <Btn title="رجّع الكل للافتراضي" onPress={resetAll} />}
      </View>
    </>
  );
}

function PermRow({ label, hint, perm, onAsk }: { label: string; hint: string; perm: Perm; onAsk: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      <View style={[S.row, { justifyContent: 'space-between' }]}>
        <View style={{ flexDirection: ROW, gap: 8, alignItems: 'center', flex: 1 }}>
          <Text style={[S.text, { fontWeight: '700' }]}>{label}</Text>
          <Text style={[S.sub, { color: PERM_COLOR[perm], fontWeight: '700' }]}>{PERM_TEXT[perm]}</Text>
          <HelpDot open={open} onPress={() => setOpen(!open)} label={label} />
        </View>
        {perm !== 'granted' && <Btn title={perm === 'denied' ? 'افتح الإعدادات' : 'فعّل'} onPress={onAsk} />}
      </View>
      {open && <Text style={S.sub}>{hint}</Text>}
    </View>
  );
}

const SPEEDS = [1, 5, 10];
const CAND_STATUS: Record<CandView['status'], string> = {
  pending: 'نقيّمه',
  alerted: 'نبّهناك',
  rejected: 'ما يستاهل',
  blocked: 'ما نبّهنا',
  passed: 'تجاوزته',
};

/** «جرّب بدون ما تسوق»: مشوار على شارع العليا بأماكن حقيقية، بسرعة تختارها */
function TrialTrip() {
  const status = useEngine();
  const [mult, setMult] = useState(5);
  const [trial, setTrial] = useState<TrialId>('olaya');
  const running = status.source === 'test' && status.test;

  return (
    <View style={[S.card, { borderColor: C.brand, borderWidth: 1.5 }]}>
      <HelpTitle
        title="جرّب بدون ما تسوق"
        help="نمشّيك على شارع العليا في الرياض (٧ كم) أو طريق الملك خالد في بريدة (٨ كم)، والأماكن من TomTom مثل السواقة الحقيقية. أول مرة لكل نوع محل تصرف طلبات قليلة من الرصيد، وبعدها محفوظة."
      />
      <View style={[S.row, { justifyContent: 'space-between' }]}>
        <Text style={S.text}>الطريق</Text>
        <Chips>
          {(Object.keys(TRIALS) as TrialId[]).map((id) => (
            <Chip key={id} label={TRIALS[id].label} on={(status.test?.trial ?? trial) === id}
              onPress={() => { if (!running) setTrial(id); }} />
          ))}
        </Chips>
      </View>
      <View style={[S.row, { justifyContent: 'space-between' }]}>
        <Text style={S.text}>السرعة</Text>
        <Chips>
          {SPEEDS.map((sp) => (
            <Chip key={sp} label={`×${sp}`} on={(status.test?.multiplier ?? mult) === sp}
              onPress={() => { setMult(sp); engine.setTestSpeed(sp); }} />
          ))}
        </Chips>
      </View>
      {running && status.test ? (
        <>
          <View style={[S.row, { justifyContent: 'space-between' }]}>
            <Text style={S.text}>{Math.round(status.test.progress * 100)}% من المسار</Text>
            <Text style={S.text}>{Math.round(status.speed * 3.6)} كم/س</Text>
            <Text style={S.text}>{status.trip ? `${status.trip.alerts} تنبيهات` : '—'}</Text>
          </View>
          <Btn title="أوقف المشوار" kind="danger" onPress={() => engine.stopTest()} />
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
        <Btn title="ابدأ المشوار التجريبي" kind="primary" onPress={() => engine.startTest(mult, trial)} />
      )}
    </View>
  );
}
