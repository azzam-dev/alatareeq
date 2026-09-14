import { describe, expect, it } from 'vitest';
import { placeTitle } from './compose';
import { placeMatches } from './gate';
import { classifyPlace } from './placeKind';
import type { Place, Reminder, Target } from './types';

const mk = (tags: Record<string, string>, over: Partial<Place> = {}): Place => ({
  id: 'x', name: tags['name:ar'] || tags.name || '', lat: 0, lon: 0, brands: [], ...classifyPlace(tags), ...over,
});
const rem = (target: Target): Reminder => ({ id: 'r1', title: 'حليب', trigger: 'pass', status: 'active', createdAt: 0, target });

describe('فئة المكان من OSM', () => {
  it('«العاب الحسين» الموسوم بقالة ما ينحسب بقالة', () => {
    expect(classifyPlace({ shop: 'convenience', name: 'العاب الحسين' }).categories).toEqual([]);
  });
  it('«زين العابدين» يبقى بقالة: نطابق الكلمة كاملة', () => {
    expect(classifyPlace({ shop: 'convenience', name: 'تموينات زين العابدين' })).toEqual({ categories: ['grocery'], kind: 'shop=convenience' });
  });
  it('محلات غلط من بيانات الرياض الحقيقية تنستبعد من البقالة', () => {
    const cases: Record<string, string>[] = [
      { name: 'شركة الهدف للوازم الصيد والرحلات' },
      { name: 'شركة طوابق العقارية' },
      { name: 'هوم سنتر', 'name:en': 'home center' },
      { name: 'بزل للوسائل التعليمية' },
      { name: 'Toys Center' },
      { name: 'عطور الماجد' },
    ];
    for (const tags of cases) {
      expect(classifyPlace({ shop: 'supermarket', ...tags }).categories, tags.name).toEqual([]);
    }
  });
  it('«الرماية» سوبرماركت حقيقي باسم الحي، ما ينستبعد', () => {
    expect(classifyPlace({ shop: 'supermarket', name: 'الرماية', 'name:en': 'Alrimaya' }).categories).toEqual(['grocery']);
  });
  it('الكلمات المستبعدة خاصة بكل فئة', () => {
    expect(classifyPlace({ shop: 'books', name: 'مكتبة الألعاب التعليمية' }).categories).toEqual(['bookstore']);
  });
});

describe('مكان بلا هوية', () => {
  it('نقطة «سوبرماركت» بلا أي معلومة ما تنحسب (مقهى الورود، node/672710394)', () => {
    expect(classifyPlace({ shop: 'supermarket' }).categories).toEqual([]);
  });
  it('العنوان لحاله ما يكفي', () => {
    expect(classifyPlace({ shop: 'supermarket', 'addr:street': 'الأمير سلطان بن سلمان بن عبدالعزيز' }).categories).toEqual([]);
  });
  it('المشغّل أو الهاتف يكفي', () => {
    expect(classifyPlace({ amenity: 'pharmacy', healthcare: 'pharmacy', operator: 'Aldawa', phone: '+966112540953' }).categories).toEqual(['pharmacy']);
    expect(classifyPlace({ shop: 'convenience', phone: '+966500000000' }).categories).toEqual(['grocery']);
  });
  it('محطات الوقود والشحن بدون اسم تبقى: تبان من الأقمار ونادرًا تختفي', () => {
    expect(classifyPlace({ amenity: 'fuel' }).categories).toEqual(['fuel']);
    expect(classifyPlace({ amenity: 'charging_station' }).categories).toEqual(['charging']);
  });
});

describe('عنوان المكان', () => {
  it('نكتب النوع لو الاسم ما يدل عليه', () => {
    expect(placeTitle(mk({ shop: 'supermarket', name: 'الرماية' }))).toBe('سوبرماركت · الرماية');
    expect(placeTitle(mk({ amenity: 'pharmacy', name: 'Orange' }))).toBe('صيدلية · Orange');
  });
  it('الاسم لحاله لو فيه نوعه أو براند معروف', () => {
    expect(placeTitle(mk({ shop: 'supermarket', name: 'أسواق التميمي' }))).toBe('أسواق التميمي');
    expect(placeTitle(mk({ shop: 'convenience', name: 'بقالة النور' }))).toBe('بقالة النور');
    expect(placeTitle(mk({ shop: 'supermarket', name: 'هايبر بنده' }))).toBe('هايبر بنده');
    expect(placeTitle(mk({ amenity: 'pharmacy', name: 'صيدلية النهدي' }))).toBe('صيدلية النهدي');
  });
  it('بدون اسم (وعليه هاتف) ← النوع، وبدون فئة ← الاسم', () => {
    expect(placeTitle(mk({ shop: 'convenience', phone: '+966500000000' }))).toBe('بقالة');
    expect(placeTitle(mk({ name: 'بيت أبوي' }))).toBe('بيت أبوي');
  });
  it('للنطق بدون فاصل', () => {
    expect(placeTitle(mk({ shop: 'supermarket', name: 'الرماية' }), ' ')).toBe('سوبرماركت الرماية');
  });
});

describe('الأماكن المخفية («مو مناسب»)', () => {
  const hidden = new Set(['x']);
  it('تنستبعد من الفئة والبراند المعروف', () => {
    expect(placeMatches(rem({ kind: 'category', categories: ['grocery'] }), mk({ shop: 'convenience', name: 'مؤسسة الحسين' }), hidden)).toBe(false);
    const jarir = mk({ shop: 'books', name: 'جرير' }, { brands: ['jarir'] });
    expect(placeMatches(rem({ kind: 'brand', brandId: 'jarir', label: 'جرير' }), jarir, hidden)).toBe(false);
    expect(placeMatches(rem({ kind: 'brand', brandId: 'jarir', label: 'جرير' }), jarir)).toBe(true);
  });
  it('تبقى لو التذكير باسمها الصريح أو موقعها', () => {
    const p = mk({ shop: 'convenience', name: 'العاب الحسين' }, { brands: ['name:العاب الحسين'] });
    expect(placeMatches(rem({ kind: 'brand', brandId: 'name:العاب الحسين', label: 'العاب الحسين' }), p, hidden)).toBe(true);
    expect(placeMatches(rem({ kind: 'place', place: { id: 'x', name: 'العاب الحسين', lat: 0, lon: 0 } }), p, hidden)).toBe(true);
  });
});
