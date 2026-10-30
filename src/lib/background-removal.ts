// Unico punto dell'app che conosce il motore di scontorno: per cambiarlo basta modificare questo file.
// Motore attuale: @imgly/background-removal (modelli ISNet). BiRefNet_lite scartato: bad_alloc su WebGPU e WASM.

import type { Config } from "@imgly/background-removal";

/** Il modello lavora sempre a 1024×1024 (la foto viene ridimensionata dentro la libreria). */
export const MODEL_INPUT_SIZE = 1024;

export type Device = "webgpu" | "wasm";
export type Model = "isnet_quint8" | "isnet_fp16";
export type Engine = { device: Device; model: Model };

export type Phase = "download" | "caricamento" | "preparazione" | "scontorno";

export type RemovalEvent =
  | { phase: Phase; type: "start" }
  | { phase: Phase; type: "progress"; detail: string }
  | { phase: Phase; type: "end"; detail?: string }
  | { phase: Phase; type: "error"; message: string };

// imgly tiene in cache una sessione per ogni configurazione e non le libera: le contiamo per saperlo.
const loadedEngines = new Set<string>();

/** Combinazioni già caricate in memoria in questa pagina. */
export function loadedEngineCount() {
  return loadedEngines.size;
}

// imgly memorizza la configurazione della prima chiamata (callback compreso): passiamo sempre lo stesso
// callback, che inoltra gli eventi all'ascoltatore del momento.
let listener: Config["progress"];
const forward: Config["progress"] = (step, current, total) => listener?.(step, current, total);

function config(engine: Engine): Config {
  return {
    model: engine.model,
    // Se WebGPU non c'è, imgly passa da solo a WASM: chi chiama deve verificarlo prima.
    device: engine.device === "webgpu" ? "gpu" : "cpu",
    output: { format: "image/png" },
    progress: forward,
  };
}

/**
 * Rimuove lo sfondo da una foto già ridotta. Restituisce un canvas con trasparenza, alle stesse dimensioni.
 */
export async function removeBackground(
  image: HTMLCanvasElement,
  engine: Engine,
  emit: (event: RemovalEvent) => void = () => {},
): Promise<HTMLCanvasElement> {
  let phase: Phase = "download";
  const track = (event: RemovalEvent) => {
    phase = event.phase;
    emit(event);
  };

  try {
    const imgly = await import("@imgly/background-removal");
    const key = `${engine.device}-${engine.model}`;

    // 1. Download (modello + runtime ONNX) e creazione della sessione, solo la prima volta per combinazione
    if (loadedEngines.has(key)) {
      track({ phase: "download", type: "end", detail: "già in memoria" });
      track({ phase: "caricamento", type: "end", detail: "già in memoria" });
    } else {
      const downloads = new Map<string, [number, number]>();
      let downloading = true;
      track({ phase: "download", type: "start" });
      listener = (step, current, total) => {
        if (!step.startsWith("fetch:")) return;
        downloads.set(step, [current, total]);
        if (!downloading) return;
        let loadedBytes = 0;
        let totalBytes = 0;
        for (const [c, t] of downloads.values()) {
          loadedBytes += c;
          totalBytes += t;
        }
        track({ phase: "download", type: "progress", detail: `${mb(loadedBytes)} / ${mb(totalBytes)} MB` });
        // Il runtime (.mjs) è l'ultimo file scaricato: dopo comincia la creazione della sessione
        if (step.endsWith(".mjs") && current >= total) {
          downloading = false;
          track({ phase: "download", type: "end", detail: `${mb(totalBytes)} MB` });
          track({ phase: "caricamento", type: "start" });
        }
      };
      await imgly.preload(config(engine));
      if (downloading) track({ phase: "download", type: "end" });
      track({ phase: "caricamento", type: "end" });
      loadedEngines.add(key);
    }

    // 2. Scontorno: decodifica (preparazione) → inferenza → composizione con la maschera
    const pixels = image.getContext("2d")!.getImageData(0, 0, image.width, image.height);
    listener = (step) => {
      if (step === "compute:decode") track({ phase: "preparazione", type: "start" });
      if (step === "compute:inference") {
        track({ phase: "preparazione", type: "end", detail: `ImageData ${pixels.width}×${pixels.height}` });
        track({ phase: "scontorno", type: "start" });
      }
    };
    const blob = await imgly.removeBackground(pixels, config(engine));

    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
    track({ phase: "scontorno", type: "end", detail: `PNG ${mb(blob.size, 1)} MB` });
    return canvas;
  } catch (error) {
    listener = undefined;
    emit({ phase, type: "error", message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

function mb(bytes: number, digits = 0) {
  return (bytes / 1024 / 1024).toFixed(digits);
}
