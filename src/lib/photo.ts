/** Lato lungo massimo delle foto prima dello scontorno: il modello lavora comunque a 1024×1024. */
export const MAX_PHOTO_SIDE = 1024;

/** Riquadro di ritaglio in frazioni della foto (0–1), così non dipende dalla risoluzione. */
export type CropRect = { x: number; y: number; width: number; height: number };

export const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };

/**
 * Ritaglia la foto (a piena risoluzione, orientamento EXIF già applicato) e la riduce a `maxSide`
 * sul lato lungo. Restituisce un canvas.
 */
export async function downscale(file: Blob, crop: CropRect = FULL_CROP, maxSide = MAX_PHOTO_SIDE) {
  const bitmap = await createImageBitmap(file);
  const sx = Math.round(crop.x * bitmap.width);
  const sy = Math.round(crop.y * bitmap.height);
  const sw = Math.max(1, Math.round(crop.width * bitmap.width));
  const sh = Math.max(1, Math.round(crop.height * bitmap.height));
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext("2d")!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Conversione della foto non riuscita"))), type, quality),
  );
}
