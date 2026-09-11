import { useEffect, useMemo, useRef, useState } from 'react';
import { parseReminder } from '../core/parser';
import type { Reminder } from '../core/types';
import { listen, speechInputSupported } from '../services/device';
import { useEngine } from '../services/engine';
import { store, useStore } from '../state/store';
import { isLater, reminderMeta } from './format';
import { Icon, ReminderGlyph } from './icons';
import { draftFromReminder, ReminderEditor, type Draft } from './ReminderEditor';
import { addSamples, EXAMPLES } from './samples';

const MODE_PILL: Record<string, { text: string; cls: string }> = {
  driving: { text: 'نراقب طريقك', cls: 'on' },
  approaching: { text: 'نقيّم مكان قدامك', cls: 'on' },
  cooldown: { text: 'بعد تنبيه', cls: 'on' },
  stationary: { text: 'ننتظر تتحرك', cls: 'warn' },
  idle: { text: 'ما فيه تذاكير مكانية', cls: '' },
};

export function TodayView({ goDrive }: { goDrive: () => void }) {
  const reminders = useStore((s) => s.reminders);
  const status = useEngine();
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [listening, setListening] = useState(false);
  const stopRef = useRef<() => void>(() => undefined);
  const [exampleIdx, setExampleIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setExampleIdx((i) => (i + 1) % EXAMPLES.length), 4000);
    return () => clearInterval(t);
  }, []);

  const { now, later, done } = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86_400_000;
    const active = reminders.filter((r) => r.status === 'active');
    const byDue = (a: Reminder, b: Reminder) =>
      (a.at ?? a.deadline ?? Infinity) - (b.at ?? b.deadline ?? Infinity) || b.createdAt - a.createdAt;
    return {
      now: active.filter((r) => !isLater(r)).sort(byDue),
      later: active.filter((r) => isLater(r)).sort(byDue),
      done: reminders.filter((r) => r.status === 'done' && (r.doneAt ?? 0) > weekAgo).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)),
    };
  }, [reminders]);

  const submit = (value = text) => {
    const raw = value.trim();
    if (!raw) return;
    const p = parseReminder(raw);
    setDraft({ title: p.title, trigger: p.trigger, target: p.target, at: p.at, notBefore: p.notBefore, deadline: p.deadline, raw, parsed: p });
    setText('');
  };

  const toggleMic = () => {
    if (listening) { stopRef.current(); return; }
    setListening(true);
    stopRef.current = listen(
      (t, final) => { setText(t); if (final) { setListening(false); submit(t); } },
      () => setListening(false),
    );
  };

  const pill = status.source === 'none'
    ? { text: 'المشوار متوقف', cls: '' }
    : MODE_PILL[status.mode] ?? MODE_PILL.idle;

  return (
    <div className="page">
      <header className="top">
        <div className="brand">
          <span className="brand-mark"><Icon.drive size={20} /></span>
          <div>
            <h1>عالطريق</h1>
            <small>هل يستاهل أوقف الحين؟</small>
          </div>
        </div>
        <button className={`pill ${pill.cls}`} onClick={goDrive} style={{ border: 0 }}>
          <span className="dot" />{pill.text}
        </button>
      </header>

      <div className="quick">
        <label htmlFor="quick">وش تبي تتذكر؟</label>
        <div className="quick-row">
          <textarea
            id="quick" rows={1} value={text} enterKeyHint="send"
            placeholder={EXAMPLES[exampleIdx]}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          />
          {speechInputSupported() && (
            <button className={`icon-btn ${listening ? 'live' : ''}`} onClick={toggleMic} aria-label={listening ? 'أوقف التسجيل' : 'قلها بصوتك'} aria-pressed={listening}>
              <Icon.mic />
            </button>
          )}
          <button className="icon-btn primary" onClick={() => submit()} disabled={!text.trim()} aria-label="أضف">
            <Icon.send />
          </button>
        </div>
        <p className="hint">اكتبها زي ما تقولها: «ذكرني إذا مريت على صيدلية أشتري دواء»</p>
      </div>

      {reminders.length === 0 ? (
        <div className="empty">
          <b>ما عندك تذاكير</b>
          اكتب أول تذكير فوق، أو جرّب بأمثلة جاهزة وشغّل محاكاة مشوار في الرياض.
          <q>ذكرني إذا مريت على جرير أشتري كتاب Java</q>
          <button className="btn primary" onClick={() => { addSamples(); }}>
            <Icon.sparkle size={18} /> أضف أمثلة
          </button>
        </div>
      ) : (
        <>
          <Section title="مهم الحين" items={now} onOpen={(r) => setDraft(draftFromReminder(r))} empty="ما فيه شيء حاليًا." />
          {later.length > 0 && <Section title="لاحقًا" items={later} onOpen={(r) => setDraft(draftFromReminder(r))} />}
          {done.length > 0 && <Section title="تم" items={done} onOpen={(r) => setDraft(draftFromReminder(r))} />}
        </>
      )}

      {draft && <ReminderEditor draft={draft} onClose={() => setDraft(null)} />}
    </div>
  );
}

function Section({ title, items, onOpen, empty }: { title: string; items: Reminder[]; onOpen: (r: Reminder) => void; empty?: string }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        <span className="count">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="empty" style={{ padding: 16 }}>{empty}</div>
      ) : (
        <div className="list">
          {items.map((r) => <Row key={r.id} r={r} onOpen={() => onOpen(r)} />)}
        </div>
      )}
    </section>
  );
}

function Row({ r, onOpen }: { r: Reminder; onOpen: () => void }) {
  const isDone = r.status === 'done';
  const toggle = () => store.updateReminder(r.id, isDone
    ? { status: 'active', doneAt: undefined }
    : { status: 'done', doneAt: Date.now() });
  const overdue = r.trigger === 'time' && !isDone && (r.at ?? Infinity) < Date.now();
  return (
    <div className={`row ${isDone ? 'is-done' : ''}`}>
      <button className={`check ${isDone ? 'done' : ''}`} onClick={toggle} aria-label={isDone ? 'رجّعه' : 'تم'} aria-pressed={isDone}>
        {isDone && <Icon.check size={16} />}
      </button>
      <span className="glyph"><ReminderGlyph r={r} /></span>
      <button className="row-body" onClick={onOpen}>
        <div className="row-title">{r.title || 'تذكير'}</div>
        <div className="row-meta">
          {reminderMeta(r).map((m, i) => <span key={i}>{i > 0 ? '· ' : ''}{m}</span>)}
          {overdue && <span className="tag red">فات موعده</span>}
          {r.remindOnReturn && !isDone && <span className="tag">بنذكرك بالرجعة</span>}
        </div>
      </button>
    </div>
  );
}
