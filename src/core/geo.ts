export interface LatLon {
  lat: number;
  lon: number;
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function distanceM(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** الاتجاه من a إلى b بالدرجات (0 = شمال، باتجاه عقارب الساعة) */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** الفرق المطلق بين اتجاهين، من 0 إلى 180 */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

export interface Relative {
  distance: number;
  /** الزاوية بين اتجاه حركتك واتجاه المكان */
  angle: number;
  /** المسافة للأمام على خط حركتك */
  along: number;
  /** البعد الجانبي عن خط حركتك */
  cross: number;
}

export function relativeTo(me: LatLon, heading: number, place: LatLon): Relative {
  const distance = distanceM(me, place);
  const angle = angleDiff(heading, bearingDeg(me, place));
  return {
    distance,
    angle,
    along: distance * Math.cos(rad(angle)),
    cross: Math.abs(distance * Math.sin(rad(angle))),
  };
}

/** نقطة على بعد d متر باتجاه معيّن */
export function offset(p: LatLon, bearing: number, d: number): LatLon {
  const br = rad(bearing);
  const lat1 = rad(p.lat);
  const lon1 = rad(p.lon);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d / R) + Math.cos(lat1) * Math.sin(d / R) * Math.cos(br));
  const lon2 = lon1 + Math.atan2(Math.sin(br) * Math.sin(d / R) * Math.cos(lat1), Math.cos(d / R) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lon: deg(lon2) };
}

export interface BBox { s: number; w: number; n: number; e: number }

export function bboxAround(p: LatLon, radiusM: number): BBox {
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos(rad(p.lat)));
  return { s: p.lat - dLat, n: p.lat + dLat, w: p.lon - dLon, e: p.lon + dLon };
}

export function bboxOf(points: LatLon[], marginM: number): BBox {
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
  for (const p of points) {
    s = Math.min(s, p.lat); n = Math.max(n, p.lat);
    w = Math.min(w, p.lon); e = Math.max(e, p.lon);
  }
  const mid = { lat: (s + n) / 2, lon: (w + e) / 2 };
  const m = bboxAround(mid, marginM);
  return { s: s - (mid.lat - m.s), n: n + (m.n - mid.lat), w: w - (mid.lon - m.w), e: e + (m.e - mid.lon) };
}

export function bboxContains(outer: BBox, inner: BBox): boolean {
  return inner.s >= outer.s && inner.n <= outer.n && inner.w >= outer.w && inner.e <= outer.e;
}
