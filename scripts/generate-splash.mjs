// Genera le immagini di avvio di iOS (apple-touch-startup-image) in public/splash/, chiare e scure, una per misura
// di schermo (src/lib/splash-screens.json). Stesso disegno della schermata di caricamento dell'app (SplashMark in
// src/components/auth-provider.tsx): gruccia e scritta "Clean Fit" al centro, così il passaggio non si nota.
// Il font è Geist, incluso in next/og: niente download. Uso: node scripts/generate-splash.mjs
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createElement as h } from "react";
import { ImageResponse } from "next/og.js";

const screens = JSON.parse(await readFile(new URL("../src/lib/splash-screens.json", import.meta.url), "utf8"));

// Colori di --background e --foreground in globals.css
const THEMES = {
  light: { background: "#fafaf8", ink: "#111111" },
  dark: { background: "#0e0e0f", ink: "#f2f2f0" },
};

// Misure in punti, come in SplashMark: gruccia 96, scritta 30, spazio 12
const MARK = 96;
const TEXT = 30;
const GAP = 12;

const hanger = (ink) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g fill="none" stroke="${ink}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M44 27 A6 6 0 1 1 50 33 L50 38" />
    <path d="M50 38 L18 61 Q15 64 19 64 L81 64 Q85 64 82 61 Z" />
  </g>
</svg>`;

await mkdir(new URL("../public/splash/", import.meta.url), { recursive: true });

for (const { width, height, ratio } of screens) {
  for (const [theme, { background, ink }] of Object.entries(THEMES)) {
    const svg = `data:image/svg+xml;base64,${Buffer.from(hanger(ink)).toString("base64")}`;
    const image = new ImageResponse(
      h(
        "div",
        {
          style: {
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background,
          },
        },
        h("img", { src: svg, width: MARK * ratio, height: MARK * ratio }),
        h(
          "div",
          { style: { marginTop: GAP * ratio, fontSize: TEXT * ratio, color: ink, letterSpacing: -0.02 * TEXT * ratio } },
          "Clean Fit",
        ),
      ),
      { width: width * ratio, height: height * ratio },
    );
    const file = `splash-${width * ratio}x${height * ratio}-${theme}.png`;
    await writeFile(new URL(`../public/splash/${file}`, import.meta.url), Buffer.from(await image.arrayBuffer()));
    console.log(`✓ ${file}`);
  }
}
