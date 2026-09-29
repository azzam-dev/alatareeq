import { describe, expect, it } from 'vitest';
import { cityOf } from './cities';

describe('مدينة المكان', () => {
  it('محلات حقيقية من المشاوير التجريبية', () => {
    // جرير على شارع العليا
    expect(cityOf({ lat: 24.701797, lon: 46.680766 })).toBe('الرياض');
    // طريق الملك خالد في بريدة، أوله وآخره
    expect(cityOf({ lat: 26.379212, lon: 43.958302 })).toBe('بريدة');
    expect(cityOf({ lat: 26.320217, lon: 43.990626 })).toBe('بريدة');
  });
  it('المدن المتجاورة: الأقرب يغلب', () => {
    expect(cityOf({ lat: 26.084, lon: 43.99 })).toBe('عنيزة');
    expect(cityOf({ lat: 26.28, lon: 50.2 })).toBe('الخبر');
    expect(cityOf({ lat: 26.43, lon: 50.1 })).toBe('الدمام');
  });
  it('برا أي مدينة: بدون', () => {
    // الربع الخالي
    expect(cityOf({ lat: 20.5, lon: 50.5 })).toBeUndefined();
  });
});
