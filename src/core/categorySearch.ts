import { CATEGORIES, ITEM_CATEGORIES, type CategoryDef } from './lexicon';
import { normalize } from './normalize';
import { categoriesFor } from './reminderInput';

/** الكلمة وصيغتها بدون «ال»: «الصيدلية» تطابق «صيدلية» */
const forms = (t: string) => (t.startsWith('ال') && t.length > 3 ? [t, t.slice(2)] : [t]);
const tokensOf = (texts: string[]) => texts.flatMap((s) => normalize(s).split(/\s+/)).filter(Boolean).flatMap(forms);

/** لكل فئة ثلاث طبقات بالأولوية: اسمها، كلمات المحل وبضاعته، الأغراض اللي تنشرى منها */
const INDEX = CATEGORIES.map((c) => ({
  c,
  tiers: [
    tokensOf([c.label]),
    tokensOf([...c.words, ...(c.goods ?? [])]),
    tokensOf(ITEM_CATEGORIES.filter(([, cs]) => cs.includes(c.id)).flatMap(([words]) => words)),
  ],
}));

/**
 * يدوّر على فئة باللي يكتبه المستخدم في المحرر: «العاب» ← محل ألعاب، «فيفا» ← محل ألعاب، «بنادول» ← صيدلية.
 * يطابق بداية الكلمة عشان تطلع النتيجة وهو يكتب. أقل من حرفين ما يدوّر.
 */
export function searchCategories(query: string, limit = 6): CategoryDef[] {
  const q = normalize(query).split(/\s+/).filter(Boolean);
  if (q.join('').length < 2) return [];
  const matches = (toks: string[]) => q.every((t) => forms(t).some((f) => toks.some((x) => x.startsWith(f))));
  const exact = (toks: string[]) => q.every((t) => forms(t).some((f) => toks.includes(f)));
  return INDEX
    .map(({ c, tiers }) => {
      const tier = tiers.findIndex(matches);
      // داخل نفس الطبقة الكلمة الكاملة قبل البداية: «فيفا» محل ألعاب قبل «فيفادول» صيدلية
      return { c, score: tier < 0 ? -1 : tier * 2 + (exact(tiers[tier]) ? 0 : 1) };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.c);
}

/** قائمة اختيار الفئة في المحرر: المناسبة لأغراض التذكير، وباقي الفئات */
export interface CategoryPickerList {
  suggested: CategoryDef[];
  rest: CategoryDef[];
}

const collate = (a: string, b: string) => normalize(a).localeCompare(normalize(b), 'ar');

/**
 * بدون بحث: المناسبة لعنوان التذكير أول («شامبو» ← صيدلية، بقالة)، وبعدها الباقي: الست الأساسية ثم الإضافية أبجديًا.
 * مع بحث (حرفين أو أكثر): نتيجة `searchCategories` كاملة بترتيبها، بدون أقسام.
 */
export function categoryPicker(title: string, query: string): CategoryPickerList {
  if (normalize(query).replace(/\s+/g, '').length >= 2) return { suggested: [], rest: searchCategories(query, CATEGORIES.length) };
  const ids = new Set(categoriesFor(title));
  const suggested = CATEGORIES.filter((c) => ids.has(c.id));
  const others = CATEGORIES.filter((c) => !ids.has(c.id));
  return {
    suggested,
    rest: [...others.filter((c) => !c.more), ...others.filter((c) => c.more).sort((a, b) => collate(a.label, b.label))],
  };
}
