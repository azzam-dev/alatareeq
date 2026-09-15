import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { cleanTitle } from '../../../src/core/items';
import { DEFAULT_SETTINGS, type Reminder, type Settings, type SpecificPlace, type SuppressReason } from '../../../src/core/types';

export type LogKind = 'alert' | 'suppressed' | 'missed' | 'arrive' | 'time' | 'passed' | 'trip';
export type Response = 'go' | 'done' | 'later' | 'ignored' | 'return' | 'no';
/** جواب «خلصت؟» بعد «اذهب» */
export type Outcome = 'done' | 'partial' | 'notDone';

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

export interface LogEntry {
  id: string;
  t: number;
  kind: LogKind;
  text: string;
  placeName?: string;
  reminderIds: string[];
  reminderTitles: string[];
  detourSeconds?: number;
  approximate?: boolean;
  distance?: number;
  reason?: SuppressReason;
  alertId?: string;
  response?: Response;
  outcome?: Outcome;
  /** من المشوار التجريبي */
  sim?: boolean;
}

export interface AppState {
  reminders: Reminder[];
  settings: Settings;
  log: LogEntry[];
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
const LOG_LIMIT = 400;

let state: AppState = { reminders: [], settings: DEFAULT_SETTINGS, log: [], pendingGo: null, goResult: null, onboarded: false, hydrated: false };
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { reminders, settings, log, pendingGo, onboarded } = state;
    AsyncStorage.setItem(KEY, JSON.stringify({ reminders, settings, log, pendingGo, onboarded, itemTitles: ITEM_TITLES })).catch(() => undefined);
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
        const s = JSON.parse(raw) as Partial<AppState> & { itemTitles?: unknown };
        // مرة لكل نسخة تنظيف: تذاكير انحفظت بالكلام كامل («راح اشتري خبز») تصير بالأغراض بس
        const clean = s.itemTitles !== ITEM_TITLES;
        migrated = clean && !!s.reminders?.length;
        state = {
          ...state,
          reminders: clean ? (s.reminders ?? []).map((r) => ({ ...r, title: cleanTitle(r.title) })) : s.reminders ?? [],
          settings: { ...DEFAULT_SETTINGS, ...s.settings },
          log: s.log ?? [],
          pendingGo: s.pendingGo ?? null,
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
  log(entry: Omit<LogEntry, 'id' | 't'> & { t?: number }) {
    const e: LogEntry = { id: uid(), t: Date.now(), ...entry };
    store.set((s) => ({ ...s, log: [e, ...s.log].slice(0, LOG_LIMIT) }));
    return e;
  },
  setLogResponse(alertId: string, response: Response) {
    store.set((s) => ({ ...s, log: s.log.map((l) => (l.alertId === alertId ? { ...l, response } : l)) }));
  },
  setLogOutcome(alertId: string, outcome: Outcome) {
    store.set((s) => ({ ...s, log: s.log.map((l) => (l.alertId === alertId ? { ...l, outcome } : l)) }));
  },
  setPendingGo(pendingGo: PendingGo | null) {
    store.set((s) => ({ ...s, pendingGo }));
  },
  setGoResult(goResult: GoResult | null) {
    store.set((s) => ({ ...s, goResult }));
  },
  clearLog() {
    store.set((s) => ({ ...s, log: [] }));
  },
  resetAll() {
    AsyncStorage.removeItem(KEY).catch(() => undefined);
    state = { reminders: [], settings: DEFAULT_SETTINGS, log: [], pendingGo: null, goResult: null, onboarded: false, hydrated: true };
    emit();
  },
};

export function useStore<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(state));
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
