import { bearingDeg, distanceM, type LatLon } from '../../../src/core/geo';
import type { Sample } from '../../../src/core/motion';

const TICK_MS = 250;
/** سرعة شارع داخل المدينة: ٥٠ كم/س */
const SPEED_MS = 50 / 3.6;
/** بعد نهاية المسار نوقف ٣.٥ دقائق (بوقت الاختبار) عشان ينتهي المشوار طبيعيًا */
const PARK_MS = 210_000;

/** يمشّيك على مسار ثابت كأنك تسوق عليه، بدون شبكة. الوقت وقت الاختبار (يتسارع مع multiplier) */
export class RoutePlayer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly cum: number[] = [0];
  private seg = 0;
  private dist = 0;
  private parkedFor = 0;
  private t = 0;
  multiplier = 5;

  constructor(
    private readonly route: LatLon[],
    private readonly onSample: (s: Sample) => void,
    private readonly onEnd: () => void,
  ) {
    for (let i = 1; i < route.length; i++) this.cum.push(this.cum[i - 1] + distanceM(route[i - 1], route[i]));
  }

  get total(): number {
    return this.cum[this.cum.length - 1] || 0;
  }

  get progress(): number {
    return this.total ? Math.min(1, this.dist / this.total) : 0;
  }

  start(multiplier = this.multiplier) {
    this.multiplier = multiplier;
    this.t = Date.now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick() {
    const dt = TICK_MS * this.multiplier;
    this.t += dt;
    const c = this.route;

    if (this.dist >= this.total) {
      this.parkedFor += dt;
      const end = c[c.length - 1];
      this.onSample({ lat: end.lat, lon: end.lon, t: this.t, speed: 0, heading: null, accuracy: 5 });
      if (this.parkedFor >= PARK_MS) {
        this.stop();
        this.onEnd();
      }
      return;
    }

    this.dist = Math.min(this.total, this.dist + (SPEED_MS * dt) / 1000);
    while (this.seg < c.length - 2 && this.cum[this.seg + 1] < this.dist) this.seg++;
    const a = c[this.seg];
    const b = c[this.seg + 1] ?? a;
    const segLen = this.cum[this.seg + 1] - this.cum[this.seg] || 1;
    const f = Math.min(1, Math.max(0, (this.dist - this.cum[this.seg]) / segLen));
    this.onSample({
      lat: a.lat + (b.lat - a.lat) * f,
      lon: a.lon + (b.lon - a.lon) * f,
      t: this.t,
      speed: SPEED_MS,
      heading: bearingDeg(a, b),
      accuracy: 5,
    });
  }
}
