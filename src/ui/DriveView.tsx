import { useMemo, useState } from 'react';
import { formatDetour, formatDistance } from '../core/compose';
import type { LatLon } from '../core/geo';
import type { EngineMode } from '../core/types';
import { engine, useEngine, type CandView } from '../services/engine';
import { SIM_PRESETS } from '../services/simulator';
import { useStore } from '../state/store';
import { Icon } from './icons';
import { MapView } from './MapView';
import { addSamples } from './samples';

const MODES: { id: EngineMode; label: string; desc: string }[] = [
  { id: 'idle', label: 'خامل', desc: 'ما عندك تذاكير مكانية، فما نراقب شيء.' },
  { id: 'stationary', label: 'ثابت', desc: 'واقف أو ماشي. ننتظر تبدأ تسوق.' },
  { id: 'driving', label: 'قيادة', desc: 'نراقب الأماكن اللي قدامك على طريقك.' },
  { id: 'approaching', label: 'اقتراب', desc: 'مكان مطابق دخل الحلقة الخارجية، نحسب التحويلة.' },
  { id: 'cooldown', label: 'تهدئة', desc: 'نبهناك قبل شوي، نرجع للمراقبة بعدها.' },
];

const SPEEDS = [1, 5, 10];

export function DriveView() {
  const status = useEngine();
  const settings = useStore((s) => s.settings);
  const reminders = useStore((s) => s.reminders);
  const [preset, setPreset] = useState(SIM_PRESETS[0].id);
  const [mult, setMult] = useState(5);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [picked, setPicked] = useState<{ from?: LatLon; to?: LatLon }>({});

  const placeRems = useMemo(() => reminders.filter((r) => r.status === 'active' && r.trigger !== 'time' && r.target), [reminders]);
  const running = status.source !== 'none';
  const mode = MODES.find((m) => m.id === status.mode) ?? MODES[0];

  const onPick = (p: LatLon) => {
    if (picking === 'from') { setPicked({ from: p }); setPicking('to'); }
    else if (picking === 'to') { setPicked((x) => ({ ...x, to: p })); setPicking(null); }
  };

  const startSim = () => {
    if (preset === 'custom') {
      if (picked.from && picked.to) void engine.startSim(picked.from, picked.to, mult);
      return;
    }
    const p = SIM_PRESETS.find((x) => x.id === preset)!;
    setPicked({});
    void engine.startSim(p.from, p.to, mult);
  };

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1 className="h-title">المشوار</h1>
        </div>
        {running && (
          <span className={`pill ${status.source === 'sim' ? 'warn' : 'on'}`}>
            <span className="dot" />{status.source === 'sim' ? `محاكاة ×${status.sim?.multiplier ?? mult}` : 'GPS'}
          </span>
        )}
      </header>

      <MapView status={status} ringM={settings.outerRingM} picking={picking} picked={picked} onPick={onPick} />

      {running ? (
        <>
          <div className="mode-card" aria-live="polite">
            <div className="mode-line">
              <span className="mode-name">{mode.label}</span>
              {status.sim && !status.sim.loading && (
                <span className="count">{Math.round(status.sim.progress * 100)}% من المسار</span>
              )}
            </div>
            <p className="mode-desc">
              {status.sim?.loading ? 'نجهز المسار ونحمّل الأماكن حوله...' : mode.desc}
            </p>
            <div className="stats">
              <div><b>{Math.round(status.speed * 3.6)}</b><span>كم/س</span></div>
              <div><b>{status.trip ? `${status.trip.alerts}/${settings.maxAlertsPerTrip}` : '—'}</b><span>تنبيهات المشوار</span></div>
              <div><b>{status.nearby.length}</b><span>أماكن مطابقة</span></div>
              <div><b>{status.trip ? (status.trip.distanceM / 1000).toFixed(1) : '—'}</b><span>كم</span></div>
            </div>
            <div className="states" aria-hidden="true">
              {MODES.map((m) => <span key={m.id} className={m.id === status.mode ? 'on' : ''}>{m.label}</span>)}
            </div>
          </div>

          {status.source === 'sim' && (
            <div className="controls">
              <span className="field-label">سرعة المحاكاة</span>
              <div className="seg" role="group" aria-label="سرعة المحاكاة">
                {SPEEDS.map((s) => (
                  <button key={s} aria-pressed={(status.sim?.multiplier ?? mult) === s} onClick={() => { setMult(s); engine.setSimSpeed(s); }}>×{s}</button>
                ))}
              </div>
            </div>
          )}

          <button className="btn danger block" onClick={() => engine.stop()} style={{ marginBottom: 16 }}>
            <Icon.stop size={18} /> إيقاف المشوار
          </button>

          <section className="section">
            <div className="section-head"><h2>قدامك</h2><span className="count">الحلقة الخارجية {formatDistance(settings.outerRingM)}</span></div>
            {status.candidates.length ? (
              <div className="list">{status.candidates.map((c) => <CandRow key={c.id} c={c} />)}</div>
            ) : (
              <div className="empty" style={{ padding: 16 }}>
                {status.trip ? 'ما فيه مكان مطابق داخل الحلقة الحين.' : 'أول ما تبدأ تتحرك نبدأ نراقب الطريق.'}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          {placeRems.length === 0 && (
            <div className="note warn" style={{ marginTop: 12 }}>
              ما عندك تذاكير مكانية، فالمحرك بيكون خامل.{' '}
              <button className="btn ghost" style={{ minHeight: 0, padding: 0 }} onClick={addSamples}>أضف أمثلة</button>
            </div>
          )}

          <div className="controls" style={{ marginTop: 12 }}>
            <h3>مشوار حقيقي</h3>
            <p className="mode-desc">خلّ الجوال على الحامل والصفحة مفتوحة. نبقي الشاشة شغالة وننبهك بصوت.</p>
            <button className="btn primary block" onClick={() => engine.startGps()}>
              <Icon.gps size={18} /> ابدأ المشوار
            </button>
            {status.gpsError && <div className="note bad">{status.gpsError}</div>}
          </div>

          <div className="controls">
            <h3>محاكاة مشوار</h3>
            <p className="mode-desc">جرّب المنتج بدون ما تسوق: نشغّل مسار حقيقي في الرياض مع أماكن حقيقية من الخريطة.</p>
            <div className="field">
              <label htmlFor="preset">المسار</label>
              <select id="preset" className="input" value={preset} onChange={(e) => {
                setPreset(e.target.value);
                if (e.target.value === 'custom') { setPicked({}); setPicking('from'); } else { setPicking(null); setPicked({}); }
              }}>
                {SIM_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                <option value="custom">اختار البداية والوجهة من الخريطة</option>
              </select>
            </div>
            <div className="field">
              <span className="field-label">السرعة</span>
              <div className="seg" role="group" aria-label="سرعة المحاكاة">
                {SPEEDS.map((s) => <button key={s} aria-pressed={mult === s} onClick={() => setMult(s)}>×{s}</button>)}
              </div>
            </div>
            <button className="btn block" onClick={startSim} disabled={preset === 'custom' && !(picked.from && picked.to)}>
              <Icon.play size={18} /> شغّل المحاكاة
            </button>
            {status.sim?.error && <div className="note bad">{status.sim.error}</div>}
            <small className="mode-desc" style={{ display: 'block', marginTop: 8, marginBottom: 0 }}>المحاكاة تتجاهل ساعات الهدوء عشان تقدر تجربها بأي وقت.</small>
          </div>
        </>
      )}

      {status.placesError && <div className="note warn">{status.placesError}</div>}
      {status.fetching && <div className="note">نحمّل الأماكن من OpenStreetMap...</div>}
      <div className="note">
        نسخة الويب تشتغل والصفحة مفتوحة فقط، لأن المتصفح ما يسمح بتتبع الموقع في الخلفية. التشغيل والجوال مقفل يحتاج التطبيق الأصلي على iOS.
      </div>
    </div>
  );
}

function CandRow({ c }: { c: CandView }) {
  let tag: { text: string; cls: string };
  switch (c.status) {
    case 'alerted': tag = { text: 'نبّهناك', cls: 'green' }; break;
    case 'rejected': tag = { text: `تحويلة ${formatDetour(c.detourSeconds ?? 0)}`, cls: 'red' }; break;
    case 'routing': tag = { text: 'نحسب التحويلة…', cls: '' }; break;
    case 'pending': tag = { text: c.detourSeconds != null ? `${formatDetour(c.detourSeconds)} ✓` : 'ينتظر', cls: '' }; break;
    case 'passed': tag = { text: 'تجاوزناه', cls: 'gray' }; break;
    default: tag = { text: 'ما ننبه', cls: 'gray' };
  }
  return (
    <div className="cand">
      <span className="cand-name">{c.name}</span>
      <span className="cand-dist">{formatDistance(c.distance)}</span>
      <span className="cand-sub">
        <span className={`tag ${tag.cls}`}>{tag.text}</span>{' '}
        {c.status === 'blocked' && c.reasonText ? c.reasonText : c.titles.join('، ')}
      </span>
    </div>
  );
}
