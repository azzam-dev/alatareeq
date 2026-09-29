/**
 * خريطة «تفاصيل المشوار» (مؤقت للاختبار): صفحة Leaflet تنعرض في WebView (الجوال) أو iframe (المتصفح)، والشاشة ترسل لها
 * `{ type: 'render', data: MapData, fit }` و`{ type: 'focus', lat, lon }` عن طريق `window.handle`.
 */
export const TRIP_MAP_HTML = `<!doctype html>
<html lang="ar"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<style>
  html, body, #map { margin: 0; height: 100%; }
  body { font: 14px/1.5 -apple-system, system-ui, "Segoe UI", Tahoma, sans-serif; }
  .leaflet-popup-content, .leaflet-tooltip { direction: rtl; text-align: right; white-space: pre-line; }
  .pin { width: 28px; height: 28px; border-radius: 50%; background: #fff; border: 3px solid #9AA39F; display: flex;
    align-items: center; justify-content: center; font-size: 14px; position: relative; box-shadow: 0 1px 4px rgba(0,0,0,.3); }
  .pin.other { opacity: .45; transform: scale(.8); }
  .pin i { position: absolute; top: -7px; right: -7px; font-style: normal; font-size: 10px; font-weight: 700; width: 15px; height: 15px;
    border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; }
  .me { width: 14px; height: 14px; border-radius: 50%; background: #0F6B4F; border: 3px solid #fff; box-shadow: 0 0 0 2px #0F6B4F; }
  .bell { font-size: 19px; filter: drop-shadow(0 1px 2px rgba(0,0,0,.4)); }
  #bar { position: absolute; z-index: 800; left: 8px; right: 8px; bottom: 8px; background: #fff; border-radius: 10px; padding: 6px 10px;
    box-shadow: 0 2px 8px rgba(0,0,0,.2); display: none; gap: 8px; align-items: center; direction: rtl; }
  #bar input { flex: 1; }
  #key { position: absolute; z-index: 800; top: 8px; right: 8px; background: #fff; border-radius: 10px; padding: 4px 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,.2); direction: rtl; font-size: 12px; }
  #key summary { cursor: pointer; font-weight: 600; }
  #key div { display: flex; gap: 5px; align-items: center; }
  .sw { width: 12px; height: 12px; border-radius: 50%; border: 3px solid; display: inline-block; }
</style></head>
<body>
<div id="map"></div>
<details id="key"><summary>الألوان</summary>
  <div><span class="sw" style="border-color:#1E8A5A"></span>نبّهناك</div>
  <div><span class="sw" style="border-color:#C0392B"></span>ما نبّهناك</div>
  <div><span class="sw" style="border-color:#C98A12"></span>يناسبك وما دخل النطاق</div>
  <div><span class="sw" style="border-color:#9AA39F"></span>ما يخصك</div>
  <div><b style="color:#2F6FD6">✓</b> مسجّل قبل · <b style="color:#E07B14">★</b> جديد</div>
  <div>مربعات: <span style="color:#2E9E6A">الجوال</span> · <span style="color:#2F6FD6">قاعدة البيانات</span> · <span style="color:#E07B14">TomTom</span></div>
</details>
<div id="bar"><input id="time" type="range" min="0" value="0" aria-label="الوقت"><span id="tt"></span></div>
<script>
var map = L.map('map', { zoomControl: false }).setView([24.71, 46.67], 12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
var base = L.layerGroup().addTo(map), live = L.layerGroup().addTo(map), data = null, lastFit = null;
var MARK = { alerted: '#1E8A5A', skipped: '#C0392B', matched: '#C98A12', other: '#9AA39F' };
var SRC = { phone: '#2E9E6A', db: '#2F6FD6', new: '#E07B14', none: '#9AA39F' };
var TL = 0.0135, TN = 0.015;
function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
function dest(lat, lon, deg, m) {
  var r = Math.PI / 180, d = m / 6371000, b = deg * r, p1 = lat * r, l1 = lon * r;
  var p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  var l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [p2 / r, l2 / r];
}
function clock(t) { return new Date(t).toLocaleTimeString('ar-SA-u-nu-latn-ca-gregory', { hour: 'numeric', minute: '2-digit' }); }
function drawAt(i) {
  live.clearLayers();
  var p = data && data.path[i];
  if (!p) return;
  L.circle([p[0], p[1]], { radius: data.ringM, color: '#0F6B4F', weight: 1.5, fillOpacity: 0.04, dashArray: '6 6' }).addTo(live);
  if (p[2] !== null) {
    var cone = [[p[0], p[1]]];
    for (var d = -data.aheadDeg; d <= data.aheadDeg; d += 5) cone.push(dest(p[0], p[1], p[2] + d, data.ringM));
    L.polygon(cone, { color: '#0F6B4F', weight: 1, fillOpacity: 0.12 }).addTo(live);
  }
  L.marker([p[0], p[1]], { icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }), zIndexOffset: 2000 }).addTo(live);
  document.getElementById('tt').textContent = clock(p[3]);
}
function render(d, fit) {
  var range = document.getElementById('time');
  var atEnd = !data || Number(range.value) >= data.path.length - 1;
  data = d;
  base.clearLayers();
  d.tiles.forEach(function (t) {
    var rc = t.id.split(':').map(Number);
    L.rectangle([[rc[0] * TL, rc[1] * TN], [(rc[0] + 1) * TL, (rc[1] + 1) * TN]], { color: SRC[t.src], weight: 1, fillOpacity: 0.1, interactive: false }).addTo(base);
  });
  if (d.path.length) L.polyline(d.path.map(function (p) { return [p[0], p[1]]; }), { color: '#0F6B4F', weight: 5, opacity: 0.85 }).addTo(base);
  d.places.forEach(function (p) {
    var badge = p.isNew === null ? '' : p.isNew ? '<i style="background:#E07B14">★</i>' : '<i style="background:#2F6FD6">✓</i>';
    var icon = L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14],
      html: '<div class="pin ' + p.mark + '" style="border-color:' + MARK[p.mark] + '">' + p.emoji + badge + '</div>' });
    L.marker([p.lat, p.lon], { icon: icon, zIndexOffset: p.mark === 'other' ? 0 : 500 })
      .bindPopup('<b>' + esc(p.name) + '</b>\\n' + esc(p.info)).addTo(base);
  });
  d.bells.forEach(function (b) {
    L.marker([b.lat, b.lon], { icon: L.divIcon({ className: '', html: '<div class="bell">🔔</div>', iconSize: [20, 20], iconAnchor: [10, 10] }), zIndexOffset: 1000 })
      .bindPopup(esc(b.title)).addTo(base);
  });
  var bar = document.getElementById('bar');
  bar.style.display = d.path.length ? 'flex' : 'none';
  range.max = Math.max(0, d.path.length - 1);
  // المشوار الحالي يمشي معك، إلا لو رجعت بالشريط
  if (fit || (d.live && atEnd)) range.value = d.live ? range.max : 0;
  drawAt(Number(range.value));
  if (fit) {
    // المسار والمحلات اللي تخصك مع بعض، عشان أول المشوار (مسار قصير) ما تقرّب زيادة
    lastFit = d.path.map(function (p) { return [p[0], p[1]]; })
      .concat(d.places.filter(function (p) { return p.mark !== 'other'; }).map(function (p) { return [p.lat, p.lon]; }));
    doFit();
  }
}
function doFit() {
  map.invalidateSize();
  if (!lastFit || !lastFit.length || !map.getSize().x) return;
  map.fitBounds(L.latLngBounds(lastFit), { padding: [24, 24], maxZoom: 15 });
}
// الخريطة ممكن تنرسم ومقاسها صفر (الشاشة للحين ما بانت)، فنعيد التقريب أول ما يصير لها مقاس
new ResizeObserver(doFit).observe(document.getElementById('map'));
document.getElementById('time').oninput = function (e) { drawAt(Number(e.target.value)); };
window.handle = function (m) {
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return; } }
  if (!m || !m.type) return;
  if (m.type === 'render') render(m.data, m.fit);
  if (m.type === 'focus') {
    map.setView([m.lat, m.lon], Math.max(map.getZoom(), 16));
    base.eachLayer(function (l) {
      if (l.getLatLng && l.getLatLng().lat === m.lat && l.getLatLng().lng === m.lon && l.openPopup) l.openPopup();
    });
  }
};
window.addEventListener('message', function (e) { window.handle(e.data); });
</script>
</body></html>`;
