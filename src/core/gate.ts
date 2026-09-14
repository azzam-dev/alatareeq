import { distanceM } from './geo';
import type { Place, Reminder, Settings, SuppressReason, Trip } from './types';

/**
 * هل المكان يحقق هدف التذكير؟
 * hidden: أماكن قال عنها المستخدم «مو مناسب»؛ تنستبعد إلا لو التذكير باسمها الصريح أو موقعها.
 */
export function placeMatches(r: Reminder, place: Place, hidden?: ReadonlySet<string>): boolean {
  const t = r.target;
  if (!t) return false;
  switch (t.kind) {
    case 'category': return !hidden?.has(place.id) && t.categories.some((c) => place.categories.includes(c));
    case 'brand': return place.brands.includes(t.brandId) && (t.brandId.startsWith('name:') || !hidden?.has(place.id));
    case 'place': return place.id === t.place.id || distanceM(place, t.place) < 40;
  }
}

export function inQuietHours(s: Settings, now: Date): boolean {
  if (!s.quietEnabled) return false;
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const cur = now.getHours() * 60 + now.getMinutes();
  const a = toMin(s.quietStart);
  const b = toMin(s.quietEnd);
  return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
}

export interface GateContext {
  now: number;
  trip: Trip;
  settings: Settings;
}

export interface ReminderCheck {
  eligible: Reminder[];
  /** سبب استبعاد كل تذكير ما انقبل */
  excluded: { reminder: Reminder; reason: SuppressReason }[];
}

/** شروط على مستوى التذكير نفسه */
export function checkReminders(reminders: Reminder[], ctx: GateContext): ReminderCheck {
  const eligible: Reminder[] = [];
  const excluded: ReminderCheck['excluded'] = [];
  for (const r of reminders) {
    if (r.status !== 'active') continue;
    if (r.snoozedTripId === ctx.trip.id) excluded.push({ reminder: r, reason: 'snoozed' });
    else if (ctx.trip.notified[r.id]) excluded.push({ reminder: r, reason: 'notified' });
    else if (r.notBefore && r.notBefore > ctx.now) excluded.push({ reminder: r, reason: 'notBefore' });
    else eligible.push(r);
  }
  return { eligible, excluded };
}

export interface PreGateInput {
  angle: number;
  along: number;
  speedMs: number;
}

/**
 * البوابة قبل طلب المسار (رخيصة): الاتجاه، الميزانية، التهدئة، ساعات الهدوء.
 * ترجع null لو كل شيء تمام.
 */
export function preGate(input: PreGateInput, ctx: GateContext): SuppressReason | null {
  const { settings: s, trip, now } = ctx;
  if (input.angle > s.aheadAngleDeg) return 'behind';
  // أقل من ~٨ ثواني للمكان: ما فيه وقت تتصرف بأمان
  if (input.along < Math.max(150, input.speedMs * 8)) return 'late';
  if (trip.alerts >= s.maxAlertsPerTrip) return 'budget';
  if (trip.lastAlertAt && now - trip.lastAlertAt < s.cooldownMin * 60_000) return 'cooldown';
  if (inQuietHours(s, new Date(now))) return 'quiet';
  return null;
}

export function detourGate(detourSeconds: number, s: Settings): SuppressReason | null {
  return detourSeconds > s.maxDetourMin * 60 ? 'detour' : null;
}

export interface Candidate {
  place: Place;
  reminders: Reminder[];
  detourSeconds: number;
  distance: number;
}

/** الترتيب: الأقرب موعدًا نهائيًا، ثم الأرخص تحويلة، ثم الأقرب مسافة */
export function rankCandidates(cands: Candidate[]): Candidate[] {
  const deadline = (c: Candidate) => Math.min(...c.reminders.map((r) => r.deadline ?? Infinity));
  return [...cands].sort((a, b) =>
    deadline(a) - deadline(b) || a.detourSeconds - b.detourSeconds || a.distance - b.distance);
}

/** الترتيب داخل التنبيه نفسه */
export function sortReminders(rs: Reminder[]): Reminder[] {
  return [...rs].sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity) || a.createdAt - b.createdAt);
}
