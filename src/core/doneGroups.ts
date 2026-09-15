import { joinItems } from './items';
import type { Reminder, SpecificPlace } from './types';

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

/** «تم» من نفس المكان خلال ساعة = نفس الزيارة. «حصلت بعضها» يحفظ اللي حصله تذكير منفصل بنفس الوقت */
const SAME_VISIT_MS = 60 * 60_000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** التذاكير المنتهية مجمّعة بالزيارة ومقسّمة بالأيام، الأحدث أول */
export function groupDone(reminders: Reminder[], now: number): DoneDays {
  const sorted = reminders.filter((r) => r.status === 'done').sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  const groups: DoneGroup[] = [];
  for (const r of sorted) {
    const at = r.doneAt ?? 0;
    const visit = r.donePlace && groups.find((g) =>
      g.place?.id === r.donePlace!.id && startOfDay(g.at) === startOfDay(at) && g.at - at <= SAME_VISIT_MS);
    if (visit) visit.reminders.push(r);
    else groups.push({ key: r.id, reminders: [r], title: '', place: r.donePlace, at });
  }
  for (const g of groups) g.title = joinItems(g.reminders.map((r) => r.title || 'تذكير'));

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
