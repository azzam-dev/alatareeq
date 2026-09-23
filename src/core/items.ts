import { ITEM_CATEGORIES, TASK_VERBS } from './lexicon';
import { INVISIBLE, normalize, stems } from './normalize';
import { BRANDS, COMPOUND_HEADS, GENERIC_WORDS, PRODUCTS, QUANTITIES } from './products';

/**
 * الأغراض من جملة التذكير بدون الكلام حولها: «ابي اشتري حاجة خبز وعسل حجم كبير الله يعافيك» ← [خبز، عسل حجم كبير].
 *
 * الطريقة: نعرف الغرض نفسه (قاموس `products.ts`) بدل ما نعرف الكلام. الغرض = منتج + الكمية قبله + الوصف بعده.
 * اللي مو في القاموس ياخذ مكانه من الجملة: بعد فعل الشراء، أو بعد «و»/الفاصلة.
 */

/** مجموعة مطبّعة. «المراعي» تطابق «مراعي» كمان */
function wordSet(words: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const w of words) {
    const n = normalize(w);
    out.add(n);
    if (n.startsWith('ال') && n.length > 4) out.add(n.slice(2));
  }
  return out;
}

/** القاموس، وكل غرض له فئة («زولية» ← سجاد) غرض كمان */
const PRODUCT = wordSet([...PRODUCTS, ...ITEM_CATEGORIES.flatMap(([words]) => words)]);
const BRAND = wordSet(BRANDS);
const QUANTITY = wordSet(QUANTITIES);
const HEAD = wordSet(COMPOUND_HEADS);
const GENERIC = wordSet(GENERIC_WORDS);

/** أفعال الشراء: الغرض يكفي عنها («اشتري خبز» ← «خبز») */
const BUY = wordSet([
  'اشتري', 'اشتر', 'اشتريلي', 'اشتريلنا', 'نشتري', 'بشتري', 'اشري', 'نشري', 'بشري', 'شري',
  'اخذ', 'ناخذ', 'باخذ', 'خذ', 'اخذلي', 'اجيب', 'نجيب', 'بجيب', 'جيب', 'اجيبلي', 'جيبلي',
]);
/** باقي أفعال المهمة هي المهمة نفسها فتبقى: «ادفع الفاتورة»، «أعبي السيارة» */
const TASK = new Set([...wordSet(TASK_VERBS)].filter((v) => !BUY.has(v)));

/** أدوات كلام. تساعد بس: الكلام قبل الغرض ينشال حتى لو مو هنا */
const TALK = wordSet([
  'ابي', 'ابغي', 'ابغا', 'ودي', 'بغيت', 'احتاج', 'محتاج', 'حاب', 'نبي', 'نبغي', 'نبغا', 'بدي', 'اريد', 'ممكن',
  'راح', 'رح', 'اروح', 'نروح', 'بروح', 'رايح', 'امر', 'نمر', 'خليني', 'خلني', 'خلينا', 'خلنا',
  'ذكرني', 'ذكرنا', 'نبهني', 'علمني', 'تذكير', 'لا', 'تنساني', 'تنسانا', 'تنسي', 'تنسا',
  'لازم', 'ضروري', 'مهم', 'اني', 'ان', 'اذا', 'بس', 'طيب', 'يعني', 'كمان', 'بعدين', 'ثم', 'او',
  'اليوم', 'الحين', 'بكره', 'بسرعه', 'تكفي', 'بليز', 'جدا', 'مره',
]);
/** بعد الفعل: «اشتري لي خبز» */
const FILLER = wordSet(['لي', 'لنا', 'له', 'لها', 'لهم', 'معي', 'معاي', 'معنا', 'معك', 'شوي', 'شويه']);
/** سبب أو مكان بعد الغرض، ينشال مع اللي بعده: «خبز عشان الفطور»، «حليب حق العيال»، «خبز من بنده» */
const REASON = wordSet(['عشان', 'علشان', 'لاجل', 'حق', 'من', 'في']);
/** عبارات مجاملة في أي مكان */
const PHRASES = ['الله يعافيك', 'الله يعافيكم', 'الله يسعدك', 'الله يحفظك', 'لو سمحت', 'يعطيك العافيه', 'جزاك الله خير'].map((p) => normalize(p).split(' '));
/** كلمات تبدأ بواو أصلًا، فما نعتبر الواو فاصل */
const WAW_WORDS = wordSet(['والد', 'والدي', 'والده', 'والدتي', 'والدين', 'ولد', 'ولدي', 'وليد', 'وزارة', 'وثيقة', 'وكالة', 'واتساب', 'وسط', 'وردي', 'وجبة', 'وجبات', 'وسادة', 'وصفة']);

type Kind = 'buy' | 'task' | 'talk' | 'filler' | 'reason' | 'quantity' | 'generic' | 'product' | 'brand' | 'word';
interface Word { w: string; n: string; kind: Kind }

const inSet = (set: Set<string>, n: string) => stems(n).some((s) => set.has(s));

function kindOf(n: string): Kind {
  if (BUY.has(n)) return 'buy';
  if (TASK.has(n)) return 'task';
  if (TALK.has(n)) return 'talk';
  if (FILLER.has(n)) return 'filler';
  if (REASON.has(n)) return 'reason';
  if (/^[0-9]+(\.[0-9]+)?$/.test(n) || inSet(QUANTITY, n)) return 'quantity';
  if (inSet(GENERIC, n)) return 'generic';
  if (inSet(PRODUCT, n)) return 'product';
  if (inSet(BRAND, n)) return 'brand';
  return 'word';
}

const isVerb = (x: Word) => x.kind === 'buy' || x.kind === 'task';
const isNoise = (x: Word) => x.kind === 'talk' || x.kind === 'generic' || x.kind === 'filler';

/** الأجزاء بين الفواصل: «،» «,» «.» «؟» أو واو ملزوقة بأول الكلمة */
function segments(title: string): Word[][] {
  const segs: Word[][] = [[]];
  const cut = () => {
    if (segs[segs.length - 1].length) segs.push([]);
  };
  let started = false;
  for (const raw of title.replace(INVISIBLE, '').trim().split(/\s+/).filter(Boolean)) {
    // الفاصلة ممكن تكون ملزوقة: «خبز،» أو «،خبز». والإملاء بالصوت يحط نقطة، إلا بين رقمين («١.٥ لتر»)
    raw.split(/[،,؛;!?؟]|\.(?![0-9٠-٩])/).forEach((part, i) => {
      if (i > 0) cut();
      let w = part.trim();
      if (!w) return;
      if (w === 'و') return cut();
      let n = normalize(w);
      const known = WAW_WORDS.has(n) || PRODUCT.has(n) || BRAND.has(n) || QUANTITY.has(n);
      if (started && n.length > 2 && n.startsWith('و') && !known) {
        cut();
        w = w.slice(1);
        n = n.slice(1);
      }
      started = true;
      segs[segs.length - 1].push({ w, n, kind: kindOf(n) });
    });
  }
  return segs.filter((s) => s.length);
}

/** يشيل عبارات المجاملة، والسبب/المكان بعد الغرض */
function prepare(ws: Word[]): Word[] {
  let out = [...ws];
  for (let i = 0; i < out.length; i++) {
    const phrase = PHRASES.find((p) => p.every((pw, k) => out[i + k]?.n === pw));
    if (phrase) out.splice(i--, phrase.length);
  }
  let seenVerb = false;
  for (let i = 0; i < out.length; i++) {
    const x = out[i];
    if (x.kind === 'reason' && out.slice(0, i).some((y) => y.kind === 'product' || y.kind === 'brand' || y.kind === 'quantity' || (y.kind === 'word' && seenVerb))) {
      out = out.slice(0, i);
      break;
    }
    if (isVerb(x)) seenVerb = true;
  }
  return out.filter((x) => x.kind !== 'reason');
}

/** جزء فيه منتج معروف: كل غرض يبدأ من منتج، والكلام اللي ما يلتصق بمنتج ينشال */
function productItems(ws: Word[]): string[] {
  const items: string[] = [];
  let cur: string[] | null = null;
  // الغرض الحالي منتج ياخذ منتج ثاني وصف («عصير» ← «عصير برتقال»)
  let joinable = false;
  // كمية أو براند قبل المنتج الجاي («كيلو طماطم»)
  let pending: Word[] = [];
  // بعد فعل وقبل أول منتج: كلمات ممكن تكون غرض مو في القاموس («اشتري بطاقة سوا»)
  let afterVerb: Word[] | null = null;

  const close = () => {
    if (cur) {
      cur.push(...pending.map((p) => p.w));
      pending = [];
      items.push(cur.join(' '));
    }
    cur = null;
    joinable = false;
  };
  const nextKind = (j: number) => ws.slice(j + 1).find((y) => y.kind !== 'quantity' && y.kind !== 'brand')?.kind;

  ws.forEach((x, j) => {
    if (x.kind === 'product') {
      if (cur && joinable) {
        cur.push(...pending.map((p) => p.w), x.w);
        pending = [];
        joinable = false;
        return;
      }
      // «اطبع ورق»: فعل مهمة لحاله قبل المنتج يبقى معه. كلمات غريبة بين الفعل والمنتج («حاجات للبيت») تنشال
      const verb = afterVerb?.length === 1 && afterVerb[0].kind === 'task' ? [afterVerb[0].w] : [];
      const pre = pending;
      pending = [];
      close();
      cur = [...verb, ...pre.map((p) => p.w), x.w];
      joinable = inSet(HEAD, x.n);
      afterVerb = null;
    } else if (x.kind === 'quantity' || x.kind === 'brand') {
      if (cur && nextKind(j) === 'product') {
        if (!joinable) close();
        pending.push(x);
      } else if (cur) {
        cur.push(...pending.map((p) => p.w), x.w);
        pending = [];
        joinable = false;
      } else {
        pending.push(x);
        afterVerb?.push(x);
      }
    } else if (x.kind === 'word') {
      if (cur) {
        cur.push(...pending.map((p) => p.w), x.w);
        pending = [];
        joinable = false;
      } else if (afterVerb) {
        afterVerb.push(x);
      } else if (pending.length) {
        pending.push(x); // «علبة كبيرة تونة»
      }
      // غير كذا: كلام قبل الغرض، ينشال
    } else if (isVerb(x)) {
      close();
      pending = [];
      afterVerb = x.kind === 'task' ? [x] : [];
    } else {
      close();
    }
  });
  close();
  if (afterVerb && (afterVerb as Word[]).length) items.push((afterVerb as Word[]).map((y) => y.w).join(' '));
  return items;
}

/** جزء بدون منتج معروف: الغرض اللي بعد الفعل، أو الجزء كله بعد «و» */
function otherItems(ws: Word[]): string[] {
  const v = ws.findIndex(isVerb);
  const items: string[] = [];
  let cur: string[] = [];
  const close = () => {
    if (cur.length) items.push(cur.join(' '));
    cur = [];
  };
  for (const x of ws.slice(Math.max(v, 0))) {
    if (x.kind === 'buy') close();
    else if (x.kind === 'task') {
      close();
      cur = [x.w];
    } else if (!isNoise(x)) cur.push(x.w);
  }
  close();
  return items;
}

/**
 * الأغراض بس من جملة التذكير. الوصف والكمية مع الغرض («لبن صغير»، «كيلو طماطم»، «عصير ربيع»)،
 * ومنتجين ورا بعض بدون «و» غرضين («خبز زبادي» من الإملاء بالصوت).
 */
export function splitItems(title: string): string[] {
  const segs = segments(title).map(prepare).filter((s) => s.length).map((ws) => ({
    items: ws.some((x) => x.kind === 'product') ? productItems(ws) : otherItems(ws),
    verb: ws.some(isVerb),
    known: ws.some((x) => x.kind === 'product' || isVerb(x)),
  }));
  // «يا ليت، اشتري خبز»: أجزاء بأول الجملة بدون منتج ولا فعل، وبعدها فعل، كلام
  const firstVerb = segs.findIndex((s) => s.verb);
  let leading = true;
  return segs.flatMap((s, i) => {
    if (s.known) leading = false;
    return leading && i < firstVerb ? [] : s.items;
  });
}

/** الأغراض للسؤال بعد «اذهب». جملة بدون أغراض واضحة تنحسب غرض واحد */
export function reminderItems(title: string): string[] {
  const items = splitItems(title);
  return items.length ? items : [title.replace(INVISIBLE, '').trim() || 'تذكير'];
}

/** يركّب العنوان من الأغراض بفواصل بس: «خبز، صامولي، زبادي» */
export function joinItems(items: string[]): string {
  return items.join('، ');
}

/** عنوان التذكير بالأغراض بس: «خليني اشتري خبز وزبادي» ← «خبز، زبادي». بدون أغراض واضحة يبقى مثل ما هو */
export function cleanTitle(title: string): string {
  const items = splitItems(title);
  return items.length ? joinItems(items) : title.replace(INVISIBLE, '').trim();
}
