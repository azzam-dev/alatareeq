import { inTile, TILE_SEARCH_RADIUS_M, tileBounds, tileCenter, type TilePlace } from './placeTiles';
import type { CategoryId } from './types';

/**
 * أماكن Google Places (New) بنفس مربعات TomTom (`placeTiles.ts`). الفروق من توثيق Google (٢٣ سبتمبر ٢٠٢٦):
 * - Nearby Search يرجّع ٢٠ نتيجة بالكثير وبدون صفحات: لو وصلها سؤال فيه كذا نوع نسأل عن كل نوع لحاله، ولو وصلها نوع
 *   لحاله نقسم المربع أرباع (`searchCircles`).
 * - شروط Google: بيانات المكان ما تنحفظ أكثر من ٣٠ يوم، ورقم المكان مستثنى.
 * - المجاني ٥٠٠٠ طلب Nearby Search Pro بالشهر، وبعدها ٣٢ دولار لكل ألف.
 * - الحسابات السعودية لازم عن طريق موزّع معتمد، فهذا المصدر ينتظر حساب صاحب المشروع، والافتراضي TomTom.
 */

export type PlacesProvider = 'tomtom' | 'google';

/** حد Google للنتائج في الطلب الواحد */
export const GOOGLE_MAX_RESULTS = 20;
/** أقصى مدة حفظ لبيانات المكان حسب شروط Google */
export const GOOGLE_TTL_DAYS = 30;
/** طلبات الشهر: تحت المجاني (٥٠٠٠) بهامش، ويساوي حد يومي ١٦٠ × ٣٠ في Google Cloud */
export const GOOGLE_MONTHLY_BUDGET = 4800;
/** حد Google لأنواع `includedTypes` في الطلب الواحد */
export const GOOGLE_MAX_TYPES = 50;
/**
 * حقول الرد، وكلها من فئة Pro. أي حقل من فئة Enterprise (مثل التقييم أو ساعات الدوام) يغلّي كل الطلب
 * ومجانيه ١٠٠٠ بس، فلا تضيف حقل بدون ما تتأكد من فئته في توثيق Nearby Search.
 */
export const GOOGLE_FIELD_MASK = 'places.id,places.displayName,places.location,places.types,places.addressComponents';
/** نصف قطر ربع المربع (≈ ٧٥٠ × ٧٦٠ م): يغطي زواياه بهامش */
export const QUARTER_RADIUS_M = 560;

/**
 * أنواع Google لكل فئة (Table A في توثيق Place Types). `null` = ما لها نوع عند Google: عطور ونظارات.
 * «أدوات منزلية» و«حلويات» مخفية عند TomTom ولها أنواع هنا.
 */
export const GOOGLE_TYPES: Record<CategoryId, string[] | null> = {
  pharmacy: ['pharmacy', 'drugstore'],
  grocery: ['grocery_store', 'supermarket', 'hypermarket', 'discount_supermarket', 'convenience_store', 'market'],
  bookstore: ['book_store'],
  fuel: ['gas_station'],
  laundry: ['laundry'],
  charging: ['electric_vehicle_charging_station'],
  toys: ['toy_store'],
  electronics: ['electronics_store'],
  mobile: ['cell_phone_store'],
  clothes: ['clothing_store', 'womens_clothing_store'],
  shoes: ['shoe_store'],
  perfume: null,
  jewelry: ['jewelry_store'],
  florist: ['florist'],
  gifts: ['gift_shop'],
  houseware: ['home_goods_store'],
  furniture: ['furniture_store'],
  hardware: ['hardware_store', 'home_improvement_store'],
  sports: ['sporting_goods_store', 'sportswear_store'],
  pets: ['pet_store'],
  bakery: ['bakery'],
  sweets: ['candy_store', 'confectionery', 'dessert_shop', 'chocolate_shop', 'pastry_shop'],
  cafe: ['cafe', 'coffee_shop'],
  restaurant: ['restaurant'],
  atm: ['atm'],
  bank: ['bank'],
  clinic: ['doctor', 'medical_clinic', 'medical_center', 'dentist', 'dental_clinic'],
  hospital: ['hospital', 'general_hospital'],
  optician: null,
  barber: ['barber_shop', 'hair_salon'],
  beauty: ['beauty_salon', 'nail_salon'],
  carWash: ['car_wash'],
  carParts: ['auto_parts_store'],
  carRepair: ['car_repair'],
  post: ['post_office'],
  tailor: ['tailor'],
  butcher: ['butcher_shop'],
  mall: ['shopping_mall'],
  gym: ['gym', 'fitness_center'],
  // فئات TomTom الجديدة: أغلبها ما لها نوع عند Google
  produce: null,
  fish: null,
  carpets: null,
  curtains: null,
  lighting: null,
  paint: null,
  building: ['building_materials_store'],
  garden: ['garden_center'],
  kitchens: null,
  cosmetics: ['cosmetics_store'],
  bags: null,
  print: null,
  medicalSupplies: null,
  tires: ['tire_shop'],
  carRental: ['car_rental'],
  vet: ['veterinary_care'],
};

/** فئاتنا لمكان من أنواعه عند Google. هايبر فيه صيدلية يطلع للاثنين، والأنواع العامة («store») ما تطابق شي */
export function categoriesOfTypes(types: string[]): CategoryId[] {
  return (Object.entries(GOOGLE_TYPES) as [CategoryId, string[] | null][])
    .filter(([, list]) => list?.some((t) => types.includes(t)))
    .map(([id]) => id);
}

/** أنواع Google لسؤال عن فئات (بدون تكرار) */
export function googleTypesFor(categories: CategoryId[]): string[] {
  return [...new Set(categories.flatMap((c) => GOOGLE_TYPES[c] ?? []))];
}

/** الفئات مجموعات بحيث أنواعها ٥٠ بالكثير لكل سؤال، والفئة اللي ما لها نوع تنشال */
export function combineGoogleCategories(categories: CategoryId[]): CategoryId[][] {
  const groups: CategoryId[][] = [];
  let cur: CategoryId[] = [];
  for (const c of categories) {
    if (!GOOGLE_TYPES[c]) continue;
    if (cur.length && googleTypesFor([...cur, c]).length > GOOGLE_MAX_TYPES) {
      groups.push(cur);
      cur = [];
    }
    cur.push(c);
  }
  if (cur.length) groups.push(cur);
  return groups;
}

export interface SearchCircle {
  lat: number;
  lon: number;
  radiusM: number;
}

/** دوائر البحث للمربع: دائرة وحدة حول وسطه، أو ٤ دوائر للأرباع لو دائرته وصلت حد الـ٢٠ */
export function searchCircles(tile: string, quarters = false): SearchCircle[] {
  if (!quarters) return [{ ...tileCenter(tile), radiusM: TILE_SEARCH_RADIUS_M }];
  const b = tileBounds(tile);
  const midLat = (b.south + b.north) / 2;
  const midLon = (b.west + b.east) / 2;
  return [
    [(b.south + midLat) / 2, (b.west + midLon) / 2],
    [(b.south + midLat) / 2, (midLon + b.east) / 2],
    [(midLat + b.north) / 2, (b.west + midLon) / 2],
    [(midLat + b.north) / 2, (midLon + b.east) / 2],
  ].map(([lat, lon]) => ({ lat, lon, radiusM: QUARTER_RADIUS_M }));
}

/** مكان مثل ما يرجّعه Nearby Search بحقول `GOOGLE_FIELD_MASK` */
export interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  addressComponents?: { longText?: string; types?: string[] }[];
}

/** الحي من العنوان («العليا»)، مثل `municipalitySubdivision` عند TomTom */
const BRANCH_TYPES = ['neighborhood', 'sublocality_level_1', 'sublocality', 'route'];

function branchOf(p: GooglePlace): string | undefined {
  for (const type of BRANCH_TYPES) {
    const c = p.addressComponents?.find((x) => x.types?.includes(type) && x.longText);
    if (c) return c.longText;
  }
  return undefined;
}

/**
 * نتائج أسئلة Google لمربع ← أماكن كل فئة مطلوبة: اللي داخل المربع بس (الدائرة تطلع برّاه)، وبدون تكرار لو نفس المكان
 * رجع من ربعين، وكل فئة مطلوبة لها قائمة ولو فاضية عشان المربع ينحفظ «ما فيه» وما ينسأل عنه مرة ثانية.
 */
export function googleToTile(results: GooglePlace[], tile: string, categories: CategoryId[]): Map<CategoryId, TilePlace[]> {
  const out = new Map<CategoryId, TilePlace[]>(categories.map((c) => [c, []]));
  const seen = new Set<string>();
  for (const p of results) {
    const name = p.displayName?.text?.trim();
    const lat = p.location?.latitude;
    const lon = p.location?.longitude;
    if (!p.id || !name || lat === undefined || lon === undefined) continue;
    if (seen.has(p.id) || !inTile(tile, lat, lon)) continue;
    seen.add(p.id);
    const branch = branchOf(p);
    for (const category of categoriesOfTypes(p.types ?? [])) {
      out.get(category)?.push({ id: `gp:${p.id}`, name, lat, lon, branch, category });
    }
  }
  return out;
}
