import { useMemo, useState } from 'react';
import { formatDetour, formatDistance } from '../core/compose';
import { store, useStore, type LogEntry, type LogKind, type Response } from '../state/store';
import { formatWhen } from './format';

const KIND: Record<LogKind, { text: string; cls: string }> = {
  alert: { text: 'نبّه', cls: 'green' },
  suppressed: { text: 'ما نبّه', cls: 'red' },
  missed: { text: 'مرّينا بدون تنبيه', cls: '' },
  arrive: { text: 'وصول', cls: 'green' },
  time: { text: 'وقت', cls: 'green' },
  passed: { text: 'تجاوزت المكان', cls: '' },
  trip: { text: 'مشوار', cls: 'gray' },
};

const RESPONSE: Record<Response, string> = {
  go: 'رحت له', done: 'تم', later: 'لاحقًا', ignored: 'تجاهلته', return: 'ذكرني بالرجعة', no: 'لا',
};

type Filter = 'all' | 'alert' | 'no' | 'missed';

export function LogView() {
  const log = useStore((s) => s.log);
  const [filter, setFilter] = useState<Filter>('all');

  const shown = useMemo(() => log.filter((e) => {
    if (filter === 'alert') return e.kind === 'alert' || e.kind === 'arrive' || e.kind === 'time';
    if (filter === 'no') return e.kind === 'suppressed';
    if (filter === 'missed') return e.kind === 'missed';
    return true;
  }), [log, filter]);

  // مقاييس البيتا من الخطة
  const m = useMemo(() => {
    const alerts = log.filter((e) => e.kind === 'alert');
    const answered = alerts.filter((e) => e.response);
    const useful = answered.filter((e) => e.response === 'go' || e.response === 'done').length;
    const ignored = answered.filter((e) => e.response === 'ignored').length;
    const missed = log.filter((e) => e.kind === 'missed').length;
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
    return {
      useful: pct(useful, answered.length),
      ignored: pct(ignored, answered.length),
      missed: pct(missed, missed + alerts.length),
      n: alerts.length,
    };
  }, [log]);

  return (
    <div className="page">
      <header className="top">
        <h1 className="h-title">سجل القرارات</h1>
        {log.length > 0 && <button className="btn ghost" onClick={() => confirm('نمسح السجل كله؟') && store.clearLog()}>امسح</button>}
      </header>
      <p className="lede">كل مرة قررنا ننبهك أو لا، مع السبب. منه نضبط العتبات: ليش نبهني، وليش ما نبهني.</p>

      <div className="metrics">
        <Metric value={m.useful} label="انتهت بـ «اذهب» أو «تم»" target="الهدف: 50% أو أكثر" ok={m.useful !== null && m.useful >= 50} />
        <Metric value={m.ignored} label="تنبيهات تجاهلتها" target="الهدف: 20% أو أقل" ok={m.ignored !== null && m.ignored <= 20} />
        <Metric value={m.missed} label="مرور بدون تنبيه" target="الهدف: 30% أو أقل" ok={m.missed !== null && m.missed <= 30} />
      </div>

      <div className="chips" style={{ marginBottom: 12 }} role="group" aria-label="تصفية">
        {([['all', 'الكل'], ['alert', 'نبّه'], ['no', 'ما نبّه'], ['missed', 'مرّينا بدون تنبيه']] as [Filter, string][]).map(([id, label]) => (
          <button key={id} className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <b>السجل فاضي</b>
          شغّل مشوار أو محاكاة من تبويب «المشوار» وبتشوف هنا كل قرار وسببه.
        </div>
      ) : (
        <div className="list">{shown.map((e) => <Entry key={e.id} e={e} />)}</div>
      )}
    </div>
  );
}

function Metric({ value, label, target, ok }: { value: number | null; label: string; target: string; ok: boolean }) {
  return (
    <div className="metric">
      <b>{value === null ? '—' : `${value}%`}</b>
      <span>{label}</span>
      <i className={value === null ? '' : ok ? 'ok' : 'bad'}>{target}</i>
    </div>
  );
}

function Entry({ e }: { e: LogEntry }) {
  const k = KIND[e.kind];
  return (
    <div className="log-entry">
      <div className="log-head">
        <span className={`tag ${k.cls}`}>{k.text}</span>
        {e.placeName && <span className="log-place">{e.placeName}</span>}
        {e.sim && <span className="tag gray">محاكاة</span>}
        <span className="log-time">{formatWhen(e.t)}</span>
      </div>
      <p className="log-text">{e.text}</p>
      {(e.reminderTitles.length > 0 || e.detourSeconds != null || e.distance != null) && (
        <p className="log-items">
          {[
            e.reminderTitles.length ? `عندك: ${e.reminderTitles.join('، ')}` : '',
            e.detourSeconds != null ? `تحويلة ${formatDetour(e.detourSeconds)}${e.approximate ? ' (تقديري)' : ''}` : '',
            e.distance != null ? (e.kind === 'missed' ? `أقرب مسافة ${formatDistance(e.distance)}` : `على بعد ${formatDistance(e.distance)}`) : '',
          ].filter(Boolean).join(' · ')}
        </p>
      )}
      {e.response && <p className="log-items">ردك: <b>{RESPONSE[e.response]}</b></p>}
    </div>
  );
}
