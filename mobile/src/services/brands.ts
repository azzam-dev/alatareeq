import type { CategoryId } from '../../../src/core/types';
import { engine } from './engine';

/** براند صححه السيرفر: الاسم مثل ما يكتبه المحل («النهدي») وفئته لو معروفة */
export interface BrandSuggestion {
  name: string;
  key: string;
  category: CategoryId | null;
}

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

async function verify(text: string, confirm: boolean): Promise<BrandSuggestion | null> {
  if (!URL || !KEY) return null;
  const pos = engine.position;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${URL}/functions/v1/verify-brand`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, confirm, ...(pos ? { lat: pos.lat, lon: pos.lon } : {}) }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { brand?: BrandSuggestion | null };
    return j.brand ?? null;
  } catch {
    // بدون نت أو السيرفر ما رد: الاسم ينحفظ مثل ما انكتب
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** «تقصد: النهدي؟» بدون ما يتغير شي في الداتابيس */
export function suggestBrand(text: string): Promise<BrandSuggestion | null> {
  return verify(text, false);
}

/** المستخدم اعتمده: ينحفظ للكل، والخطأ اللي كتبه ينحفظ معه («جريير» ← جرير) */
export function confirmBrand(text: string): void {
  void verify(text, true);
}
