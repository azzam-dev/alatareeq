// منسوخ من src/core/types.ts بـ npm run functions. لا تعدّله هنا
export type CategoryId =
  | 'pharmacy' | 'grocery' | 'bookstore' | 'fuel' | 'laundry' | 'charging'
  // فئات إضافية تطلع بالبحث في المحرر (`CategoryDef.more`)
  | 'toys' | 'electronics' | 'mobile' | 'clothes' | 'shoes' | 'perfume' | 'jewelry' | 'florist' | 'gifts' | 'houseware'
  | 'furniture' | 'hardware' | 'sports' | 'pets' | 'bakery' | 'sweets' | 'cafe' | 'restaurant' | 'atm' | 'bank' | 'clinic'
  | 'hospital' | 'optician' | 'barber' | 'beauty' | 'carWash' | 'carParts' | 'carRepair' | 'post' | 'tailor' | 'butcher'
  | 'mall' | 'gym'
  // من قائمة TomTom (٢٣ سبتمبر)
  | 'produce' | 'fish' | 'carpets' | 'curtains' | 'lighting' | 'paint' | 'building' | 'garden' | 'kitchens' | 'cosmetics'
  | 'bags' | 'print' | 'medicalSupplies' | 'tires' | 'carRental' | 'vet';

/** pass = عند المرور (الافتراضي)، arrive = عند الوصول، time = في وقت محدد */
export type TriggerKind = 'pass' | 'arrive' | 'time';

export interface SpecificPlace {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** يميّز الفرع عن فروع نفس الاسم: الحي («حي الملك فهد») أو الشارع */
  branch?: string;
}

export type Target =
  | { kind: 'category'; categories: CategoryId[] }
  /** براند معروف (id مثل "jarir") أو اسم حر (id يبدأ بـ "name:") */
  | { kind: 'brand'; brandId: string; label: string }
  | { kind: 'place'; place: SpecificPlace };

/** أولوية الغرض. غيابها = عادية (تذاكير الويب والقديمة) */
export type Priority = 'high' | 'normal' | 'low';

/**
 * متى نذكره قبل آخر موعد. بساعة: قبل ساعة (الافتراضي) أو ٣ ساعات أو يوم؛ طول اليوم: ٩ الصبح (الافتراضي)
 * أو ٩ الليلة اللي قبل. `none` بدون إشعار. الخيار اللي ما يناسب نوع الموعد يرجع للافتراضي.
 */
export type RemindBefore = 'hour' | 'hours3' | 'day' | 'morning' | 'eve' | 'none';

export interface Reminder {
  id: string;
  title: string;
  priority?: Priority;
  /** غيابه = الافتراضي */
  remindBefore?: RemindBefore;
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
  /** فات موعده وضغط «انتهى» وما جابه (مع `status: 'done'`) */
  expiredAt?: number;
  /** المكان اللي خلّصت منه: «اذهب» ثم «تم»، أو «تم» على تنبيه الوصول */
  donePlace?: SpecificPlace;
  /** آخر مكان رحت له وما حصلت فيه الغرض. معلومة بس: التنبيه يبقى بأي فرع */
  notFoundAt?: { place: SpecificPlace; at: number };
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
  /** الحي أو الشارع، يميّز الفرع */
  branch?: string;
  /** وسم OSM اللي حدد نوعه، مثل «shop=supermarket» */
  kind?: string;
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
