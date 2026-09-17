import * as Location from 'expo-location';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import {
  formatDetour, formatDistance, itemsText, placeTitle, reasonText, spokenAlert, whyAlertText,
} from '../../../src/core/compose';
import { estimateDetourFallback, type DetourResult } from '../../../src/core/detour';
import {
  checkReminders, detourGate, placeMatches, preGate, rankCandidates, sortReminders,
  type Candidate, type GateContext,
} from '../../../src/core/gate';
import { distanceM, relativeTo, type LatLon, type Relative } from '../../../src/core/geo';
import { joinItems, reminderItems } from '../../../src/core/items';
import { KinematicsTracker, ModeTracker, type Sample } from '../../../src/core/motion';
import type { EngineMode, Place, Reminder, Settings, SpecificPlace, SuppressReason, Trip } from '../../../src/core/types';
import { OLAYA_ROUTE } from '../mock/olaya';
import { store, uid } from '../state/store';
import { announce, dismissNotification, dismissStaleNotifications, notify, openInGoogleMaps } from './device';
import { mockPlaces } from './places';
import { RoutePlayer } from './routePlayer';

/** pass = على طريقك، passed = تجاوزت المكان؟ */
export type AlertKind = 'pass' | 'passed';

export interface ActiveAlert {
  id: string;
  kind: AlertKind;
  label: string;
  title: string;
  distanceText?: string;
  sub: string;
  why?: string;
  place?: Place;
  reminderIds: string[];
  createdAt: number;
  /** ينتهي عنده التنبيه، بوقت المشوار */
  expiresAt?: number;
  notifId?: string;
}

export type CandStatus = 'pending' | 'alerted' | 'rejected' | 'blocked' | 'passed';

interface CandState {
  place: Place;
  status: CandStatus;
  rel: Relative;
  titles: string[];
  detour?: DetourResult;
  reason?: SuppressReason;
  alertId?: string;
  responded?: boolean;
}

export interface CandView {
  id: string;
  name: string;
  distance: number;
  status: CandStatus;
  detourSeconds?: number;
  approximate?: boolean;
  reasonText?: string;
  titles: string[];
}

export type Source = 'none' | 'gps' | 'test';

export interface EngineStatus {
  source: Source;
  mode: EngineMode;
  speed: number;
  trip: Trip | null;
  candidates: CandView[];
  /** أماكن مطابقة لتذاكيرك في حدود ٤ كم */
  nearbyCount: number;
  gpsError: string | null;
  test: { progress: number; multiplier: number } | null;
  alerts: ActiveAlert[];
}

const ALERT_PRIORITY: Record<AlertKind, number> = { pass: 0, passed: 1 };
const NEARBY_M = 4000;
const PLACES_RADIUS_M = 9000;
/** عمر التنبيه بوقت المشوار (في التجريبي يتسارع مع السرعة) */
const ALERT_TTL_MS: Record<AlertKind, number> = { pass: 90_000, passed: 60_000 };
/** احتياط بالساعة الحقيقية لو وقف وقت المشوار (ما فيه تحديثات موقع) */
const STALE_REAL_MS = 15 * 60_000;
/** التنبيهات كلها خانة وحدة في مركز الإشعارات: الجديد يستبدل القديم */
const DRIVE_NOTIFICATION = 'alatareeq:drive';

class Engine {
  private status: EngineStatus = {
    source: 'none', mode: 'idle', speed: 0, trip: null, candidates: [], nearbyCount: 0, gpsError: null, test: null, alerts: [],
  };
  private listeners = new Set<() => void>();
  private kin = new KinematicsTracker();
  private modes = new ModeTracker();
  private trip: Trip | null = null;
  private cands = new Map<string, CandState>();
  private cooldownUntil?: number;
  private watch: Location.LocationSubscription | null = null;
  private player: RoutePlayer | null = null;
  /** يزيد مع كل تغيير مصدر، عشان بدء قديم (ينتظر صلاحية) ما يكمل بعد إيقافه */
  private run = 0;
  private lastPos: LatLon | null = null;
  private lastT = 0;
  private alerts: ActiveAlert[] = [];
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  /** آخر موقع معروف في المراقبة، لتقريب بحث البراند من المستخدم */
  get position(): LatLon | null {
    return this.lastPos;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  getSnapshot = () => this.status;

  private emit(patch: Partial<EngineStatus> = {}) {
    this.status = { ...this.status, ...patch, alerts: [...this.alerts], trip: this.trip ? { ...this.trip } : null };
    this.listeners.forEach((l) => l());
  }

  /** مرة وحدة عند تشغيل التطبيق: ننهي التنبيهات اللي فات وقتها حتى لو وقف الموقع */
  init() {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweepAlerts(), 10_000);
    // إشعارات جلسة سابقة ما لها تنبيه شغال
    void dismissStaleNotifications([]);
    AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      this.sweepAlerts();
      void dismissStaleNotifications(this.alerts.map((a) => a.id));
    });
  }

  /** وقت المشوار: في التجريبي من العينات، وإلا الساعة */
  private engineNow(): number {
    return this.status.source === 'test' ? this.lastT : Date.now();
  }

  private sweepAlerts() {
    const now = Date.now();
    const engineNow = this.engineNow();
    for (const a of [...this.alerts]) {
      if (a.expiresAt === undefined) continue;
      if (engineNow >= a.expiresAt || now - a.createdAt >= STALE_REAL_MS) this.respond(a.id, 'ignored');
    }
  }

  /** في المشوار التجريبي نتجاهل ساعات الهدوء عشان تقدر تجربه بأي وقت */
  private settings(): Settings {
    const s = store.get().settings;
    return this.status.source === 'test' ? { ...s, quietEnabled: false } : s;
  }

  // ——— مصادر الموقع ———

  /** يراقب موقعك الحقيقي والتطبيق مفتوح. يطلب الصلاحية لو ما انطلبت */
  async startGps() {
    this.stopSource();
    const run = this.run;
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (run !== this.run) return;
      if (perm.status !== 'granted') {
        this.emit({ source: 'none', gpsError: 'رفضت صلاحية الموقع. فعّلها من إعدادات الجوال عشان نقدر ننبهك.' });
        return;
      }
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10 },
        (loc) => this.ingest({
          lat: loc.coords.latitude, lon: loc.coords.longitude, t: loc.timestamp,
          speed: loc.coords.speed, heading: loc.coords.heading, accuracy: loc.coords.accuracy,
        }),
      );
      if (run !== this.run) { sub.remove(); return; }
      this.watch = sub;
      this.emit({ source: 'gps', gpsError: null, test: null });
    } catch {
      if (run === this.run) this.emit({ source: 'none', gpsError: 'ما قدرنا نحدد موقعك. تأكد إن خدمات الموقع شغالة.' });
    }
  }

  /** يرجع للموقع الحقيقي بس لو الصلاحية موجودة، بدون ما يطلبها */
  async resumeGps() {
    try {
      const p = await Location.getForegroundPermissionsAsync();
      if (p.status === 'granted') await this.startGps();
    } catch { /* تجاهل */ }
  }

  startTest(multiplier: number) {
    this.stopSource();
    if (this.modes.forceEnd() && this.trip) this.finishTrip();
    this.cands.clear();
    this.emit({ source: 'test', gpsError: null, test: { progress: 0, multiplier }, candidates: [] });
    this.player = new RoutePlayer(OLAYA_ROUTE, (s) => this.ingest(s), () => this.stopTest());
    this.player.start(multiplier);
  }

  setTestSpeed(m: number) {
    if (this.player) this.player.multiplier = m;
    if (this.status.test) this.emit({ test: { ...this.status.test, multiplier: m } });
  }

  stopTest() {
    this.stop();
    void this.resumeGps();
  }

  private stopSource() {
    // التنبيهات تخص المصدر اللي وقف
    for (const a of [...this.alerts]) this.respond(a.id, 'ignored');
    this.watch?.remove();
    this.watch = null;
    this.player?.stop();
    this.player = null;
    this.run++;
    this.kin.reset();
  }

  stop() {
    this.stopSource();
    if (this.modes.forceEnd() && this.trip) this.finishTrip();
    this.cands.clear();
    this.lastPos = null;
    this.emit({ source: 'none', mode: 'idle', candidates: [], test: null, speed: 0, nearbyCount: 0 });
  }

  // ——— قلب المحرك ———

  private ingest(s: Sample) {
    const settings = this.settings();
    const reminders = store.get().reminders;
    const { speed, heading } = this.kin.push(s);
    const me = { lat: s.lat, lon: s.lon };
    const placeRems = reminders.filter((r) => r.status === 'active' && r.target);

    if (this.trip && this.lastPos) this.trip.distanceM += distanceM(this.lastPos, me);
    this.lastPos = me;
    this.lastT = s.t;

    const approaching = [...this.cands.values()].some((c) => c.status === 'pending');
    const step = this.modes.step({ t: s.t, speed, hasPlaceReminders: placeRems.length > 0, approaching, cooldownUntil: this.cooldownUntil });
    if (step.tripStarted) this.beginTrip(s.t);
    if (step.tripEnded) this.finishTrip();

    const places = this.placesFor(placeRems, me);
    if (this.trip && heading !== null && speed >= 3) {
      this.checkPassBy(me, heading, speed, s.t, placeRems, places, settings);
    }
    this.sweepAlerts();

    this.emit({
      mode: step.mode,
      speed,
      candidates: this.candViews(settings),
      nearbyCount: places.filter((p) => distanceM(me, p) < NEARBY_M).length,
      test: this.player && this.status.test ? { ...this.status.test, progress: this.player.progress } : this.status.test,
    });
  }

  /** الأماكن اللي تطابق تذكير واحد على الأقل، مع الأماكن المحددة يدويًا */
  private placesFor(rems: Reminder[], me: LatLon): Place[] {
    const out: Place[] = [];
    for (const r of rems) {
      if (r.target?.kind === 'place') {
        const p = r.target.place;
        out.push({ id: `sp:${p.id}`, name: p.name, lat: p.lat, lon: p.lon, categories: [], brands: [] });
      }
    }
    for (const p of mockPlaces.near(me, PLACES_RADIUS_M)) {
      if (rems.some((r) => placeMatches(r, p))) out.push(p);
    }
    return out;
  }

  private beginTrip(t: number) {
    this.trip = { id: uid(), startedAt: t, alerts: 0, notified: {}, askedPassed: [], distanceM: 0 };
    this.cands.clear();
    this.cooldownUntil = undefined;
  }

  private finishTrip() {
    this.trip = null;
    this.cands.clear();
    this.cooldownUntil = undefined;
  }

  // ——— التنبيه عند المرور ———

  private checkPassBy(me: LatLon, heading: number, speed: number, t: number, rems: Reminder[], places: Place[], settings: Settings) {
    const trip = this.trip!;
    const ctx: GateContext = { now: t, trip, settings };
    const ring = settings.outerRingM;
    const ready: Candidate[] = [];

    for (const place of places) {
      const matched = rems.filter((r) => placeMatches(r, place));
      if (!matched.length) continue;
      const rel = relativeTo(me, heading, place);
      let c = this.cands.get(place.id);
      if (!c) {
        if (rel.distance > ring) continue;
        c = { place, status: 'pending', rel, titles: [] };
        this.cands.set(place.id, c);
      }
      c.rel = rel;
      c.titles = matched.map((r) => r.title);

      if (c.status !== 'passed' && rel.angle > 100 && rel.distance > 60) {
        this.onPassed(c);
        continue;
      }
      if (rel.distance > ring * 1.6 && c.status === 'passed') { this.cands.delete(place.id); continue; }
      if (rel.distance > ring) continue;
      if (c.status === 'alerted' || c.status === 'rejected' || c.status === 'passed') continue;

      const chk = checkReminders(matched, ctx);
      if (!chk.eligible.length) { c.status = 'blocked'; c.reason = chk.excluded[0]?.reason; continue; }
      const pre = preGate({ angle: rel.angle, along: rel.along, speedMs: speed }, ctx);
      if (pre) { c.status = 'blocked'; c.reason = pre; continue; }

      // بدون شبكة: تقدير هندسي من البعد الجانبي. المسار الحقيقي يجي مع ربط الخرائط
      c.detour ??= estimateDetourFallback(rel.cross);
      c.status = 'pending';
      c.reason = undefined;
      const dg = detourGate(c.detour.seconds, settings);
      if (dg) {
        c.status = 'rejected';
        c.reason = dg;
        continue;
      }
      ready.push({ place, reminders: chk.eligible, detourSeconds: c.detour.seconds, distance: rel.distance });
    }

    if (ready.length) this.firePass(rankCandidates(ready)[0], t, settings);
  }

  private firePass(best: Candidate, t: number, settings: Settings) {
    const trip = this.trip!;
    const c = this.cands.get(best.place.id)!;
    const rems = sortReminders(best.reminders);
    const alertId = uid();
    trip.alerts += 1;
    trip.lastAlertAt = t;
    rems.forEach((r) => { trip.notified[r.id] = best.place.id; });
    this.cooldownUntil = t + 45_000;
    c.status = 'alerted';
    c.alertId = alertId;
    store.updateReminders(rems.map((r) => r.id), () => ({ lastNotifiedAt: Date.now(), remindOnReturn: false }));

    const why = whyAlertText({ angle: c.rel.angle, detourSeconds: best.detourSeconds, approximate: !!c.detour?.approximate, settings, alertNo: trip.alerts });
    const alert: ActiveAlert = {
      id: alertId, kind: 'pass', label: 'على طريقك', title: placeTitle(best.place),
      distanceText: formatDistance(best.distance),
      sub: `${formatDetour(best.detourSeconds)} · عندك: ${itemsText(rems)}`,
      why, place: best.place, reminderIds: rems.map((r) => r.id), createdAt: Date.now(),
    };
    this.pushAlert(alert, spokenAlert(best.place, best.distance, best.detourSeconds, rems));
  }

  /** المكان صار وراك: لو نبهناك وما رديت، نسأل مرة وحدة عن الرجعة */
  private onPassed(c: CandState) {
    const prev = c.status;
    c.status = 'passed';
    const trip = this.trip;
    if (!trip || prev !== 'alerted' || !c.alertId) return;

    const stillShowing = this.alerts.some((a) => a.id === c.alertId);
    if (stillShowing) this.respond(c.alertId, 'ignored');
    if (c.responded || trip.askedPassed.includes(c.place.id)) return;
    trip.askedPassed.push(c.place.id);
    const ids = Object.entries(trip.notified).filter(([, p]) => p === c.place.id).map(([r]) => r);
    this.pushAlert({
      id: uid(), kind: 'passed', label: 'تجاوزت المكان؟', title: placeTitle(c.place),
      sub: 'أذكرك بطريق الرجعة؟', place: c.place, reminderIds: ids, createdAt: Date.now(),
    }, null);
  }

  // ——— عرض التنبيهات والرد عليها ———

  private pushAlert(a: ActiveAlert, spoken: string | null) {
    // تنبيه جديد يستبدل القديم، فما يتكدس تحته تنبيه عن مكان فات
    for (const old of [...this.alerts]) this.respond(old.id, 'ignored');
    a.expiresAt = this.engineNow() + ALERT_TTL_MS[a.kind];
    a.notifId = DRIVE_NOTIFICATION;
    this.alerts.push(a);
    this.alerts.sort((x, y) => ALERT_PRIORITY[x.kind] - ALERT_PRIORITY[y.kind]);
    announce(this.settings(), spoken);
    void notify({ alertId: a.id, identifier: a.notifId, title: `${a.label}: ${a.title}${a.distanceText ? ` · ${a.distanceText}` : ''}`, body: a.sub, category: a.kind });
    this.emit();
  }

  respond(alertId: string, action: string) {
    const a = this.alerts.find((x) => x.id === alertId);
    if (!a) return;
    if (action === 'open') { this.emit(); return; } // ضغط الإشعار نفسه: التطبيق ينفتح والبطاقة باقية
    this.alerts = this.alerts.filter((x) => x.id !== alertId);
    if (a.notifId) void dismissNotification(a.notifId);
    const ids = a.reminderIds;
    const c = a.place ? this.cands.get(a.place.id) : undefined;
    if (c && action !== 'ignored') c.responded = true;

    switch (action) {
      case 'go':
        if (a.place) {
          openInGoogleMaps(a.place);
          // لما يرجع للتطبيق نسأله «خلصت؟»
          if (a.kind === 'pass') store.setPendingGo({ alertId, place: specificOf(a.place, a.title), reminderIds: ids, at: Date.now() });
        }
        break;
      case 'done':
        // «تم» على تنبيه المرور غالبًا من مكان ثاني، فما نحفظ المكان
        store.updateReminders(ids, () => ({ status: 'done', doneAt: Date.now(), notFoundAt: undefined }));
        break;
      case 'later':
        store.updateReminders(ids, () => ({ snoozedTripId: this.trip?.id ?? 'none' }));
        break;
      case 'return':
        store.updateReminders(ids, () => ({ remindOnReturn: true }));
        break;
    }
    this.emit();
  }

  /**
   * جواب «خلصت؟» بعد «اذهب». اللي تم يتسكّر ومعه المكان؛ واللي ما تم يرجع مثل ما كان بالضبط:
   * ما نستبعد المكان ولا البراند، لأن الغرض ممكن يكون في فرع ثاني أو حتى في نفس الفرع بعدين.
   * found: لكل تذكير، الأغراض اللي حصلها (بنفس نصوص `reminderItems`)
   */
  confirmGo(found: Record<string, string[]>) {
    const p = store.get().pendingGo;
    if (!p) return;
    const now = Date.now();
    const active = store.get().reminders.filter((r) => p.reminderIds.includes(r.id) && r.status === 'active');
    const got: string[] = [];
    const left: string[] = [];
    const notDone: string[] = [];
    for (const r of active) {
      const items = reminderItems(r.title);
      const yes = items.filter((i) => found[r.id]?.includes(i));
      const no = items.filter((i) => !found[r.id]?.includes(i));
      got.push(...yes);
      left.push(...no);
      if (!no.length) {
        store.updateReminder(r.id, { status: 'done', doneAt: now, donePlace: p.place, notFoundAt: undefined, remindOnReturn: false });
        continue;
      }
      notDone.push(r.id);
      // «ما حصلته في بنده» معلومة بس، والتنبيه يبقى بأي فرع
      const notFoundAt = { place: p.place, at: now };
      if (!yes.length) {
        store.updateReminder(r.id, { snoozedTripId: undefined, notFoundAt });
      } else {
        // حصل بعضها: اللي حصله تذكير منتهي لحاله، والتذكير يبقى بالباقي بس
        store.addReminder({
          ...r, id: uid(), title: joinItems(yes), status: 'done', doneAt: now, donePlace: p.place,
          notFoundAt: undefined, remindOnReturn: false,
        });
        store.updateReminder(r.id, { title: joinItems(no), snoozedTripId: undefined, notFoundAt });
      }
    }
    if (notDone.length) {
      const trip = this.trip;
      if (trip) notDone.forEach((id) => { delete trip.notified[id]; });
      const c = this.cands.get(p.place.id);
      if (c?.status === 'alerted') {
        c.status = 'pending';
        c.alertId = undefined;
        c.responded = false;
      }
    }
    if (active.length) store.setGoResult({ place: p.place, done: got, notDone: left, at: now });
    store.setPendingGo(null);
    this.emit();
  }

  private candViews(settings: Settings): CandView[] {
    return [...this.cands.values()]
      .filter((c) => c.status !== 'passed' || c.rel.distance < 500)
      .sort((a, b) => a.rel.distance - b.rel.distance)
      .slice(0, 12)
      .map((c) => ({
        id: c.place.id, name: placeTitle(c.place), distance: c.rel.distance, status: c.status,
        detourSeconds: c.detour?.seconds, approximate: c.detour?.approximate, titles: c.titles,
        reasonText: c.reason ? reasonText(c.reason, { detourSeconds: c.detour?.seconds, angle: c.rel.angle, settings }) : undefined,
      }));
  }
}

function specificOf(p: Place, title: string): SpecificPlace {
  return { id: p.id, name: title, lat: p.lat, lon: p.lon, branch: p.branch };
}

export const engine = new Engine();

export function useEngine(): EngineStatus {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot);
}
