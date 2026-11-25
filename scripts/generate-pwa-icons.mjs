import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const COLORS = {
  background: [11, 16, 32, 255],
  border: [184, 243, 107, 255],
  glyph: [234, 243, 223, 255]
};
const POLYGON = [
  [126, 366], [126, 146], [184, 146], [256, 258], [328, 146],
  [386, 146], [386, 366], [324, 366], [324, 247], [256, 348],
  [188, 247], [188, 366]
];

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersects = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function insideRoundedRect(x, y, left, top, width, height, radius) {
  const cx = Math.max(left + radius, Math.min(x, left + width - radius));
  const cy = Math.max(top + radius, Math.min(y, top + height - radius));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function renderPng(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const scale = size / 512;
  for (let y = 0; y < size; y++) {
    const rowOffset = y * (size * 4 + 1);
    raw[rowOffset] = 0;
    for (let x = 0; x < size; x++) {
      const sx = (x + 0.5) / scale;
      const sy = (y + 0.5) / scale;
      let color = COLORS.background;
      const outer = insideRoundedRect(sx, sy, 42, 42, 428, 428, 88);
      const inner = insideRoundedRect(sx, sy, 52, 52, 408, 408, 78);
      if (outer && !inner) color = COLORS.border;
      if (insidePolygon(sx, sy, POLYGON)) color = COLORS.glyph;
      const dx = sx - 390;
      const dy = sy - 122;
      if (dx * dx + dy * dy <= 24 * 24) color = COLORS.border;
      const offset = rowOffset + 1 + x * 4;
      raw.set(color, offset);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

await mkdir("public", { recursive: true });
for (const size of [180, 192, 512]) {
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  await writeFile(`public/${name}`, renderPng(size));
}
