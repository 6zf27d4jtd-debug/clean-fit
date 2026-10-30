// Pulizia dello scontorno, indipendente dal motore: tiene il capo ed elimina pezzi staccati e linee sottili
// (gancio della gruccia, fili, bordi del letto). Lavora sulla trasparenza, in place, senza librerie.

export type CleanupStats = {
  /** Pezzi separati trovati dopo aver tolto le linee sottili. */
  pieces: number;
  /** Pezzi tenuti: il più grande più quelli di dimensione simile (es. le due scarpe). */
  keptPieces: number;
  /** Percentuale dell'area visibile eliminata. */
  removedPercent: number;
  ms: number;
};

/** Un pezzo si tiene se è grande almeno questa frazione del più grande (le scarpe sono due pezzi). */
const KEEP_RATIO = 0.2;

export function cleanCutout(canvas: HTMLCanvasElement): CleanupStats {
  const ctx = canvas.getContext("2d")!;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const stats = cleanPixels(image.data, image.width, image.height);
  if (stats.removedPercent > 0) ctx.putImageData(image, 0, 0);
  return stats;
}

/** Come `cleanCutout`, sui pixel RGBA: modifica solo la trasparenza. */
export function cleanPixels(data: Uint8ClampedArray, w: number, h: number): CleanupStats {
  const start = performance.now();
  const n = w * h;

  const solid = new Uint8Array(n);
  let visible = 0;
  for (let i = 0; i < n; i++) {
    const alpha = data[i * 4 + 3];
    if (alpha >= 128) solid[i] = 1;
    if (alpha > 0) visible++;
  }

  // Apertura (erosione + dilatazione): spariscono le linee più sottili di ~2r pixel. r = 3 a 1024px.
  const r = Math.max(1, Math.round(Math.max(w, h) / 340));
  const opened = dilate(erode(solid, w, h, r), w, h, r);

  const { labels, sizes } = components(opened, w, h);
  const largest = sizes.reduce((max, size) => Math.max(max, size), 0);
  if (largest === 0) return { pieces: 0, keptPieces: 0, removedPercent: 0, ms: performance.now() - start };

  const keepLabel = sizes.map((size) => size >= largest * KEEP_RATIO);
  const kept = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (labels[i] && keepLabel[labels[i] - 1]) kept[i] = 1;

  // Ridilatando i pezzi tenuti si recuperano i bordi del capo (sfumati compresi) tolti dall'apertura.
  const area = dilate(kept, w, h, r + 1);
  let removed = 0;
  for (let i = 0; i < n; i++) {
    if (!area[i] && data[i * 4 + 3] > 0) {
      data[i * 4 + 3] = 0;
      removed++;
    }
  }

  return {
    pieces: sizes.length,
    keptPieces: keepLabel.filter(Boolean).length,
    removedPercent: visible ? (removed / visible) * 100 : 0,
    ms: performance.now() - start,
  };
}

function erode(src: Uint8Array, w: number, h: number, r: number) {
  return pass(pass(src, w, h, r, true, true), w, h, r, false, true);
}

function dilate(src: Uint8Array, w: number, h: number, r: number) {
  return pass(pass(src, w, h, r, true, false), w, h, r, false, false);
}

/** Erosione o dilatazione con un segmento lungo 2r+1, in orizzontale o in verticale (finestra scorrevole). */
function pass(src: Uint8Array, w: number, h: number, r: number, horizontal: boolean, erosion: boolean) {
  const out = new Uint8Array(src.length);
  const lines = horizontal ? h : w;
  const length = horizontal ? w : h;
  const step = horizontal ? 1 : w;
  const full = 2 * r + 1;
  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * w : line;
    let count = 0;
    for (let k = 0; k <= r && k < length; k++) count += src[base + k * step];
    for (let i = 0; i < length; i++) {
      // Fuori dall'immagine conta come vuoto: vicino ai bordi l'erosione toglie, la dilatazione no.
      out[base + i * step] = erosion ? (count === full ? 1 : 0) : count > 0 ? 1 : 0;
      if (i + r + 1 < length) count += src[base + (i + r + 1) * step];
      if (i - r >= 0) count -= src[base + (i - r) * step];
    }
  }
  return out;
}

/** Etichetta i pezzi connessi (8 vicini). labels[i] = numero del pezzo (da 1), sizes[k] = pixel del pezzo k+1. */
function components(mask: Uint8Array, w: number, h: number) {
  const labels = new Int32Array(mask.length);
  const sizes: number[] = [];
  const stack = new Int32Array(mask.length);
  for (let startIndex = 0; startIndex < mask.length; startIndex++) {
    if (!mask[startIndex] || labels[startIndex]) continue;
    const label = sizes.length + 1;
    let size = 0;
    let top = 0;
    stack[top++] = startIndex;
    labels[startIndex] = label;
    while (top) {
      const i = stack[--top];
      size++;
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w || (dx === 0 && dy === 0)) continue;
          const j = ny * w + nx;
          if (mask[j] && !labels[j]) {
            labels[j] = label;
            stack[top++] = j;
          }
        }
      }
    }
    sizes.push(size);
  }
  return { labels, sizes };
}
