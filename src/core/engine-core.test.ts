import { describe, expect, it } from 'vitest';
import { formatDetour, formatDistance } from './compose';
import { estimateDetour } from './detour';
import { checkReminders, detourGate, inQuietHours, placeMatches, preGate, rankCandidates } from './gate';
import { offset, relativeTo } from './geo';
import { ModeTracker } from './motion';
import { DEFAULT_SETTINGS, type Place, type Reminder, type Trip } from './types';

const me = { lat: 24.7, lon: 46.68 };
const trip = (over: Partial<Trip> = {}): Trip => ({ id: 't1', startedAt: 0, alerts: 0, notified: {}, askedPassed: [], distanceM: 0, ...over });
const rem = (over: Partial<Reminder> = {}): Reminder => ({
  id: 'r1', title: 'دواء', trigger: 'pass', status: 'active', createdAt: 0,
  target: { kind: 'category', categories: ['pharmacy'] }, ...over,
});
const pharmacy: Place = { id: 'p1', name: 'صيدلية', lat: 0, lon: 0, categories: ['pharmacy'], brands: [] };

describe('geo', () => {
  it('مكان قدامك مباشرة', () => {
    const p = offset(me, 0, 700);
    const r = relativeTo(me, 0, p);
    expect(r.distance).toBeCloseTo(700, 0);
    expect(r.angle).toBeLessThan(1);
    expect(r.along).toBeCloseTo(700, 0);
  });
  it('مكان وراك', () => {
    const r = relativeTo(me, 0, offset(me, 180, 500));
    expect(r.angle).toBeCloseTo(180, 0);
  });
});

describe('detour L0', () => {
  it('نفس الجهة: تحويلة شبه صفر', () => {
    const d = estimateDetour({ routeDistanceM: 720, alongM: 700, crossM: 20 });
    expect(d.seconds).toBeLessThan(15);
    expect(d.uturn).toBe(false);
  });
  it('مثال الخطة: ٣٠٠ م في الجهة الثانية ← حوالي ٨ دقائق', () => {
    const d = estimateDetour({ routeDistanceM: 2300, alongM: 300, crossM: 40 });
    expect(d.uturn).toBe(true);
    expect(d.seconds).toBeGreaterThan(420);
    expect(detourGate(d.seconds, DEFAULT_SETTINGS)).toBe('detour');
  });
});

describe('gate', () => {
  const ctx = { now: 10 * 60_000, trip: trip(), settings: { ...DEFAULT_SETTINGS, quietEnabled: false } };
  it('يرفض المكان اللي وراك', () => {
    expect(preGate({ angle: 75, along: 500, speedMs: 15 }, ctx)).toBe('behind');
  });
  it('يرفض لو قريب مرّة', () => {
    expect(preGate({ angle: 5, along: 90, speedMs: 15 }, ctx)).toBe('late');
  });
  it('الميزانية والتهدئة', () => {
    expect(preGate({ angle: 5, along: 800, speedMs: 15 }, { ...ctx, trip: trip({ alerts: 3 }) })).toBe('budget');
    expect(preGate({ angle: 5, along: 800, speedMs: 15 }, { ...ctx, trip: trip({ alerts: 1, lastAlertAt: ctx.now - 60_000 }) })).toBe('cooldown');
    expect(preGate({ angle: 5, along: 800, speedMs: 15 }, { ...ctx, trip: trip({ alerts: 1, lastAlertAt: ctx.now - 5 * 60_000 }) })).toBeNull();
  });
  it('لاحقًا وسبق التنبيه', () => {
    const res = checkReminders([
      rem({ id: 'a', snoozedTripId: 't1' }),
      rem({ id: 'b' }),
      rem({ id: 'c', status: 'done' }),
      rem({ id: 'd', notBefore: ctx.now + 1 }),
    ], { ...ctx, trip: trip({ notified: { b: 'p1' } }) });
    expect(res.eligible).toHaveLength(0);
    expect(res.excluded.map((e) => e.reason)).toEqual(['snoozed', 'notified', 'notBefore']);
  });
  it('ساعات الهدوء تلف بعد منتصف الليل', () => {
    const s = DEFAULT_SETTINGS;
    expect(inQuietHours(s, new Date(2026, 0, 1, 23, 30))).toBe(true);
    expect(inQuietHours(s, new Date(2026, 0, 1, 5, 59))).toBe(true);
    expect(inQuietHours(s, new Date(2026, 0, 1, 12, 0))).toBe(false);
  });
  it('مطابقة الفئة والبراند', () => {
    expect(placeMatches(rem(), pharmacy)).toBe(true);
    expect(placeMatches(rem({ target: { kind: 'brand', brandId: 'jarir', label: 'جرير' } }), pharmacy)).toBe(false);
  });
  it('الترتيب: الموعد النهائي أولًا ثم التحويلة', () => {
    const a = { place: pharmacy, reminders: [rem()], detourSeconds: 30, distance: 500 };
    const b = { place: pharmacy, reminders: [rem({ deadline: 5 })], detourSeconds: 120, distance: 900 };
    const c = { place: pharmacy, reminders: [rem()], detourSeconds: 10, distance: 900 };
    expect(rankCandidates([a, b, c])).toEqual([b, c, a]);
  });
});

describe('mode', () => {
  it('يبدأ المشوار بعد سرعة مستمرة وينتهي بعد ٣ دقائق وقوف', () => {
    const m = new ModeTracker();
    const base = { hasPlaceReminders: true, approaching: false };
    expect(m.step({ ...base, t: 0, speed: 0 }).mode).toBe('stationary');
    m.step({ ...base, t: 1000, speed: 12 });
    const started = m.step({ ...base, t: 6000, speed: 12 });
    expect(started.tripStarted).toBe(true);
    expect(started.mode).toBe('driving');
    m.step({ ...base, t: 10_000, speed: 0 });
    expect(m.step({ ...base, t: 100_000, speed: 0 }).mode).toBe('driving');
    const ended = m.step({ ...base, t: 191_000, speed: 0 });
    expect(ended.tripEnded).toBe(true);
    expect(ended.mode).toBe('stationary');
  });
});

describe('compose', () => {
  it('تنسيق المسافة والتحويلة', () => {
    expect(formatDistance(712)).toBe('700 م');
    expect(formatDistance(1540)).toBe('1.5 كم');
    expect(formatDetour(20)).toBe('+أقل من دقيقة');
    expect(formatDetour(130)).toBe('+2 د');
  });
});
