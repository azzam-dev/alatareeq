import { tokenize } from './normalize';
import type { Priority } from './types';

// «مو ضروري» فيها «ضروري»، فالمنخفضة تنفحص قبل العالية
const LOW = ['مو ضروري', 'مب ضروري', 'مو مهم', 'مب مهم', 'لو تيسر', 'اذا تيسر', 'براحتك'];
const HIGH = ['ضروري', 'مستعجل', 'عاجل', 'مهم', 'بسرعه'];

const PHRASES: [string[], Priority][] = [
  ...LOW.map((p): [string[], Priority] => [p.split(' '), 'low']),
  ...HIGH.map((p): [string[], Priority] => [p.split(' '), 'high']),
];

/** مواضع كلمات الأولوية في النص، مع أولوية أول عبارة */
function scan(text: string): { priority: Priority; used: Set<number> } {
  const norms = tokenize(text).map((t) => t.norm.replace(/[:.\-–—]+/g, ''));
  const used = new Set<number>();
  let priority: Priority = 'normal';
  for (const [words, level] of PHRASES) {
    for (let i = 0; i + words.length <= norms.length; i++) {
      if (!words.every((w, k) => norms[i + k] === w) || words.some((_, k) => used.has(i + k))) continue;
      words.forEach((_, k) => used.add(i + k));
      if (priority === 'normal') priority = level;
    }
  }
  return { priority, used };
}

/** الأولوية من كلام المستخدم: «ضروري» عالية، «مو ضروري» منخفضة، وإلا عادية */
export function priorityFromText(text: string): Priority {
  return scan(text).priority;
}

/** يشيل كلمات الأولوية من العنوان عشان ما تصير وصف للغرض («بنادول ضروري» ← «بنادول») */
export function stripPriority(text: string): string {
  const { used } = scan(text);
  if (!used.size) return text;
  return tokenize(text).filter((_, i) => !used.has(i)).map((t) => t.orig).join(' ');
}
