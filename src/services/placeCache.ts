import { bboxAround, bboxContains, type BBox, type LatLon } from '../core/geo';
import type { CategoryId, Place, Reminder } from '../core/types';
import { fetchPlaces, type Wanted } from './osm';

const KEY = 'alatareeq:places:v1';
const TTL = 24 * 3600_000;
const MAX_PLACES = 4000;

interface Area { bbox: BBox; keys: string[]; at: number }

/** الأماكن المطلوبة من التذاكير النشطة */
export function wantedFrom(reminders: Reminder[]): Wanted {
  const categories = new Set<CategoryId>();
  const brands = new Map<string, string>();
  for (const r of reminders) {
    if (r.status !== 'active' || !r.target || r.trigger === 'time') continue;
    if (r.target.kind === 'category') r.target.categories.forEach((c) => categories.add(c));
    if (r.target.kind === 'brand') brands.set(r.target.brandId, r.target.label);
  }
  return { categories: [...categories], brands: [...brands].map(([id, label]) => ({ id, label })) };
}

const keysOf = (w: Wanted) => [...w.categories.map((c) => `c:${c}`), ...w.brands.map((b) => `b:${b.id}`)].sort();

/** كاش الأماكن على الجهاز، ونجيب من Overpass بس لما نطلع برا المنطقة المغطاة */
export class PlaceCache {
  places = new Map<string, Place>();
  private areas: Area[] = [];
  private inflight: Promise<void> | null = null;
  private lastFail = 0;
  error: string | null = null;
  onChange: () => void = () => undefined;

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw) as { places: Place[]; areas: Area[] };
        s.places.forEach((p) => this.places.set(p.id, p));
        this.areas = s.areas.filter((a) => Date.now() - a.at < TTL);
      }
    } catch { /* كاش تالف */ }
  }

  get fetching(): boolean {
    return this.inflight !== null;
  }

  private covered(need: BBox, keys: string[]): boolean {
    return this.areas.some((a) => Date.now() - a.at < TTL && keys.every((k) => a.keys.includes(k)) && bboxContains(a.bbox, need));
  }

  /** تأكد إن المنطقة حول النقطة مغطاة */
  ensureAround(p: LatLon, wanted: Wanted) {
    this.ensure(bboxAround(p, 2500), bboxAround(p, 6000), wanted);
  }

  ensure(need: BBox, fetchBox: BBox, wanted: Wanted): Promise<void> | void {
    const keys = keysOf(wanted);
    if (!keys.length || this.covered(need, keys) || this.inflight) return;
    if (Date.now() - this.lastFail < 30_000) return;
    this.inflight = fetchPlaces(fetchBox, wanted)
      .then((list) => {
        for (const p of list) this.places.set(p.id, p);
        this.areas = [...this.areas.filter((a) => Date.now() - a.at < TTL), { bbox: fetchBox, keys, at: Date.now() }].slice(-30);
        this.error = null;
        this.save();
      })
      .catch(() => {
        this.lastFail = Date.now();
        this.error = 'تعذر تحميل الأماكن من OpenStreetMap. بنحاول مرة ثانية بعد شوي.';
      })
      .finally(() => {
        this.inflight = null;
        this.onChange();
      });
    this.onChange();
    return this.inflight;
  }

  private save() {
    if (this.places.size > MAX_PLACES) {
      const keep = [...this.places.values()].slice(-MAX_PLACES);
      this.places = new Map(keep.map((p) => [p.id, p]));
    }
    try {
      localStorage.setItem(KEY, JSON.stringify({ places: [...this.places.values()], areas: this.areas }));
    } catch { /* ممتلئ */ }
  }

  clear() {
    this.places.clear();
    this.areas = [];
    try { localStorage.removeItem(KEY); } catch { /* تجاهل */ }
  }
}
