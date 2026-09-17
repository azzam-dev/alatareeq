import { distanceM, type LatLon } from '../../../src/core/geo';
import { BRANDS } from '../../../src/core/lexicon';
import type { CategoryId, Place, SpecificPlace } from '../../../src/core/types';
import { OLAYA_PLACES } from '../mock/olaya';

/** مصدر الأماكن. المستوى ١ بيانات تجريبية؛ ربط Google عبر السيرفر لاحقًا يرجع نفس الشكل */
export interface PlacesSource {
  near(me: LatLon, radiusM: number): Place[];
}

const withBrands = (p: Place): Place => ({
  ...p,
  brands: BRANDS.filter((b) => new RegExp(b.osmRegex, 'i').test(p.name)).map((b) => b.id),
});

const MOCK = OLAYA_PLACES.map(withBrands);

/** فرع مكان محفوظ قبل ما نحفظ الفرع مع التذكير */
export function branchOf(id: string): string | undefined {
  return MOCK.find((p) => p.id === id)?.branch;
}

/** فئات مكان محفوظ (وين خلّصت الغرض)، لفرز «تمت» بالفئة. المكان المحفوظ ما فيه فئاته لين نحفظها مع TomTom */
export function placeCategories(p: SpecificPlace): CategoryId[] | undefined {
  return MOCK.find((m) => m.id === p.id)?.categories;
}

/** أماكن حقيقية على شارع العليا فقط؛ خارجها ما فيه أماكن */
export const mockPlaces: PlacesSource = {
  near: (me, radiusM) => MOCK.filter((p) => distanceM(me, p) <= radiusM),
};
