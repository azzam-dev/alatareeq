import AsyncStorage from '@react-native-async-storage/async-storage';
import { distanceM, type LatLon } from '../../../src/core/geo';
import { BRANDS } from '../../../src/core/lexicon';
import { mergeTilePlaces, tileOf, tilesAhead, TILE_TTL_DAYS, type TilePlace } from '../../../src/core/placeTiles';
import type { CategoryId, Place, SpecificPlace } from '../../../src/core/types';
import { tripLog } from './tripLog';

/** مصدر الأماكن: مربعات TomTom من السيرفر، وأنت تسوق وفي المشوار التجريبي */
export interface PlacesSource {
  near(me: LatLon, radiusM: number): Place[];
}

const brandRes = BRANDS.map((b) => ({ id: b.id, re: new RegExp(b.osmRegex, 'i') }));

/** براندات المكان من اسمه، أو من اسم البراند عند TomTom («Panda») */
function brandsOf(texts: string[]): string[] {
  return brandRes.filter((b) => texts.some((t) => b.re.test(t))).map((b) => b.id);
}


// ——— مربعات TomTom ———

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const STORE_KEY = 'alatareeq:places:v1';
const TTL_MS = TILE_TTL_DAYS * 86_400_000;
/** أقصى مربعات×أنواع محفوظة في الجوال (الأقدم ينشال) */
const MAX_ENTRIES = 800;
/** ما نطلب مرتين ورا بعض لنفس المربعات والأنواع */
const ASK_GAP_MS = 20_000;

interface Entry {
  at: number;
  places: TilePlace[];
}

class TilePlaces implements PlacesSource {
  /** «1835:3112|pharmacy» ← أماكنه */
  private entries = new Map<string, Entry>();
  private merged: Place[] = [];
  private busy = false;
  private lastAsk = { key: '', at: 0 };
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private loaded: Promise<void>;

  constructor() {
    this.loaded = this.load();
  }

  near(me: LatLon, radiusM: number): Place[] {
    return this.merged.filter((p) => distanceM(me, p) <= radiusM);
  }

  byId(id: string): Place | undefined {
    return this.merged.find((p) => p.id === id);
  }

  /**
   * يطلب من السيرفر المربعات اللي قدامك الناقصة لأنواع تذاكيرك. ما يوقف المحرك: الأماكن توصل بعدين
   * وتدخل من الموقع الجاي. بدون نت أو السيرفر ما رد: نكمل بالمحفوظ.
   */
  want(me: LatLon, heading: number | null, categories: CategoryId[]) {
    if (!URL || !KEY || !categories.length || this.busy) return;
    const now = Date.now();
    const tiles = tilesAhead(me.lat, me.lon, heading);
    const keys = tiles.flatMap((t) => categories.map((c) => `${t}|${c}`));
    const missing = keys.filter((k) => { const e = this.entries.get(k); return !e || now - e.at > TTL_MS; });
    tripLog.tiles(keys, missing);
    if (!missing.length) return;
    const key = missing.join(',');
    if (key === this.lastAsk.key && now - this.lastAsk.at < ASK_GAP_MS) return;
    this.lastAsk = { key, at: now };
    void this.fetch(missing);
  }

  private async fetch(missing: string[]) {
    this.busy = true;
    const started = Date.now();
    try {
      await this.loaded;
      const tiles = [...new Set(missing.map((k) => k.split('|')[0]))];
      const categories = [...new Set(missing.map((k) => k.split('|')[1]))];
      const r = await fetch(`${URL}/functions/v1/nearby-places`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, apikey: KEY!, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiles, categories }),
      });
      if (!r.ok) {
        tripLog.request({ t: started, asked: missing, done: [], pending: missing.length, ok: false, ms: Date.now() - started });
        return;
      }
      const j = (await r.json()) as { places?: TilePlace[]; done?: string[]; pending?: number };
      tripLog.request({ t: started, asked: missing, done: j.done ?? [], pending: j.pending ?? 0, ok: true, ms: Date.now() - started });
      const now = Date.now();
      const byKey = new Map<string, TilePlace[]>((j.done ?? []).map((k) => [k, []]));
      for (const p of j.places ?? []) {
        // المكان داخل مربع واحد بس (السيرفر يفلتر)، فنرجّعه لمربعه ونوعه
        byKey.get(`${tileOf(p.lat, p.lon)}|${p.category}`)?.push(p);
      }
      for (const [k, places] of byKey) this.entries.set(k, { at: now, places });
      this.rebuild();
      this.save();
    } catch {
      tripLog.request({ t: started, asked: missing, done: [], pending: missing.length, ok: false, ms: Date.now() - started });
      // بدون نت: نكمل بالمحفوظ ونحاول مع الموقع الجاي
    } finally {
      this.busy = false;
    }
  }

  private rebuild() {
    if (this.entries.size > MAX_ENTRIES) {
      const oldest = [...this.entries.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, this.entries.size - MAX_ENTRIES);
      for (const [k] of oldest) this.entries.delete(k);
    }
    this.merged = mergeTilePlaces([...this.entries.values()].flatMap((e) => e.places), brandsOf);
  }

  private async load() {
    try {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as [string, Entry][];
      const now = Date.now();
      for (const [k, e] of saved) if (now - e.at <= TTL_MS && !this.entries.has(k)) this.entries.set(k, e);
      this.rebuild();
    } catch { /* تخزين تالف: نبدأ فاضي */ }
  }

  private save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      AsyncStorage.setItem(STORE_KEY, JSON.stringify([...this.entries.entries()])).catch(() => undefined);
    }, 2000);
  }
}

export const tilePlaces = new TilePlaces();

/** فرع مكان محفوظ قبل ما نحفظ الفرع مع التذكير */
export function branchOf(id: string): string | undefined {
  return tilePlaces.byId(id)?.branch;
}

/** فئات مكان محفوظ (وين خلّصت الغرض)، لفرز «تمت» بالفئة */
export function placeCategories(p: SpecificPlace): CategoryId[] | undefined {
  return tilePlaces.byId(p.id)?.categories;
}
