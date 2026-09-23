import { describe, expect, it } from 'vitest';
import { itemKey, learnedTarget, learnFromEdit, sameTarget, type Learned } from './learned';
import { parseReminder } from './parser';
import { toReminderInputs } from './reminderInput';
import type { CategoryId, Target } from './types';

// الأربعاء ٢٣ سبتمبر ٢٠٢٦، الساعة ١٠ صباحًا
const NOW = new Date(2026, 8, 23, 10, 0);
const cat = (...categories: CategoryId[]): Target => ({ kind: 'category', categories });
const nahdi: Target = { kind: 'brand', brandId: 'nahdi', label: 'النهدي' };
const inputs = (s: string, learned: Learned) => toReminderInputs(parseReminder(s, NOW), s, learned);

describe('مفتاح الغرض', () => {
  it('مطبّع وبدون «ال»', () => {
    expect(itemKey('قهوة')).toBe('قهوه');
    expect(itemKey('القهوة')).toBe('قهوه');
    expect(itemKey('قهوة عربية')).toBe('قهوه عربيه');
    expect(itemKey('  ')).toBe('');
  });
});

describe('التعلم من المحرر', () => {
  it('غيّر المحل لغرض واحد: ينحفظ', () => {
    expect(learnFromEdit(['قهوة'], cat('cafe'), cat('cafe', 'grocery'), 5)).toEqual({
      key: 'قهوه', place: { item: 'قهوة', target: cat('cafe', 'grocery'), at: 5 },
    });
    // ما كان له محل («عطر») واختار له مول
    expect(learnFromEdit(['عطر'], null, cat('mall'), 5)?.place.target).toEqual(cat('mall'));
    expect(learnFromEdit(['بنادول'], cat('pharmacy'), nahdi, 5)?.place.target).toEqual(nahdi);
  });
  it('ما ينحفظ: نفس المحل، أكثر من غرض، فرع محدد، أو بدون محل', () => {
    expect(learnFromEdit(['قهوة'], cat('cafe'), cat('cafe'), 5)).toBeNull();
    // نفس الفئات بترتيب ثاني
    expect(learnFromEdit(['طماطم'], cat('grocery', 'produce'), cat('produce', 'grocery'), 5)).toBeNull();
    expect(learnFromEdit(['خبز', 'حليب'], cat('grocery'), cat('bakery'), 5)).toBeNull();
    const place: Target = { kind: 'place', place: { id: 'p', name: 'بنده العليا', lat: 24.7, lon: 46.6 } };
    expect(learnFromEdit(['خبز'], cat('grocery'), place, 5)).toBeNull();
    expect(learnFromEdit(['خبز'], cat('grocery'), null, 5)).toBeNull();
  });
  it('مقارنة المحلات', () => {
    expect(sameTarget(null, null)).toBe(true);
    expect(sameTarget(cat('cafe'), null)).toBe(false);
    expect(sameTarget(nahdi, { ...nahdi, label: 'نهدي' })).toBe(true);
    expect(sameTarget(nahdi, cat('pharmacy'))).toBe(false);
  });
});

describe('التفضيل في الجملة الجاية', () => {
  const learned: Learned = {
    قهوه: { item: 'قهوة', target: cat('cafe', 'grocery'), at: 1 },
    عطر: { item: 'عطر', target: cat('mall'), at: 1 },
  };
  it('يغلب القاموس، وينعلّم إنه من التفضيل', () => {
    expect(inputs('ابي اشتري قهوة', learned)).toEqual([
      { title: 'قهوة', target: cat('cafe', 'grocery'), deadline: undefined, priority: 'normal', needsPlace: false, learned: true },
    ]);
    expect(learnedTarget(learned, 'القهوة')).toEqual(cat('cafe', 'grocery'));
    // «عطر» ما له محل في القاموس، والتفضيل يعطيه
    expect(inputs('ابي اشتري عطر', learned)[0]).toMatchObject({ target: cat('mall'), needsPlace: false, learned: true });
  });
  it('باقي الأغراض من القاموس', () => {
    expect(inputs('ابي اشتري قهوة وحليب', learned).map((i) => [i.title, i.target, i.learned])).toEqual([
      ['قهوة', cat('cafe', 'grocery'), true], ['حليب', cat('grocery'), undefined],
    ]);
  });
  it('المحل الصريح في الجملة يغلب التفضيل', () => {
    expect(inputs('ذكرني إذا مريت على صيدلية اشتري قهوة', learned)[0]).toMatchObject({ target: cat('pharmacy') });
    expect(inputs('ذكرني إذا مريت على صيدلية اشتري قهوة', learned)[0].learned).toBeUndefined();
  });
  it('غرض ثاني ما يتأثر', () => {
    expect(inputs('ابي اشتري قهوة عربية', learned)[0].learned).toBeUndefined();
  });
});
