import { useSyncExternalStore } from 'react';
import {
  formatDetour, formatDistance, itemsText, placeTitle, reasonText, spokenAlert, whyAlertText,
} from '../core/compose';
import { estimateDetour, estimateDetourFallback, type DetourResult } from '../core/detour';
import {
  checkReminders, detourGate, inQuietHours, placeMatches, preGate, rankCandidates, sortReminders,
  type Candidate, type GateContext,
} from '../core/gate';
import { bboxOf, distanceM, relativeTo, type BBox, type LatLon, type Relative } from '../core/geo';
import { KinematicsTracker, ModeTracker, type Sample } from '../core/motion';
import type { EngineMode, Place, Reminder, Settings, SuppressReason, Trip } from '../core/types';
import { store, uid, type Response } from '../state/store';
import {
  announce, closeSystemNotifications, keepAwake, mapsUrl, showSystemNotification, unlockAudio,
} from './device';
import { routeGeometry, routeTo, type RouteGeometry } from './osm';
import { PlaceCache, wantedFrom } from './placeCache';
import { Simulator } from './simulator';

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
}

export type CandStatus = 'pending' | 'routing' | 'alerted' | 'rejected' | 'blocked' | 'passed';

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
  lat: number;
  lon: number;
  distance: number;
  angle: number;
  status: CandStatus;
  detourSeconds?: number;
  approximate?: boolean;
  reasonText?: string;
  titles: string[];
}

export interface PlaceView { id: string; name: string; lat: number; lon: number; titles: string[] }

export interface EngineStatus {
  source: 'none' | 'gps' | 'sim';
  mode: EngineMode;
  position: LatLon | null;
  speed: number;
  heading: number | null;
  accuracy: number | null;
  trip: Trip | null;
  candidates: CandView[];
  nearby: PlaceView[];
  fetching: boolean;
  placesError: string | null;
  placeCount: number;
  gpsError: string | null;
  sim: { route: LatLon[]; progress: number; multiplier: number; loading: boolean; error?: string; placesFailed?: boolean } | null;
  alerts: ActiveAlert[];
}

const ARRIVE_REPEAT_MS = 30 * 60_000;
const ALERT_PRIORITY: Record<AlertKind, number> = { pass: 0, arrive: 1, time: 2, passed: 3 };
const NEARBY_M = 4000;

class Engine {
  private status: EngineStatus = {
    source: 'none', mode: 'idle', position: null, speed: 0, heading: null, accuracy: null, trip: null,
    candidates: [], nearby: [], fetching: false, placesError: null, placeCount: 0, gpsError: null, sim: null, alerts: [],
  };
  private listeners = new Set<() => void>();
  private kin = new KinematicsTracker();
  private modes = new ModeTracker();
  private cache = new PlaceCache();
  private trip: Trip | null = null;
  private cands = new Map<string, CandState>();
  private cooldownUntil?: number;
  private watchId: number | null = null;
  private simulator: Simulator | null = null;
  private simBoxes: { need: BBox; fetch: BBox } | null = null;
  /** مسار جاهز ينتظر تحميل الأماكن قبل ما تبدأ المحاكاة */
  private pendingSim: RouteGeometry | null = null;
  /** يزيد مع كل تغيير مصدر، عشان بدء قديم ما يكمل بعد إيقافه */
  private simRun = 0;
  private lastPos: LatLon | null = null;
  private lastT = 0;
  private alerts: ActiveAlert[] = [];
  private arrivedAt = new Map<string, number>();
  private quietLogged = new Set<string>();

  constructor() {
    this.cache.onChange = () => this.emit();
    if (typeof window !== 'undefined') {
      setInterval(() => this.checkTimeReminders(), 10_000);
      setTimeout(() => this.checkTimeReminders(), 800);
    }
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.status;

  private emit(patch: Partial<EngineStatus> = {}) {
    this.status = {
      ...this.status,
      ...patch,
      alerts: [...this.alerts],
      trip: this.trip ? { ...this.trip } : null,
      fetching: this.cache.fetching,
      placesError: this.cache.error,
      placeCount: this.cache.places.size,
    };
    this.listeners.forEach((l) => l());
  }

  /** في المحاكاة نتجاهل ساعات الهدوء عشان التجربة تشتغل بأي وقت */
  private settings(): Settings {
    const s = store.get().settings;
    return this.status.source === 'sim' ? { ...s, quietEnabled: false } : s;
  }

  // ——— مصادر الموقع ———

  startGps() {
    unlockAudio();
    this.stopSource();
    if (!('geolocation' in navigator)) {
      this.emit({ gpsError: 'المتصفح ما يدعم تحديد الموقع.' });
      return;
    }
    this.emit({ source: 'gps', gpsError: null, sim: null });
    void keepAwake(true);
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.ingest({
        lat: pos.coords.latitude, lon: pos.coords.longitude, t: pos.timestamp || Date.now(),
        speed: pos.coords.speed, heading: pos.coords.heading, accuracy: pos.coords.accuracy,
      }),
      (err) => this.emit({
        gpsError: err.code === err.PERMISSION_DENIED
          ? 'رفضت صلاحية الموقع. فعّلها من إعدادات المتصفح عشان نقدر ننبهك.'
          : 'ما قدرنا نحدد موقعك. تأكد إن الـ GPS شغال.',
      }),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 30_000 },
    );
  }

  async startSim(from: LatLon, to: LatLon, multiplier: number) {
    unlockAudio();
    this.stopSource();
    const run = this.simRun;
    this.emit({ source: 'sim', gpsError: null, sim: { route: [], progress: 0, multiplier, loading: true } });
    let geom: RouteGeometry;
    try {
      geom = await routeGeometry(from, to);
    } catch {
      if (run === this.simRun) {
        this.emit({ sim: { route: [], progress: 0, multiplier, loading: false, error: 'ما قدرنا نجيب المسار. تأكد من الاتصال وجرب مرة ثانية.' } });
      }
      return;
    }
    if (run !== this.simRun) return;
    // نحمّل الأماكن على طول المسار كله مرة وحدة
    this.simBoxes = { need: bboxOf(geom.coords, 1800), fetch: bboxOf(geom.coords, 2500) };
    this.pendingSim = geom;
    await this.loadSimPlaces(run);
  }

  /** ما نبدأ المحاكاة قبل ما تتحمّل الأماكن، وإلا نمر عليها قبل ما توصل */
  private async loadSimPlaces(run: number) {
    const geom = this.pendingSim;
    const boxes = this.simBoxes;
    if (!geom || !boxes || !this.status.sim) return;
    this.emit({ sim: { ...this.status.sim, route: geom.coords, loading: true, placesFailed: false } });
    const ok = await this.cache.load(boxes.need, boxes.fetch, wantedFrom(store.get().reminders));
    if (run !== this.simRun || !this.status.sim) return;
    if (ok) this.runSim();
    else this.emit({ sim: { ...this.status.sim, loading: false, placesFailed: true } });
  }

  retrySimPlaces() {
    void this.loadSimPlaces(this.simRun);
  }

  /** يبدأ المسار الجاهز؛ لو الأماكن ما تحمّلت تنحمّل أثناء المشوار إذا رجع الخادم */
  runSim() {
    const geom = this.pendingSim;
    const sim = this.status.sim;
    if (!geom || !sim || this.status.source !== 'sim') return;
    this.pendingSim = null;
    this.simulator = new Simulator(geom, (s) => this.ingest(s), () => this.stop());
    this.emit({ sim: { ...sim, progress: 0, loading: false, placesFailed: false } });
    this.simulator.start(sim.multiplier);
  }

  setSimSpeed(m: number) {
    if (this.simulator) this.simulator.multiplier = m;
    if (this.status.sim) this.emit({ sim: { ...this.status.sim, multiplier: m } });
  }

  private stopSource() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    this.simulator?.stop();
    this.simulator = null;
    this.simBoxes = null;
    this.pendingSim = null;
    this.simRun++;
    this.kin.reset();
    // كل مصدر له خط زمني: وقت المحاكاة يسبق الساعة، فأوقات الوصول القديمة تمنع تنبيهات المصدر الجديد
    this.arrivedAt.clear();
  }

  stop() {
    this.stopSource();
    if (this.modes.forceEnd() && this.trip) this.finishTrip();
    this.cands.clear();
    this.lastPos = null;
    void keepAwake(false);
    this.emit({ source: 'none', mode: 'idle', candidates: [], sim: null, speed: 0 });
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

    const approaching = [...this.cands.values()].some((c) => c.status === 'pending' || c.status === 'routing');
    const step = this.modes.step({ t: s.t, speed, hasPlaceReminders: placeRems.length > 0, approaching, cooldownUntil: this.cooldownUntil });
    if (step.tripStarted) this.beginTrip(s.t);
    if (step.tripEnded) this.finishTrip();

    if (this.status.source === 'gps') this.cache.ensureAround(me, wantedFrom(reminders));
    else if (this.simBoxes) this.cache.ensure(this.simBoxes.need, this.simBoxes.fetch, wantedFrom(reminders));
    const places = this.placesFor(placeRems, me);

    this.checkArrivals(me, speed, s.t, placeRems.filter((r) => r.trigger === 'arrive'), places, settings);
    if (this.trip && heading !== null && speed >= 3) {
      this.checkPassBy(me, heading, speed, s.t, placeRems.filter((r) => r.trigger === 'pass'), places, settings);
    }

    this.emit({
      mode: step.mode,
      position: me,
      speed,
      heading,
      accuracy: s.accuracy ?? null,
      candidates: this.candViews(settings),
      nearby: places.filter((p) => distanceM(me, p) < NEARBY_M).slice(0, 200).map((p) => ({
        id: p.id, name: placeTitle(p), lat: p.lat, lon: p.lon,
        titles: placeRems.filter((r) => placeMatches(r, p)).map((r) => r.title),
      })),
      sim: this.simulator && this.status.sim ? { ...this.status.sim, progress: this.simulator.progress } : this.status.sim,
    });
  }

  /** الأماكن من الكاش اللي تطابق تذكير واحد على الأقل، مع الأماكن المحددة يدويًا */
  private placesFor(rems: Reminder[], me: LatLon): Place[] {
    const out: Place[] = [];
    for (const r of rems) {
      if (r.target?.kind === 'place') {
        const p = r.target.place;
        out.push({ id: `sp:${p.id}`, name: p.name, lat: p.lat, lon: p.lon, categories: [], brands: [] });
      }
    }
    for (const p of this.cache.places.values()) {
      if (Math.abs(p.lat - me.lat) > 0.08 || Math.abs(p.lon - me.lon) > 0.09) continue; // ~٩ كم
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
      reminderIds: [], reminderTitles: [], sim: this.status.source === 'sim',
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
    const toRoute: { c: CandState; rel: Relative }[] = [];

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
      if (c.status === 'alerted' || c.status === 'rejected' || c.status === 'passed' || c.status === 'routing') continue;

      const chk = checkReminders(matched, ctx);
      if (!chk.eligible.length) { c.status = 'blocked'; c.reason = chk.excluded[0]?.reason; continue; }
      const pre = preGate({ angle: rel.angle, along: rel.along, speedMs: speed }, ctx);
      if (pre) { c.status = 'blocked'; c.reason = pre; continue; }

      if (!c.detour) { c.status = 'pending'; c.reason = undefined; toRoute.push({ c, rel }); continue; }
      const dg = detourGate(c.detour.seconds, settings);
      if (dg) {
        c.status = 'rejected';
        c.reason = dg;
        c.logged = true;
        store.log({
          kind: 'suppressed', text: reasonText(dg, { detourSeconds: c.detour.seconds, settings }),
          placeName: placeTitle(place), reminderIds: chk.eligible.map((r) => r.id), reminderTitles: chk.eligible.map((r) => r.title),
          detourSeconds: c.detour.seconds, approximate: c.detour.approximate, distance: rel.distance, reason: dg,
          sim: this.status.source === 'sim',
        });
        continue;
      }
      ready.push({ place, reminders: chk.eligible, detourSeconds: c.detour.seconds, distance: rel.distance });
    }

    const inFlight = [...this.cands.values()].filter((c) => c.status === 'routing').length;
    toRoute
      .sort((a, b) => a.rel.along - b.rel.along)
      .slice(0, Math.max(0, 2 - inFlight))
      .forEach(({ c, rel }) => this.requestDetour(c, me, heading, rel));

    if (ready.length) this.firePass(rankCandidates(ready)[0], t, settings);
  }

  private requestDetour(c: CandState, me: LatLon, heading: number, rel: Relative) {
    c.status = 'routing';
    routeTo(me, c.place, heading)
      .then((r) => estimateDetour({ routeDistanceM: r.distance, alongM: rel.along, crossM: rel.cross }))
      .catch(() => estimateDetourFallback(rel.cross))
      .then((d) => {
        if (this.cands.get(c.place.id) !== c) return;
        c.detour = d;
        if (c.status === 'routing') c.status = 'pending';
      });
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
      distance: best.distance, sim: this.status.source === 'sim',
    });
    this.pushAlert(alert, spokenAlert(best.place, best.distance, best.detourSeconds, rems), [
      { action: 'go', title: 'اذهب' }, { action: 'done', title: 'تم' }, { action: 'later', title: 'لاحقًا' },
    ]);
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
          placeName: alert.title, reminderIds: ids, reminderTitles: c.titles, sim: this.status.source === 'sim',
        });
        this.pushAlert(alert, null, [{ action: 'return', title: 'ذكرني' }, { action: 'no', title: 'لا' }]);
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
          : 'ما لحقنا نحسب التحويلة قبل ما تتجاوزه',
        placeName: placeTitle(c.place), reminderIds: [], reminderTitles: c.titles,
        distance: c.minDist, reason: c.reason, sim: this.status.source === 'sim',
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
      store.log({ kind: 'arrive', alertId, text: alert.why!, placeName: alert.title, reminderIds: alert.reminderIds, reminderTitles: rs.map((r) => r.title), sim: this.status.source === 'sim' });
      this.pushAlert(alert, `وصلت ${alert.title}. عندك: ${itemsText(rs, 2)}`, [{ action: 'done', title: 'تم' }, { action: 'later', title: 'لاحقًا' }]);
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
      this.pushAlert(alert, `تذكير: ${r.title}`, [{ action: 'done', title: 'تم' }, { action: 'later', title: 'بعد ربع ساعة' }]);
    }
  }

  // ——— عرض التنبيهات والرد عليها ———

  private pushAlert(a: ActiveAlert, spoken: string | null, actions: { action: string; title: string }[]) {
    // سؤال «تجاوزت المكان؟» ما يغطي على تنبيه جديد وأنت تسوق
    if (a.kind === 'pass' || a.kind === 'arrive') this.alerts = this.alerts.filter((x) => x.kind !== 'passed');
    this.alerts.push(a);
    this.alerts.sort((x, y) => ALERT_PRIORITY[x.kind] - ALERT_PRIORITY[y.kind]);
    const s = this.settings();
    if (spoken) announce(s, spoken);
    else if (s.sound) announce({ ...s, speak: false }, '');
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      void showSystemNotification({ alertId: a.id, title: `${a.label}: ${a.title}${a.distanceText ? ` · ${a.distanceText}` : ''}`, body: a.sub, actions });
    }
    // احتياط: التنبيه ما يبقى معلّق للأبد
    setTimeout(() => {
      if (this.alerts.some((x) => x.id === a.id)) this.respond(a.id, a.kind === 'passed' ? 'no' : 'ignored');
    }, a.kind === 'time' ? 10 * 60_000 : 120_000);
    this.emit();
  }

  respond(alertId: string, action: string) {
    const a = this.alerts.find((x) => x.id === alertId);
    if (!a) return;
    this.alerts = this.alerts.filter((x) => x.id !== alertId);
    void closeSystemNotifications();
    const ids = a.reminderIds;
    const c = a.place ? this.cands.get(a.place.id) : undefined;
    if (c && action !== 'ignored') c.responded = true;

    if (action === 'open') { this.emit(); return; } // ضغط على الإشعار نفسه: نفتح الصفحة بس

    let response: Response = action as Response;
    switch (action) {
      case 'go':
        if (a.place) window.open(mapsUrl(a.place, this.settings().mapsApp), '_blank', 'noopener');
        break;
      case 'done':
        store.updateReminders(ids, () => ({ status: 'done', doneAt: Date.now() }));
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

  private candViews(settings: Settings): CandView[] {
    return [...this.cands.values()]
      .filter((c) => c.status !== 'passed' || c.rel.distance < 500)
      .sort((a, b) => a.rel.distance - b.rel.distance)
      .slice(0, 12)
      .map((c) => ({
        id: c.place.id, name: placeTitle(c.place), lat: c.place.lat, lon: c.place.lon,
        distance: c.rel.distance, angle: c.rel.angle, status: c.status,
        detourSeconds: c.detour?.seconds, approximate: c.detour?.approximate, titles: c.titles,
        reasonText: c.reason ? reasonText(c.reason, { detourSeconds: c.detour?.seconds, angle: c.rel.angle, settings }) : undefined,
      }));
  }

  clearPlaceCache() {
    this.cache.clear();
    this.emit();
  }
}

export const engine = new Engine();

// للتشخيص أثناء التطوير: engine من الكونسول
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { engine: Engine }).engine = engine;
}

export function useEngine(): EngineStatus {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot);
}
