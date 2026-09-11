import { useState } from 'react';
import { engine, type ActiveAlert } from '../services/engine';

const ACTIONS: Record<ActiveAlert['kind'], { action: string; label: string }[]> = {
  pass: [{ action: 'go', label: 'اذهب' }, { action: 'done', label: 'تم' }, { action: 'later', label: 'لاحقًا' }],
  arrive: [{ action: 'done', label: 'تم' }, { action: 'later', label: 'لاحقًا' }],
  time: [{ action: 'done', label: 'تم' }, { action: 'later', label: 'بعد ربع ساعة' }],
  passed: [{ action: 'return', label: 'ذكرني بالرجعة' }, { action: 'no', label: 'لا' }],
};

export function AlertSign({ alert, queued = 0, demo = false }: { alert: ActiveAlert; queued?: number; demo?: boolean }) {
  const [why, setWhy] = useState(false);
  return (
    <div className={`alert ${alert.kind === 'passed' ? 'passed' : ''}`} role={demo ? undefined : 'alertdialog'} aria-live="assertive" aria-label={`${alert.label}: ${alert.title}`}>
      <p className="alert-label">
        <span>{alert.label}{queued > 0 ? ` · +${queued} بالانتظار` : ''}</span>
        {alert.why && !demo && (
          <button className="why-btn" onClick={() => setWhy((v) => !v)} aria-expanded={why}>ليش؟</button>
        )}
      </p>
      <div className="alert-main">
        <span className="alert-name">{alert.title}</span>
        {alert.distanceText && <span className="alert-dist">{alert.distanceText}</span>}
      </div>
      <div className="alert-sub">{alert.sub}</div>
      {why && alert.why && <div className="alert-why">{alert.why}</div>}
      <div className="alert-actions">
        {ACTIONS[alert.kind].map((a, i) => (
          <button key={a.action} className={i === 0 ? 'main' : ''} onClick={() => !demo && engine.respond(alert.id, a.action)} tabIndex={demo ? -1 : 0}>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
