/** Lato lungo massimo delle foto prima dello scontorno: il modello lavora comunque a 1024×1024. */
export const MAX_PHOTO_SIDE = 1024;

/** Riduce la foto a `maxSide` sul lato lungo (orientamento EXIF già applicato) e la restituisce come canvas. */
export async function downscale(file: Blob, maxSide = MAX_PHOTO_SIDE) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Conversione della foto non riuscita"))), type, quality),
  );
}
