import { useEffect, useMemo, useState } from 'react';
import { targetLabel } from '../core/compose';
import { BRANDS, CATEGORIES } from '../core/lexicon';
import { normalize, stems } from '../core/normalize';
import type { ParsedReminder } from '../core/parser';
import type { CategoryId, Reminder, Target, TriggerKind } from '../core/types';
import { engine } from '../services/engine';
import { searchPlaces, type SearchResult } from '../services/osm';
import { store, uid } from '../state/store';
import { fromLocalInput, toLocalInput, TRIGGER_LABEL } from './format';
import { CategoryIcon, Icon } from './icons';

export interface Draft {
  id?: string;
  title: string;
  trigger: TriggerKind;
  target: Target | null;
  at?: number;
  notBefore?: number;
  deadline?: number;
  raw?: string;
  parsed?: ParsedReminder;
}

export function draftFromReminder(r: Reminder): Draft {
  return { id: r.id, title: r.title, trigger: r.trigger, target: r.target, at: r.at, notBefore: r.notBefore, deadline: r.deadline, raw: r.raw };
}

type TargetMode = 'category' | 'brand' | 'place';
const RIYADH = { lat: 24.7136, lon: 46.6753 };

function brandFromText(text: string): Target | null {
  const t = text.trim();
  if (!t) return null;
  const n = normalize(t).split(/\s+/).flatMap(stems);
  const known = BRANDS.find((b) => b.words.some((w) => normalize(w).split(' ').every((part) => n.includes(part))));
  if (known) return { kind: 'brand', brandId: known.id, label: known.label };
  return { kind: 'brand', brandId: `name:${t}`, label: t };
}

export function ReminderEditor({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const [title, setTitle] = useState(draft.title);
  const [trigger, setTrigger] = useState<TriggerKind>(draft.trigger);
  const [target, setTarget] = useState<Target | null>(draft.target);
  const [mode, setMode] = useState<TargetMode>(draft.target?.kind ?? 'category');
  const [brandText, setBrandText] = useState(draft.target?.kind === 'brand' ? draft.target.label : '');
  const [at, setAt] = useState(toLocalInput(draft.at ?? defaultTime()));
  const [notBefore, setNotBefore] = useState(toLocalInput(draft.notBefore));
  const [deadline, setDeadline] = useState(toLocalInput(draft.deadline));
  const [q, setQ] = useState(draft.target?.kind === 'place' ? draft.target.place.name : '');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cats = target?.kind === 'category' ? target.categories : [];
  const toggleCat = (id: CategoryId) => {
    const next = cats.includes(id) ? cats.filter((c) => c !== id) : [...cats, id];
    setTarget(next.length ? { kind: 'category', categories: next } : null);
  };

  const doSearch = async () => {
    if (!q.trim()) return;
    setSearching(true);
    setSearchErr(null);
    try {
      const res = await searchPlaces(q.trim(), engine.getSnapshot().position ?? RIYADH);
      setResults(res);
      if (!res.length) setSearchErr('ما لقينا شيء بهالاسم. جرّب اسم أوضح أو اختر فئة.');
    } catch {
      setSearchErr('تعذر البحث. تأكد من الاتصال.');
    } finally {
      setSearching(false);
    }
  };

  const valid = trigger === 'time' ? !!fromLocalInput(at) : !!target;

  const save = () => {
    if (!valid) return;
    const base = {
      title: title.trim() || (trigger === 'time' ? 'تذكير' : targetLabel(target)),
      trigger,
      target: trigger === 'time' ? null : target,
      at: trigger === 'time' ? fromLocalInput(at) : undefined,
      notBefore: trigger === 'time' ? undefined : fromLocalInput(notBefore),
      deadline: fromLocalInput(deadline),
    };
    if (draft.id) {
      store.updateReminder(draft.id, { ...base, lastNotifiedAt: undefined, snoozedUntil: undefined });
    } else {
      store.addReminder({ id: uid(), status: 'active', createdAt: Date.now(), raw: draft.raw, ...base });
    }
    onClose();
  };

  const understood = useMemo(() => {
    const p = draft.parsed;
    if (!p) return null;
    if (p.needsTarget) return { warn: true, text: 'ما عرفت المكان ولا الوقت. اختر تحت وين أو متى تبي أذكرك.' };
    const parts = [p.trigger === 'time' ? `في وقت: ${new Date(p.at!).toLocaleString('ar-SA-u-nu-latn-ca-gregory', { weekday: 'long', hour: 'numeric', minute: '2-digit' })}` : TRIGGER_LABEL[p.trigger]];
    if (p.target) parts.push(targetLabel(p.target));
    if (p.title) parts.push(`«${p.title}»`);
    return { warn: false, text: parts.join(' · '), inferred: p.inferred };
  }, [draft.parsed]);

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={draft.id ? 'تعديل التذكير' : 'تذكير جديد'} onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        <div className="top" style={{ marginBottom: 10 }}>
          <h2 className="h-title" style={{ fontSize: 22 }}>{draft.id ? 'تعديل التذكير' : 'تذكير جديد'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="إغلاق" style={{ width: 40, height: 40 }}><Icon.close /></button>
        </div>

        {understood && (
          <div className={`understood ${understood.warn ? 'warn' : ''}`}>
            <b>{understood.warn ? 'انتبه: ' : 'فهمت: '}</b>{understood.text}
            {understood.inferred && <div style={{ fontSize: 13, marginTop: 2 }}>استنتجت المكان من الغرض نفسه. عدّله لو تبي.</div>}
          </div>
        )}

        <div className="field">
          <label htmlFor="ed-title">وش تبي تتذكر؟</label>
          <input id="ed-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: أشتري دواء" />
        </div>

        <div className="field">
          <span className="field-label">متى أذكرك؟</span>
          <div className="seg" role="group" aria-label="نوع التذكير">
            {(['pass', 'arrive', 'time'] as TriggerKind[]).map((k) => (
              <button key={k} aria-pressed={trigger === k} onClick={() => setTrigger(k)}>{TRIGGER_LABEL[k]}</button>
            ))}
          </div>
          <small>
            {trigger === 'pass' && 'ننبهك وأنت تسوق لو المكان على طريقك والتحويلة تستاهل.'}
            {trigger === 'arrive' && 'ننبهك لما توصل المكان وتوقف عنده.'}
            {trigger === 'time' && 'تنبيه عادي بوقت محدد.'}
          </small>
        </div>

        {trigger === 'time' ? (
          <div className="field">
            <label htmlFor="ed-at">الوقت</label>
            <input id="ed-at" type="datetime-local" className="input" value={at} onChange={(e) => setAt(e.target.value)} />
          </div>
        ) : (
          <div className="field">
            <span className="field-label">وين؟</span>
            {target && (
              <div className="target-now">
                <span className="glyph" style={{ width: 30, height: 30 }}>
                  {target.kind === 'category' ? <CategoryIcon id={target.categories[0]} /> : target.kind === 'brand' ? <Icon.tag size={18} /> : <Icon.pin size={18} />}
                </span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{targetLabel(target)}</span>
              </div>
            )}
            <div className="seg" role="group" aria-label="نوع المكان" style={{ marginBottom: 10 }}>
              <button aria-pressed={mode === 'category'} onClick={() => setMode('category')}>فئة</button>
              <button aria-pressed={mode === 'brand'} onClick={() => setMode('brand')}>براند أو اسم</button>
              <button aria-pressed={mode === 'place'} onClick={() => setMode('place')}>مكان محدد</button>
            </div>

            {mode === 'category' && (
              <>
                <div className="chips">
                  {CATEGORIES.filter((c) => !c.more || cats.includes(c.id)).map((c) => (
                    <button key={c.id} className="chip" aria-pressed={cats.includes(c.id)} onClick={() => toggleCat(c.id)}>
                      <CategoryIcon id={c.id} size={16} /> {c.label}
                    </button>
                  ))}
                </div>
                <small>تقدر تختار أكثر من فئة. الفئة تعطيك فرص أكثر لأن أي فرع على طريقك ينفع.</small>
              </>
            )}

            {mode === 'brand' && (
              <>
                <input
                  className="input" value={brandText} placeholder="مثال: جرير، النهدي، بنده"
                  onChange={(e) => { setBrandText(e.target.value); setTarget(brandFromText(e.target.value)); }}
                />
                <div className="chips" style={{ marginTop: 8 }}>
                  {BRANDS.slice(0, 9).map((b) => (
                    <button key={b.id} className="chip" aria-pressed={target?.kind === 'brand' && target.brandId === b.id}
                      onClick={() => { setBrandText(b.label); setTarget({ kind: 'brand', brandId: b.id, label: b.label }); }}>
                      {b.label}
                    </button>
                  ))}
                </div>
                <small>ننبهك عند أي فرع على طريقك. الأسماء غير المعروفة نبحث عنها بالاسم في الخريطة.</small>
              </>
            )}

            {mode === 'place' && (
              <>
                <div className="input-row">
                  <input className="input" value={q} placeholder="اسم المكان أو الحي" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void doSearch()} />
                  <button className="btn" onClick={() => void doSearch()} disabled={searching || !q.trim()}>{searching ? '...' : 'ابحث'}</button>
                </div>
                {searchErr && <div className="note warn">{searchErr}</div>}
                {results && results.length > 0 && (
                  <div className="results">
                    {results.map((r) => (
                      <button key={r.id} className="result" aria-pressed={target?.kind === 'place' && target.place.id === r.id}
                        onClick={() => { setTarget({ kind: 'place', place: { id: r.id, name: r.name, lat: r.lat, lon: r.lon } }); setResults(null); }}>
                        {r.name}
                        <span>{r.sub}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <details className="more" open={!!(draft.deadline || draft.notBefore)}>
          <summary>خيارات إضافية</summary>
          {trigger !== 'time' && (
            <div className="field">
              <label htmlFor="ed-nb">لا تنبهني قبل</label>
              <input id="ed-nb" type="datetime-local" className="input" value={notBefore} onChange={(e) => setNotBefore(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label htmlFor="ed-dl">الموعد النهائي</label>
            <input id="ed-dl" type="datetime-local" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            <small>لو فيه أكثر من مكان على طريقك، نقدّم التذكير الأقرب موعدًا.</small>
          </div>
        </details>

        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={save} disabled={!valid}>حفظ</button>
          {draft.id && (
            <button className="btn danger" onClick={() => { store.deleteReminder(draft.id!); onClose(); }}>حذف</button>
          )}
        </div>
      </div>
    </div>
  );
}

function defaultTime(): number {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}
