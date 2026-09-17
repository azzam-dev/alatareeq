import { normalize } from './normalize';
import { categoryOfCode } from './placeTiles';
import type { CategoryId } from './types';

/**
 * التعرف على براند من اسم فيه خطأ، على نتائج بحث الأماكن (TomTom). صافي بدون شبكة،
 * والسيرفر (دالة `verify-brand`) يناديه بعد ما يجيب النتائج.
 *
 * تجربة فعلية (١٧ سبتمبر): TomTom لحاله يغلط («باندا» ← «مكتبة ماندا»، «لوزين» ← مطعم «لوسين»)،
 * فنقبل النتيجة بس لو الاسم يفرق حرف بالكثير وله ٣ فروع أو أكثر، والمستخدم يأكد.
 */

/**
 * كلمات نوع المحل (مطبّعة) تنشال قبل المقارنة: «صيدلية النهدي» = «النهدي».
 * «حلويات» مو منها: «حلويات جرير» محل ثاني، ولو انشالت صار فرع لجرير وغيّر فئته.
 */
const TYPE_WORDS = new Set([
  'صيدليه', 'صيدليات', 'فارمسي', 'مكتبه', 'مكتبات', 'اسواق', 'سوق', 'هايبر', 'سوبرماركت', 'سوبر', 'ماركت', 'تموينات',
  'بقاله', 'محطه', 'محطات', 'مطعم', 'مطاعم', 'كافيه', 'كوفي', 'مقهي', 'مخبز', 'مخابز', 'معرض', 'فرع',
  'pharmacy', 'pharmacies', 'supermarket', 'hypermarket', 'market', 'bookstore', 'cafe', 'coffee', 'restaurant',
]);

/** أقل عدد فروع بنفس الاسم عشان نعتبره براند (سلسلة) مو محل واحد */
export const MIN_BRANCHES = 3;

interface Word {
  orig: string;
  key: string;
}

/** كلمات الاسم بعد التطبيع ونزع «ال» و«لل» وكلمات النوع */
function words(name: string): Word[] {
  return name.split(/\s+/).filter(Boolean).map((orig) => {
    let key = normalize(orig).replace(/\s+/g, '');
    if (key.startsWith('لل') && key.length > 4) key = key.slice(2);
    else if (key.startsWith('ال') && key.length > 3) key = key.slice(2);
    return { orig, key };
  }).filter((w) => w.key && !TYPE_WORDS.has(w.key));
}

/** مفتاح المقارنة: «صيدلية النهدى» و«النهدي» كلهم «نهدي» */
export function brandKey(name: string): string {
  return words(name).map((w) => w.key).join(' ');
}

/** عدد التعديلات (إضافة، حذف، تبديل حرف) بين كلمتين */
export function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/** نتيجة بحث مكان: الاسم، ورقم فئة TomTom (`categorySet[0].id`) */
export interface PlaceHit {
  id: string;
  name: string;
  categoryCode?: number;
}

export interface BrandMatch {
  /** الاسم مثل ما يكتبه المحل («النهدي»)، بدون كلمة النوع */
  name: string;
  key: string;
  /** كم فرع بنفس الاسم */
  branches: number;
  category: CategoryId | null;
  /** صفر = نفس اللي كتبه المستخدم (بعد التطبيع) */
  distance: number;
}

/**
 * يدوّر في النتائج على براند يطابق اللي كتبه المستخدم: أول كلمات اسم المكان (بدون النوع) تفرق حرف بالكثير
 * عن كلامه (والكلمة القصيرة لازم تطابق)، وله `MIN_BRANCHES` فروع أو أكثر. الأقرب ثم الأكثر فروع.
 * الاسم المعروض الأكثر تكرارًا بين الفروع، فالسيرفر يدمج نتائج أكثر من كتابة («النهدى» و«النهدي»)
 * عشان ما يطلع خطأ موجود في بيانات TomTom نفسها («صيدلية النهدى» ٤ فروع).
 */
export function pickBrand(query: string, hits: PlaceHit[]): BrandMatch | null {
  const q = words(query);
  if (!q.length) return null;
  const groups = new Map<string, { ids: Set<string>; labels: Map<string, number>; cats: Map<CategoryId, number>; distance: number }>();

  for (const hit of hits) {
    const w = words(hit.name).slice(0, q.length);
    if (w.length < q.length) continue;
    let distance = 0;
    for (let i = 0; i < q.length; i++) {
      const d = editDistance(q[i].key, w[i].key);
      // الكلمة القصيرة (٣ حروف أو أقل) لازم تطابق، وإلا «بنك» تصير «بنده»
      if (d > 0 && Math.min(q[i].key.length, w[i].key.length) <= 3) distance = Infinity;
      distance += d;
    }
    if (distance > 1) continue;
    const key = w.map((x) => x.key).join(' ');
    const g = groups.get(key) ?? { ids: new Set(), labels: new Map(), cats: new Map(), distance };
    // نفس الفرع يرجع من أكثر من كتابة
    if (g.ids.has(hit.id)) continue;
    g.ids.add(hit.id);
    const label = w.map((x) => x.orig).join(' ');
    g.labels.set(label, (g.labels.get(label) ?? 0) + 1);
    const cat = categoryOfCode(hit.categoryCode);
    if (cat) g.cats.set(cat, (g.cats.get(cat) ?? 0) + 1);
    groups.set(key, g);
  }

  const top = <T>(m: Map<T, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  // الفئة بس لو نصف الفروع أو أكثر عليها: «تموينات جرير» وحدة ما تخلي جرير بقالة
  const category = (g: { ids: Set<string>; cats: Map<CategoryId, number> }) => {
    const t = top(g.cats);
    return t && t[1] * 2 >= g.ids.size ? t[0] : null;
  };
  return [...groups.entries()]
    .filter(([, g]) => g.ids.size >= MIN_BRANCHES)
    .map(([key, g]): BrandMatch => ({ name: top(g.labels)![0], key, branches: g.ids.size, category: category(g), distance: g.distance }))
    .sort((a, b) => a.distance - b.distance || b.branches - a.branches)[0] ?? null;
}

/**
 * كتابات يبحث فيها السيرفر عن نفس الاسم، لأن TomTom يطابق الحروف حرفيًا («النهدى» يرجّع ٤ فروع مكتوبة غلط بس،
 * و«نهدي» يرجّع مستودعات). `spellings` تنبحث دائمًا وتندمج: مثل ما كتبه، وبـ «ي» بدل «ى» آخر الكلمة.
 * `withAl` («ال» قدامه) تنبحث بس لو ما طلع شي.
 */
export function searchVariants(text: string): { spellings: string[]; withAl: string | null } {
  const t = text.trim();
  const standard = t.replace(/ى(?=\s|$)/g, 'ي');
  return { spellings: [...new Set([t, standard])], withAl: t.startsWith('ال') ? null : `ال${standard}` };
}
