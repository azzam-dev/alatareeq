import { bearingDeg, distanceM, type LatLon } from '../core/geo';
import type { Sample } from '../core/motion';
import type { RouteGeometry } from './osm';

const TICK_MS = 250;
/** بعد الوصول نوقف ٣.٥ دقائق (بوقت المحاكاة) عشان ينتهي المشوار طبيعيًا */
const PARK_MS = 210_000;

export interface SimPreset {
  id: string;
  label: string;
  from: LatLon;
  to: LatLon;
}

export const SIM_PRESETS: SimPreset[] = [
  { id: 'olaya', label: 'شارع العليا: من الشمال للجنوب', from: { lat: 24.7425, lon: 46.6555 }, to: { lat: 24.6905, lon: 46.6858 } },
  { id: 'tahlia', label: 'التحلية ← الملك فهد', from: { lat: 24.7003, lon: 46.6607 }, to: { lat: 24.7290, lon: 46.6600 } },
  { id: 'malqa', label: 'الملقا ← العليا (طريق أطول)', from: { lat: 24.8105, lon: 46.6120 }, to: { lat: 24.7115, lon: 46.6745 } },
];

/** يعيد تشغيل مسار حقيقي كأنك تسوق عليه، بسرعات OSRM لكل مقطع */
export class Simulator {
  private timer: ReturnType<typeof setInterval> | null = null;
  private cum: number[] = [];
  private seg = 0;
  private dist = 0;
  private parkedFor = 0;
  simT = 0;
  multiplier = 5;

  constructor(
    readonly route: RouteGeometry,
    private onSample: (s: Sample) => void,
    private onEnd: () => void,
  ) {
    this.cum = [0];
    for (let i = 1; i < route.coords.length; i++) this.cum.push(this.cum[i - 1] + distanceM(route.coords[i - 1], route.coords[i]));
  }

  get total(): number {
    return this.cum[this.cum.length - 1] || 0;
  }

  get progress(): number {
    return this.total ? Math.min(1, this.dist / this.total) : 0;
  }

  start(multiplier = this.multiplier) {
    this.multiplier = multiplier;
    this.simT = Date.now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  private tick() {
    const dt = TICK_MS * this.multiplier;
    this.simT += dt;
    const c = this.route.coords;

    if (this.dist >= this.total) {
      this.parkedFor += dt;
      const end = c[c.length - 1];
      this.onSample({ lat: end.lat, lon: end.lon, t: this.simT, speed: 0, heading: null, accuracy: 5 });
      if (this.parkedFor >= PARK_MS) {
        this.stop();
        this.onEnd();
      }
      return;
    }

    const speed = this.route.speeds[Math.min(this.seg, this.route.speeds.length - 1)] ?? 14;
    this.dist = Math.min(this.total, this.dist + (speed * dt) / 1000);
    while (this.seg < c.length - 2 && this.cum[this.seg + 1] < this.dist) this.seg++;
    const a = c[this.seg];
    const b = c[this.seg + 1] ?? a;
    const segLen = this.cum[this.seg + 1] - this.cum[this.seg] || 1;
    const f = Math.min(1, Math.max(0, (this.dist - this.cum[this.seg]) / segLen));
    const pos = { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f };
    this.onSample({ lat: pos.lat, lon: pos.lon, t: this.simT, speed, heading: bearingDeg(a, b), accuracy: 5 });
  }
}
