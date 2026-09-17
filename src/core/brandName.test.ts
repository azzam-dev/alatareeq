import { describe, expect, it } from 'vitest';
import { brandKey, editDistance, pickBrand, searchVariants, type PlaceHit } from './brandName';
import { TOMTOM_HITS } from './brandName.fixtures';

const pick = (q: string) => pickBrand(q, TOMTOM_HITS[q] ?? []);

describe('مفتاح البراند', () => {
  it('بدون «ال» وكلمة النوع والهمزات', () => {
    expect(brandKey('صيدلية النهدى')).toBe('نهدي');
    expect(brandKey('هايبر بنده')).toBe('بنده');
    expect(brandKey('الدانوب هايبر ماركت')).toBe('دانوب');
    expect(editDistance('نهدي', 'نهدى'.replace('ى', 'ي'))).toBe(0);
    expect(editDistance('جريير', 'جرير')).toBe(1);
  });
});

describe('البراند من نتائج TomTom الحقيقية', () => {
  it('الإملاء الغلط يتصحح لو له فروع', () => {
    expect(pick('النهدى')).toMatchObject({ name: 'النهدي', key: 'نهدي', category: 'pharmacy' });
    expect(pick('النهدي')).toMatchObject({ name: 'النهدي', distance: 0 });
    expect(pick('بنده')).toMatchObject({ name: 'بنده', category: 'grocery' });
    expect(pick('الدانوب')).toMatchObject({ key: 'دانوب', category: 'grocery' });
    expect(pick('دنكن')).toMatchObject({ key: 'دنكن', category: 'cafe' });
  });
  it('ما يصحح لمكان ثاني يشبهه', () => {
    // «لوزين» ← «لوسين» مطعم بفرعين، و«باندا» ← «مكتبة ماندا»
    expect(pick('لوزين')).toBeNull();
    expect(pick('باندا')).toBeNull();
    expect(pick('كافيه ابو فلان')).toBeNull();
    // «نهدي» بدون «ال»: TomTom يرجّع مستودعات، والسيرفر يعيد البحث بـ «النهدي»
    expect(pick('نهدي')).toBeNull();
  });
  it('«جريير» يصير «جرير» مو «جرينير» (محل واحد)', () => {
    expect(pick('جريير')).toMatchObject({ name: 'جرير', distance: 1 });
  });
});

describe('دمج أكثر من كتابة', () => {
  // بحث TomTom بدون موقع (١٧ سبتمبر): «النهدى» يرجّع ٤ فروع مكتوبة غلط، و«النهدي» يرجّع الصحيحة
  const typo: PlaceHit[] = [1, 2, 3, 4].map((i) => ({ id: `t${i}`, name: 'صيدلية النهدى', categoryCode: 7326 }));
  const right: PlaceHit[] = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ id: `r${i}`, name: i % 2 ? 'صيدلية النهدي' : 'النهدي', categoryCode: 7326 }));

  it('الكتابات: مثل ما هي، و«ي» بدل «ى»، و«ال» قدامه', () => {
    expect(searchVariants('النهدى')).toEqual({ spellings: ['النهدى', 'النهدي'], withAl: null });
    expect(searchVariants('نهدي')).toEqual({ spellings: ['نهدي'], withAl: 'النهدي' });
    expect(searchVariants('نهدى')).toEqual({ spellings: ['نهدى', 'نهدي'], withAl: 'النهدي' });
  });
  it('الاسم الأكثر تكرارًا يغلب الخطأ اللي في بيانات TomTom', () => {
    expect(pickBrand('النهدى', typo)?.name).toBe('النهدى');
    expect(pickBrand('النهدى', [...typo, ...right])).toMatchObject({ name: 'النهدي', branches: 12, category: 'pharmacy' });
  });
  it('نفس الفرع من كتابتين ينحسب مرة', () => {
    expect(pickBrand('النهدي', [...right, ...right])?.branches).toBe(8);
  });
  it('الفئة بس لو نصف الفروع أو أكثر', () => {
    // «جريير» بدون موقع: مكتبة جرير كثير، وفرع «تموينات جرير» واحد
    const jarir: PlaceHit[] = [
      ...[1, 2, 3, 4, 5].map((i) => ({ id: `m${i}`, name: 'مكتبة جرير', categoryCode: 9361002 })),
      ...[1, 2, 3].map((i) => ({ id: `x${i}`, name: 'مكتبة جرير', categoryCode: 9913 })),
      { id: 'g', name: 'تموينات جرير', categoryCode: 9361023 },
    ];
    expect(pickBrand('جريير', jarir)).toMatchObject({ name: 'جرير', category: 'bookstore' });
    expect(pickBrand('جريير', jarir.map((h) => (h.categoryCode === 9361002 ? { ...h, categoryCode: 9913 } : h)))?.category).toBeNull();
  });
});
