import { describe, expect, it } from 'vitest';
import { expiredReminders, groupDone, groupDoneBy } from './doneGroups';
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

describe('فرز «جبتها» بالفئة وبالمكان', () => {
  const kunooz: SpecificPlace = { id: 'p3', name: 'صيدلية كنوز', lat: 0, lon: 0 };
  const withTarget = (r: Reminder, target: Reminder['target']): Reminder => ({ ...r, target });
  const rs = [
    withTarget(done('a', 'خبز', at(15, 17, 54), panda), { kind: 'category', categories: ['grocery'] }),
    withTarget(done('b', 'شامبو', at(15, 17, 54), panda), { kind: 'category', categories: ['pharmacy', 'grocery'] }),
    withTarget(done('c', 'بنادول', at(14, 21), kunooz), { kind: 'category', categories: ['pharmacy'] }),
    withTarget(done('d', 'دفتر', at(14, 20)), { kind: 'brand', brandId: 'jarir', label: 'جرير' }),
    { ...done('e', 'قديم', at(10, 9), panda), status: 'active' as const },
  ];
  const view = (ss: { title: string; groups: { title: string }[] }[]) => ss.map((s) => [s.title, titles(s.groups)]);

  it('بالمكان: الزيارة صف واحد، و«بدون مكان» آخر شي', () => {
    expect(view(groupDoneBy(rs, 'place'))).toEqual([
      ['هايبر بنده', ['خبز، شامبو']],
      ['صيدلية كنوز', ['بنادول']],
      ['بدون مكان', ['دفتر']],
    ]);
  });
  it('بالفئة: كل غرض لحاله، والغرض بفئتين تحت فئة المكان اللي خلّصته منه', () => {
    const placeCategories = (p: SpecificPlace) => (p.id === 'p1' ? ['grocery' as const] : undefined);
    expect(view(groupDoneBy(rs, 'category', placeCategories))).toEqual([
      ['بقالة', ['خبز', 'شامبو']],
      ['صيدلية', ['بنادول']],
      ['جرير', ['دفتر']],
    ]);
  });
  it('بالفئة بدون فئة المكان: أول فئة', () => {
    expect(view(groupDoneBy(rs, 'category'))).toEqual([
      ['بقالة', ['خبز']],
      ['صيدلية', ['شامبو', 'بنادول']],
      ['جرير', ['دفتر']],
    ]);
  });
  it('المنتهية ما تدخل', () => {
    expect(groupDoneBy([{ ...done('x', 'عيش', at(15, 8)), expiredAt: at(15, 8) }], 'place')).toEqual([]);
  });
});

describe('«انتهى موعدها وما جبتها»', () => {
  const expired = (id: string, expiredAt: number): Reminder => ({ ...done(id, id, expiredAt), expiredAt });
  it('منفصلة عن «جبتها»، والأحدث أول', () => {
    const rs = [expired('هدية', at(14, 9)), done('a', 'خبز', at(15, 10)), expired('عيش', at(15, 8))];
    expect(titles(groupDone(rs, NOW).today)).toEqual(['خبز']);
    expect(expiredReminders(rs).map((r) => r.id)).toEqual(['عيش', 'هدية']);
  });
  it('النشطة ما تدخل حتى لو فات موعدها', () => {
    expect(expiredReminders([{ ...expired('عيش', at(15, 8)), status: 'active' }])).toEqual([]);
  });
});
