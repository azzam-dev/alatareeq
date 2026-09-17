// منسوخ من src/core/normalize.ts بـ npm run functions. لا تعدّله هنا
/** حروف اتجاه ومسافات مخفية: iPhone يحطها أحيانًا مع النص العربي («‏راح» ما تطابق «راح») */
export const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;

/** توحيد النص العربي للمطابقة فقط (العرض يستخدم النص الأصلي) */
export function normalize(input: string): string {
  return input
    .replace(INVISIBLE, '')
    .replace(/[ً-ٰٟـ]/g, '') // تشكيل وتطويل
    .replace(/[أإآٱ]/g, 'ا') // أ إ آ ٱ ← ا
    .replace(/ى/g, 'ي') // ى ← ي
    .replace(/ة/g, 'ه') // ة ← ه
    .replace(/ؤ/g, 'و') // ؤ ← و
    .replace(/ئ/g, 'ي') // ئ ← ي
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[،,؛;!?؟"'«»()[\]]/g, ' ')
    .toLowerCase()
    .trim();
}

/** صيغ محتملة للكلمة بعد نزع «ال» وحروف الجر الملتصقة: بالصيدلية ← صيدليه */
export function stems(token: string): string[] {
  const out = new Set<string>([token]);
  if (token.startsWith('لل') && token.length > 3) out.add(token.slice(2));
  const m = token.match(/^[وبلفك]?ال(.{2,})$/);
  if (m) out.add(m[1]);
  if (/^[وف]/.test(token) && token.length > 3) {
    const rest = token.slice(1);
    out.add(rest);
    const m2 = rest.match(/^[بلك]?ال(.{2,})$/);
    if (m2) out.add(m2[1]);
  }
  return [...out];
}

export interface Tok {
  orig: string;
  norm: string;
}

export function tokenize(text: string): Tok[] {
  return text
    .replace(/([،,؛;!?؟])/g, '$1 ')
    .split(/\s+/)
    .filter(Boolean)
    .map((orig) => ({ orig, norm: normalize(orig).replace(/\s+/g, '') }));
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
