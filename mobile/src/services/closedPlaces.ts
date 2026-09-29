import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { deviceId } from './deviceId';

/**
 * «المحل مقفل نهائيًا»: TomTom ما يعلّم على المحلات اللي سكّرت. اللي بلّغت عنه ينشال عندك فورًا، وعند الكل بعد تبليغات
 * من ٣ شبكات مختلفة (دالة `closed-places`). الأماكن المحددة يدويًا (`sp:`) عندك بس، لأن رقمها ما يعرفه غيرك.
 */

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const MINE_KEY = 'alatareeq:closed:mine';
const ALL_KEY = 'alatareeq:closed:all';
/** نحدّث قائمة الكل كل ٦ ساعات بالكثير */
const REFRESH_MS = 6 * 3_600_000;

export interface MyReport {
  name: string;
  at: number;
  /** وصل السيرفر (وإلا نحاول مرة ثانية) */
  sent: boolean;
}

let mine: Record<string, MyReport> = {};
let all = new Set<string>();
let allAt = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function call(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (!URL || !KEY) return null;
  try {
    const r = await fetch(`${URL}/functions/v1/closed-places`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.ok ? ((await r.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const shared = (id: string) => id.startsWith('tt:');

function saveMine() {
  AsyncStorage.setItem(MINE_KEY, JSON.stringify(mine)).catch(() => undefined);
}

async function refreshAll() {
  const j = await call({ action: 'list' });
  if (!Array.isArray(j?.closed)) return;
  all = new Set(j.closed as string[]);
  allAt = Date.now();
  AsyncStorage.setItem(ALL_KEY, JSON.stringify({ ids: [...all], at: allAt })).catch(() => undefined);
  emit();
}

/** تبليغات ما وصلت السيرفر (بدون نت وقتها) */
async function resend() {
  const device = await deviceId();
  for (const [id, r] of Object.entries(mine)) {
    if (r.sent || !shared(id)) continue;
    if (await call({ action: 'report', placeId: id, name: r.name, device })) {
      mine = { ...mine, [id]: { ...r, sent: true } };
      saveMine();
    }
  }
}

void (async () => {
  try {
    // تبليغ صار قبل ما يخلص التحميل يبقى
    mine = { ...(JSON.parse((await AsyncStorage.getItem(MINE_KEY)) ?? '{}') as Record<string, MyReport>), ...mine };
    const saved = JSON.parse((await AsyncStorage.getItem(ALL_KEY)) ?? 'null') as { ids: string[]; at: number } | null;
    if (saved) { all = new Set(saved.ids); allAt = saved.at; }
  } catch { /* تخزين تالف: نبدأ فاضي */ }
  emit();
  if (Date.now() - allAt > REFRESH_MS) void refreshAll();
  void resend();
})();

/** المحل مقفل: بلّغت عنه أنت، أو بلّغ عنه ٣ */
export function isClosed(id: string): boolean {
  if (mine[id] || all.has(id)) return true;
  if (Date.now() - allAt > REFRESH_MS) { allAt = Date.now(); void refreshAll(); }
  return false;
}

export function reportClosed(id: string, name: string) {
  if (mine[id]) return;
  mine = { ...mine, [id]: { name, at: Date.now(), sent: !shared(id) } };
  saveMine();
  emit();
  if (!shared(id)) return;
  void deviceId().then(async (device) => {
    // لو رجع عنه قبل ما يوصل الرد، ما نرجّعه
    if (await call({ action: 'report', placeId: id, name, device }) && mine[id]) {
      mine = { ...mine, [id]: { ...mine[id], sent: true } };
      saveMine();
    }
  });
}

/** غلطت: يرجع عندك فورًا، وتبليغك ينشال من السيرفر (لو بلّغ غيرك ٣ يبقى مقفل عند الكل) */
export function undoClosed(id: string) {
  mine = Object.fromEntries(Object.entries(mine).filter(([k]) => k !== id));
  saveMine();
  emit();
  if (shared(id)) void deviceId().then((device) => call({ action: 'undo', placeId: id, device })).then(() => refreshAll());
}

/** تبليغاتك (للإعدادات). `mine` كائن جديد مع كل تغيير */
export function useMyClosed(): Record<string, MyReport> {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => mine);
}
