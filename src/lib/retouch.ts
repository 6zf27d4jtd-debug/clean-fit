// Ritocco automatico dopo scontorno e pulizia: stesso stile per tutte le foto.
// Luminosità e contrasto calcolati solo sul capo, poi capo centrato su fondo chiaro con ombra leggera.

/** Formato finale delle foto: verticale 3:4, come le schede dell'armadio. */
export const RETOUCH_WIDTH = 900;
export const RETOUCH_HEIGHT = 1200;
export const RETOUCH_BACKGROUND = "#f3f2ee";
/** Spazio libero attorno al capo, in frazione del lato. */
const MARGIN = 0.09;

/** Limiti della correzione: le foto in casa sono spesso scure, quindi si schiarisce più di quanto si scurisca. */
const MAX_BLACK_POINT = 12;
const MIN_WHITE_POINT = 190;
const CONTRAST = 1.06;

export type RetouchStats = { blackPoint: number; whitePoint: number; ms: number };

export async function retouch(cutout: Blob): Promise<{ canvas: HTMLCanvasElement; stats: RetouchStats }> {
  const start = performance.now();
  const bitmap = await createImageBitmap(cutout);
  const source = document.createElement("canvas");
  source.width = bitmap.width;
  source.height = bitmap.height;
  const sourceCtx = source.getContext("2d")!;
  sourceCtx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const image = sourceCtx.getImageData(0, 0, source.width, source.height);
  const { box, blackPoint, whitePoint } = adjustPixels(image.data, image.width, image.height);
  sourceCtx.putImageData(image, 0, 0);

  const canvas = document.createElement("canvas");
  canvas.width = RETOUCH_WIDTH;
  canvas.height = RETOUCH_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = RETOUCH_BACKGROUND;
  ctx.fillRect(0, 0, RETOUCH_WIDTH, RETOUCH_HEIGHT);

  if (box) {
    const availableWidth = RETOUCH_WIDTH * (1 - 2 * MARGIN);
    const availableHeight = RETOUCH_HEIGHT * (1 - 2 * MARGIN);
    const scale = Math.min(availableWidth / box.width, availableHeight / box.height);
    const width = box.width * scale;
    const height = box.height * scale;
    ctx.imageSmoothingQuality = "high";
    // Ombra morbida tutt'attorno, un po' più marcata in basso: capo appoggiato, visto dall'alto
    ctx.shadowColor = "rgba(0, 0, 0, 0.16)";
    ctx.shadowBlur = RETOUCH_WIDTH * 0.03;
    ctx.shadowOffsetY = RETOUCH_WIDTH * 0.012;
    ctx.drawImage(
      source,
      box.x,
      box.y,
      box.width,
      box.height,
      (RETOUCH_WIDTH - width) / 2,
      (RETOUCH_HEIGHT - height) / 2,
      width,
      height,
    );
  }

  return { canvas, stats: { blackPoint, whitePoint, ms: performance.now() - start } };
}

/**
 * Corregge luminosità e contrasto dei pixel del capo (in place) e trova il riquadro che lo contiene.
 * Stiramento dei livelli tra 1° e 99° percentile della luminosità, con limiti, più un leggero contrasto.
 */
export function adjustPixels(data: Uint8ClampedArray, w: number, h: number) {
  const histogram = new Uint32Array(256);
  let count = 0;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const alpha = data[i + 3];
      if (alpha <= 10) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (alpha >= 128) {
        histogram[Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])]++;
        count++;
      }
    }
  }
  if (maxX < 0 || !count) return { box: null, blackPoint: 0, whitePoint: 255 };

  const low = percentile(histogram, count, 0.01);
  const high = percentile(histogram, count, 0.99);
  const blackPoint = Math.min(low, MAX_BLACK_POINT);
  const whitePoint = Math.max(high, MIN_WHITE_POINT);

  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const stretched = (v - blackPoint) / (whitePoint - blackPoint);
    lut[v] = Math.round((0.5 + (stretched - 0.5) * CONTRAST) * 255);
  }
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }

  return {
    box: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    blackPoint,
    whitePoint,
  };
}

function percentile(histogram: Uint32Array, count: number, fraction: number) {
  const target = count * fraction;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += histogram[v];
    if (seen >= target) return v;
  }
  return 255;
}
