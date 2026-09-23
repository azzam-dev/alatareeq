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

describe('فئات TomTom الجديدة (٢٣ سبتمبر)', () => {
  it('الغرض يدل على الفئة', () => {
    expect(inputs('ابي اشتري طماطم وموز').map((r) => [r.title, r.target])).toEqual([
      ['طماطم', cat('grocery', 'produce')], ['موز', cat('grocery', 'produce')],
    ]);
    expect(input('ابي اشتري سمك').target).toEqual(cat('fish', 'grocery'));
    expect(input('ابي اشتري بوية').target).toEqual(cat('paint', 'hardware'));
    expect(input('ابي اشتري كفرات').target).toEqual(cat('tires'));
    expect(input('ابي اشتري مكياج').target).toEqual(cat('cosmetics', 'pharmacy'));
    expect(input('ابي اشتري زولية').target).toEqual(cat('carpets'));
    // «أدوات منزلية» كانت مخفية، وصار لها أماكن
    expect(input('ابي اشتري صحون').target).toEqual(cat('houseware'));
    // القهوة من المقهى، مو البقالة (ملاحظة صاحب المشروع)
    expect(input('ابي اشتري قهوة').target).toEqual(cat('cafe'));
    expect(input('ابي اشتري قهوة وحليب').target).toEqual(cat('cafe'));
  });
  it('المحل الصريح', () => {
    expect(input('ذكرني إذا مريت على مشتل أشتري سماد').target).toEqual(cat('garden'));
    expect(input('ذكرني إذا مريت على بنشر').target).toEqual(cat('tires'));
    expect(input('ذكرني إذا مريت على عيادة بيطرية').target).toEqual(cat('vet'));
    expect(input('ذكرني إذا مريت على مطبعة أطبع الدعوات').target).toEqual(cat('print'));
    expect(input('ذكرني إذا مريت على محل خضار').target).toEqual(cat('produce'));
    // «ورد» باقي للورد، و«مشتل» صار لحاله
    expect(input('ذكرني إذا مريت على محل ورد').target).toEqual(cat('florist'));
  });
});

describe('الفئات اللي ما لها أماكن (عطور، حلويات)', () => {
  it('ما تنحط محل، فالمستخدم يختار', () => {
    expect(input('ابي اشتري عطر')).toMatchObject({ title: 'عطر', target: null, needsPlace: true });
    expect(input('ذكرني إذا مريت على محل عطور أشتري عود')).toMatchObject({ target: null, needsPlace: true });
    expect(input('ابي اشتري كيك وحليب').target).toEqual({ kind: 'category', categories: ['grocery'] });
  });
});

describe('أغراض كل الفئات (قاموس ٢٣ سبتمبر)', () => {
  const cats = (s: string) => inputs(s).map((r) => [r.title, r.target]);
  it('كل غرض يروح لفئته', () => {
    expect(cats('ابي اشتري ثلاجة ومكيف')).toEqual([['ثلاجة', cat('electronics')], ['مكيف', cat('electronics')]]);
    expect(cats('ابي اشتري محفظة')).toEqual([['محفظة', cat('bags')]]);
    expect(cats('ابي اشتري روج')).toEqual([['روج', cat('cosmetics', 'pharmacy')]]);
    expect(cats('ابي اشتري بذور')).toEqual([['بذور', cat('garden')]]);
    expect(cats('ابي اشتري مخدات')).toEqual([['مخدات', cat('houseware', 'furniture')]]);
    expect(cats('ابي اشتري لحم مفروم')).toEqual([['لحم مفروم', cat('grocery', 'butcher')]]);
    expect(cats('ابي اشتري شاحن ايفون')).toEqual([['شاحن ايفون', cat('mobile', 'electronics')]]);
    expect(cats('ابي اشتري شاكوش ومسامير')).toEqual([['شاكوش', cat('hardware')], ['مسامير', cat('hardware')]]);
    expect(cats('ابي اشتري جنوط')).toEqual([['جنوط', cat('tires', 'carParts')]]);
    expect(cats('ابي اطبع بروشور')[0][1]).toEqual(cat('print'));
  });
  it('كلمات لها معنى ثاني ما تغيّر الفئة', () => {
    // «الساعة» وقت مو مجوهرات
    expect(input('ابي اشتري خبز الساعة ٥').target).toEqual(cat('grocery'));
    // «فول» أكل، و«عبي» لحالها وقود
    expect(input('ابي اشتري فول').target).toEqual(cat('grocery'));
    expect(input('عبي بنزين').target).toEqual(cat('fuel'));
  });
});

describe('توسعة القاموس الثانية', () => {
  it('أغراض شائعة جديدة', () => {
    expect(input('ابي اشتري فريزر').target).toEqual(cat('electronics'));
    expect(input('ابي اشتري سجاجيد').target).toEqual(cat('carpets'));
    expect(input('ابي اشتري ورد جوري').target).toEqual(cat('florist'));
    expect(input('ابي اشتري اضحية').target).toEqual(cat('butcher'));
    expect(input('ابي اشتري مجلى').target).toEqual(cat('kitchens', 'hardware'));
    expect(input('ابي اشتري ماكياتو').target).toEqual(cat('cafe'));
    expect(input('ابي اشتري تورتة').target).toBeNull();
    expect(input('ابي اشتري مصحف').target).toEqual(cat('bookstore'));
    expect(input('ابي اشتري ليرة ذهب').target).toEqual(cat('jewelry'));
    expect(input('ابي اشتري ببغاء').target).toEqual(cat('pets'));
    expect(input('ابي اسوي تحاليل').target).toEqual(cat('clinic', 'hospital'));
  });
  it('المبالغ والأوقات ما تصير أغراض', () => {
    expect(input('ابي اشتري خبز بخمسة ريال').target).toEqual(cat('grocery'));
    expect(input('ابي اشتري حليب بعد ساعتين').target).toEqual(cat('grocery'));
  });
});
