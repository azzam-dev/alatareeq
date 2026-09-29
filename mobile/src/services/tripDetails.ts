import { reasonText } from '../../../src/core/compose';
import { distanceM } from '../../../src/core/geo';
import { CATEGORY_BY_ID } from '../../../src/core/lexicon';
import { MONTHLY_PLACES_BUDGET, type TilePlace } from '../../../src/core/placeTiles';
import { DEFAULT_SETTINGS, type CategoryId, type SuppressReason } from '../../../src/core/types';
import type { TripLog } from './tripLog';

/**
 * مؤقت للاختبار: يحسب «تفاصيل المشوار» من سجله، ومن السيرفر يعرف المحلات اللي في المربعات ووش كان مسجّل قبل المشوار
 * (`place_tiles.fetched_at`) وكم باقي من رصيد TomTom. ينشال مع `tripLog.ts`.
 */

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export interface TileRow {
  tile: string;
  category: CategoryId;
  fetched_at: string;
  places: TilePlace[];
}

async function api<T>(path: string): Promise<T | null> {
  if (!URL || !KEY) return null;
  try {
    const r = await fetch(`${URL}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function fetchTileRows(keys: string[]): Promise<TileRow[]> {
  const tiles = [...new Set(keys.map((k) => k.split('|')[0]))];
  if (!tiles.length) return [];
  const list = encodeURIComponent(tiles.map((t) => `"${t}"`).join(','));
  return (await api<TileRow[]>(`place_tiles?select=tile,category,fetched_at,places&tile=in.(${list})`)) ?? [];
}

/** كم صرفنا من رصيد TomTom في شهر المشوار */
export async function fetchSpent(at: number): Promise<number | null> {
  const month = new Date(at).toISOString().slice(0, 7);
  const rows = await api<{ spent: number }[]>(`tomtom_budget?select=spent&month=eq.${month}`);
  return rows ? rows.reduce((s, r) => s + Number(r.spent), 0) : null;
}

const EMOJI: Partial<Record<CategoryId, string>> = {
  pharmacy: '💊', grocery: '🛒', bookstore: '📚', fuel: '⛽', laundry: '👔', charging: '🔌', toys: '🧸', electronics: '💻', mobile: '📱',
  clothes: '👕', shoes: '👟', perfume: '🌸', jewelry: '💍', florist: '💐', gifts: '🎁', houseware: '🍽️', furniture: '🛋️', hardware: '🔧',
  sports: '⚽', pets: '🐾', bakery: '🥖', sweets: '🍬', cafe: '☕', restaurant: '🍴', atm: '🏧', bank: '🏦', clinic: '🩺', hospital: '🏥',
  optician: '👓', barber: '💈', beauty: '💅', carWash: '🚿', carParts: '⚙️', carRepair: '🛠️', post: '📮', tailor: '🧵', butcher: '🥩',
  mall: '🏬', gym: '🏋️', produce: '🥦', fish: '🐟', carpets: '🧶', curtains: '🪟', lighting: '💡', paint: '🎨', building: '🧱', garden: '🪴',
  kitchens: '🚰', cosmetics: '💄', bags: '👜', print: '🖨️', medicalSupplies: '🩹', tires: '🛞', carRental: '🚗', vet: '🐕',
};

const ANSWER: Record<string, string> = {
  go: 'رحت له («اذهب»)', done: 'تم', later: 'مو بهالمشوار', notHere: 'مو هذا المحل', ignored: 'ما رديت', open: 'فتحت الإشعار',
};

/** لون المحل على الخريطة: نبّهناك، ما نبّهناك، يناسب تذاكيرك وما دخل النطاق، ما يخصك */
export type PlaceMark = 'alerted' | 'skipped' | 'matched' | 'other';

export interface MapData {
  /** [عرض، طول، اتجاه، وقت] */
  path: [number, number, number | null, number][];
  tiles: { id: string; src: 'phone' | 'db' | 'new' | 'none' }[];
  places: { id: string; lat: number; lon: number; emoji: string; mark: PlaceMark; isNew: boolean | null; name: string; info: string }[];
  bells: { lat: number; lon: number; title: string }[];
  ringM: number;
  aheadDeg: number;
  live: boolean;
}

export interface TripView {
  durationMs: number;
  distanceM: number;
  /** طلبات TomTom تقريبًا: المربعات اللي انجابت جديدة بهالمشوار */
  tomtom: number;
  budgetLeft: number | null;
  placesTotal: number;
  placesNew: number;
  placesMatched: number;
  alerts: { t: number; placeId: string; title: string; items: string; answer: string }[];
  skipped: { placeId: string; name: string; why: string }[];
  /** الموقع انقطع أكثر من ٢٠ ث */
  gaps: { t: number; ms: number }[];
  cut: boolean;
  map: MapData;
}

/** «نبّهناك» يغلب «ما نبّهناك» (لأن السبب ممكن يكون قبل ما يقرب)، وكلها تغلب «نقيّمه» */
const RANK: Record<string, number> = { alerted: 4, rejected: 3, blocked: 3, pending: 2, passed: 1 };

export function summarize(log: TripLog, rows: TileRow[], spent: number | null, live: boolean): TripView {
  const start = log.startedAt;
  const end = log.endedAt ?? log.points.at(-1)?.[0] ?? start;
  const settings = { ...DEFAULT_SETTINGS, ...log.settings };
  const isNewRow = (r: TileRow) => new Date(r.fetched_at).getTime() >= start - 60_000;

  // المربعات: من الجوال، أو من السيرفر (قبل المشوار = قاعدة البيانات، أثناءه = جديد من TomTom)
  const keys = Object.keys(log.tiles);
  const cats = new Set(keys.map((k) => k.split('|')[1]));
  const byKey = new Map(rows.map((r) => [`${r.tile}|${r.category}`, r]));
  const srcOf = (k: string) => {
    const r = byKey.get(k);
    return log.tiles[k] === 'phone' ? 'phone' : !r ? 'none' : isNewRow(r) ? 'new' : 'db';
  };
  const tileIds = [...new Set(keys.map((k) => k.split('|')[0]))];
  const tiles = tileIds.map((id) => {
    const s = keys.filter((k) => k.startsWith(`${id}|`)).map(srcOf);
    const src = s.includes('new') ? 'new' : s.includes('db') ? 'db' : s.includes('phone') ? 'phone' : 'none';
    return { id, src } as MapData['tiles'][number];
  });

  // حالة كل محل من سجل القرارات
  const state = new Map<string, { st: string; reason: string | null; angle: number; detour: number | null }>();
  for (const [, id, st, reason, , angle, detour] of log.cands) {
    const cur = state.get(id);
    if (!cur || (RANK[st] ?? 0) >= (RANK[cur.st] ?? 0)) state.set(id, { st, reason: reason ?? cur?.reason ?? null, angle, detour });
  }
  const alerted = new Set(log.alerts.map((a) => a.placeId));
  const whyOf = (id: string) => {
    const s = state.get(id);
    if (!s?.reason) return 'ما وصلنا له';
    return reasonText(s.reason as SuppressReason, { detourSeconds: s.detour ?? undefined, angle: s.angle, settings });
  };
  const markOf = (id: string, matched: boolean): PlaceMark => {
    if (alerted.has(id)) return 'alerted';
    const st = state.get(id)?.st;
    if (st === 'rejected' || st === 'blocked') return 'skipped';
    return matched ? 'matched' : 'other';
  };

  // المحلات: كل اللي في المربعات لأنواع المشوار، والمطابقة لتذاكيرك من السجل
  const places = new Map<string, { id: string; name: string; lat: number; lon: number; categories: CategoryId[]; isNew: boolean | null }>();
  for (const r of rows) {
    if (!cats.has(r.category)) continue;
    for (const p of r.places ?? []) {
      const have = places.get(p.id);
      if (have) {
        if (!have.categories.includes(p.category)) have.categories.push(p.category);
        continue;
      }
      places.set(p.id, { id: p.id, name: p.name, lat: p.lat, lon: p.lon, categories: [p.category], isNew: isNewRow(r) });
    }
  }
  for (const [id, p] of Object.entries(log.places)) {
    if (!places.has(id)) places.set(id, { id, name: p.name, lat: p.lat, lon: p.lon, categories: p.categories, isNew: null });
  }
  const nameOf = (p: { name: string; categories: CategoryId[] }) => p.name || CATEGORY_BY_ID[p.categories[0]]?.label || 'محل';

  const mapPlaces = [...places.values()].map((p) => {
    const matched = p.id in log.places;
    const mark = markOf(p.id, matched);
    const kinds = p.categories.map((c) => CATEGORY_BY_ID[c]?.label ?? c).join('، ');
    const status = mark === 'alerted' ? 'نبّهناك' : mark === 'skipped' ? `ما نبّهناك: ${whyOf(p.id)}` : matched ? 'يناسب تذاكيرك وما دخل النطاق' : '';
    const when = p.isNew === null ? '' : p.isNew ? 'جديد بهالمشوار' : 'مسجّل قبل المشوار';
    return {
      id: p.id, lat: p.lat, lon: p.lon, emoji: EMOJI[p.categories[0]] ?? '📍', mark, isNew: p.isNew, name: nameOf(p),
      info: [kinds, status, when].filter(Boolean).join('\n'),
    };
  });

  const path = log.points.map((p): MapData['path'][number] => [p[1], p[2], p[4], p[0]]);
  let dist = 0;
  const gaps: TripView['gaps'] = [];
  for (let i = 1; i < log.points.length; i++) {
    const a = log.points[i - 1];
    const b = log.points[i];
    dist += distanceM({ lat: a[1], lon: a[2] }, { lat: b[1], lon: b[2] });
    if (b[0] - a[0] > 20_000) gaps.push({ t: a[0], ms: b[0] - a[0] });
  }
  const pointAt = (t: number) => log.points.reduce((best, p) => (Math.abs(p[0] - t) < Math.abs(best[0] - t) ? p : best), log.points[0]);

  const matchedIds = Object.keys(log.places);
  return {
    durationMs: end - start,
    distanceM: dist,
    tomtom: tiles.filter((t) => t.src === 'new').length,
    budgetLeft: spent === null ? null : Math.max(0, Math.round(MONTHLY_PLACES_BUDGET - spent)),
    placesTotal: places.size,
    placesNew: [...places.values()].filter((p) => p.isNew).length,
    placesMatched: matchedIds.length,
    alerts: log.alerts.map((a) => {
      const r = log.responses.find((x) => x.alertId === a.id);
      return { t: a.t, placeId: a.placeId, title: a.title, items: a.items, answer: r ? ANSWER[r.action] ?? r.action : 'ما رديت' };
    }),
    skipped: matchedIds.filter((id) => markOf(id, true) === 'skipped').map((id) => ({ placeId: id, name: nameOf(places.get(id)!), why: whyOf(id) })),
    gaps,
    cut: log.events.some((e) => e.kind === 'cut'),
    map: {
      path, tiles, places: mapPlaces, ringM: settings.outerRingM, aheadDeg: settings.aheadAngleDeg, live,
      bells: log.points.length ? log.alerts.map((a) => { const p = pointAt(a.t); return { lat: p[1], lon: p[2], title: a.title }; }) : [],
    },
  };
}
