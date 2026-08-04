// Genera le icone PWA (192, 512, apple-touch-icon 180) da un SVG semplice:
// sfondo teal (colore "tappa" della palette app) + pin bianco.
// Uso: node generate-icons.mjs

import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve(import.meta.dirname, "../app/public");
mkdirSync(OUT_DIR, { recursive: true });

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0f9d8b"/>
  <path
    fill="#ffffff"
    d="M256 96c-70.7 0-128 57.3-128 128 0 96 128 224 128 224s128-128 128-224c0-70.7-57.3-128-128-128zm0 176a48 48 0 1 1 0-96 48 48 0 0 1 0 96z"
  />
</svg>
`.trim();

const targets = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
];

for (const { file, size } of targets) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(OUT_DIR, file));
  console.log(`Scritto ${file} (${size}x${size})`);
}

writeFileSync(path.join(OUT_DIR, "favicon.svg"), svg);
console.log("Scritto favicon.svg");
