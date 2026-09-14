import { useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS, type Reminder, type Settings, type SuppressReason } from '../core/types';

export type LogKind = 'alert' | 'suppressed' | 'missed' | 'arrive' | 'time' | 'passed' | 'trip';
export type Response = 'go' | 'done' | 'later' | 'ignored' | 'return' | 'no' | 'wrong';

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
  sim?: boolean;
}

export interface AppState {
  reminders: Reminder[];
  settings: Settings;
  log: LogEntry[];
  /** أماكن قال عنها «مو مناسب»: تنستبعد من تذاكير الفئات والبراندات */
  hiddenPlaces: string[];
  onboarded: boolean;
}

const KEY = 'alatareeq:v1';
const LOG_LIMIT = 400;

function load(): AppState {
  const fallback: AppState = { reminders: [], settings: DEFAULT_SETTINGS, log: [], hiddenPlaces: [], onboarded: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const s = JSON.parse(raw) as Partial<AppState>;
    return {
      reminders: s.reminders ?? [],
      settings: { ...DEFAULT_SETTINGS, ...s.settings },
      log: s.log ?? [],
      hiddenPlaces: s.hiddenPlaces ?? [],
      onboarded: s.onboarded ?? false,
    };
  } catch {
    return fallback;
  }
}

let state: AppState = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* التخزين ممتلئ أو محظور */ }
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
    persist();
    listeners.forEach((l) => l());
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
  clearLog() {
    store.set((s) => ({ ...s, log: [] }));
  },
  hidePlace(placeId: string) {
    store.set((s) => (s.hiddenPlaces.includes(placeId) ? s : { ...s, hiddenPlaces: [...s.hiddenPlaces, placeId] }));
  },
  clearHiddenPlaces() {
    store.set((s) => ({ ...s, hiddenPlaces: [] }));
  },
  resetAll() {
    try { localStorage.clear(); } catch { /* تجاهل */ }
    state = { reminders: [], settings: DEFAULT_SETTINGS, log: [], hiddenPlaces: [], onboarded: false };
    listeners.forEach((l) => l());
  },
};

export function useStore<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(state));
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
