import { describe, expect, it } from 'vitest';
import { CATEGORIES } from './lexicon';
import {
  affordable, categoryOfCode, chargeFetch, combineCategories, hasPlaceSource, inTile, isTileId, mergeTilePlaces, recordDemand,
  splitByCategory, tileBounds, tileCenter, tileOf, tilesAhead, TOMTOM_CODES, type BudgetState, type RawPlace, type TilePlace,
} from './placeTiles';

// طريق الملك عبدالعزيز، الرياض
const LAT = 24.7745;
const LON = 46.6935;

describe('أرقام فئات TomTom', () => {
  it('كل فئة لها رقم أو مخفية، و١٠ أرقام بالكثير', () => {
    for (const c of CATEGORIES) {
      expect(c.id in TOMTOM_CODES, c.id).toBe(true);
      expect((TOMTOM_CODES[c.id] ?? []).length).toBeLessThanOrEqual(10);
    }
    expect(CATEGORIES.filter((c) => !hasPlaceSource(c.id)).map((c) => c.id)).toEqual(['perfume', 'sweets']);
  });
  it('الرقم وفروعه، والأطول يغلب', () => {
    expect(categoryOfCode(7332005)).toBe('grocery');
    expect(categoryOfCode(7326)).toBe('pharmacy');
    expect(categoryOfCode(9376006)).toBe('cafe');
    expect(categoryOfCode(7321002)).toBe('hospital');
    // «Specialty Foods» مو حلويات
    expect(categoryOfCode(9361061)).toBeNull();
    expect(categoryOfCode(undefined)).toBeNull();
  });
});

describe('المربعات', () => {
  it('النقطة داخل مربعها، ووسطه داخله', () => {
    const id = tileOf(LAT, LON);
    expect(isTileId(id)).toBe(true);
    expect(inTile(id, LAT, LON)).toBe(true);
    const c = tileCenter(id);
    expect(tileOf(c.lat, c.lon)).toBe(id);
    const b = tileBounds(id);
    expect(b.north - b.south).toBeCloseTo(0.0135);
    expect(isTileId('1:2; drop table')).toBe(false);
  });
  it('بدون اتجاه: المربعات حولك، مربعك أول', () => {
    const all = tilesAhead(LAT, LON, null);
    expect(all[0]).toBe(tileOf(LAT, LON));
    expect(all.length).toBeGreaterThanOrEqual(4);
    expect(all.length).toBeLessThan(16);
  });
  it('رايح شرق: اللي غرب وبعيد ما ينطلب، وأبعد من كيلو ونص ما ينطلب', () => {
    const east = tilesAhead(LAT, LON, 90);
    const all = tilesAhead(LAT, LON, null);
    expect(east.length).toBeLessThan(all.length);
    // المربع الغربي الجار (أقرب نقطة فيه ١٫٣٥ كم)، والشرقي الجار
    const west = tileOf(LAT, LON - 0.02);
    expect(all).toContain(west);
    expect(east).not.toContain(west);
    expect(east).toContain(tileOf(LAT, LON + 0.012));
    // ٣ كم شرق
    expect(all).not.toContain(tileOf(LAT, LON + 0.03));
  });
});

describe('دمج أماكن المربعات', () => {
  const brandsOf = (texts: string[]) => (texts.some((t) => /بنده|panda/i.test(t)) ? ['panda'] : []);
  it('نفس المكان من نوعين مكان واحد بفئتين، والبراند من الاسم أو من TomTom', () => {
    const list: TilePlace[] = [
      { id: 't1', name: 'بنده', lat: LAT, lon: LON, branch: 'المصيف', brandNames: ['Panda'], category: 'grocery' },
      { id: 't1', name: 'بنده', lat: LAT, lon: LON, branch: 'المصيف', brandNames: ['Panda'], category: 'pharmacy' },
      { id: 't2', name: 'هايبر', lat: LAT, lon: LON, brandNames: ['Panda'], category: 'grocery' },
      { id: 't3', name: 'صيدلية المصيف', lat: LAT, lon: LON, category: 'pharmacy' },
    ];
    expect(mergeTilePlaces(list, brandsOf)).toEqual([
      { id: 't1', name: 'بنده', lat: LAT, lon: LON, categories: ['grocery', 'pharmacy'], brands: ['panda'], branch: 'المصيف' },
      { id: 't2', name: 'هايبر', lat: LAT, lon: LON, categories: ['grocery'], brands: ['panda'], branch: undefined },
      { id: 't3', name: 'صيدلية المصيف', lat: LAT, lon: LON, categories: ['pharmacy'], brands: [], branch: undefined },
    ]);
  });
});

describe('رصيد TomTom حسب استخدام الفئات', () => {
  it('الحصة على قد الطلب، والنوع اللي خلصت حصته ينشال', () => {
    // الشهر: بقالة ٥٠، صيدلية ٣٠، وقود ١٥، مكتبة ٥ من رصيد ١٠٠
    const state: BudgetState = {
      grocery: { demand: 50, spent: 10 },
      pharmacy: { demand: 30, spent: 29.5 },
      fuel: { demand: 15, spent: 15 },
      bookstore: { demand: 5, spent: 1 },
    };
    expect(affordable(['grocery', 'pharmacy', 'fuel', 'bookstore'], state, 100)).toEqual(['grocery', 'pharmacy', 'bookstore']);
  });
  it('الرصيد كله خلص: ما نسأل عن شي', () => {
    const state: BudgetState = { grocery: { demand: 10, spent: 60 }, pharmacy: { demand: 90, spent: 39.5 } };
    expect(affordable(['pharmacy'], state, 100)).toEqual([]);
  });
  it('أول الشهر: أول طلب ياخذ حصته، والسؤال الواحد ينقسم', () => {
    const state: BudgetState = {};
    recordDemand(state, ['grocery', 'pharmacy', 'fuel']);
    expect(affordable(['grocery', 'pharmacy', 'fuel'], state, 100)).toEqual(['grocery', 'pharmacy', 'fuel']);
    chargeFetch(state, ['grocery', 'pharmacy', 'fuel']);
    expect(state.grocery!.spent).toBeCloseTo(1 / 3);
    expect(state.fuel!.demand).toBe(1);
  });
});

describe('سؤال واحد عن كذا نوع', () => {
  it('الأرقام ١٠ بالكثير لكل سؤال', () => {
    // بقالة ٤ + صيدلية ١ + وقود ١ = ٦، وملابس ٥ تبدأ سؤال ثاني
    expect(combineCategories(['grocery', 'pharmacy', 'fuel', 'clothes', 'perfume'])).toEqual([['grocery', 'pharmacy', 'fuel'], ['clothes']]);
  });
  it('النتائج المخلوطة تنفرز على أنواعها، والنوع الفاضي ينحفظ فاضي', () => {
    const raw: RawPlace[] = [
      { id: 'a', name: 'بنده', lat: LAT, lon: LON, codes: [7332005] },
      { id: 'b', name: 'صيدلية المصيف', lat: LAT, lon: LON, codes: [7326] },
      { id: 'c', name: 'هايبر فيه صيدلية', lat: LAT, lon: LON, codes: [7332005, 7326] },
      { id: 'd', name: 'مطعم', lat: LAT, lon: LON, codes: [7315] },
    ];
    const split = splitByCategory(raw, ['grocery', 'pharmacy', 'fuel']);
    expect(split.get('grocery')!.map((p) => p.id)).toEqual(['a', 'c']);
    expect(split.get('pharmacy')!.map((p) => p.id)).toEqual(['b', 'c']);
    expect(split.get('fuel')).toEqual([]);
  });
});
