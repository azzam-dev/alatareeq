import { describe, expect, it } from 'vitest';
import { parseReminder } from './parser';
import { toReminderInputs } from './reminderInput';
import type { CategoryId } from './types';

// الخميس ١٧ سبتمبر ٢٠٢٦، الساعة ١٠ صباحًا
const NOW = new Date(2026, 8, 17, 10, 0);
const inputs = (s: string) => toReminderInputs(parseReminder(s, NOW), s);
const input = (s: string) => inputs(s)[0];
const at = (day: number, h: number, m = 0) => new Date(2026, 8, day, h, m).getTime();
const endOf = (day: number) => new Date(2026, 8, day, 23, 59, 59, 999).getTime();
const cat = (...categories: CategoryId[]) => ({ kind: 'category', categories });

describe('الجملة ← تذكير بمحل وآخر موعد', () => {
  it('اليوم بدون ساعة: آخر موعد نهاية اليوم، والفئة من الغرض', () => {
    expect(inputs('ابي اشتري هدية يوم الثلاثاء')).toEqual([{
      title: 'هدية', target: cat('gifts'), deadline: endOf(22), priority: 'normal', needsPlace: false,
    }]);
    expect(input('ابي اشتري هدية بكرة').deadline).toBe(endOf(18));
    expect(inputs('ابي اشتري شامبو قبل الخميس')).toEqual([{
      title: 'شامبو', target: cat('pharmacy', 'grocery'), deadline: endOf(24), priority: 'normal', needsPlace: false,
    }]);
  });
  it('فيه ساعة: آخر موعد الساعة نفسها', () => {
    expect(inputs('جيب خبز قبل الساعة ٧')).toEqual([{
      title: 'خبز', target: cat('grocery'), deadline: at(17, 19), priority: 'normal', needsPlace: false,
    }]);
    expect(input('ابي اشتري بنادول الثلاثاء الساعة ٥').deadline).toBe(at(22, 17));
  });
  it('بدون وقت: بدون آخر موعد، و«لما أوصل» يصير مرور عادي بنفس المكان', () => {
    expect(inputs('لما أوصل الصيدلية آخذ الدواء')).toEqual([{
      title: 'الدواء', target: cat('pharmacy'), deadline: undefined, priority: 'normal', needsPlace: false,
    }]);
    expect(input('أعبي السيارة').target).toEqual(cat('fuel'));
  });
  it('ما له محل: ما ينحفظ لين يختار المستخدم وين', () => {
    expect(inputs('ذكرني الساعة ٥ أتصل على أبوي')).toEqual([
      expect.objectContaining({ title: 'أتصل على أبوي', target: null, needsPlace: true }),
    ]);
    expect(input('ادفع الفاتورة')).toMatchObject({ title: 'ادفع الفاتورة', target: null, needsPlace: true });
  });
});

describe('كل غرض تذكير مستقل', () => {
  it('كل غرض بفئته، والأولوية مشتركة وتنشال من العنوان', () => {
    expect(inputs('ابي اشتري خبز وبنادول ضروري')).toEqual([
      { title: 'خبز', target: cat('grocery'), deadline: undefined, priority: 'high', needsPlace: false },
      { title: 'بنادول', target: cat('pharmacy'), deadline: undefined, priority: 'high', needsPlace: false },
    ]);
  });
  it('المحل الصريح لكل الأغراض', () => {
    expect(inputs('ذكرني إذا مريت على صيدلية أشتري بنادول وشامبو').map((i) => [i.title, i.target])).toEqual([
      ['بنادول', cat('pharmacy')],
      ['شامبو', cat('pharmacy')],
    ]);
    expect(inputs('ذكرني إذا مريت على جرير أشتري دفتر وقلم').map((i) => i.target?.kind)).toEqual(['brand', 'brand']);
  });
  it('غرض يصلح لفئتين ياخذهم الاثنين', () => {
    expect(input('ابي اشتري شامبو').target).toEqual(cat('pharmacy', 'grocery'));
  });
  it('غرض بدون فئة ياخذ فئات الجملة، والموعد مشترك', () => {
    expect(inputs('ابي اشتري خبز وهيل بكرة')).toEqual([
      { title: 'خبز', target: cat('grocery'), deadline: endOf(18), priority: 'normal', needsPlace: false },
      { title: 'هيل', target: cat('grocery'), deadline: endOf(18), priority: 'normal', needsPlace: false },
    ]);
  });
  it('أولوية منخفضة', () => {
    expect(inputs('مو ضروري اشتري حليب')).toEqual([
      { title: 'حليب', target: cat('grocery'), deadline: undefined, priority: 'low', needsPlace: false },
    ]);
  });
});

describe('الفئات اللي ما لها أماكن (عطور، حلويات، أدوات منزلية)', () => {
  it('ما تنحط محل، فالمستخدم يختار', () => {
    expect(input('ابي اشتري عطر')).toMatchObject({ title: 'عطر', target: null, needsPlace: true });
    expect(input('ذكرني إذا مريت على محل عطور أشتري عود')).toMatchObject({ target: null, needsPlace: true });
    expect(input('ابي اشتري كيك وحليب').target).toEqual({ kind: 'category', categories: ['grocery'] });
  });
});
