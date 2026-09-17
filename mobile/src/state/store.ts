import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { cleanTitle, splitItems } from '../../../src/core/items';
import { DEFAULT_SETTINGS, type Reminder, type Settings, type SpecificPlace } from '../../../src/core/types';

/** نتيجة «خلصت؟» نعرضها لثواني: وش حصلت ووش باقي */
export interface GoResult {
  place: SpecificPlace;
  done: string[];
  notDone: string[];
  at: number;
}

/** ضغط «اذهب» وننتظر نسأله «خلصت؟» لما يرجع للتطبيق */
export interface PendingGo {
  alertId: string;
  place: SpecificPlace;
  reminderIds: string[];
  at: number;
}

export interface AppState {
  reminders: Reminder[];
  settings: Settings;
  pendingGo: PendingGo | null;
  /** مؤقت، ما ينحفظ على الجهاز */
  goResult: GoResult | null;
  onboarded: boolean;
  /** انقرت البيانات من الجهاز. قبلها ما نحفظ شيء عشان ما نمسح المحفوظ بحالة فاضية */
  hydrated: boolean;
}

const KEY = 'alatareeq:v1';
/** نسخة تنظيف العناوين (`cleanTitle`). ٢: حروف الاتجاه المخفية من iPhone. ٣: الكلام قبل الفعل («خليني») والفواصل بدل «و». ٤: قاموس المنتجات */
const ITEM_TITLES = 4;
/** ١: كل التذاكير «عند المرور»، والوقت صار آخر موعد */
const PASS_ONLY = 1;
/** ١: كل غرض تذكير مستقل بأولويته */
const ONE_ITEM = 1;

/** «عند الوصول» يصير مرور بنفس المكان، و«بوقت» يصير آخر موعد */
function toPass(r: Reminder): Reminder {
  if (r.trigger === 'pass') return r;
  return {
    ...r,
    trigger: 'pass',
    deadline: r.deadline ?? (r.trigger === 'time' ? r.at : undefined),
    at: undefined,
    snoozedUntil: undefined,
  };
}

/** تذكير نشط فيه أكثر من غرض («خبز، حليب») يصير تذكير لكل غرض بنفس المحل والموعد */
function splitReminder(r: Reminder): Reminder[] {
  if (r.status !== 'active') return [r];
  const items = splitItems(r.title);
  if (items.length < 2) return [r];
  return items.map((title) => ({ ...r, id: uid(), title, priority: 'normal' }));
}

let state: AppState = { reminders: [], settings: DEFAULT_SETTINGS, pendingGo: null, goResult: null, onboarded: false, hydrated: false };
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { reminders, settings, pendingGo, onboarded } = state;
    AsyncStorage.setItem(KEY, JSON.stringify({ reminders, settings, pendingGo, onboarded, itemTitles: ITEM_TITLES, passOnly: PASS_ONLY, oneItem: ONE_ITEM }))
      .catch(() => undefined);
  }, 150);
}

export const store = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  set(update: (s: AppState) => AppState) {
    state = update(state);
    if (state.hydrated) persist();
    emit();
  },

  async hydrate() {
    let migrated = false;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw) as Partial<AppState> & { itemTitles?: unknown; passOnly?: unknown; oneItem?: unknown };
        let reminders = s.reminders ?? [];
        // مرة لكل نسخة تنظيف: تذاكير انحفظت بالكلام كامل («راح اشتري خبز») تصير بالأغراض بس
        const clean = s.itemTitles !== ITEM_TITLES;
        if (clean) reminders = reminders.map((r) => ({ ...r, title: cleanTitle(r.title) }));
        const passOnly = s.passOnly !== PASS_ONLY;
        if (passOnly) reminders = reminders.map(toPass);
        let pendingGo = s.pendingGo ?? null;
        const oneItem = s.oneItem !== ONE_ITEM;
        if (oneItem) {
          const split = new Set<string>();
          reminders = reminders.flatMap((r) => {
            const out = splitReminder(r);
            if (out.length > 1) split.add(r.id);
            return out;
          });
          // «رحت له؟» ينتظر تذاكير انقسمت: ما نقدر نربط أجوبته بالتذاكير الجديدة
          if (pendingGo?.reminderIds.some((id) => split.has(id))) pendingGo = null;
        }
        migrated = (clean || passOnly || oneItem) && reminders.length > 0;
        state = {
          ...state,
          reminders,
          settings: { ...DEFAULT_SETTINGS, ...s.settings },
          pendingGo,
          onboarded: s.onboarded ?? false,
        };
      }
    } catch { /* تخزين تالف: نبدأ من جديد */ }
    state = { ...state, hydrated: true };
    if (migrated) persist();
    emit();
  },

  addReminder(r: Reminder) {
    store.set((s) => ({ ...s, reminders: [r, ...s.reminders] }));
  },
  updateReminder(id: string, patch: Partial<Reminder>) {
    store.set((s) => ({ ...s, reminders: s.reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  },
  updateReminders(ids: string[], patch: (r: Reminder) => Partial<Reminder>) {
    const set = new Set(ids);
    store.set((s) => ({ ...s, reminders: s.reminders.map((r) => (set.has(r.id) ? { ...r, ...patch(r) } : r)) }));
  },
  deleteReminder(id: string) {
    store.set((s) => ({ ...s, reminders: s.reminders.filter((r) => r.id !== id) }));
  },
  setSettings(patch: Partial<Settings>) {
    store.set((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  },
  setPendingGo(pendingGo: PendingGo | null) {
    store.set((s) => ({ ...s, pendingGo }));
  },
  setGoResult(goResult: GoResult | null) {
    store.set((s) => ({ ...s, goResult }));
  },
  resetAll() {
    AsyncStorage.removeItem(KEY).catch(() => undefined);
    state = { reminders: [], settings: DEFAULT_SETTINGS, pendingGo: null, goResult: null, onboarded: false, hydrated: true };
    emit();
  },
};

export function useStore<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(state));
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
