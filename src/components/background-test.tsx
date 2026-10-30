"use client";

import { useEffect, useRef, useState } from "react";
import {
  defaultEngine,
  loadedEngineCount,
  MODEL_INPUT_SIZE,
  removeBackground,
  type Device,
  type Engine,
  type Model,
  type Phase,
  type RemovalEvent,
} from "@/lib/background-removal";

/** Lato lungo massimo della foto prima dell'elaborazione, come farà l'app vera. */
const MAX_SIDE = 1024;

const PHASES: { phase: Phase; label: string }[] = [
  { phase: "download", label: "Download modello" },
  { phase: "caricamento", label: "Caricamento modello" },
  { phase: "preparazione", label: "Preparazione input" },
  { phase: "scontorno", label: "Scontorno" },
];

type PhaseState = { state: "attesa" | "in corso" | "ok" | "errore"; start?: number; ms?: number; detail?: string };
type Phases = Record<Phase, PhaseState>;

type Run = { engine: Engine; loadMs: number; inferenceMs: number; size: string };

type Env = { secure: boolean; webgpu: boolean; webgpuText: string; isolated: boolean; threads: number };

const idlePhases = (): Phases => ({
  download: { state: "attesa" },
  caricamento: { state: "attesa" },
  preparazione: { state: "attesa" },
  scontorno: { state: "attesa" },
});

export function BackgroundTest() {
  const [env, setEnv] = useState<Env | null>(null);
  const [device, setDevice] = useState<Device>("webgpu");
  const [model, setModel] = useState<Model>("isnet_fp16");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  // Combinazione dell'ultima elaborazione (può differire dalla selezione attuale)
  const [current, setCurrent] = useState<Engine | null>(null);
  const [photoSize, setPhotoSize] = useState("");
  const [phases, setPhases] = useState<Phases>(idlePhases);
  const [error, setError] = useState<{ phase: Phase; message: string } | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [copied, setCopied] = useState(false);
  const [inMemory, setInMemory] = useState(0);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function detect() {
      let webgpu = false;
      let webgpuText = "non disponibile";
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
      if (gpu) {
        try {
          const adapter = await gpu.requestAdapter();
          webgpu = !!adapter;
          webgpuText = adapter ? (adapter.features.has("shader-f16") ? "sì, con shader-f16" : "sì, senza shader-f16") : "nessun adattatore";
        } catch {
          webgpuText = "errore adattatore";
        }
      }
      setEnv({
        secure: window.isSecureContext,
        webgpu,
        webgpuText,
        isolated: window.crossOriginIsolated,
        threads: navigator.hardwareConcurrency ?? 1,
      });
      // Selezione iniziale = motore che userà l'app
      const engine = await defaultEngine();
      setDevice(engine.device);
      setModel(engine.model);
    }
    detect();
  }, []);

  function onEvent(event: RemovalEvent) {
    const now = performance.now();
    setPhases((prev) => {
      const p = prev[event.phase];
      switch (event.type) {
        case "start":
          return { ...prev, [event.phase]: { state: "in corso", start: now } };
        case "progress":
          return { ...prev, [event.phase]: { ...p, detail: event.detail } };
        case "end":
          return { ...prev, [event.phase]: { state: "ok", ms: p.start ? now - p.start : undefined, detail: event.detail ?? p.detail } };
        case "error":
          return { ...prev, [event.phase]: { ...p, state: "errore", ms: p.start ? now - p.start : undefined } };
      }
    });
    if (event.type === "error") setError({ phase: event.phase, message: event.message });
  }

  async function run() {
    if (!file) return;
    const engine = { device, model };
    setBusy(true);
    setError(null);
    setCopied(false);
    setCurrent(engine);
    setPhases(idlePhases());
    outputRef.current?.replaceChildren();

    try {
      const photo = await downscale(file);
      setPhotoSize(`${photo.width}×${photo.height}`);
      let loadStart = 0;
      let loadMs = 0;
      let inferenceStart = 0;
      const canvas = await removeBackground(photo, engine, (event) => {
        if (event.phase === "download" && event.type === "start") loadStart = performance.now();
        if (event.phase === "caricamento" && event.type === "end" && loadStart) loadMs = performance.now() - loadStart;
        if (event.phase === "scontorno" && event.type === "start") inferenceStart = performance.now();
        onEvent(event);
      });
      const inferenceMs = performance.now() - inferenceStart;
      canvas.className = "mx-auto max-h-[420px] w-auto max-w-full";
      outputRef.current?.replaceChildren(canvas);
      setRuns((prev) => [{ engine, loadMs, inferenceMs, size: `${canvas.width}×${canvas.height}` }, ...prev]);
    } catch (err) {
      console.error(err);
    } finally {
      setInMemory(loadedEngineCount());
      setBusy(false);
    }
  }

  function report() {
    const lines = [
      `Combinazione: ${current ? label(current) : "—"}`,
      `Browser: ${navigator.userAgent}`,
      `HTTPS: ${env?.secure ? "sì" : "no"} · WebGPU: ${env?.webgpuText} · WASM multi-thread: ${env?.isolated ? "sì" : "no"}`,
      `Foto ridotta: ${photoSize || "—"} → ingresso modello ${MODEL_INPUT_SIZE}×${MODEL_INPUT_SIZE}`,
      `Combinazioni in memoria: ${inMemory}`,
      ...PHASES.map(({ phase, label }) => `${label}: ${phaseText(phases[phase])}`),
      error ? `Errore (${error.phase}): ${error.message}` : "Nessun errore",
      ...runs.map((r) => `Prova ${label(r.engine)}: caricamento ${r.loadMs ? seconds(r.loadMs) : "—"}, scontorno ${seconds(r.inferenceMs)}`),
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => setCopied(true), () => setCopied(false));
  }

  return (
    <div className="space-y-6 pb-6">
      <section className="rounded-3xl bg-surface p-5 text-[14px] leading-relaxed">
        {env ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted">HTTPS</dt>
            <dd>{env.secure ? "sì" : "no"}</dd>
            <dt className="text-muted">WebGPU</dt>
            <dd>{env.webgpuText}</dd>
            <dt className="text-muted">WASM multi-thread</dt>
            <dd>{env.isolated ? `sì (${env.threads} core)` : "no, un solo thread"}</dd>
          </dl>
        ) : (
          <p className="text-muted">Controllo del browser…</p>
        )}
      </section>

      <Segmented
        label="Motore"
        value={device}
        options={[
          ["webgpu", "WebGPU", !env?.webgpu],
          ["wasm", "WASM", false],
        ]}
        onChange={setDevice}
        disabled={busy}
      />
      <Segmented
        label="Modello"
        value={model}
        options={[
          ["isnet_quint8", "quint8 · 44 MB", false],
          ["isnet_fp16", "fp16 · 88 MB", false],
        ]}
        onChange={setModel}
        disabled={busy}
      />

      <label className="flex h-12 cursor-pointer items-center justify-center rounded-2xl border border-line px-4 text-[15px] font-medium">
        <span className="truncate">{file ? file.name : "Scegli una foto"}</span>
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>

      <button
        type="button"
        onClick={run}
        disabled={!file || busy}
        className="h-12 w-full rounded-2xl bg-foreground text-[15px] font-medium text-background disabled:opacity-40"
      >
        {busy ? "Attendi…" : `Rimuovi sfondo · ${label({ device, model })}`}
      </button>

      {current && (
        <section aria-live="polite" className="rounded-3xl border border-line p-5 text-[14px]">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Combinazione in uso</p>
          <p className="mt-1 text-[20px] font-semibold">{label(current)}</p>
          <p className="mt-1 text-muted">
            Foto {photoSize || "…"} → ingresso modello {MODEL_INPUT_SIZE}×{MODEL_INPUT_SIZE}
          </p>
          {inMemory > 1 && (
            <p className="mt-1 text-muted">
              {inMemory} combinazioni in memoria: ricarica la pagina prima di cambiare, per misure pulite.
            </p>
          )}

          <ol className="mt-4 space-y-2">
            {PHASES.map(({ phase, label }) => (
              <li key={phase} className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
                <span>
                  {label}
                  {phases[phase].detail && <span className="block text-xs text-muted">{phases[phase].detail}</span>}
                </span>
                <span className={`shrink-0 font-medium ${phases[phase].state === "attesa" ? "text-muted" : ""}`}>
                  {phaseText(phases[phase])}
                </span>
              </li>
            ))}
          </ol>

          {error && (
            <p className="mt-4 rounded-2xl bg-surface-muted p-4 break-words">
              <span className="font-semibold">Errore in “{PHASES.find((p) => p.phase === error.phase)?.label}”:</span>{" "}
              {error.message}
            </p>
          )}

          {!busy && (
            <button
              type="button"
              onClick={report}
              className="mt-4 h-11 w-full rounded-xl bg-surface-muted text-[15px] font-medium"
            >
              {copied ? "Rapporto copiato" : "Copia rapporto"}
            </button>
          )}
        </section>
      )}

      <div ref={outputRef} className="rounded-3xl bg-surface-muted p-4 empty:hidden" />

      {runs.length > 0 && (
        <table className="w-full text-[14px]">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1 font-normal">Motore</th>
              <th className="py-1 font-normal">Caricamento</th>
              <th className="py-1 font-normal">Scontorno</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => (
              <tr key={runs.length - i} className="border-t border-line">
                <td className="py-2">
                  {label(r.engine)}
                  <span className="block text-xs text-muted">{r.size}</span>
                </td>
                <td className="py-2">{r.loadMs ? seconds(r.loadMs) : "già in memoria"}</td>
                <td className="py-2">{seconds(r.inferenceMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: [T, string, boolean][];
  onChange: (value: T) => void;
  disabled: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-muted p-1">
      {options.map(([option, text, unavailable]) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          disabled={disabled || unavailable}
          onClick={() => onChange(option)}
          className={`h-11 rounded-xl text-[15px] font-medium transition-colors disabled:opacity-40 ${
            value === option ? "bg-surface text-foreground shadow-sm" : "text-muted"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** Riduce la foto a MAX_SIDE sul lato lungo e la restituisce come canvas. */
async function downscale(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

function label({ device, model }: Engine) {
  return `${device === "webgpu" ? "WebGPU" : "WASM"} · ${model}`;
}

function phaseText(p: PhaseState) {
  if (p.state === "attesa") return "—";
  if (p.state === "in corso") return "in corso…";
  const time = p.ms !== undefined ? ` · ${seconds(p.ms)}` : "";
  return p.state === "ok" ? `ok${time}` : `errore${time}`;
}

function seconds(ms: number) {
  return `${(ms / 1000).toFixed(1)} s`;
}
