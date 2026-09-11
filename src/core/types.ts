export type CategoryId = 'pharmacy' | 'grocery' | 'bookstore' | 'fuel' | 'laundry' | 'charging';

/** pass = عند المرور (الافتراضي)، arrive = عند الوصول، time = في وقت محدد */
export type TriggerKind = 'pass' | 'arrive' | 'time';

export interface SpecificPlace {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export type Target =
  | { kind: 'category'; categories: CategoryId[] }
  /** براند معروف (id مثل "jarir") أو اسم حر (id يبدأ بـ "name:") */
  | { kind: 'brand'; brandId: string; label: string }
  | { kind: 'place'; place: SpecificPlace };

export interface Reminder {
  id: string;
  title: string;
  target: Target | null;
  trigger: TriggerKind;
  /** وقت التنبيه لتريغر الوقت */
  at?: number;
  /** لا ننبه قبل هذا الوقت (للتذاكير المكانية) */
  notBefore?: number;
  /** الموعد النهائي، يُستخدم في الترتيب */
  deadline?: number;
  status: 'active' | 'done';
  createdAt: number;
  doneAt?: number;
  /** ضغط «لاحقًا» في هذا المشوار */
  snoozedTripId?: string;
  /** للتذاكير الزمنية: «لاحقًا» يأجلها لهذا الوقت */
  snoozedUntil?: number;
  lastNotifiedAt?: number;
  remindOnReturn?: boolean;
  raw?: string;
}

export interface Place {
  id: string;
  name: string;
  lat: number;
  lon: number;
  categories: CategoryId[];
  brands: string[];
}

export interface Settings {
  maxDetourMin: number;
  maxAlertsPerTrip: number;
  cooldownMin: number;
  outerRingM: number;
  aheadAngleDeg: number;
  arriveRadiusM: number;
  quietEnabled: boolean;
  quietStart: string; // "23:00"
  quietEnd: string; // "06:00"
  mapsApp: 'auto' | 'google' | 'apple' | 'waze';
  speak: boolean;
  sound: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  maxDetourMin: 3,
  maxAlertsPerTrip: 3,
  cooldownMin: 4,
  outerRingM: 1800,
  aheadAngleDeg: 60,
  arriveRadiusM: 120,
  quietEnabled: true,
  quietStart: '23:00',
  quietEnd: '06:00',
  mapsApp: 'auto',
  speak: true,
  sound: true,
};

export interface Trip {
  id: string;
  startedAt: number;
  endedAt?: number;
  alerts: number;
  lastAlertAt?: number;
  /** reminderId → placeId اللي نبهنا عنه */
  notified: Record<string, string>;
  /** أماكن سألنا عنها «تجاوزت المكان؟» */
  askedPassed: string[];
  distanceM: number;
}

export type SuppressReason =
  | 'detour'
  | 'behind'
  | 'late'
  | 'notified'
  | 'snoozed'
  | 'budget'
  | 'cooldown'
  | 'quiet'
  | 'notBefore';

export type EngineMode = 'idle' | 'stationary' | 'driving' | 'approaching' | 'cooldown';
