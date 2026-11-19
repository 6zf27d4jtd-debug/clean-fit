// Genera le icone PNG della PWA in public/icons/ a partire dall'SVG della gruccia.
// Uso: node scripts/generate-icons.mjs
import { writeFile, mkdir } from "node:fs/promises";
import { createElement as h } from "react";
import { ImageResponse } from "next/og.js";

const BACKGROUND = "#F4F1EC";
const INK = "#111111";

// Gruccia su una griglia 100x100, centrata nella zona sicura delle icone "maskable".
const hanger = (scale) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g transform="translate(50 50) scale(${scale}) translate(-50 -46)" fill="none" stroke="${INK}"
     stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M44 27 A6 6 0 1 1 50 33 L50 38" />
    <path d="M50 38 L18 61 Q15 64 19 64 L81 64 Q85 64 82 61 Z" />
  </g>
</svg>`;

const icons = [
  { file: "icon-192.png", size: 192, scale: 1 },
  { file: "icon-512.png", size: 512, scale: 1 },
  { file: "icon-maskable-512.png", size: 512, scale: 0.8 },
  { file: "apple-touch-icon.png", size: 180, scale: 0.9 },
];

await mkdir(new URL("../public/icons/", import.meta.url), { recursive: true });

/** PNG quadrato della gruccia su fondo avorio. */
async function renderPng(size, scale) {
  const svg = `data:image/svg+xml;base64,${Buffer.from(hanger(scale)).toString("base64")}`;
  const image = new ImageResponse(
    h(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          background: BACKGROUND,
        },
      },
      h("img", { src: svg, width: size, height: size }),
    ),
    { width: size, height: size },
  );
  return Buffer.from(await image.arrayBuffer());
}

for (const { file, size, scale } of icons) {
  await writeFile(new URL(`../public/icons/${file}`, import.meta.url), await renderPng(size, scale));
  console.log(`✓ ${file}`);
}

// favicon.ico per i browser che lo chiedono comunque (altrimenti 404): file ICO che contiene direttamente i PNG
const faviconSizes = [16, 32, 48];
const pngs = await Promise.all(faviconSizes.map((size) => renderPng(size, 1)));
const header = Buffer.alloc(6 + 16 * pngs.length);
header.writeUInt16LE(0, 0); // riservato
header.writeUInt16LE(1, 2); // tipo: icona
header.writeUInt16LE(pngs.length, 4);
let offset = header.length;
pngs.forEach((png, i) => {
  const entry = 6 + 16 * i;
  header.writeUInt8(faviconSizes[i], entry); // larghezza
  header.writeUInt8(faviconSizes[i], entry + 1); // altezza
  header.writeUInt16LE(1, entry + 4); // piani di colore
  header.writeUInt16LE(32, entry + 6); // bit per pixel
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
await writeFile(new URL("../src/app/favicon.ico", import.meta.url), Buffer.concat([header, ...pngs]));
console.log("✓ src/app/favicon.ico");

await writeFile(new URL("../src/app/icon.svg", import.meta.url), hanger(1).trim().replace(
  "<g",
  `<rect width="100" height="100" rx="22" fill="${BACKGROUND}"/><g`,
));
console.log("✓ src/app/icon.svg");
