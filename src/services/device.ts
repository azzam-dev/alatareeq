import type { LatLon } from '../core/geo';
import type { Settings } from '../core/types';

// ——— إشعارات النظام (عبر Service Worker عشان تشتغل على أندرويد و PWA على iOS) ———

let swReg: ServiceWorkerRegistration | null = null;
type ActionHandler = (alertId: string, action: string) => void;
let actionHandler: ActionHandler | null = null;

export async function registerServiceWorker(onAction: ActionHandler) {
  actionHandler = onAction;
  if (!('serviceWorker' in navigator)) return;
  try {
    swReg = await navigator.serviceWorker.register('./sw.js');
    navigator.serviceWorker.addEventListener('message', (e) => {
      const d = e.data as { type?: string; alertId?: string; action?: string };
      if (d?.type === 'notification-action' && d.alertId) actionHandler?.(d.alertId, d.action || 'open');
    });
  } catch {
    swReg = null;
  }
}

export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined';
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}

export interface SystemAlert {
  alertId: string;
  title: string;
  body: string;
  actions: { action: string; title: string }[];
}

export async function showSystemNotification(a: SystemAlert) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const opts: NotificationOptions & { actions?: { action: string; title: string }[]; renotify?: boolean; vibrate?: number[] } = {
    body: a.body,
    tag: 'alatareeq-alert',
    renotify: true,
    requireInteraction: true,
    dir: 'rtl',
    lang: 'ar',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { alertId: a.alertId },
    actions: a.actions,
    vibrate: [180, 80, 180],
  };
  try {
    if (swReg) await swReg.showNotification(a.title, opts);
    else new Notification(a.title, opts);
  } catch { /* بعض المتصفحات ترفض الأزرار */ }
}

export async function closeSystemNotifications() {
  try {
    const list = (await swReg?.getNotifications({ tag: 'alatareeq-alert' })) ?? [];
    list.forEach((n) => n.close());
  } catch { /* تجاهل */ }
}

// ——— صوت وتنبيه ———

let audio: AudioContext | null = null;

/** لازم تُستدعى من ضغطة المستخدم (سياسة المتصفحات للصوت) */
export function unlockAudio() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audio ??= new Ctx();
    if (audio.state === 'suspended') void audio.resume();
  } catch { audio = null; }
}

export function chime() {
  if (!audio) return;
  const now = audio.currentTime;
  [[880, 0], [1175, 0.16]].forEach(([f, dt]) => {
    const o = audio!.createOscillator();
    const g = audio!.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, now + dt);
    g.gain.exponentialRampToValueAtTime(0.35, now + dt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dt + 0.35);
    o.connect(g).connect(audio!.destination);
    o.start(now + dt);
    o.stop(now + dt + 0.4);
  });
}

export function vibrate() {
  try { navigator.vibrate?.([180, 80, 180]); } catch { /* تجاهل */ }
}

export function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ar-SA';
    const voice = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('ar'));
    if (voice) u.voice = voice;
    u.rate = 1;
    speechSynthesis.speak(u);
  } catch { /* تجاهل */ }
}

export function announce(s: Settings, spoken: string) {
  if (s.sound) chime();
  vibrate();
  if (s.speak) setTimeout(() => speak(spoken), s.sound ? 450 : 0);
}

// ——— إبقاء الشاشة شغالة أثناء المشوار ———

let wakeLock: { release: () => Promise<void> } | null = null;
let wantWake = false;

export async function keepAwake(on: boolean) {
  wantWake = on;
  const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
  if (on && nav.wakeLock && !wakeLock) {
    try { wakeLock = await nav.wakeLock.request('screen'); } catch { wakeLock = null; }
  } else if (!on && wakeLock) {
    await wakeLock.release().catch(() => undefined);
    wakeLock = null;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wantWake) {
      wakeLock = null;
      void keepAwake(true);
    }
  });
}

export function wakeLockSupported(): boolean {
  return 'wakeLock' in navigator;
}

// ——— الإدخال الصوتي ———

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function recognitionCtor(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechInputSupported(): boolean {
  return recognitionCtor() !== null;
}

export function listen(onText: (text: string, final: boolean) => void, onEnd: () => void): () => void {
  const Ctor = recognitionCtor();
  if (!Ctor) { onEnd(); return () => undefined; }
  const r = new Ctor();
  r.lang = 'ar-SA';
  r.interimResults = true;
  r.continuous = false;
  r.onresult = (e) => {
    let text = '';
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      final = e.results[i].isFinal;
    }
    onText(text, final);
  };
  r.onend = onEnd;
  r.onerror = onEnd;
  try { r.start(); } catch { onEnd(); }
  return () => { try { r.stop(); } catch { /* تجاهل */ } };
}

// ——— فتح التطبيق الملاحي ———

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function mapsUrl(p: LatLon, app: Settings['mapsApp']): string {
  const ll = `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
  const which = app === 'auto' ? (isIOS() ? 'apple' : 'google') : app;
  switch (which) {
    case 'apple': return `https://maps.apple.com/?daddr=${ll}&dirflg=d`;
    case 'waze': return `https://waze.com/ul?ll=${ll}&navigate=yes`;
    default: return `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`;
  }
}
