import { describe, expect, it } from 'vitest';
import { groupDone } from './doneGroups';
import type { Reminder, SpecificPlace } from './types';

// الثلاثاء ١٥ سبتمبر ٢٠٢٦، الساعة ٦ مساءً
const NOW = new Date(2026, 8, 15, 18, 0).getTime();
const at = (day: number, hour: number, min = 0) => new Date(2026, 8, day, hour, min).getTime();
const panda: SpecificPlace = { id: 'p1', name: 'هايبر بنده', lat: 0, lon: 0 };
const nahdi: SpecificPlace = { id: 'p2', name: 'النهدي', lat: 0, lon: 0 };

const done = (id: string, title: string, doneAt: number, donePlace?: SpecificPlace): Reminder => ({
  id, title, trigger: 'pass', status: 'done', createdAt: 0, target: null, doneAt, donePlace,
});
const titles = (gs: { title: string }[]) => gs.map((g) => g.title);

describe('«تم» مجمّع ومقسّم بالأيام', () => {
  it('نفس المكان بنفس الزيارة صف واحد', () => {
    const d = groupDone([done('a', 'خبز', at(15, 17), panda), done('b', 'صامولي', at(15, 17), panda)], NOW);
    expect(titles(d.today)).toEqual(['خبز، صامولي']);
    expect(d.today[0].place).toEqual(panda);
    expect(d.today[0].reminders.map((r) => r.id)).toEqual(['a', 'b']);
  });
  it('زيارة ثانية بعد أكثر من ساعة، أو مكان ثاني، أو بدون مكان: صفوف منفصلة', () => {
    const d = groupDone([
      done('a', 'خبز', at(15, 9), panda),
      done('b', 'حليب', at(15, 12), panda),
      done('c', 'دواء', at(15, 12), nahdi),
      done('d', 'ادفع الفاتورة', at(15, 12)),
      done('e', 'اعبي السيارة', at(15, 12)),
    ], NOW);
    expect(titles(d.today)).toEqual(['حليب', 'دواء', 'ادفع الفاتورة', 'اعبي السيارة', 'خبز']);
  });
  it('اليوم، أمس، والأقدم، الأحدث أول', () => {
    const d = groupDone([
      done('a', 'قديم', at(12, 10)),
      done('b', 'أمس', at(14, 23, 30)),
      done('c', 'اليوم بدري', at(15, 0, 5)),
      done('d', 'اليوم', at(15, 16)),
    ], NOW);
    expect(titles(d.today)).toEqual(['اليوم', 'اليوم بدري']);
    expect(titles(d.yesterday)).toEqual(['أمس']);
    expect(titles(d.older)).toEqual(['قديم']);
  });
  it('نفس المكان بيومين مختلفين ما يتجمّع', () => {
    const d = groupDone([done('a', 'خبز', at(15, 0, 10), panda), done('b', 'حليب', at(14, 23, 50), panda)], NOW);
    expect(titles(d.today)).toEqual(['خبز']);
    expect(titles(d.yesterday)).toEqual(['حليب']);
  });
  it('التذاكير النشطة ما تدخل', () => {
    const active: Reminder = { ...done('a', 'خبز', at(15, 10)), status: 'active' };
    expect(groupDone([active], NOW)).toEqual({ today: [], yesterday: [], older: [] });
  });
});
