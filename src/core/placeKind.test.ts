import { describe, expect, it } from 'vitest';
import { placeTitle } from './compose';
import { placeMatches } from './gate';
import { classifyPlace } from './placeKind';
import type { Place, Reminder, Target } from './types';

const mk = (name: string, tags: Record<string, string>, over: Partial<Place> = {}): Place => ({
  id: 'x', name, lat: 0, lon: 0, brands: [], ...classifyPlace(tags, [name]), ...over,
});
const rem = (target: Target): Reminder => ({ id: 'r1', title: 'حليب', trigger: 'pass', status: 'active', createdAt: 0, target });

describe('فئة المكان من OSM', () => {
  it('«العاب الحسين» الموسوم بقالة ما ينحسب بقالة', () => {
    expect(classifyPlace({ shop: 'convenience' }, ['العاب الحسين']).categories).toEqual([]);
  });
  it('«زين العابدين» يبقى بقالة: نطابق الكلمة كاملة', () => {
    expect(classifyPlace({ shop: 'convenience' }, ['تموينات زين العابدين'])).toEqual({ categories: ['grocery'], kind: 'shop=convenience' });
  });
  it('محلات غلط من بيانات الرياض الحقيقية تنستبعد من البقالة', () => {
    for (const names of [
      ['شركة الهدف للوازم الصيد والرحلات'],
      ['شركة طوابق العقارية'],
      ['هوم سنتر', 'home center'],
      ['بزل للوسائل التعليمية'],
      ['Toys Center'],
      ['عطور الماجد'],
    ]) {
      expect(classifyPlace({ shop: 'supermarket' }, names).categories, names[0]).toEqual([]);
    }
  });
  it('«الرماية» سوبرماركت حقيقي باسم الحي، ما ينستبعد', () => {
    expect(classifyPlace({ shop: 'supermarket' }, ['الرماية', 'Alrimaya']).categories).toEqual(['grocery']);
  });
  it('الكلمات المستبعدة خاصة بكل فئة', () => {
    expect(classifyPlace({ shop: 'books' }, ['مكتبة الألعاب التعليمية']).categories).toEqual(['bookstore']);
  });
});

describe('عنوان المكان', () => {
  it('نكتب النوع لو الاسم ما يدل عليه', () => {
    expect(placeTitle(mk('الرماية', { shop: 'supermarket' }))).toBe('سوبرماركت · الرماية');
    expect(placeTitle(mk('Orange', { amenity: 'pharmacy' }))).toBe('صيدلية · Orange');
  });
  it('الاسم لحاله لو فيه نوعه أو براند معروف', () => {
    expect(placeTitle(mk('أسواق التميمي', { shop: 'supermarket' }))).toBe('أسواق التميمي');
    expect(placeTitle(mk('بقالة النور', { shop: 'convenience' }))).toBe('بقالة النور');
    expect(placeTitle(mk('هايبر بنده', { shop: 'supermarket' }))).toBe('هايبر بنده');
    expect(placeTitle(mk('صيدلية النهدي', { amenity: 'pharmacy' }))).toBe('صيدلية النهدي');
  });
  it('بدون اسم ← النوع، وبدون فئة ← الاسم', () => {
    expect(placeTitle(mk('', { shop: 'convenience' }))).toBe('بقالة');
    expect(placeTitle(mk('بيت أبوي', {}))).toBe('بيت أبوي');
  });
  it('للنطق بدون فاصل', () => {
    expect(placeTitle(mk('الرماية', { shop: 'supermarket' }), ' ')).toBe('سوبرماركت الرماية');
  });
});

describe('الأماكن المخفية («مو مناسب»)', () => {
  const hidden = new Set(['x']);
  it('تنستبعد من الفئة والبراند المعروف', () => {
    expect(placeMatches(rem({ kind: 'category', categories: ['grocery'] }), mk('مؤسسة الحسين', { shop: 'convenience' }), hidden)).toBe(false);
    const jarir = mk('جرير', { shop: 'books' }, { brands: ['jarir'] });
    expect(placeMatches(rem({ kind: 'brand', brandId: 'jarir', label: 'جرير' }), jarir, hidden)).toBe(false);
    expect(placeMatches(rem({ kind: 'brand', brandId: 'jarir', label: 'جرير' }), jarir)).toBe(true);
  });
  it('تبقى لو التذكير باسمها الصريح أو موقعها', () => {
    const p = mk('العاب الحسين', { shop: 'convenience' }, { brands: ['name:العاب الحسين'] });
    expect(placeMatches(rem({ kind: 'brand', brandId: 'name:العاب الحسين', label: 'العاب الحسين' }), p, hidden)).toBe(true);
    expect(placeMatches(rem({ kind: 'place', place: { id: 'x', name: 'العاب الحسين', lat: 0, lon: 0 } }), p, hidden)).toBe(true);
  });
});
