import { joinItems } from './items';
import { BRAND_BY_ID, CATEGORY_BY_ID } from './lexicon';
import type { CategoryId, Reminder, SpecificPlace } from './types';

/** صف واحد في «تم»: تذاكير خلصت من نفس المكان بنفس الزيارة («خبز، صامولي · بنده») */
export interface DoneGroup {
  key: string;
  reminders: Reminder[];
  title: string;
  place?: SpecificPlace;
  /** آخر وقت «تم» في المجموعة */
  at: number;
}

export interface DoneDays {
  today: DoneGroup[];
  yesterday: DoneGroup[];
  older: DoneGroup[];
}

/** قسم في فرز «تمت» بالفئة أو بالمكان */
export interface DoneSection {
  key: string;
  title: string;
  /** المكان اللي خلّصت منه (فرز المكان)، والواجهة تضيف فرعه للعنوان */
  place?: SpecificPlace;
  groups: DoneGroup[];
}

export type DoneSort = 'category' | 'place';

/** «تم» من نفس المكان خلال ساعة = نفس الزيارة. «حصلت بعضها» يحفظ اللي حصله تذكير منفصل بنفس الوقت */
const SAME_VISIT_MS = 60 * 60_000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** «انتهى موعدها وما جبتها»: الأحدث انتهاء أول */
export function expiredReminders(reminders: Reminder[]): Reminder[] {
  return reminders.filter((r) => r.status === 'done' && r.expiredAt !== undefined).sort((a, b) => b.expiredAt! - a.expiredAt!);
}

/** «جبتها»: اللي خلص (مو اللي انتهى موعده)، الأحدث أول */
function gotten(reminders: Reminder[]): Reminder[] {
  return reminders.filter((r) => r.status === 'done' && r.expiredAt === undefined).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
}

const single = (r: Reminder): DoneGroup => ({ key: r.id, reminders: [r], title: r.title || 'تذكير', place: r.donePlace, at: r.doneAt ?? 0 });

/** تجميع بالزيارة لتذاكير مرتبة بالأحدث */
function byVisit(sorted: Reminder[]): DoneGroup[] {
  const groups: DoneGroup[] = [];
  for (const r of sorted) {
    const at = r.doneAt ?? 0;
    const visit = r.donePlace && groups.find((g) =>
      g.place?.id === r.donePlace!.id && startOfDay(g.at) === startOfDay(at) && g.at - at <= SAME_VISIT_MS);
    if (visit) visit.reminders.push(r);
    else groups.push(single(r));
  }
  for (const g of groups) g.title = joinItems(g.reminders.map((r) => r.title || 'تذكير'));
  return groups;
}

/** «جبتها» مجمّعة بالزيارة ومقسّمة بالأيام، الأحدث أول */
export function groupDone(reminders: Reminder[], now: number): DoneDays {
  const groups = byVisit(gotten(reminders));
  const today = startOfDay(now);
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  const yesterday = y.getTime();
  return {
    today: groups.filter((g) => g.at >= today),
    yesterday: groups.filter((g) => g.at >= yesterday && g.at < today),
    older: groups.filter((g) => g.at < yesterday),
  };
}

const NO_PLACE = 'بدون مكان';

/** القسم بالفئة: الفئة اللي تطابق المكان اللي خلّصته منه، وإلا أول فئة. البراند باسمه */
function categorySection(r: Reminder, placeCategories?: (p: SpecificPlace) => CategoryId[] | undefined): [string, string] {
  const t = r.target;
  if (!t) return ['none', NO_PLACE];
  if (t.kind === 'brand') return [`brand:${t.brandId}`, BRAND_BY_ID[t.brandId]?.label ?? t.label];
  if (t.kind === 'place') return [`place:${t.place.id}`, t.place.name];
  const atPlace = r.donePlace && placeCategories?.(r.donePlace);
  const id = t.categories.find((c) => atPlace?.includes(c)) ?? t.categories[0];
  return [id, CATEGORY_BY_ID[id].label];
}

/**
 * «جبتها» بأقسام: بالفئة (كل غرض صف لحاله، لأن الزيارة الوحدة فيها فئات مختلفة)، أو بالمكان (الزيارة صف واحد).
 * الأقسام بالأحدث، و«بدون مكان» آخر شي. `placeCategories` فئات المكان اللي خلّصت منه لو معروفة.
 */
export function groupDoneBy(
  reminders: Reminder[], sort: DoneSort, placeCategories?: (p: SpecificPlace) => CategoryId[] | undefined,
): DoneSection[] {
  const sorted = gotten(reminders);
  const sections = new Map<string, DoneSection>();
  const add = (key: string, title: string, g: DoneGroup, place?: SpecificPlace) => {
    const s = sections.get(key);
    if (s) s.groups.push(g);
    else sections.set(key, { key, title, place, groups: [g] });
  };
  if (sort === 'category') {
    for (const r of sorted) {
      const [key, title] = categorySection(r, placeCategories);
      add(key, title, single(r));
    }
  } else {
    for (const g of byVisit(sorted)) {
      if (g.place) add(`place:${g.place.id}`, g.place.name, g, g.place);
      else add('none', NO_PLACE, g);
    }
  }
  // الأقسام بترتيب أول ظهور = بالأحدث، و«بدون مكان» آخر شي
  const out = [...sections.values()];
  return [...out.filter((s) => s.key !== 'none'), ...out.filter((s) => s.key === 'none')];
}
