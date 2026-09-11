import { bearingDeg, distanceM } from './geo';
import type { EngineMode } from './types';

export interface Sample {
  lat: number;
  lon: number;
  /** epoch ms */
  t: number;
  speed?: number | null;
  heading?: number | null;
  accuracy?: number | null;
}

export interface Kinematic {
  speed: number;
  heading: number | null;
}

/** يحسب السرعة والاتجاه من آخر العينات لما يكون GPS ما يعطيها */
export class KinematicsTracker {
  private history: Sample[] = [];
  private lastHeading: number | null = null;

  push(s: Sample): Kinematic {
    this.history.push(s);
    this.history = this.history.filter((h) => s.t - h.t <= 45_000);

    let speed = s.speed != null && s.speed >= 0 && Number.isFinite(s.speed) ? s.speed : NaN;
    if (Number.isNaN(speed)) {
      const ref = this.history.find((h) => s.t - h.t >= 4_000 && s.t - h.t <= 15_000) ?? this.history[0];
      const dt = (s.t - ref.t) / 1000;
      speed = dt > 0.5 ? distanceM(ref, s) / dt : 0;
    }

    let heading: number | null = null;
    if (s.heading != null && Number.isFinite(s.heading) && s.heading >= 0 && speed > 3) {
      heading = s.heading;
    } else {
      for (let i = this.history.length - 2; i >= 0; i--) {
        if (distanceM(this.history[i], s) >= 25) { heading = bearingDeg(this.history[i], s); break; }
      }
    }
    if (heading !== null) this.lastHeading = heading;
    return { speed, heading: heading ?? this.lastHeading };
  }

  reset() {
    this.history = [];
    this.lastHeading = null;
  }
}

export const DRIVE_SPEED = 5; // ١٨ كم/س
export const STILL_SPEED = 2;
export const TRIP_END_MS = 180_000; // ٣ دقائق وقوف تنهي المشوار

export interface ModeInput {
  t: number;
  speed: number;
  hasPlaceReminders: boolean;
  approaching: boolean;
  cooldownUntil?: number;
}

export interface ModeStep {
  mode: EngineMode;
  tripStarted: boolean;
  tripEnded: boolean;
}

/** آلة الحالات: خامل ← ثابت ← قيادة ← اقتراب ← تهدئة */
export class ModeTracker {
  mode: EngineMode = 'idle';
  private fastSince?: number;
  private stillSince?: number;
  private inTrip = false;

  step(i: ModeInput): ModeStep {
    let tripStarted = false;
    let tripEnded = false;

    if (i.speed >= DRIVE_SPEED) {
      this.fastSince ??= i.t;
      this.stillSince = undefined;
      if (!this.inTrip && i.t - this.fastSince >= 4_000) {
        this.inTrip = true;
        tripStarted = true;
      }
    } else {
      this.fastSince = undefined;
      if (i.speed < STILL_SPEED) this.stillSince ??= i.t;
      if (this.inTrip && this.stillSince !== undefined && i.t - this.stillSince >= TRIP_END_MS) {
        this.inTrip = false;
        tripEnded = true;
      }
    }

    if (!i.hasPlaceReminders) this.mode = 'idle';
    else if (!this.inTrip) this.mode = 'stationary';
    else if (i.cooldownUntil && i.t < i.cooldownUntil) this.mode = 'cooldown';
    else if (i.approaching) this.mode = 'approaching';
    else this.mode = 'driving';

    return { mode: this.mode, tripStarted, tripEnded };
  }

  get driving(): boolean {
    return this.inTrip;
  }

  /** نهاية يدوية (إيقاف المشوار) */
  forceEnd(): boolean {
    const was = this.inTrip;
    this.inTrip = false;
    this.fastSince = this.stillSince = undefined;
    this.mode = 'idle';
    return was;
  }
}
