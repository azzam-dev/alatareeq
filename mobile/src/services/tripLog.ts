import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { targetLabel } from '../../../src/core/compose';
import type { CategoryId, Place, Reminder, Settings } from '../../../src/core/types';

/**
 * مؤقت للاختبار: يسجّل المشوار كامل ويرفعه لجدول `trip_logs`، وصفحة `public/trips.html` تعرضه على خريطة.
 * ينشال مع الصفحة والجدول بعد الاختبار. مطفي افتراضيًا، ويتشغّل من «إعدادات متقدمة».
 */

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const ON_KEY = 'alatareeq:triplog:on';
const DEVICE_KEY = 'alatareeq:triplog:device';
/** المشوار الحالي (ينحفظ كل شوي عشان لو انقفلت الصفحة) واللي ما ارتفع */
const CURRENT_KEY = 'alatareeq:triplog:current';
const PENDING_KEY = 'alatareeq:triplog:pending';
/** نقطة من المسار كل ٣ ثواني بالكثير */
const POINT_GAP_MS = 3000;
/** الجدول يرفض أكبر من ١ ميقا */
const MAX_CHARS = 900_000;

export type TripSource = 'gps' | 'test';

/** [وقت، عرض، طول، سرعة م/ث، اتجاه] */
type Point = [number, number, number, number, number | null];

export interface TripLog {
  v: 1;
  id: string;
  source: TripSource;
  startedAt: number;
  endedAt?: number;
  settings: Pick<Settings, 'maxDetourMin' | 'maxAlertsPerTrip' | 'outerRingM' | 'aheadAngleDeg'>;
  reminders: { id: string; title: string; target: string; categories: CategoryId[]; brandId?: string }[];
  points: Point[];
  /** كل مربع|نوع احتجناه: `phone` كان محفوظ في الجوال، `server` طلبناه */
  tiles: Record<string, 'phone' | 'server'>;
  /** طلبات السيرفر */
  requests: { t: number; asked: string[]; done: string[]; pending: number; ok: boolean; ms: number }[];
  /** المحلات اللي طابقت تذكير، بأول مرة شفناها */
  places: Record<string, { name: string; lat: number; lon: number; categories: CategoryId[]; branch?: string; t: number }>;
  /** تغير حالة كل محل: [وقت، محل، حالة، سبب، بعده م، زاوية، تحويلة ث] */
  cands: [number, string, string, string | null, number, number, number | null][];
  alerts: { t: number; id: string; placeId: string; title: string; items: string; distance: number; detour: number; why?: string }[];
  responses: { t: number; alertId: string; action: string }[];
  events: { t: number; kind: string; text?: string }[];
  /** وقفنا نسجّل نقاط لأن السجل كبر */
  truncated?: boolean;
}

// ——— الإعداد ———

let on = false;
const listeners = new Set<() => void>();

void AsyncStorage.getItem(ON_KEY).then((v) => {
  on = v === '1';
  listeners.forEach((l) => l());
  if (on) void recover();
}).catch(() => undefined);

export function setTripLogOn(v: boolean) {
  on = v;
  AsyncStorage.setItem(ON_KEY, v ? '1' : '0').catch(() => undefined);
  listeners.forEach((l) => l());
}

export function useTripLogOn(): boolean {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => on);
}

// ——— التسجيل ———

let cur: TripLog | null = null;
let lastPoint = 0;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const tripLog = {
  get active() {
    return on && !!cur;
  },

  start(id: string, source: TripSource, t: number, settings: Settings, reminders: Reminder[]) {
    if (!on) return;
    cur = {
      v: 1, id, source, startedAt: t,
      settings: {
        maxDetourMin: settings.maxDetourMin, maxAlertsPerTrip: settings.maxAlertsPerTrip,
        outerRingM: settings.outerRingM, aheadAngleDeg: settings.aheadAngleDeg,
      },
      reminders: reminders.map((r) => ({
        id: r.id, title: r.title, target: targetLabel(r.target),
        categories: r.target?.kind === 'category' ? r.target.categories : [],
        brandId: r.target?.kind === 'brand' ? r.target.brandId : undefined,
      })),
      points: [], tiles: {}, requests: [], places: {}, cands: [], alerts: [], responses: [], events: [],
    };
    lastPoint = 0;
    save();
  },

  point(t: number, lat: number, lon: number, speed: number, heading: number | null) {
    if (!cur || cur.truncated || t - lastPoint < POINT_GAP_MS) return;
    lastPoint = t;
    cur.points.push([t, round(lat, 6), round(lon, 6), round(speed, 1), heading === null ? null : Math.round(heading)]);
    if (cur.points.length % 20 === 0 && JSON.stringify(cur).length > MAX_CHARS) {
      cur.truncated = true;
      tripLog.event(t, 'truncated', 'السجل كبر، وقفنا نسجّل نقاط المسار');
    }
    save();
  },

  tiles(keys: string[], missing: string[]) {
    if (!cur) return;
    for (const k of keys) cur.tiles[k] ??= missing.includes(k) ? 'server' : 'phone';
  },

  request(r: TripLog['requests'][number]) {
    if (!cur) return;
    cur.requests.push(r);
    save();
  },

  place(p: Place, t: number) {
    if (!cur || cur.places[p.id]) return;
    cur.places[p.id] = { name: p.name, lat: round(p.lat, 6), lon: round(p.lon, 6), categories: p.categories, branch: p.branch, t };
  },

  cand(t: number, placeId: string, status: string, reason: string | undefined, distance: number, angle: number, detour?: number) {
    cur?.cands.push([t, placeId, status, reason ?? null, Math.round(distance), Math.round(angle), detour ?? null]);
  },

  alert(a: TripLog['alerts'][number]) {
    if (!cur) return;
    cur.alerts.push(a);
    save();
  },

  response(t: number, alertId: string, action: string) {
    if (!cur) return;
    cur.responses.push({ t, alertId, action });
    save();
  },

  event(t: number, kind: string, text?: string) {
    if (!cur) return;
    cur.events.push({ t, kind, text });
    save();
  },

  /** نهاية المشوار: نرفعه، ولو ما نفع يبقى وينرفع بعدين */
  finish(t: number) {
    if (!cur) return;
    cur.endedAt = t;
    const done = cur;
    cur = null;
    clearTimeout(saveTimer);
    AsyncStorage.removeItem(CURRENT_KEY).catch(() => undefined);
    void queue(done);
  },

  /** زر «ارفع الحين»: المشوار الحالي لين الحين (ويكمل تسجيله) واللي ما ارتفع قبل */
  async uploadNow(): Promise<string> {
    if (cur) await upload(cur);
    const left = await flush();
    return left ? `ارتفع، وباقي ${left} ما ارتفعت (تأكد من النت)` : 'ارتفع';
  },
};

function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** نحفظ المشوار الحالي في الجهاز كل شوي: Safari يقفل الصفحة أحيانًا وهي بالخلفية */
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (cur) AsyncStorage.setItem(CURRENT_KEY, JSON.stringify(cur)).catch(() => undefined);
  }, 2000);
}

/** بداية التطبيق: مشوار انقطع (انقفلت الصفحة) يتسكّر ويرتفع، واللي ما ارتفع يرتفع */
async function recover() {
  try {
    const raw = await AsyncStorage.getItem(CURRENT_KEY);
    if (raw) {
      const log = JSON.parse(raw) as TripLog;
      log.endedAt ??= log.points.at(-1)?.[0] ?? log.startedAt;
      log.events.push({ t: log.endedAt, kind: 'cut', text: 'التطبيق انقفل قبل نهاية المشوار' });
      await AsyncStorage.removeItem(CURRENT_KEY);
      await queue(log);
    } else {
      await flush();
    }
  } catch { /* تجاهل */ }
}

async function pending(): Promise<TripLog[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(PENDING_KEY)) ?? '[]') as TripLog[];
  } catch {
    return [];
  }
}

async function queue(log: TripLog) {
  if (!log.points.length) return;
  try {
    const list = await pending();
    list.push(log);
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-5)));
  } catch { /* تجاهل */ }
  await flush();
}

/** يرفع اللي ما ارتفع، ويرجع كم باقي */
async function flush(): Promise<number> {
  const list = await pending();
  const left: TripLog[] = [];
  for (const log of list) if (!(await upload(log))) left.push(log);
  try {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(left));
  } catch { /* تجاهل */ }
  return left.length;
}

/** إضافة بس (الجدول ما يسمح بتعديل): رفع نفس المشوار مرتين يطلع سجلين، والصفحة تعرض الأحدث لكل مشوار */
async function upload(log: TripLog): Promise<boolean> {
  if (!URL || !KEY) return false;
  try {
    const r = await fetch(`${URL}/rest/v1/trip_logs`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ device: await deviceId(), log }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function deviceId(): Promise<string> {
  try {
    const have = await AsyncStorage.getItem(DEVICE_KEY);
    if (have) return have;
    const id = Math.random().toString(36).slice(2, 10);
    await AsyncStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return 'unknown';
  }
}
