import type { Reminder, RemindBefore } from './types';

const HOUR = 60 * 60_000;
/** الموعد بيوم بس («الثلاثاء») ينبّه الساعة ٩ الصبح */
const DAY_ALERT_HOUR = 9;
/** «الليلة اللي قبل» الساعة ٩ م */
const EVE_ALERT_HOUR = 21;
/** لما يختار «بساعة محددة» على يوم ثاني غير اليوم */
const DEFAULT_CLOCK_HOUR = 17;

/** الموعد بيوم بس ينحفظ نهاية اليوم (٢٣:٥٩)، وبساعة ينحفظ بالساعة نفسها */
export function isAllDay(deadline: number): boolean {
  const d = new Date(deadline);
  return d.getHours() === 23 && d.getMinutes() === 59;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

// ——— متى نذكره ———

/** خيارات «ذكرني» لنوع الموعد، الافتراضي أول */
export function remindOptions(allDay: boolean): RemindBefore[] {
  return allDay ? ['morning', 'eve', 'none'] : ['hour', 'hours3', 'day', 'none'];
}

/** الخيار الفعلي: الغياب أو اللي ما يناسب نوع الموعد يصير الافتراضي */
export function effectiveRemind(deadline: number, remind?: RemindBefore): RemindBefore {
  const options = remindOptions(isAllDay(deadline));
  return remind && options.includes(remind) ? remind : options[0];
}

/** وقت الإشعار قبل الموعد حسب «ذكرني»، بدون النظر لو فات */
export function remindTime(deadline: number, remind?: RemindBefore): number | null {
  const at = new Date(deadline);
  switch (effectiveRemind(deadline, remind)) {
    case 'none': return null;
    case 'hour': return deadline - HOUR;
    case 'hours3': return deadline - 3 * HOUR;
    case 'day': return deadline - 24 * HOUR;
    case 'morning': at.setHours(DAY_ALERT_HOUR, 0, 0, 0); return at.getTime();
    case 'eve': at.setDate(at.getDate() - 1); at.setHours(EVE_ALERT_HOUR, 0, 0, 0); return at.getTime();
  }
}

/**
 * وقت التنبيه قبل الموعد: الافتراضي بساعة لو فيه ساعة، و٩ الصبح لو يوم بس.
 * ما فيه تنبيه لو وقته فات (موعد بعد أقل من ساعة، أو «اليوم» بعد ٩ الصبح) أو «لا تذكرني».
 */
export function deadlineAlertAt(deadline: number, now: number, remind?: RemindBefore): number | null {
  const at = remindTime(deadline, remind);
  return at !== null && at > now ? at : null;
}

/** إشعار واحد لكل الأغراض اللي لها نفس الموعد ونفس «ذكرني» («باقي ساعة: خبز، حليب») */
export interface DeadlineAlert {
  at: number;
  deadline: number;
  allDay: boolean;
  remind: RemindBefore;
  reminders: Reminder[];
}

/** تنبيهات المواعيد الجاية للأغراض اللي باقية، الأقرب أول */
export function deadlineAlerts(reminders: Reminder[], now: number): DeadlineAlert[] {
  // بالموعد مو بوقت التنبيه: «الخميس» و«الخميس الساعة ١٠» ينبّهون ٩ الصبح بنصين مختلفين
  const byKey = new Map<string, DeadlineAlert>();
  for (const r of reminders) {
    if (r.status !== 'active' || r.deadline === undefined) continue;
    const at = deadlineAlertAt(r.deadline, now, r.remindBefore);
    if (at === null) continue;
    const remind = effectiveRemind(r.deadline, r.remindBefore);
    const key = `${r.deadline}:${remind}`;
    const a = byKey.get(key);
    if (a) a.reminders.push(r);
    else byKey.set(key, { at, deadline: r.deadline, allDay: isAllDay(r.deadline), remind, reminders: [r] });
  }
  return [...byKey.values()].sort((a, b) => a.at - b.at);
}

// ——— تعديل الموعد في المحرر ———

/** أول ما يفتح «آخر موعد»: اليوم، طول اليوم */
export function newDeadline(now: number): number {
  return endOfDay(now);
}

/** يوم قدام أو ورا بنفس الساعة، وما يرجع قبل اليوم */
export function shiftDay(deadline: number, days: number, now: number): number {
  const d = new Date(deadline);
  d.setDate(d.getDate() + days);
  return startOfDay(d.getTime()) < startOfDay(now) ? deadline : d.getTime();
}

const HALF_HOUR_MIN = 30;

/** أول ساعة معقولة لما يترك «طول اليوم»: اليوم ← أول ساعة كاملة بعد ساعتين من الحين (يلحق تنبيه قبلها بساعة)، ويوم ثاني ← ٥ م */
function firstClock(deadline: number, now: number): number {
  if (startOfDay(deadline) !== startOfDay(now)) {
    const d = new Date(deadline);
    d.setHours(DEFAULT_CLOCK_HOUR, 0, 0, 0);
    return d.getTime();
  }
  const d = new Date(now + 2 * HOUR);
  if (d.getMinutes() || d.getSeconds() || d.getMilliseconds()) d.setHours(d.getHours() + 1, 0, 0, 0);
  return d.getTime();
}

/**
 * عدّاد «الوقت»: كل ضغطة نص ساعة (10:00 ← 10:30). «طول اليوم» أول قيمة، ومنه + أو − يبدأ بساعة معقولة.
 * بعد 11:30 م أو قبل 12:00 ص يرجع «طول اليوم». وقت مو على نص ساعة (10:15) ينقرّب للي بعده أو قبله.
 */
export function shiftTime(deadline: number, steps: number, now: number): number {
  if (isAllDay(deadline)) return firstClock(deadline, now);
  const d = new Date(deadline);
  const m = d.getHours() * 60 + d.getMinutes();
  const next = steps > 0
    ? Math.floor(m / HALF_HOUR_MIN) * HALF_HOUR_MIN + steps * HALF_HOUR_MIN
    : Math.ceil(m / HALF_HOUR_MIN) * HALF_HOUR_MIN + steps * HALF_HOUR_MIN;
  if (next < 0 || next >= 24 * 60) return endOfDay(deadline);
  d.setHours(Math.floor(next / 60), next % 60, 0, 0);
  return d.getTime();
}
