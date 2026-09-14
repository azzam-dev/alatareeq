import type { BBox, LatLon } from '../core/geo';
import { BRAND_BY_ID, CATEGORIES } from '../core/lexicon';
import { escapeRegex } from '../core/normalize';
import { classifyPlace } from '../core/placeKind';
import type { CategoryId, Place, SpecificPlace } from '../core/types';

// ——— Overpass: الأماكن حسب الفئة أو البراند ———

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/** تعبير مرن للعربي (للمطابقة المحلية في JS): ة/ه، أ/ا، ى/ي */
export function looseArabicRegex(text: string): string {
  return escapeRegex(text.trim())
    .replace(/[ةه]/g, '[ةه]')
    .replace(/[اأإآ]/g, '[اأإآ]')
    .replace(/[يى]/g, '[يى]')
    .replace(/\s+/g, '\\s*');
}

/** لـ Overpass: بدائل صريحة بدل أقواس الحروف، لأن محرك التعبيرات هناك ما يضمن UTF-8 داخل الأقواس */
function overpassVariants(text: string): string {
  const base = text.trim().replace(/\s+/g, ' ');
  const variants = new Set<string>();
  for (const v of [base, base.replace(/ة/g, 'ه'), base.replace(/ه(?=\s|$)/g, 'ة')]) {
    variants.add(v);
    variants.add(v.replace(/[أإآ]/g, 'ا'));
  }
  return [...variants].map(escapeRegex).join('|');
}

function customName(brandId: string, label: string): string {
  return brandId.startsWith('name:') ? brandId.slice(5) || label : label;
}

export function brandRegex(brandId: string, label: string): string {
  return BRAND_BY_ID[brandId]?.osmRegex ?? looseArabicRegex(customName(brandId, label));
}

function brandRegexOverpass(brandId: string, label: string): string {
  return BRAND_BY_ID[brandId]?.osmRegex ?? overpassVariants(customName(brandId, label));
}

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface Wanted {
  categories: CategoryId[];
  brands: { id: string; label: string }[];
}

/** مهلة كل خادم؛ أطول من مهلة الاستعلام نفسه عشان الخادم يلحق يرجع ملاحظة الخطأ */
const OVERPASS_TIMEOUT_MS = 25_000;

export async function fetchPlaces(bbox: BBox, wanted: Wanted): Promise<Place[]> {
  const stmts: string[] = [];
  for (const c of CATEGORIES.filter((c) => wanted.categories.includes(c.id))) {
    for (const [k, v] of c.osm) stmts.push(`nwr["${k}"="${v}"];`);
  }
  const brandRes = wanted.brands.map((b) => ({ id: b.id, re: brandRegex(b.id, b.label) }));
  for (const b of wanted.brands) {
    const re = brandRegexOverpass(b.id, b.label).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    stmts.push(`nwr[~"^(name|brand)(:(ar|en))?$"~"${re}",i];`);
  }
  if (!stmts.length) return [];

  const q = `[out:json][timeout:20][bbox:${bbox.s.toFixed(5)},${bbox.w.toFixed(5)},${bbox.n.toFixed(5)},${bbox.e.toFixed(5)}];(${stmts.join('')});out tags center 2500;`;

  let lastErr: unknown;
  for (const url of OVERPASS) {
    try {
      const res = await fetchWithTimeout(url, OVERPASS_TIMEOUT_MS, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = (await res.json()) as { elements: OsmElement[]; remark?: string };
      // لو انتهت مهلة الاستعلام يرجع Overpass نتيجة ناقصة مع ملاحظة؛ قبولها يحفظها ٢٤ ساعة كأنها كاملة
      if (json.remark?.includes('runtime error')) throw new Error(json.remark);
      return json.elements.map((el) => toPlace(el, brandRes)).filter((p): p is Place => p !== null);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function toPlace(el: OsmElement, brands: { id: string; re: string }[]): Place | null {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  const tags = el.tags ?? {};
  if (lat == null || lon == null) return null;
  const names = ['name', 'name:ar', 'name:en', 'brand', 'brand:ar', 'brand:en'].map((k) => tags[k]).filter(Boolean);
  const matchedBrands = brands.filter((b) => {
    const re = new RegExp(b.re, 'i');
    return names.some((n) => re.test(n));
  }).map((b) => b.id);
  const name = tags['name:ar'] || tags.name || tags['brand:ar'] || tags.brand || tags.operator || '';
  return { id: `${el.type}/${el.id}`, name, lat, lon, ...classifyPlace(tags), brands: matchedBrands };
}

// ——— OSRM: المسارات والوقت ———

const OSRM = 'https://router.project-osrm.org/route/v1/driving';

let chain: Promise<unknown> = Promise.resolve();
let lastCall = 0;

/** الخادم التجريبي يطلب طلب واحد بالثانية تقريبًا، فنرتّب الطلبات */
function queued<T>(fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    const wait = lastCall + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

export interface RouteSummary { distance: number; duration: number }

export function routeTo(from: LatLon, to: LatLon, heading: number | null): Promise<RouteSummary> {
  return queued(async () => {
    const coords = `${from.lon.toFixed(6)},${from.lat.toFixed(6)};${to.lon.toFixed(6)},${to.lat.toFixed(6)}`;
    const params = new URLSearchParams({ overview: 'false', alternatives: 'false' });
    // الاتجاه يمنع OSRM يثبّتك على المسار المعاكس في الطرق المزدوجة
    if (heading !== null) params.set('bearings', `${Math.round(heading) % 360},60;`);
    const res = await fetchWithTimeout(`${OSRM}/${coords}?${params}`, 8000);
    const json = await res.json();
    if (json.code !== 'Ok' || !json.routes?.length) throw new Error(json.code ?? 'NoRoute');
    return { distance: json.routes[0].distance, duration: json.routes[0].duration };
  });
}

export interface RouteGeometry {
  coords: LatLon[];
  /** سرعة كل مقطع (م/ث) */
  speeds: number[];
  distance: number;
  duration: number;
}

export function routeGeometry(from: LatLon, to: LatLon): Promise<RouteGeometry> {
  return queued(async () => {
    const coords = `${from.lon.toFixed(6)},${from.lat.toFixed(6)};${to.lon.toFixed(6)},${to.lat.toFixed(6)}`;
    const res = await fetchWithTimeout(`${OSRM}/${coords}?overview=full&geometries=geojson&annotations=distance,duration`, 12000);
    const json = await res.json();
    if (json.code !== 'Ok' || !json.routes?.length) throw new Error(json.code ?? 'NoRoute');
    const r = json.routes[0];
    const pts: LatLon[] = r.geometry.coordinates.map(([lon, lat]: [number, number]) => ({ lat, lon }));
    const ann = r.legs[0].annotation;
    const speeds: number[] = ann.distance.map((d: number, i: number) => {
      const t = ann.duration[i];
      return Math.min(33, Math.max(6, t > 0 ? d / t : 14));
    });
    return { coords: pts, speeds, distance: r.distance, duration: r.duration };
  });
}

// ——— Nominatim: البحث عن مكان محدد ———

export interface SearchResult extends SpecificPlace {
  sub: string;
}

export async function searchPlaces(q: string, near: LatLon | null): Promise<SearchResult[]> {
  const params = new URLSearchParams({ format: 'jsonv2', q, limit: '8', 'accept-language': 'ar' });
  if (near) {
    const d = 0.35;
    params.set('viewbox', `${near.lon - d},${near.lat + d},${near.lon + d},${near.lat - d}`);
  }
  const res = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?${params}`, 10000);
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const json = (await res.json()) as { osm_type: string; osm_id: number; lat: string; lon: string; name?: string; display_name: string }[];
  return json.map((r) => ({
    id: `${r.osm_type}/${r.osm_id}`,
    name: r.name || r.display_name.split('،')[0].split(',')[0],
    sub: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
  }));
}

async function fetchWithTimeout(url: string, ms: number, init: RequestInit = {}): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}
