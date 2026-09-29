import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import { Alert, AppState, Linking, Platform, Vibration } from 'react-native';
import type { LatLon } from '../../../src/core/geo';
import type { Settings } from '../../../src/core/types';

// ——— نوافذ التأكيد ———
// `Alert.alert` ما يسوي شي في نسخة المتصفح، فهناك نستخدم نوافذ المتصفح نفسه

/** تأكيد قبل حذف: «لا» يلغي، و«احذف» ينفّذ */
export function confirmDelete(title: string, message: string | undefined, onDelete: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(message ? `${title}\n${message}` : title)) onDelete();
    return;
  }
  Alert.alert(title, message, [
    { text: 'لا', style: 'cancel' },
    { text: 'احذف', style: 'destructive', onPress: onDelete },
  ]);
}

/** رسالة بزر «تمام» بس */
export function showNotice(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n${message}`);
  else Alert.alert(title, message);
}

// ——— الإشعارات ———

type ActionHandler = (alertId: string, action: string) => void;

/** أزرار كل نوع تنبيه (نفس أزرار بطاقة التنبيه داخل التطبيق) */
const CATEGORIES: Record<string, { identifier: string; buttonTitle: string; foreground?: boolean }[]> = {
  pass: [
    { identifier: 'go', buttonTitle: 'اذهب', foreground: true }, { identifier: 'done', buttonTitle: 'تم' },
    { identifier: 'notHere', buttonTitle: 'مو هذا المحل' }, { identifier: 'later', buttonTitle: 'مو بهالمشوار' },
  ],
};

/**
 * والتطبيق مفتوح بطاقة التنبيه تكفي، فالإشعار ما يطلع كبانر إلا بالخلفية
 * أو لو طلبناه صراحة (زر «جرّب إشعار»). يرجع دالة إلغاء الاشتراك.
 */
export function setupNotifications(onAction: ActionHandler, onOpenNotes: () => void): () => void {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async (n) => {
        const show = AppState.currentState !== 'active' || n.request.content.data?.forceShow === true;
        // والتطبيق مفتوح ما يروح شيء لمركز الإشعارات، وإلا تتكدس
        return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
      },
    });
  } catch { /* تجاهل */ }

  void Promise.all(Object.entries(CATEGORIES).map(([id, actions]) =>
    Notifications.setNotificationCategoryAsync(id, actions.map((a) => ({
      identifier: a.identifier,
      buttonTitle: a.buttonTitle,
      options: { opensAppToForeground: !!a.foreground },
    }))))).catch(() => undefined);

  try {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      if (r.notification.request.content.data?.kind === DEADLINE_KIND) { onOpenNotes(); return; }
      const alertId = r.notification.request.content.data?.alertId;
      if (typeof alertId !== 'string') return;
      onAction(alertId, r.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER ? 'open' : r.actionIdentifier);
    });
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}

export async function notificationPermission(): Promise<'granted' | 'denied' | 'undetermined'> {
  try {
    return (await Notifications.getPermissionsAsync()).status;
  } catch {
    return 'undetermined';
  }
}

export async function requestNotifications(): Promise<'granted' | 'denied' | 'undetermined'> {
  try {
    return (await Notifications.requestPermissionsAsync()).status;
  } catch {
    return 'undetermined';
  }
}

export interface SystemAlert {
  alertId: string;
  /** نفس المعرّف يستبدل الإشعار السابق بدل ما ينضاف تحته */
  identifier?: string;
  title: string;
  body: string;
  /** نوع التنبيه، ويحدد الأزرار */
  category: string;
  forceShow?: boolean;
}

/** الإرسال والمسح بالترتيب، عشان مسح إشعار قديم ما يلحق يمسح الجديد اللي بنفس المعرّف */
let chain: Promise<unknown> = Promise.resolve();
function serial(fn: () => Promise<unknown>): Promise<void> {
  const p = chain.then(fn, fn).then(() => undefined, () => undefined);
  chain = p;
  return p;
}

export function notify(a: SystemAlert, delaySeconds = 0): Promise<void> {
  return serial(() => Notifications.scheduleNotificationAsync({
    identifier: a.identifier ?? a.alertId,
    content: { title: a.title, body: a.body, categoryIdentifier: a.category, sound: true, data: { alertId: a.alertId, forceShow: !!a.forceShow } },
    trigger: delaySeconds > 0 ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delaySeconds } : null,
  }));
}

export function dismissNotification(identifier: string): Promise<void> {
  return serial(() => Notifications.dismissNotificationAsync(identifier));
}

/** يمسح الإشعارات اللي تنبيهاتها انتهت (مثلًا انتهت والتطبيق بالخلفية) */
export function dismissStaleNotifications(activeAlertIds: string[]): Promise<void> {
  return serial(async () => {
    for (const n of await Notifications.getPresentedNotificationsAsync()) {
      const alertId = n.request.content.data?.alertId;
      if (typeof alertId === 'string' && alertId !== 'test' && !activeAlertIds.includes(alertId)) {
        await Notifications.dismissNotificationAsync(n.request.identifier);
      }
    }
  });
}

// ——— تنبيه قبل الموعد ———

const DEADLINE_KIND = 'deadline';

export interface DeadlineNotification {
  /** وقت الإشعار */
  at: number;
  /** الموعد و«ذكرني»، ويميّز الإشعار */
  key: string;
  title: string;
  body: string;
}

/**
 * يلغي كل إشعارات المواعيد المجدولة ويجدولها من جديد من التذاكير الحالية.
 * يغطي الإضافة والتعديل والحذف و«تم» و«انتهى» و«رجّعها» بدون منطق لكل حالة.
 * بدون أزرار، ويطلع كبانر حتى والتطبيق مفتوح لأن ما له بطاقة داخل التطبيق.
 */
export function syncDeadlineNotifications(list: DeadlineNotification[]): Promise<void> {
  return serial(async () => {
    for (const n of await Notifications.getAllScheduledNotificationsAsync()) {
      if (n.content.data?.kind === DEADLINE_KIND) await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
    for (const n of list) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${DEADLINE_KIND}:${n.key}`,
        content: { title: n.title, body: n.body, sound: true, data: { kind: DEADLINE_KIND, forceShow: true } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at },
      });
    }
  });
}

// ——— الصوت ———

export function announce(s: Settings, spoken: string | null) {
  try {
    if (s.sound) Vibration.vibrate([0, 180, 80, 180]);
    if (s.speak && spoken) {
      Speech.stop();
      Speech.speak(spoken, { language: 'ar-SA', rate: 1 });
    }
  } catch { /* تجاهل */ }
}

// ——— «اذهب» ———

/**
 * نسخة المتصفح في الجوال تفتح الرابط بنفس التبويب: `Linking.openURL` يفتح تبويب جديد، وiPhone يحوّله
 * لتطبيق Google Maps ويخلي التبويب فاضي، فلما ترجع لـ Safari تلقى صفحة بيضاء والتطبيق في تبويب ثاني.
 * بنفس التبويب: لو التطبيق موجود ينفتح وصفحتنا تبقى، ولو مو موجود تنفتح الخرائط والرجوع يرجّعك.
 * في الكمبيوتر تبويب جديد عشان ما تطلع من التطبيق.
 */
function openWebUrl(url: string) {
  try {
    const ua = navigator.userAgent;
    const phone = /iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (phone) { window.location.assign(url); return; }
  } catch { /* تجاهل */ }
  Linking.openURL(url).catch(() => undefined);
}

/** يفتح خرائط Google على المكان ويبدأ الملاحة (تطبيق Google Maps لو موجود، وإلا المتصفح) */
export function openInGoogleMaps(p: LatLon) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${p.lat.toFixed(6)},${p.lon.toFixed(6)}&travelmode=driving`;
  if (Platform.OS === 'web') { openWebUrl(url); return; }
  Linking.openURL(url).catch(() => undefined);
}

/**
 * يفتح صفحة مكان محفوظ (وين خلّصت الغرض) في خرائط Google، بدون ملاحة.
 * نبحث باسم المحل حول موقعه، لأن الإحداثيات لحالها تفتح نقطة مو المحل،
 * والاسم لحاله ممكن يفتح فرع ثاني. الدقيق ١٠٠٪ يجي مع رقم المكان من Google Places.
 */
export function openPlaceInGoogleMaps(p: LatLon & { name: string; branch?: string }) {
  const ll = `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
  // العنوان المعروض فيه النوع قبل الاسم («صيدلية · كنوز»)، والبحث يبي الاسم بس، ومعه الفرع يضيّق الفروع
  const name = p.name.split(' · ').pop()?.trim() ?? '';
  const q = encodeURIComponent([name, p.branch].filter(Boolean).join(' '));
  const web = name
    ? `https://www.google.com/maps/search/${q}/@${ll},17z`
    : `https://www.google.com/maps/search/?api=1&query=${ll}`;
  if (Platform.OS === 'web') { openWebUrl(web); return; }
  if (!name) {
    Linking.openURL(web).catch(() => undefined);
    return;
  }
  // تطبيق Google Maps يدوّر بالاسم حول الموقع؛ لو مو مثبّت نفتح المتصفح
  Linking.openURL(`comgooglemaps://?q=${q}&center=${ll}&zoom=17`)
    .catch(() => Linking.openURL(web))
    .catch(() => undefined);
}
