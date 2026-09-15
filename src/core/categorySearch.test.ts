import { describe, expect, it } from 'vitest';
import { searchCategories } from './categorySearch';
import { parseReminder } from './parser';
import { classifyPlace } from './placeKind';

// السبت ١٢ سبتمبر ٢٠٢٦، الساعة ١٠ صباحًا
const NOW = new Date(2026, 8, 12, 10, 0);
const ids = (q: string) => searchCategories(q).map((c) => c.id);

describe('البحث عن فئة في المحرر', () => {
  it('باسم المحل، أو بضاعته، أو غرض ينشرى منه', () => {
    for (const [q, id] of [
      ['العاب', 'toys'], ['ألعاب', 'toys'], ['فيفا', 'toys'], ['جوال', 'mobile'], ['صراف', 'atm'], ['نظارات', 'optician'],
      ['قطع غيار', 'carParts'], ['قهوة', 'cafe'], ['صيدلية', 'pharmacy'], ['الصيدلية', 'pharmacy'], ['بنادول', 'pharmacy'],
      ['ورد', 'florist'], ['حلاق', 'barber'], ['مغسلة سيارات', 'carWash'],
    ] as const) {
      expect(ids(q)[0], q).toBe(id);
    }
  });
  it('تطلع وهو يكتب', () => {
    expect(ids('الع')).toContain('toys');
    expect(ids('مطع')).toContain('restaurant');
  });
  it('ما فيه نتيجة', () => {
    expect(ids('سباكة')).toEqual([]);
    expect(ids('')).toEqual([]);
    expect(ids('ب')).toEqual([]);
  });
});

describe('الفئات الإضافية في الجملة والأماكن', () => {
  it('«محل ألعاب» بعد المرور', () => {
    const r = parseReminder('ذكرني إذا مريت على محل ألعاب أشتري شريط فيفا', NOW);
    expect(r.target).toEqual({ kind: 'category', categories: ['toys'] });
    expect(r.title).toBe('أشتري شريط فيفا');
  });
  it('الفئة من الغرض نفسه', () => {
    const r = parseReminder('ابي اشتري شريط فيفا', NOW);
    expect(r.inferred).toBe(true);
    expect(r.target).toEqual({ kind: 'category', categories: ['toys'] });
  });
  it('البضاعة بدون «محل» تبقى غرض في العنوان', () => {
    const r = parseReminder('ابي اشتري العاب للعيال', NOW);
    expect(r.title).toBe('ابي اشتري العاب للعيال');
    expect(r.target).toEqual({ kind: 'category', categories: ['toys'] });
  });
  it('أطول اسم فئة يغلب', () => {
    expect(parseReminder('لو مريت على مغسلة سيارات', NOW).target).toEqual({ kind: 'category', categories: ['carWash'] });
    expect(parseReminder('لو مريت على مغسلة أستلم الثياب', NOW).target).toEqual({ kind: 'category', categories: ['laundry'] });
  });
  it('مكان OSM بوسم فئة إضافية', () => {
    expect(classifyPlace({ shop: 'toys', name: 'Toys R Us' }).categories).toEqual(['toys']);
    expect(classifyPlace({ amenity: 'atm' }).categories).toEqual(['atm']);
  });
});
