import { cleanTitle, splitItems } from './items';
import { ITEM_CATEGORIES } from './lexicon';
import { stems, tokenize } from './normalize';
import type { ParsedReminder } from './parser';
import { priorityFromText, stripPriority } from './priority';
import type { CategoryId, Priority, Target } from './types';

/** تذكير تطبيق الجوال: غرض واحد أو مشوار له محل، والوقت آخر موعد له مو تنبيه مستقل */
export interface ReminderInput {
  title: string;
  target: Target | null;
  /** آخر موعد: الساعة لو انقالت («الساعة ٥»)، وإلا نهاية اليوم («الثلاثاء») */
  deadline?: number;
  priority: Priority;
  /** ما له محل («أتصل على أبوي»): ما ينحفظ لين يختار المستخدم وين */
  needsPlace: boolean;
}

function endOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** فئات الأغراض المذكورة في النص: «هدية» ← هدايا، «شامبو» ← صيدلية وبقالة */
export function categoriesFor(text: string): CategoryId[] {
  const cats: CategoryId[] = [];
  for (const t of tokenize(text)) {
    for (const [words, cs] of ITEM_CATEGORIES) {
      if (stems(t.norm).some((s) => words.includes(s))) for (const c of cs) if (!cats.includes(c)) cats.push(c);
    }
  }
  return cats;
}

/**
 * من جملة المستخدم لتذاكير، كل غرض تذكير مستقل: «ابي اشتري خبز وبنادول ضروري» ← خبز · بقالة، بنادول · صيدلية، والاثنين عالية.
 * المحل الصريح («إذا مريت على صيدلية»، «من جرير») لكل الأغراض، وإلا كل غرض بفئته، ولو ما له فئة ياخذ فئات الجملة.
 * الموعد والأولوية مشتركة. المحلل ما يستنتج الفئة لما يكون فيه وقت (لأنه كان يعتبره تذكير بوقت)، فنستنتجها هنا.
 */
export function toReminderInputs(p: ParsedReminder, raw: string): ReminderInput[] {
  const title = stripPriority(p.title);
  const explicit = p.target && !p.inferred ? p.target : null;
  let fallback = p.target;
  if (!fallback) {
    const categories = categoriesFor(title);
    if (categories.length) fallback = { kind: 'category', categories };
  }
  let deadline: number | undefined;
  if (p.deadline !== undefined) deadline = p.deadline;
  else {
    const when = p.at ?? p.notBefore;
    if (when !== undefined) deadline = p.hasClock ? when : endOfDay(when);
  }
  const priority = priorityFromText(raw);
  const one = (itemTitle: string, target: Target | null): ReminderInput => ({
    title: itemTitle, target, deadline, priority, needsPlace: !target,
  });

  const items = splitItems(title);
  if (!items.length) return [one(cleanTitle(title), fallback)];
  return items.map((item) => {
    if (explicit) return one(item, explicit);
    const categories = categoriesFor(item);
    return one(item, categories.length ? { kind: 'category', categories } : fallback);
  });
}
