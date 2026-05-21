#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, crc32 } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", "public", "icons");
mkdirSync(OUT_DIR, { recursive: true });

const BG = [15, 23, 42, 255];
const FG = [248, 250, 252, 255];
const ACCENT = [56, 189, 248, 255];

function makePng(size, { maskable = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  const safe = maskable ? Math.floor(size * 0.1) : 0;
  const boxPadding = Math.floor(size * (maskable ? 0.28 : 0.2));
  const boxLeft = boxPadding;
  const boxRight = size - boxPadding;
  const boxTop = Math.floor(size * (maskable ? 0.34 : 0.28));
  const boxBottom = size - boxPadding;
  const lidTop = Math.floor(size * (maskable ? 0.26 : 0.2));
  const stroke = Math.max(1, Math.floor(size * 0.025));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      let color = BG;

      if (maskable && (x < safe || x >= size - safe || y < safe || y >= size - safe)) {
        color = BG;
      } else if (x >= boxLeft && x < boxRight && y >= boxTop && y < boxBottom) {
        const onVertEdge = x < boxLeft + stroke || x >= boxRight - stroke;
        const onHorEdge = y < boxTop + stroke || y >= boxBottom - stroke;
        color = onVertEdge || onHorEdge ? ACCENT : FG;
      } else if (x >= boxLeft - stroke && x < boxRight + stroke && y >= lidTop && y < boxTop) {
        color = ACCENT;
      }

      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = color[3];
    }
  }

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const compressed = deflateSync(raw, { level: 9 });

  const chunks = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr(size, size)),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ];
  return Buffer.concat(chunks);
}

function ihdr(w, h) {
  const b = Buffer.alloc(13);
  b.writeUInt32BE(w, 0);
  b.writeUInt32BE(h, 4);
  b[8] = 8;
  b[9] = 6;
  b[10] = 0;
  b[11] = 0;
  b[12] = 0;
  return b;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const targets = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-384.png", size: 384 },
  { name: "icon-512.png", size: 512 },
  { name: "icon-maskable-512.png", size: 512, maskable: true },
  { name: "apple-touch-icon.png", size: 180 },
];

for (const t of targets) {
  const png = makePng(t.size, { maskable: t.maskable });
  writeFileSync(resolve(OUT_DIR, t.name), png);
  console.log(`generated ${t.name} (${t.size}x${t.size})`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0f172a"/>
  <rect x="100" y="140" width="312" height="40" fill="#38bdf8"/>
  <rect x="104" y="180" width="304" height="232" fill="#f8fafc"/>
  <rect x="104" y="180" width="304" height="12" fill="#38bdf8"/>
  <rect x="104" y="400" width="304" height="12" fill="#38bdf8"/>
  <rect x="104" y="180" width="12" height="232" fill="#38bdf8"/>
  <rect x="396" y="180" width="12" height="232" fill="#38bdf8"/>
</svg>
`;
writeFileSync(resolve(OUT_DIR, "icon.svg"), svg, "utf8");
console.log("generated icon.svg");
