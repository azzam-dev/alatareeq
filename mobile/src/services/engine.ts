import * as Location from 'expo-location';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import {
  formatDetour, formatDistance, itemsText, placeTitle, reasonText, spokenAlert, whyAlertText,
} from '../../../src/core/compose';
import { estimateDetourFallback, type DetourResult } from '../../../src/core/detour';
import {
  checkReminders, detourGate, inQuietHours, placeMatches, preGate, rankCandidates, sortReminders,
  type Candidate, type GateContext,
} from '../../../src/core/gate';
import { distanceM, relativeTo, type LatLon, type Relative } from '../../../src/core/geo';
import { joinItems, reminderItems } from '../../../src/core/items';
import { KinematicsTracker, ModeTracker, type Sample } from '../../../src/core/motion';
import type { EngineMode, Place, Reminder, Settings, SpecificPlace, SuppressReason, Trip } from '../../../src/core/types';
import { OLAYA_ROUTE } from '../mock/olaya';
import { store, uid, type Response } from '../state/store';
import { announce, dismissNotification, dismissStaleNotifications, notify, openInGoogleMaps } from './device';
import { mockPlaces } from './places';
import { RoutePlayer } from './routePlayer';

export type AlertKind = 'pass' | 'arrive' | 'time' | 'passed';

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
  /** ينتهي عنده التنبيه: بوقت المشوار لتنبيهات الطريق، وبالساعة لتنبيه الوقت */
  expiresAt?: number;
  notifId?: string;
}

export type CandStatus = 'pending' | 'alerted' | 'rejected' | 'blocked' | 'passed';

interface CandState {
  place: Place;
  status: CandStatus;
  rel: Relative;
  minDist: number;
  titles: string[];
  detour?: DetourResult;
  reason?: SuppressReason;
  logged: boolean;
  /** دخل مخروط «قدامك» ولو مرة */
  wasAhead?: boolean;
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

const ARRIVE_REPEAT_MS = 30 * 60_000;
const ALERT_PRIORITY: Record<AlertKind, number> = { pass: 0, arrive: 1, time: 2, passed: 3 };
const NEARBY_M = 4000;
const PLACES_RADIUS_M = 9000;
/** عمر تنبيهات الطريق بوقت المشوار (في التجريبي يتسارع مع السرعة) */
const ALERT_TTL_MS: Record<Exclude<AlertKind, 'time'>, number> = { pass: 90_000, arrive: 5 * 60_000, passed: 60_000 };
const TIME_ALERT_MS = 10 * 60_000;
/** احتياط بالساعة الحقيقية لو وقف وقت المشوار (ما فيه تحديثات موقع) */
const STALE_REAL_MS = 15 * 60_000;
/** تنبيهات الطريق كلها خانة وحدة في مركز الإشعارات: الجديد يستبدل القديم */
const DRIVE_NOTIFICATION = 'alatareeq:drive';

const isDrive = (a: ActiveAlert) => a.kind !== 'time';

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
  private arrivedAt = new Map<string, number>();
  private quietLogged = new Set<string>();
  private timeTimer: ReturnType<typeof setInterval> | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  getSnapshot = () => this.status;

  private emit(patch: Partial<EngineStatus> = {}) {
    this.status = { ...this.status, ...patch, alerts: [...this.alerts], trip: this.trip ? { ...this.trip } : null };
    this.listeners.forEach((l) => l());
  }

  /** فحص التذاكير الزمنية؛ مرة وحدة عند تشغيل التطبيق */
  init() {
    if (this.timeTimer) return;
    this.timeTimer = setInterval(() => {
      this.checkTimeReminders();
      this.sweepAlerts();
    }, 10_000);
    setTimeout(() => this.checkTimeReminders(), 800);
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

  /** ينهي التنبيهات اللي فات وقتها، أو تنبيه «وصلت» لما تبتعد عن المكان */
  private sweepAlerts(me?: LatLon) {
    const now = Date.now();
    const engineNow = this.engineNow();
    const radius = this.settings().arriveRadiusM;
    for (const a of [...this.alerts]) {
      if (a.expiresAt === undefined) continue;
      const expired = a.kind === 'time'
        ? now >= a.expiresAt
        : engineNow >= a.expiresAt || now - a.createdAt >= STALE_REAL_MS
          || (a.kind === 'arrive' && !!me && !!a.place && distanceM(me, a.place) > radius * 2);
      if (expired) this.respond(a.id, 'ignored');
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
    // تنبيهات الطريق تخص المصدر اللي وقف
    for (const a of this.alerts.filter(isDrive)) this.respond(a.id, 'ignored');
    this.watch?.remove();
    this.watch = null;
    this.player?.stop();
    this.player = null;
    this.run++;
    this.kin.reset();
    // كل مصدر له خط زمني: وقت الاختبار يسبق الساعة، فأوقات الوصول القديمة تمنع تنبيهات المصدر الجديد
    this.arrivedAt.clear();
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
    const placeRems = reminders.filter((r) => r.status === 'active' && r.target && r.trigger !== 'time');

    if (this.trip && this.lastPos) this.trip.distanceM += distanceM(this.lastPos, me);
    this.lastPos = me;
    this.lastT = s.t;

    const approaching = [...this.cands.values()].some((c) => c.status === 'pending');
    const step = this.modes.step({ t: s.t, speed, hasPlaceReminders: placeRems.length > 0, approaching, cooldownUntil: this.cooldownUntil });
    if (step.tripStarted) this.beginTrip(s.t);
    if (step.tripEnded) this.finishTrip();

    const places = this.placesFor(placeRems, me);
    this.checkArrivals(me, speed, s.t, placeRems.filter((r) => r.trigger === 'arrive'), places, settings);
    if (this.trip && heading !== null && speed >= 3) {
      this.checkPassBy(me, heading, speed, s.t, placeRems.filter((r) => r.trigger === 'pass'), places, settings);
    }
    this.sweepAlerts(me);

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
    const trip = this.trip;
    if (!trip) return;
    const km = (trip.distanceM / 1000).toFixed(1);
    store.log({
      kind: 'trip',
      text: `انتهى المشوار: ${km} كم، ${trip.alerts === 0 ? 'بدون تنبيهات' : `${trip.alerts} من ${this.settings().maxAlertsPerTrip} تنبيهات`}`,
      reminderIds: [], reminderTitles: [], sim: this.status.source === 'test',
    });
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
        c = { place, status: 'pending', rel, minDist: rel.distance, titles: [], logged: false };
        this.cands.set(place.id, c);
      }
      c.rel = rel;
      c.minDist = Math.min(c.minDist, rel.distance);
      c.titles = matched.map((r) => r.title);
      if (rel.angle <= settings.aheadAngleDeg) c.wasAhead = true;

      if (c.status !== 'passed' && rel.angle > 100 && rel.distance > 60) {
        this.onPassed(c, settings);
        continue;
      }
      if (rel.distance > ring * 1.6 && c.status === 'passed') { this.cands.delete(place.id); continue; }
      if (rel.distance > ring) continue;
      if (c.status === 'alerted' || c.status === 'rejected' || c.status === 'passed') continue;

      const chk = checkReminders(matched, ctx);
      if (!chk.eligible.length) { c.status = 'blocked'; c.reason = chk.excluded[0]?.reason; continue; }
      const pre = preGate({ angle: rel.angle, along: rel.along, speedMs: speed }, ctx);
      if (pre) { c.status = 'blocked'; c.reason = pre; continue; }

      // المستوى ١ بدون شبكة: تقدير هندسي من البعد الجانبي. المسار الحقيقي يجي مع ربط الخرائط
      c.detour ??= estimateDetourFallback(rel.cross);
      c.status = 'pending';
      c.reason = undefined;
      const dg = detourGate(c.detour.seconds, settings);
      if (dg) {
        c.status = 'rejected';
        c.reason = dg;
        c.logged = true;
        store.log({
          kind: 'suppressed', text: reasonText(dg, { detourSeconds: c.detour.seconds, settings }),
          placeName: placeTitle(place), reminderIds: chk.eligible.map((r) => r.id), reminderTitles: chk.eligible.map((r) => r.title),
          detourSeconds: c.detour.seconds, approximate: c.detour.approximate, distance: rel.distance, reason: dg,
          sim: this.status.source === 'test',
        });
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
    c.logged = true;
    store.updateReminders(rems.map((r) => r.id), () => ({ lastNotifiedAt: Date.now(), remindOnReturn: false }));

    const why = whyAlertText({ angle: c.rel.angle, detourSeconds: best.detourSeconds, approximate: !!c.detour?.approximate, settings, alertNo: trip.alerts });
    const alert: ActiveAlert = {
      id: alertId, kind: 'pass', label: 'على طريقك', title: placeTitle(best.place),
      distanceText: formatDistance(best.distance),
      sub: `${formatDetour(best.detourSeconds)} · عندك: ${itemsText(rems)}`,
      why, place: best.place, reminderIds: rems.map((r) => r.id), createdAt: Date.now(),
    };
    store.log({
      kind: 'alert', alertId, text: why, placeName: alert.title, reminderIds: alert.reminderIds,
      reminderTitles: rems.map((r) => r.title), detourSeconds: best.detourSeconds, approximate: c.detour?.approximate,
      distance: best.distance, sim: this.status.source === 'test',
    });
    this.pushAlert(alert, spokenAlert(best.place, best.distance, best.detourSeconds, rems));
  }

  /** المكان صار وراك */
  private onPassed(c: CandState, settings: Settings) {
    const prev = c.status;
    c.status = 'passed';
    const trip = this.trip;
    if (!trip) return;

    if (prev === 'alerted' && c.alertId) {
      const stillShowing = this.alerts.some((a) => a.id === c.alertId);
      if (stillShowing) this.respond(c.alertId, 'ignored');
      if (!c.responded && !trip.askedPassed.includes(c.place.id)) {
        trip.askedPassed.push(c.place.id);
        const ids = Object.entries(trip.notified).filter(([, p]) => p === c.place.id).map(([r]) => r);
        const alert: ActiveAlert = {
          id: uid(), kind: 'passed', label: 'تجاوزت المكان؟', title: placeTitle(c.place),
          sub: 'أذكرك بطريق الرجعة؟', place: c.place, reminderIds: ids, createdAt: Date.now(),
        };
        store.log({
          kind: 'passed', alertId: alert.id, text: 'تجاوزت المكان بدون رد، سألناك سؤال واحد عن الرجعة',
          placeName: alert.title, reminderIds: ids, reminderTitles: c.titles, sim: this.status.source === 'test',
        });
        this.pushAlert(alert, null);
      }
      return;
    }

    // «ليش ما نبهني»: مرّينا قريب من مكان مطابق بدون تنبيه
    const close = c.wasAhead ? c.minDist < 300 : c.minDist < 150;
    if (!c.logged && close && c.reason !== 'notified' && c.reason !== 'snoozed') {
      c.logged = true;
      store.log({
        kind: 'missed',
        text: c.reason
          ? reasonText(c.reason, { detourSeconds: c.detour?.seconds, angle: c.rel.angle, settings })
          : 'ما لحقنا نقيّم المكان قبل ما تتجاوزه',
        placeName: placeTitle(c.place), reminderIds: [], reminderTitles: c.titles,
        distance: c.minDist, reason: c.reason, sim: this.status.source === 'test',
      });
    }
  }

  // ——— التنبيه عند الوصول ———

  private checkArrivals(me: LatLon, speed: number, t: number, rems: Reminder[], places: Place[], settings: Settings) {
    if (!rems.length || speed > 3) return;
    const byPlace = new Map<string, { place: Place; rems: Reminder[] }>();
    for (const r of rems) {
      if (r.notBefore && r.notBefore > t) continue;
      const last = this.arrivedAt.get(r.id);
      if (last && t - last < ARRIVE_REPEAT_MS) continue;
      if (r.snoozedTripId && this.trip && r.snoozedTripId === this.trip.id) continue;
      const hit = places.find((p) => placeMatches(r, p) && distanceM(me, p) <= settings.arriveRadiusM);
      if (!hit) continue;
      const g = byPlace.get(hit.id) ?? { place: hit, rems: [] };
      g.rems.push(r);
      byPlace.set(hit.id, g);
    }
    for (const { place, rems: group } of byPlace.values()) {
      group.forEach((r) => this.arrivedAt.set(r.id, t));
      if (inQuietHours(settings, new Date(t))) {
        const key = `${place.id}:${new Date(t).toDateString()}`;
        if (!this.quietLogged.has(key)) {
          this.quietLogged.add(key);
          store.log({ kind: 'suppressed', text: reasonText('quiet', { settings }), placeName: placeTitle(place), reminderIds: group.map((r) => r.id), reminderTitles: group.map((r) => r.title), reason: 'quiet' });
        }
        continue;
      }
      const rs = sortReminders(group);
      const alertId = uid();
      store.updateReminders(rs.map((r) => r.id), () => ({ lastNotifiedAt: Date.now() }));
      const alert: ActiveAlert = {
        id: alertId, kind: 'arrive', label: 'وصلت', title: placeTitle(place),
        sub: `عندك: ${itemsText(rs)}`, why: `داخل ${settings.arriveRadiusM} م من المكان وسرعتك منخفضة`,
        place, reminderIds: rs.map((r) => r.id), createdAt: Date.now(),
      };
      store.log({ kind: 'arrive', alertId, text: alert.why!, placeName: alert.title, reminderIds: alert.reminderIds, reminderTitles: rs.map((r) => r.title), sim: this.status.source === 'test' });
      this.pushAlert(alert, `وصلت ${alert.title}. عندك: ${itemsText(rs, 2)}`);
    }
  }

  // ——— التنبيه بالوقت ———

  checkTimeReminders() {
    const now = Date.now();
    for (const r of store.get().reminders) {
      if (r.status !== 'active' || r.trigger !== 'time' || !r.at) continue;
      const due = r.snoozedUntil && r.snoozedUntil > r.at ? r.snoozedUntil : r.at;
      if (due > now || (r.lastNotifiedAt && r.lastNotifiedAt >= due)) continue;
      store.updateReminder(r.id, { lastNotifiedAt: now });
      const alertId = uid();
      const late = now - due > 5 * 60_000;
      const alert: ActiveAlert = {
        id: alertId, kind: 'time', label: late ? 'فات موعده' : 'حان الوقت', title: r.title || 'تذكير',
        sub: new Date(due).toLocaleString('ar-SA-u-nu-latn-ca-gregory', { weekday: 'long', hour: 'numeric', minute: '2-digit' }),
        reminderIds: [r.id], createdAt: now,
      };
      store.log({ kind: 'time', alertId, text: `${alert.label}: ${alert.sub}`, reminderIds: [r.id], reminderTitles: [r.title] });
      this.pushAlert(alert, `تذكير: ${r.title}`);
    }
  }

  // ——— عرض التنبيهات والرد عليها ———

  private pushAlert(a: ActiveAlert, spoken: string | null) {
    // تنبيه طريق جديد يستبدل القديم (يتسجّل «تجاهلته»)، فما يتكدس تحته تنبيه عن مكان فات
    if (isDrive(a)) for (const old of this.alerts.filter(isDrive)) this.respond(old.id, 'ignored');
    a.expiresAt = a.kind === 'time' ? Date.now() + TIME_ALERT_MS : this.engineNow() + ALERT_TTL_MS[a.kind];
    a.notifId = a.kind === 'time' ? `alatareeq:time:${a.reminderIds[0]}` : DRIVE_NOTIFICATION;
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

    let response: Response = action as Response;
    switch (action) {
      case 'go':
        if (a.place) {
          openInGoogleMaps(a.place);
          // لما يرجع للتطبيق نسأله «خلصت؟»
          if (a.kind === 'pass' || a.kind === 'arrive') {
            store.setPendingGo({ alertId, place: specificOf(a.place, a.title), reminderIds: ids, at: Date.now() });
          }
        }
        break;
      case 'done':
        // «تم» على تنبيه الوصول يعني خلّصته من هالمكان؛ على تنبيه المرور غالبًا من مكان ثاني
        store.updateReminders(ids, () => ({
          status: 'done', doneAt: Date.now(), notFoundAt: undefined,
          ...(a.kind === 'arrive' && a.place ? { donePlace: specificOf(a.place, a.title) } : {}),
        }));
        break;
      case 'later':
        if (a.kind === 'time') store.updateReminders(ids, () => ({ snoozedUntil: Date.now() + 15 * 60_000 }));
        else if (a.kind === 'arrive') ids.forEach((id) => this.arrivedAt.set(id, this.lastT));
        else store.updateReminders(ids, () => ({ snoozedTripId: this.trip?.id ?? 'none' }));
        break;
      case 'return':
        store.updateReminders(ids, () => ({ remindOnReturn: true }));
        break;
      case 'no':
      case 'ignored':
        break;
      default:
        response = 'ignored';
    }
    store.setLogResponse(alertId, response);
    this.emit();
  }

  /**
   * جواب «خلصت؟» بعد «اذهب». اللي تم يتسكّر ومعه المكان؛ واللي ما تم يرجع مثل ما كان بالضبط:
   * ما نستبعد المكان ولا البراند، لأن الغرض ممكن يكون في فرع ثاني أو حتى في نفس الفرع بعدين.
   */
  /** found: لكل تذكير، الأغراض اللي حصلها (بنفس نصوص `reminderItems`) */
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
    if (active.length) {
      store.setLogOutcome(p.alertId, left.length === 0 ? 'done' : got.length ? 'partial' : 'notDone');
      store.setGoResult({ place: p.place, done: got, notDone: left, at: now });
    }
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
