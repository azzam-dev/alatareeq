import { useEffect, useState, type ReactNode } from 'react';
import { formatDistance } from '../core/compose';
import type { Settings } from '../core/types';
import { isIOS, notificationPermission, requestNotifications, wakeLockSupported } from '../services/device';
import { engine } from '../services/engine';
import { store, useStore } from '../state/store';
import { addSamples } from './samples';

export function SettingsView() {
  const s = useStore((st) => st.settings);
  const hiddenCount = useStore((st) => st.hiddenPlaces.length);
  const set = (patch: Partial<Settings>) => store.setSettings(patch);
  const [notif, setNotif] = useState(notificationPermission());
  const [geo, setGeo] = useState<string>('—');

  useEffect(() => {
    navigator.permissions?.query({ name: 'geolocation' as PermissionName })
      .then((p) => {
        const upd = () => setGeo(p.state);
        upd();
        p.onchange = upd;
      })
      .catch(() => setGeo('unknown'));
  }, []);

  const permText: Record<string, string> = { granted: 'مسموح', denied: 'مرفوض', prompt: 'ما انطلب بعد', default: 'ما انطلب بعد', unsupported: 'غير مدعوم', unknown: 'غير معروف', '—': '—' };

  return (
    <div className="page">
      <header className="top"><h1 className="h-title">الإعدادات</h1></header>

      <p className="group-title">التنبيه</p>
      <div className="group">
        <Range label="أقصى تحويلة" hint="ما ننبهك لو الوقت الإضافي أكثر من كذا" value={s.maxDetourMin} min={1} max={10} step={1}
          show={`${s.maxDetourMin} د`} onChange={(v) => set({ maxDetourMin: v })} />
        <Range label="أقصى عدد تنبيهات في المشوار" value={s.maxAlertsPerTrip} min={1} max={6} step={1}
          show={String(s.maxAlertsPerTrip)} onChange={(v) => set({ maxAlertsPerTrip: v })} />
        <Range label="أقل مدة بين تنبيهين" value={s.cooldownMin} min={1} max={10} step={1}
          show={`${s.cooldownMin} د`} onChange={(v) => set({ cooldownMin: v })} />
      </div>

      <p className="group-title">ساعات الهدوء</p>
      <div className="group">
        <div className="setting">
          <div className="setting-line">
            <label htmlFor="quiet">ما ننبهك بالليل</label>
            <Switch id="quiet" checked={s.quietEnabled} onChange={(v) => set({ quietEnabled: v })} />
          </div>
          {s.quietEnabled && (
            <div className="time-pair">
              <span>من</span>
              <input type="time" className="input" value={s.quietStart} onChange={(e) => set({ quietStart: e.target.value })} aria-label="بداية ساعات الهدوء" />
              <span>إلى</span>
              <input type="time" className="input" value={s.quietEnd} onChange={(e) => set({ quietEnd: e.target.value })} aria-label="نهاية ساعات الهدوء" />
            </div>
          )}
        </div>
      </div>

      <p className="group-title">أثناء القيادة</p>
      <div className="group">
        <Toggle id="speak" label="انطق التنبيه" hint="عشان ما تحتاج تشوف الشاشة" checked={s.speak} onChange={(v) => set({ speak: v })} />
        <Toggle id="sound" label="صوت التنبيه" checked={s.sound} onChange={(v) => set({ sound: v })} />
        <div className="setting">
          <label className="setting-name" htmlFor="maps">زر «اذهب» يفتح</label>
          <select id="maps" className="input" style={{ marginTop: 6 }} value={s.mapsApp} onChange={(e) => set({ mapsApp: e.target.value as Settings['mapsApp'] })}>
            <option value="auto">تلقائي ({isIOS() ? 'خرائط Apple' : 'خرائط Google'})</option>
            <option value="google">خرائط Google</option>
            <option value="apple">خرائط Apple</option>
            <option value="waze">Waze</option>
          </select>
        </div>
      </div>

      <p className="group-title">متقدم</p>
      <div className="group">
        <Range label="الحلقة الخارجية" hint="لما يدخل مكان مطابق هالمسافة نبدأ نحسب التحويلة" value={s.outerRingM} min={800} max={3000} step={100}
          show={formatDistance(s.outerRingM)} onChange={(v) => set({ outerRingM: v })} />
        <Range label="زاوية «قدامك»" hint="أي مكان خارجها نعتبره وراك أو جانبي" value={s.aheadAngleDeg} min={30} max={90} step={5}
          show={`${s.aheadAngleDeg}°`} onChange={(v) => set({ aheadAngleDeg: v })} />
        <Range label="نطاق الوصول" value={s.arriveRadiusM} min={50} max={300} step={10}
          show={`${s.arriveRadiusM} م`} onChange={(v) => set({ arriveRadiusM: v })} />
      </div>

      <p className="group-title">الصلاحيات</p>
      <div className="group">
        <div className="setting setting-line">
          <div><span className="setting-name">إشعارات النظام</span><small>تطلع لو الصفحة بالخلفية. على iPhone لازم تضيف الموقع للشاشة الرئيسية أول.</small></div>
          {notif === 'granted' ? <span className="tag green">{permText[notif]}</span> : notif === 'unsupported' ? <span className="tag gray">{permText[notif]}</span> : (
            <button className="btn" onClick={async () => setNotif(await requestNotifications())}>فعّل</button>
          )}
        </div>
        <div className="setting setting-line">
          <div><span className="setting-name">الموقع</span><small>ينطلب لما تبدأ مشوار حقيقي.</small></div>
          <span className={`tag ${geo === 'granted' ? 'green' : geo === 'denied' ? 'red' : 'gray'}`}>{permText[geo] ?? geo}</span>
        </div>
        <div className="setting setting-line">
          <div><span className="setting-name">إبقاء الشاشة شغالة</span><small>أثناء المشوار</small></div>
          <span className={`tag ${wakeLockSupported() ? 'green' : 'gray'}`}>{wakeLockSupported() ? 'مدعوم' : 'غير مدعوم'}</span>
        </div>
      </div>

      <p className="group-title">البيانات</p>
      <div className="group">
        <div className="setting"><button className="btn block" onClick={addSamples}>أضف تذاكير أمثلة</button></div>
        <div className="setting"><button className="btn block" onClick={() => engine.clearPlaceCache()}>امسح الأماكن المحفوظة</button></div>
        {hiddenCount > 0 && (
          <div className="setting"><button className="btn block" onClick={() => store.clearHiddenPlaces()}>أظهر الأماكن اللي قلت عنها «مو مناسب» ({hiddenCount})</button></div>
        )}
        <div className="setting">
          <button className="btn danger block" onClick={() => { if (confirm('نحذف كل التذاكير والسجل والإعدادات من هالجهاز؟')) { engine.stop(); engine.clearPlaceCache(); store.resetAll(); } }}>
            احذف كل بياناتي
          </button>
        </div>
      </div>

      <div className="note">
        <b>الخصوصية:</b> تذاكيرك وسجلك محفوظة على جهازك فقط، بدون حساب وبدون سيرفر لنا. للبحث عن الأماكن وحساب المسارات نرسل موقعك لخدمات الخرائط المفتوحة
        (OpenStreetMap و OSRM) وقت الحاجة فقط.
      </div>
      <p className="lede" style={{ textAlign: 'center' }}>عالطريق · نسخة الـ MVP للويب 0.1</p>
    </div>
  );
}

function Setting({ children }: { children: ReactNode }) {
  return <div className="setting">{children}</div>;
}

function Range({ label, hint, value, min, max, step, show, onChange }: {
  label: string; hint?: string; value: number; min: number; max: number; step: number; show: string; onChange: (v: number) => void;
}) {
  const id = `r-${label}`;
  return (
    <Setting>
      <div className="setting-line">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{show}</output>
      </div>
      {hint && <small>{hint}</small>}
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Setting>
  );
}

function Switch({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <span className="switch">
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </span>
  );
}

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Setting>
      <div className="setting-line">
        <div><label htmlFor={id}>{label}</label>{hint && <small>{hint}</small>}</div>
        <Switch id={id} checked={checked} onChange={onChange} />
      </div>
    </Setting>
  );
}
