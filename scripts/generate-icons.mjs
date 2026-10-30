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

for (const { file, size, scale } of icons) {
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
  const buffer = Buffer.from(await image.arrayBuffer());
  await writeFile(new URL(`../public/icons/${file}`, import.meta.url), buffer);
  console.log(`✓ ${file}`);
}

await writeFile(new URL("../src/app/icon.svg", import.meta.url), hanger(1).trim().replace(
  "<g",
  `<rect width="100" height="100" rx="22" fill="${BACKGROUND}"/><g`,
));
console.log("✓ src/app/icon.svg");
