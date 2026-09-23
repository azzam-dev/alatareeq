// منسوخ من src/core/placeTiles.ts بـ npm run functions. لا تعدّله هنا
import type { CategoryId, Place } from './types.ts';

/**
 * أماكن TomTom بمربعات: الخريطة مربعات تقريبًا ١٫٥ × ١٫٥ كم، والتطبيق يطلب مربعات الطريق اللي قدامه لأنواع تذاكيره بس،
 * والسيرفر (`nearby-places`) يحفظ كل مربع ونوع ٩٠ يوم للكل. تجربة فعلية (١٧ سبتمبر): ٣ كم حول نقطة في الرياض وبريدة
 * توصل حد TomTom (١٠٠ نتيجة) للبقالات والصيدليات، و١٫٥ كم ما توصله.
 *
 * الرصيد (قرار صاحب المشروع): سؤال واحد لكل مربع عن كل الأنواع الناقصة، وتكلفته تنقسم على أنواعه، وكل نوع له حصة من رصيد
 * الشهر على قد ما الناس يطلبونه. النوع اللي خلصت حصته ينشال من السؤال، والمحفوظ منه يبقى.
 */

/** ٠٫٠١٣٥° عرض ≈ ١٫٥ كم، و٠٫٠١٥° طول ≈ ١٫٥ كم في السعودية (خط عرض ١٧ إلى ٣٢) */
const TILE_LAT = 0.0135;
const TILE_LON = 0.015;
/** نصف قطر البحث من وسط المربع: يغطي زواياه (نصف القطر ≈ ١٫٠٦ كم) */
export const TILE_SEARCH_RADIUS_M = 1100;
/** مدة حفظ المربع قبل ما نسأل TomTom عنه مرة ثانية (المحلات ما تتغير كثير خلال ٣ شهور) */
export const TILE_TTL_DAYS = 90;
/** كم قدامك نجيب المربعات (قرار صاحب المشروع: كيلو ونص) */
export const AHEAD_M = 1500;
/** حد TomTom للنتائج في الطلب الواحد: لو وصلناه في طلب فيه كذا نوع، نسأل عن كل نوع لحاله عشان ما تنقص محلات */
export const TOMTOM_MAX_RESULTS = 100;
/**
 * طلبات TomTom للأماكن بالشهر: الرصيد المجاني كله للبحث (٢٥٠٠، صفحة الأسعار سبتمبر ٢٠٢٦). تصحيح البراندات يصرف من
 * نفس الرصيد بدون حجز (قرار صاحب المشروع)، وهو قليل لأن البراند ينحفظ من أول مرة.
 */
export const MONTHLY_PLACES_BUDGET = 2500;

/**
 * أرقام فئات TomTom لكل فئة (أول ١٠ بالكثير في الطلب)، من قائمة `poiCategories` (٦١٠ فئة، ٢٣ سبتمبر). `null` = ما لها
 * رقم عند TomTom، ومخفية لين نلقى حل (قرار صاحب المشروع ١٧ سبتمبر): عطور وحلويات.
 */
export const TOMTOM_CODES: Record<CategoryId, number[] | null> = {
  pharmacy: [7326],
  grocery: [7332, 9361023, 9361009, 9361021],
  // المكتبة ومحلات القرطاسية (Office Equipment)
  bookstore: [9361002, 9361014],
  fuel: [7311],
  laundry: [9361045, 9361010],
  charging: [7309],
  toys: [9361040],
  electronics: [9361013, 9361052, 9361012],
  mobile: [9361075],
  clothes: [9361006, 9361007, 9361008, 9361004, 9361079],
  shoes: [9361005],
  perfume: null,
  jewelry: [9361036],
  florist: [9361017],
  gifts: [9361026],
  // أواني (Glassware/Ceramic) ومحلات المتنوعات (Variety Store)
  houseware: [9361055, 9361081],
  furniture: [9361054, 9361031],
  hardware: [9361069, 9361030],
  sports: [9361039],
  pets: [9361064],
  bakery: [9361018],
  sweets: null,
  cafe: [9376002, 9376006],
  restaurant: [7315],
  atm: [7397],
  bank: [7328],
  clinic: [9373, 9374],
  hospital: [7321],
  optician: [9361038],
  barber: [9361027],
  beauty: [9361067],
  carWash: [9155],
  carParts: [7310006],
  carRepair: [7310004],
  post: [7324],
  tailor: [9361077],
  butcher: [9361019],
  mall: [7373],
  gym: [7320002],
  // خضار وفواكه (Greengrocer) وحلقة الخضار (Farmers Market، تحت «سوق» 7332 فالأطول يغلب)
  produce: [9361022, 7332004],
  fish: [9361020],
  carpets: [9361028],
  curtains: [9361029],
  lighting: [9361034],
  paint: [9361035],
  building: [9361042],
  garden: [9361032],
  kitchens: [9361033],
  cosmetics: [9361050],
  bags: [9361058],
  // تصوير مستندات، واستوديو تصوير
  print: [9361047, 9361046],
  medicalSupplies: [9361043],
  tires: [7310007],
  carRental: [7312],
  vet: [9375],
};

/** الفئة لها أماكن من TomTom (غيرها تنخفي من الاختيار) */
export function hasPlaceSource(id: CategoryId): boolean {
  return TOMTOM_CODES[id] !== null;
}

/**
 * فئة رقم TomTom: الرقم نفسه أو فرعه («7332005» سوبرماركت تحت «7332» سوق). الأطول يغلب، و«7321002» مستشفى
 * ما يصير عيادة. رقم ما نعرفه = null.
 */
export function categoryOfCode(code?: number): CategoryId | null {
  if (code === undefined) return null;
  const s = String(code);
  let best: { id: CategoryId; len: number } | null = null;
  for (const [id, codes] of Object.entries(TOMTOM_CODES) as [CategoryId, number[] | null][]) {
    for (const c of codes ?? []) {
      const p = String(c);
      if (s.startsWith(p) && (!best || p.length > best.len)) best = { id, len: p.length };
    }
  }
  return best?.id ?? null;
}

export interface TileBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** رقم المربع: «1834:3113» (صف:عمود) */
export function tileOf(lat: number, lon: number): string {
  return `${Math.floor(lat / TILE_LAT)}:${Math.floor(lon / TILE_LON)}`;
}

const TILE_RE = /^-?\d{1,5}:-?\d{1,5}$/;

export function isTileId(id: string): boolean {
  return TILE_RE.test(id);
}

export function tileBounds(id: string): TileBounds {
  const [row, col] = id.split(':').map(Number);
  return { south: row * TILE_LAT, west: col * TILE_LON, north: (row + 1) * TILE_LAT, east: (col + 1) * TILE_LON };
}

export function tileCenter(id: string): { lat: number; lon: number } {
  const b = tileBounds(id);
  return { lat: (b.south + b.north) / 2, lon: (b.west + b.east) / 2 };
}

export function inTile(id: string, lat: number, lon: number): boolean {
  const b = tileBounds(id);
  return lat >= b.south && lat < b.north && lon >= b.west && lon < b.east;
}

const EARTH_M = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

function metersBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

function bearing(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** أقرب نقطة في المربع للموقع، عشان مربع يمر فيه الطريق ما ينحسب بعيد لأن وسطه بعيد */
function nearestPoint(id: string, lat: number, lon: number) {
  const b = tileBounds(id);
  return { lat: Math.min(Math.max(lat, b.south), b.north), lon: Math.min(Math.max(lon, b.west), b.east) };
}

/**
 * المربعات اللي نحتاجها وأنت تسوق: كل مربع فيه نقطة في حدود `rangeM`، ولو نعرف اتجاهك نشيل اللي وراك
 * (أبعد من ٥٠٠ م وخارج ١٠٠° من اتجاهك). الأقرب أول.
 */
export function tilesAhead(lat: number, lon: number, heading: number | null, rangeM = AHEAD_M): string[] {
  const me = { lat, lon };
  const rows = Math.ceil(rangeM / 1500) + 1;
  const [row, col] = tileOf(lat, lon).split(':').map(Number);
  const out: { id: string; d: number }[] = [];
  for (let r = row - rows; r <= row + rows; r++) {
    for (let c = col - rows; c <= col + rows; c++) {
      const id = `${r}:${c}`;
      const p = nearestPoint(id, lat, lon);
      const d = metersBetween(me, p);
      if (d > rangeM) continue;
      if (heading !== null && d > 500) {
        const diff = Math.abs(((bearing(me, tileCenter(id)) - heading + 540) % 360) - 180);
        if (diff > 100) continue;
      }
      out.push({ id, d });
    }
  }
  return out.sort((a, b) => a.d - b.d).map((x) => x.id);
}

// ——— رصيد TomTom ———

/** استخدام نوع بالشهر: كم مرة انطلب (`demand`)، وكم صرف من طلبات TomTom (`spent`، كسور لأن السؤال ينقسم) */
export interface CategoryUsage {
  demand: number;
  spent: number;
}

export type BudgetState = Partial<Record<CategoryId, CategoryUsage>>;

/**
 * الأنواع اللي نقدر نسأل عنها الحين: الشهر ما خلص رصيده، وكل نوع صرف أقل من حصته.
 * الحصة = الرصيد × طلب النوع ÷ طلب كل الأنواع («بقالة» ٥٠ من ١٠٠ ← نص الرصيد).
 */
export function affordable(categories: CategoryId[], state: BudgetState, budget = MONTHLY_PLACES_BUDGET): CategoryId[] {
  const all = Object.values(state) as CategoryUsage[];
  const totalDemand = all.reduce((s, u) => s + u.demand, 0);
  const totalSpent = all.reduce((s, u) => s + u.spent, 0);
  if (totalDemand <= 0 || totalSpent + 1 > budget) return [];
  return categories.filter((c) => {
    const u = state[c];
    return !!u && u.spent < (budget * u.demand) / totalDemand;
  });
}

/** نسجّل إن الأنواع انطلبت (مرة لكل طلب من التطبيق) */
export function recordDemand(state: BudgetState, categories: CategoryId[]): void {
  for (const c of categories) {
    const u = state[c] ?? { demand: 0, spent: 0 };
    u.demand += 1;
    state[c] = u;
  }
}

/** سؤال واحد عن كذا نوع: تكلفته (طلب واحد) تنقسم عليهم بالتساوي */
export function chargeFetch(state: BudgetState, categories: CategoryId[]): void {
  for (const c of categories) {
    const u = state[c] ?? { demand: 0, spent: 0 };
    u.spent += 1 / categories.length;
    state[c] = u;
  }
}

/** الأنواع مجموعات بحيث أرقامها ١٠ بالكثير لكل سؤال (حد `categorySet` عند TomTom) */
export function combineCategories(categories: CategoryId[]): CategoryId[][] {
  const groups: CategoryId[][] = [];
  let cur: CategoryId[] = [];
  let codes = 0;
  for (const c of categories) {
    const n = TOMTOM_CODES[c]?.length ?? 0;
    if (!n) continue;
    if (cur.length && codes + n > 10) {
      groups.push(cur);
      cur = [];
      codes = 0;
    }
    cur.push(c);
    codes += n;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/** نتيجة TomTom قبل ما نعرف نوعها: كل أرقام فئاته */
export interface RawPlace {
  id: string;
  name: string;
  lat: number;
  lon: number;
  codes: number[];
  branch?: string;
  brandNames?: string[];
}

/**
 * يفرز نتائج سؤال فيه كذا نوع على أنواعه: كل مكان يروح لكل نوع مطلوب يطابق أحد أرقامه (صيدلية داخل سوبرماركت
 * تروح للاثنين)، واللي ما طابق شي ينشال. كل نوع مطلوب له قائمة ولو فاضية، عشان المربع ينحفظ «ما فيه» وما ينسأل عنه مرة ثانية.
 */
export function splitByCategory(places: RawPlace[], categories: CategoryId[]): Map<CategoryId, TilePlace[]> {
  const out = new Map<CategoryId, TilePlace[]>(categories.map((c) => [c, []]));
  for (const p of places) {
    const found = new Set(p.codes.map(categoryOfCode).filter((c): c is CategoryId => !!c && out.has(c)));
    for (const category of found) {
      out.get(category)!.push({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, branch: p.branch, brandNames: p.brandNames, category });
    }
  }
  return out;
}

/** مكان مثل ما يرجّعه السيرفر لكل مربع ونوع */
export interface TilePlace {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** الحي من TomTom («المصيف») */
  branch?: string;
  /** أسماء البراند عند TomTom («Panda») */
  brandNames?: string[];
  category: CategoryId;
}

/**
 * يدمج أماكن المربعات: نفس المكان من نوعين (صيدلية داخل سوبرماركت) مكان واحد بفئتين.
 * `brandsOf` يعطي براندات المكان من اسمه وأسماء البراند عند TomTom («بنده»، «Panda» ← panda).
 */
export function mergeTilePlaces(list: TilePlace[], brandsOf: (texts: string[]) => string[]): Place[] {
  const byId = new Map<string, Place>();
  for (const t of list) {
    const p = byId.get(t.id);
    if (p) {
      if (!p.categories.includes(t.category)) p.categories.push(t.category);
      continue;
    }
    byId.set(t.id, {
      id: t.id, name: t.name, lat: t.lat, lon: t.lon, categories: [t.category], branch: t.branch,
      brands: brandsOf([t.name, ...(t.brandNames ?? [])]),
    });
  }
  return [...byId.values()];
}
