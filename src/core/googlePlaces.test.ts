import { describe, expect, it } from 'vitest';
import { distanceM } from './geo';
import {
  categoriesOfTypes, combineGoogleCategories, GOOGLE_MAX_TYPES, GOOGLE_TYPES, googleToTile, googleTypesFor, searchCircles,
  type GooglePlace,
} from './googlePlaces';
import { CATEGORIES } from './lexicon';
import { TILE_SEARCH_RADIUS_M, tileBounds, tileCenter, tileOf } from './placeTiles';

// طريق الملك عبدالعزيز، الرياض
const LAT = 24.7745;
const LON = 46.6935;
const TILE = tileOf(LAT, LON);

describe('أنواع Google لكل فئة', () => {
  it('كل فئة لها أنواع أو مخفية، والمخفية عطور ونظارات بس', () => {
    for (const c of CATEGORIES) {
      expect(c.id in GOOGLE_TYPES, c.id).toBe(true);
      for (const t of GOOGLE_TYPES[c.id] ?? []) expect(t).toMatch(/^[a-z_]+$/);
    }
    expect(CATEGORIES.filter((c) => !GOOGLE_TYPES[c.id]).map((c) => c.id)).toEqual(['perfume', 'optician']);
  });
  it('فئة المكان من أنواعه', () => {
    expect(categoriesOfTypes(['hypermarket', 'supermarket', 'grocery_store', 'food_store', 'store'])).toEqual(['grocery']);
    expect(categoriesOfTypes(['pharmacy', 'drugstore', 'health', 'store'])).toEqual(['pharmacy']);
    // المخفية عند TomTom
    expect(categoriesOfTypes(['candy_store', 'food_store', 'store'])).toEqual(['sweets']);
    expect(categoriesOfTypes(['home_goods_store', 'store'])).toEqual(['houseware']);
    // هايبر فيه صيدلية، ومقهى يقدّم أكل
    expect(categoriesOfTypes(['hypermarket', 'pharmacy', 'store'])).toEqual(['pharmacy', 'grocery']);
    expect(categoriesOfTypes(['cafe', 'coffee_shop', 'restaurant', 'food'])).toEqual(['cafe', 'restaurant']);
    // الأنواع العامة ما تطابق شي
    expect(categoriesOfTypes(['store', 'point_of_interest', 'establishment'])).toEqual([]);
  });
  it('الأنواع بدون تكرار، و٥٠ بالكثير لكل سؤال', () => {
    expect(googleTypesFor(['pharmacy', 'grocery', 'perfume'])).toEqual([
      'pharmacy', 'drugstore', 'grocery_store', 'supermarket', 'hypermarket', 'discount_supermarket', 'convenience_store', 'market',
    ]);
    const all = CATEGORIES.map((c) => c.id);
    const groups = combineGoogleCategories(all);
    expect(groups.length).toBeGreaterThan(1);
    for (const g of groups) expect(googleTypesFor(g).length).toBeLessThanOrEqual(GOOGLE_MAX_TYPES);
    // كل فئة لها أنواع موجودة في مجموعة، والعطور والنظارات لا
    expect(groups.flat().sort()).toEqual(all.filter((c) => GOOGLE_TYPES[c]).sort());
    expect(combineGoogleCategories(['grocery', 'pharmacy', 'fuel'])).toEqual([['grocery', 'pharmacy', 'fuel']]);
  });
});

describe('دوائر البحث في المربع', () => {
  it('دائرة وحدة حول الوسط', () => {
    expect(searchCircles(TILE)).toEqual([{ ...tileCenter(TILE), radiusM: TILE_SEARCH_RADIUS_M }]);
  });
  it('الأرباع الأربعة تغطي كل نقطة في المربع', () => {
    const circles = searchCircles(TILE, true);
    expect(circles).toHaveLength(4);
    const b = tileBounds(TILE);
    for (let i = 0; i <= 8; i++) {
      for (let j = 0; j <= 8; j++) {
        const p = { lat: b.south + ((b.north - b.south) * i) / 8, lon: b.west + ((b.east - b.west) * j) / 8 };
        expect(circles.some((c) => distanceM(c, p) <= c.radiusM), `${i},${j}`).toBe(true);
      }
    }
  });
});

describe('رد Google ← أماكن المربع', () => {
  const c = tileCenter(TILE);
  const at = (dLat: number, dLon = 0) => ({ latitude: c.lat + dLat, longitude: c.lon + dLon });
  const results: GooglePlace[] = [
    {
      id: 'a', displayName: { text: 'بنده' }, location: at(0.001), types: ['hypermarket', 'pharmacy', 'store'],
      addressComponents: [
        { longText: 'طريق الملك عبدالعزيز', types: ['route'] },
        { longText: 'المصيف', types: ['sublocality_level_1', 'sublocality', 'political'] },
      ],
    },
    { id: 'b', displayName: { text: 'صيدلية النهدي' }, location: at(-0.002), types: ['pharmacy', 'health'] },
    // نفس المكان من ربعين
    { id: 'b', displayName: { text: 'صيدلية النهدي' }, location: at(-0.002), types: ['pharmacy', 'health'] },
    // برّا المربع (الدائرة أكبر منه)
    { id: 'c', displayName: { text: 'بقالة بعيدة' }, location: at(0.009), types: ['grocery_store'] },
    // بدون اسم أو موقع
    { id: 'd', location: at(0), types: ['grocery_store'] },
    { id: 'e', displayName: { text: 'بدون موقع' }, types: ['grocery_store'] },
    // مطعم ما انطلب
    { id: 'f', displayName: { text: 'مطعم' }, location: at(0), types: ['restaurant'] },
  ];

  it('كل فئة مطلوبة لها أماكنها، والفاضية تنحفظ فاضية', () => {
    const got = googleToTile(results, TILE, ['grocery', 'pharmacy', 'fuel']);
    expect(got.get('grocery')).toEqual([
      { id: 'gp:a', name: 'بنده', lat: c.lat + 0.001, lon: c.lon, branch: 'المصيف', category: 'grocery' },
    ]);
    expect(got.get('pharmacy')!.map((p) => [p.id, p.branch])).toEqual([['gp:a', 'المصيف'], ['gp:b', undefined]]);
    expect(got.get('fuel')).toEqual([]);
    expect(got.has('restaurant')).toBe(false);
  });
  it('الحي أول، والشارع لو ما فيه حي', () => {
    const street: GooglePlace = {
      id: 'g', displayName: { text: 'محطة' }, location: at(0), types: ['gas_station'],
      addressComponents: [{ longText: 'طريق العليا', types: ['route'] }, { longText: 'الرياض', types: ['locality'] }],
    };
    expect(googleToTile([street], TILE, ['fuel']).get('fuel')![0].branch).toBe('طريق العليا');
  });
});
