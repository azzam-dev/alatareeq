import { describe, expect, it } from 'vitest';
import { priorityFromText, stripPriority } from './priority';
import type { Priority } from './types';

describe('الأولوية من الجملة', () => {
  it('عالية، منخفضة، أو عادية', () => {
    const rows: [string, Priority][] = [
      ['ابي اشتري خبز وبنادول ضروري', 'high'],
      ['مستعجل: بنادول', 'high'],
      ['عاجل اشتري حليب', 'high'],
      ['مهم أجيب الدواء', 'high'],
      ['جيب خبز بسرعة', 'high'],
      ['مو ضروري اشتري حليب', 'low'],
      ['مب ضروري', 'low'],
      ['شامبو مو مهم', 'low'],
      ['لو تيسر جيب عصير', 'low'],
      ['إذا تيسر اشتري هدية', 'low'],
      ['براحتك اشتري خبز', 'low'],
      ['ابي اشتري خبز', 'normal'],
      ['‏ضروري بنادول', 'high'],
    ];
    for (const [text, p] of rows) expect(priorityFromText(text), text).toBe(p);
  });
  it('تنشال من العنوان', () => {
    expect(stripPriority('خبز وبنادول ضروري')).toBe('خبز وبنادول');
    expect(stripPriority('مو ضروري اشتري حليب')).toBe('اشتري حليب');
    expect(stripPriority('اشتري خبز')).toBe('اشتري خبز');
  });
});
