import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type { LatLon } from '../core/geo';
import type { CandStatus, EngineStatus } from '../services/engine';

const RIYADH: L.LatLngTuple = [24.7136, 46.6753];
const STATUS_COLOR: Record<CandStatus, string> = {
  pending: '#9A6200', routing: '#9A6200', alerted: '#0A5F41', rejected: '#A23B2A', blocked: '#7d8a83', passed: '#7d8a83',
};
const ARROW = '<svg viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="12" fill="#0A5F41" stroke="#fff" stroke-width="2"/><path d="M13 5.5 18.5 18 13 15.2 7.5 18Z" fill="#fff"/></svg>';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

interface Props {
  status: EngineStatus;
  ringM: number;
  picking: 'from' | 'to' | null;
  picked: { from?: LatLon; to?: LatLon };
  onPick: (p: LatLon) => void;
}

interface Layers {
  me?: L.Marker;
  ring?: L.Circle;
  route?: L.Polyline;
  markers: Map<string, { m: L.CircleMarker; key: string }>;
  picks: L.LayerGroup;
}

export function MapView({ status, ringM, picking, picked, onPick }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<Layers | null>(null);
  const [follow, setFollow] = useState(true);
  const lastPan = useRef(0);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const pickingRef = useRef(picking);
  pickingRef.current = picking;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView(RIYADH, 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    m.attributionControl.setPrefix(false);
    layers.current = { markers: new Map(), picks: L.layerGroup().addTo(m) };
    m.on('dragstart', () => setFollow(false));
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (pickingRef.current) pickRef.current({ lat: e.latlng.lat, lon: e.latlng.lng });
    });
    map.current = m;
    return () => { m.remove(); map.current = null; layers.current = null; };
  }, []);

  // المسار (المحاكاة)
  const route = status.sim?.route;
  useEffect(() => {
    const m = map.current, ly = layers.current;
    if (!m || !ly) return;
    ly.route?.remove();
    ly.route = undefined;
    if (route && route.length > 1) {
      ly.route = L.polyline(route.map((p) => [p.lat, p.lon] as L.LatLngTuple), { color: '#0A5F41', weight: 6, opacity: 0.35 }).addTo(m);
      m.fitBounds(ly.route.getBounds(), { padding: [30, 30] });
    }
  }, [route]);

  // موقعي والحلقة الخارجية
  useEffect(() => {
    const m = map.current, ly = layers.current;
    if (!m || !ly) return;
    const p = status.position;
    if (!p) { ly.me?.remove(); ly.ring?.remove(); ly.me = ly.ring = undefined; return; }
    const ll: L.LatLngTuple = [p.lat, p.lon];
    if (!ly.me) {
      ly.ring = L.circle(ll, { radius: ringM, color: '#0A5F41', weight: 1.5, dashArray: '6 6', fillOpacity: 0.04, interactive: false }).addTo(m);
      ly.me = L.marker(ll, { icon: L.divIcon({ className: 'me-marker', html: ARROW, iconSize: [26, 26], iconAnchor: [13, 13] }), zIndexOffset: 1000, interactive: false }).addTo(m);
      m.setView(ll, 14);
    } else {
      ly.me.setLatLng(ll);
      ly.ring?.setLatLng(ll).setRadius(ringM);
    }
    const svg = ly.me.getElement()?.querySelector('svg');
    if (svg) svg.style.transform = `rotate(${status.heading ?? 0}deg)`;
    // تحريك كل ٨٠٠ ملي ثانية بدل كل عينة، عشان ما نقطع تحميل البلاطات
    if (follow && Date.now() - lastPan.current > 800) {
      lastPan.current = Date.now();
      m.panTo(ll, { animate: true, duration: 0.8 });
    }
  }, [status.position, status.heading, ringM, follow]);

  // الأماكن المطابقة (نقاط بيضاء) والمرشحة (ملونة حسب القرار) — نحدّث بدل ما نعيد الرسم
  useEffect(() => {
    const m = map.current, ly = layers.current;
    if (!m || !ly) return;
    const want = new Map<string, { lat: number; lon: number; key: string; style: L.CircleMarkerOptions; tip: string }>();
    for (const p of status.nearby) {
      want.set(p.id, {
        lat: p.lat, lon: p.lon, key: 'n',
        style: { radius: 5, color: '#0A5F41', weight: 1.5, fillColor: '#ffffff', fillOpacity: 1 },
        tip: `<b>${esc(p.name)}</b><br>${esc(p.titles.join('، '))}`,
      });
    }
    for (const c of status.candidates) {
      want.set(c.id, {
        lat: c.lat, lon: c.lon, key: c.status,
        style: { radius: c.status === 'alerted' ? 10 : 8, color: '#ffffff', weight: 2, fillColor: STATUS_COLOR[c.status], fillOpacity: 1 },
        tip: `<b>${esc(c.name)}</b>${c.reasonText ? `<br>${esc(c.reasonText)}` : ''}`,
      });
    }
    for (const [id, { m: mk }] of ly.markers) {
      if (!want.has(id)) { mk.remove(); ly.markers.delete(id); }
    }
    for (const [id, w] of want) {
      const cur = ly.markers.get(id);
      if (!cur) {
        const mk = L.circleMarker([w.lat, w.lon], w.style).bindTooltip(w.tip, { direction: 'top' }).addTo(m);
        ly.markers.set(id, { m: mk, key: w.key });
      } else if (cur.key !== w.key) {
        cur.m.setStyle(w.style).setRadius(w.style.radius!).setTooltipContent(w.tip);
        if (w.key !== 'n') cur.m.bringToFront();
        cur.key = w.key;
      }
    }
  }, [status.nearby, status.candidates]);

  // نقاط اختيار المحاكاة
  useEffect(() => {
    const ly = layers.current;
    if (!ly) return;
    ly.picks.clearLayers();
    const mk = (p: LatLon, label: string) =>
      L.marker([p.lat, p.lon], {
        icon: L.divIcon({ className: '', html: `<div style="background:#0A5F41;color:#fff;font:600 12px sans-serif;padding:2px 8px;border-radius:6px;white-space:nowrap;transform:translate(-50%,-120%)">${label}</div>`, iconSize: [0, 0] }),
        interactive: false,
      }).addTo(ly.picks);
    if (picked.from) mk(picked.from, 'البداية');
    if (picked.to) mk(picked.to, 'الوجهة');
  }, [picked.from, picked.to]);

  return (
    <div className="map-wrap">
      <div ref={el} className="map" dir="ltr" role="region" aria-label="الخريطة" />
      {picking && <div className="map-hint">اضغط على الخريطة لتحديد {picking === 'from' ? 'البداية' : 'الوجهة'}</div>}
      {!picking && !follow && status.position && (
        <button className="map-btn" onClick={() => setFollow(true)}>تتبّع موقعي</button>
      )}
    </div>
  );
}
