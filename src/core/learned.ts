import { normalize } from './normalize';
import type { Target } from './types';

/**
 * تفضيلات المستخدم «الغرض ← المحل» (قرار صاحب المشروع ٢٣ سبتمبر): لما يغيّر محل غرض في المحرر نحفظه، والمرة الجاية نفس الغرض
 * ياخذه بدل القاموس. البداية بسيطة: الغرض نفسه بس («قهوة» و«القهوة»، مو «قهوة عربية»)، فئة أو براند (الفرع المحدد ما ينحفظ)،
 * والمحل الصريح في الجملة يغلبه. محفوظة في الجوال بس، وترجع للافتراضي من الإعدادات.
 */
export interface LearnedPlace {
  /** الغرض مثل ما كتبه المستخدم («قهوة») */
  item: string;
  /** فئة أو براند */
  target: Target;
  at: number;
}

/** مفتاح الغرض ← تفضيله */
export type Learned = Record<string, LearnedPlace>;

/** مفتاح الغرض: مطبّع وبدون «ال» في أول كل كلمة («القهوة» = «قهوة») */
export function itemKey(item: string): string {
  return normalize(item).split(/\s+/).filter(Boolean).map((w) => w.replace(/^ال(?=..)/, '')).join(' ');
}

export function learnedTarget(learned: Learned, item: string): Target | null {
  const key = itemKey(item);
  return (key && learned[key]?.target) || null;
}

export function sameTarget(a: Target | null, b: Target | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind === 'category' && b.kind === 'category') {
    return a.categories.length === b.categories.length && a.categories.every((c) => b.categories.includes(c));
  }
  if (a.kind === 'brand' && b.kind === 'brand') return a.brandId === b.brandId;
  if (a.kind === 'place' && b.kind === 'place') return a.place.id === b.place.id;
  return false;
}

/**
 * التفضيل اللي ينحفظ بعد ما يحفظ المستخدم المحرر: غرض واحد (أكثر من غرض ما نعرف المحل لأي واحد)، والمحل فئة أو براند
 * وتغيّر عن اللي كان (أو ما كان له محل). غيرها null.
 */
export function learnFromEdit(
  items: string[], before: Target | null, after: Target | null, now: number,
): { key: string; place: LearnedPlace } | null {
  if (items.length !== 1 || !after || after.kind === 'place' || sameTarget(before, after)) return null;
  const item = items[0].trim();
  const key = itemKey(item);
  if (!key) return null;
  return { key, place: { item, target: after, at: now } };
}
