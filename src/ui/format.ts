import { targetLabel } from '../core/compose';
import type { Reminder, TriggerKind } from '../core/types';

const LOCALE = 'ar-SA-u-nu-latn-ca-gregory';

export const TRIGGER_LABEL: Record<TriggerKind, string> = {
  pass: 'عند المرور',
  arrive: 'عند الوصول',
  time: 'في وقت محدد',
};

function dayDiff(ts: number, now = new Date()): number {
  const a = new Date(ts); a.setHours(0, 0, 0, 0);
  const b = new Date(now); b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
}

export function formatWhen(ts: number, withClock = true): string {
  const d = dayDiff(ts);
  const day = d === 0 ? 'اليوم' : d === 1 ? 'بكرة' : d === -1 ? 'أمس'
    : new Date(ts).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'short' });
  return withClock ? `${day} ${formatClock(ts)}` : day;
}

export function reminderMeta(r: Reminder): string[] {
  const out: string[] = [];
  if (r.trigger === 'time') {
    const due = r.snoozedUntil && r.at && r.snoozedUntil > r.at ? r.snoozedUntil : r.at;
    if (due) out.push(formatWhen(due));
  } else {
    out.push(TRIGGER_LABEL[r.trigger]);
    out.push(targetLabel(r.target));
    if (r.notBefore && r.notBefore > Date.now()) out.push(`من ${formatWhen(r.notBefore, new Date(r.notBefore).getHours() !== 0)}`);
  }
  if (r.deadline) out.push(`قبل ${formatWhen(r.deadline, new Date(r.deadline).getHours() !== 0)}`);
  return out;
}

export function isLater(r: Reminder, now = Date.now()): boolean {
  if (r.status !== 'active') return false;
  if (r.trigger === 'time') {
    const due = r.snoozedUntil && r.at && r.snoozedUntil > r.at ? r.snoozedUntil : r.at ?? 0;
    const end = new Date(); end.setHours(23, 59, 59, 999);
    return due > end.getTime();
  }
  return !!r.notBefore && r.notBefore > now;
}

/** datetime-local ⇄ epoch */
export function toLocalInput(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromLocalInput(v: string): number | undefined {
  if (!v) return undefined;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? undefined : t;
}
