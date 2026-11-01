// Percorso di una foto, comune ad Aggiungi e all'import multiplo:
// ritaglio → riduzione a 1024px → scontorno → pulizia → (gomma, facoltativa) → ritocco → JPEG.

import { removeBackground, type RemovalEvent } from "@/lib/background-removal";
import { cleanCutout } from "@/lib/cutout-cleanup";
import { canvasToBlob, compressJpeg, downscale, FULL_CROP, type CropRect } from "@/lib/photo";
import { retouch } from "@/lib/retouch";

/** cutout: scontornato trasparente (PNG), base per la gomma; final: foto ritoccata e compressa (JPEG), da salvare. */
export type ProcessedPhoto = { cutout: Blob; final: Blob };

/** Scontorna, pulisce e ritocca una foto. `onProgress` riceve un testo breve da mostrare all'utente. */
export async function processPhoto(
  file: File,
  crop: CropRect = FULL_CROP,
  onProgress?: (text: string) => void,
): Promise<ProcessedPhoto> {
  const photo = await downscale(file, crop);
  const result = await removeBackground(photo, undefined, (event) => {
    const text = progressText(event);
    if (text) onProgress?.(text);
  });
  cleanCutout(result);
  const cutout = await canvasToBlob(result);
  return { cutout, final: await finishCutout(cutout) };
}

/** Ritocco automatico (luce, fondo avorio, ombra) e compressione in JPEG; si rifà dopo la gomma. */
export async function finishCutout(cutout: Blob) {
  const { canvas } = await retouch(cutout);
  return compressJpeg(canvas);
}

/** Miniatura leggera di una foto della galleria: evita di decodificare decine di foto intere nella pagina. */
export async function makeThumbnail(file: File, maxSide = 240) {
  return canvasToBlob(await downscale(file, FULL_CROP, maxSide), "image/jpeg", 0.7);
}

function progressText(event: RemovalEvent) {
  if (event.phase === "download" && event.type === "progress") return `Primo avvio: scarico il modello\n${event.detail}`;
  if (event.phase === "caricamento" && event.type === "start") return "Preparo il modello…";
  if (event.phase === "scontorno" && event.type === "start") return "Scontorno…";
  return undefined;
}
