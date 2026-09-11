// يرسم أيقونات PNG للتطبيق (بدون مكتبات) بنفس تصميم public/icons/icon.svg
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const GREEN = [10, 95, 65];
const EDGE = [233, 243, 238];
const WHITE = [255, 255, 255];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const sdRoundRect = (x, y, cx, cy, hw, hh, r) => {
  const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const sdSegment = (x, y, ax, ay, bx, by) => {
  const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay;
  const h = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - dx * h, py - dy * h);
};

/** يرجع لون البكسل في إحداثيات 512 */
function shade(x, y, { rounded, scale }) {
  // نصغر المحتوى حول المركز للأيقونة القابلة للقص
  const u = 256 + (x - 256) / scale, v = 256 + (y - 256) / scale;
  const bg = rounded ? sdRoundRect(x, y, 256, 256, 256, 256, 112) <= 0 : true;
  if (!bg) return null;
  const sw = 17;
  const white =
    Math.abs(Math.hypot(u - 256, v - 256) - 150) <= sw ||
    Math.abs(Math.hypot(u - 256, v - 256) - 40) <= sw ||
    sdSegment(u, v, 256, 296, 256, 406) <= sw ||
    sdSegment(u, v, 218, 244, 112, 216) <= sw ||
    sdSegment(u, v, 294, 244, 400, 216) <= sw;
  if (white) return WHITE;
  const edge = rounded && Math.abs(sdRoundRect(x, y, 256, 256, 228, 228, 90)) <= 7;
  return edge ? EDGE : GREEN;
}

function render(size, opts) {
  const buf = Buffer.alloc(size * size * 4);
  const ss = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const x = ((px + (sx + 0.5) / ss) / size) * 512;
        const y = ((py + (sy + 0.5) / ss) / size) * 512;
        const c = shade(x, y, opts);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
      }
      const i = (py * size + px) * 4;
      const n = ss * ss;
      buf[i] = a ? Math.round(r / a) : 0;
      buf[i + 1] = a ? Math.round(g / a) : 0;
      buf[i + 2] = a ? Math.round(b / a) : 0;
      buf[i + 3] = Math.round((a / n) * 255);
    }
  }
  return png(size, buf);
}

const out = 'public/icons';
writeFileSync(`${out}/icon-192.png`, render(192, { rounded: true, scale: 1 }));
writeFileSync(`${out}/icon-512.png`, render(512, { rounded: true, scale: 1 }));
writeFileSync(`${out}/icon-maskable-512.png`, render(512, { rounded: false, scale: 0.78 }));
writeFileSync(`${out}/apple-touch-icon.png`, render(180, { rounded: false, scale: 0.9 }));
console.log('icons written');
