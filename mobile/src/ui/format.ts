import { targetLabel } from '../../../src/core/compose';
import { isAllDay, type DeadlineAlert } from '../../../src/core/deadline';
import { joinItems } from '../../../src/core/items';
import type { Priority, Reminder, RemindBefore, SpecificPlace } from '../../../src/core/types';
import type { DeadlineNotification } from '../services/device';
import { branchOf } from '../services/places';

const LOCALE = 'ar-SA-u-nu-latn-ca-gregory';

export const PRIORITY_LABEL: Record<Priority, string> = { high: 'عالية', normal: 'عادية', low: 'منخفضة' };

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

/** آخر موعد: «الثلاثاء» لو اليوم كله (ينحفظ نهاية اليوم)، و«الثلاثاء ٥:٠٠ م» لو فيه ساعة */
export function formatDeadline(ts: number): string {
  return formatWhen(ts, !isAllDay(ts));
}

/** «ذكرني» بكلام المستخدم */
export const REMIND_LABEL: Record<RemindBefore, string> = {
  hour: 'قبل ساعة', hours3: 'قبل 3 ساعات', day: 'قبل يوم', morning: 'الصبح 9', eve: 'الليلة اللي قبل 9 م', none: 'لا تذكرني',
};

const HEADS: Record<Exclude<RemindBefore, 'none'>, string> = {
  hour: 'باقي ساعة', hours3: 'باقي 3 ساعات', day: 'باقي يوم', morning: 'آخر يوم اليوم', eve: 'آخر يوم بكرة',
};

/** «⏰ باقي ساعة: خبز، حليب» أو «⏰ آخر يوم اليوم: هدية» */
export function deadlineNotification(a: DeadlineAlert): DeadlineNotification {
  const items = joinItems(a.reminders.map((r) => r.title || 'تذكير'));
  const head = a.remind === 'none' ? '' : HEADS[a.remind];
  return {
    at: a.at,
    key: `${a.deadline}:${a.remind}`,
    title: `⏰ ${head}: ${items}`,
    body: a.allDay ? 'مرّ عليها قبل نهاية اليوم' : `آخر موعد ${formatWhen(a.deadline)}`,
  };
}

export function isOverdue(r: Reminder, now = Date.now()): boolean {
  return r.status === 'active' && !!r.deadline && r.deadline < now;
}

export function reminderMeta(r: Reminder): string[] {
  const out = [targetLabel(r.target)];
  if (r.notBefore && r.notBefore > Date.now()) out.push(`من ${formatWhen(r.notBefore, new Date(r.notBefore).getHours() !== 0)}`);
  if (r.deadline) out.push(isOverdue(r) ? `فات موعده (${formatDeadline(r.deadline)})` : `آخر موعد ${formatDeadline(r.deadline)}`);
  return out;
}

export function isLater(r: Reminder, now = Date.now()): boolean {
  return r.status === 'active' && !!r.notBefore && r.notBefore > now;
}

export function placeBranch(p: SpecificPlace): string | undefined {
  return p.branch ?? branchOf(p.id);
}

/** اسم المكان مع فرعه: «هايبر بنده · حي الملك فهد» */
export function placeWithBranch(p: SpecificPlace): string {
  const branch = placeBranch(p);
  return branch ? `${p.name} · ${branch}` : p.name;
}
