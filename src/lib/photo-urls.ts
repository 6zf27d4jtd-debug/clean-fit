"use client";

import { useEffect, useState } from "react";
import { getSupabase, PHOTO_BUCKET } from "@/lib/supabase/client";

// Le foto sono in un bucket privato: si leggono con link firmati, che scadono.
// Un link resta lo stesso finché è valido, così il browser tiene la foto in cache (caricata con cacheControl di un anno)
// invece di riscaricarla a ogni apertura. I link vengono ricordati in localStorage per 7 giorni.

const STORAGE_KEY = "cleanfit:foto";
const LIFETIME_SECONDS = 7 * 24 * 60 * 60;
/** Un link che scade entro un giorno viene rinnovato. */
const RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;

type Entry = { url: string; expires: number };

let cache: Map<string, Entry> | null = null;
const pending = new Map<string, Promise<void>>();

function load() {
  if (cache) return cache;
  cache = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, Entry>;
    for (const [path, entry] of Object.entries(saved)) cache.set(path, entry);
  } catch {}
  return cache;
}

function persist() {
  try {
    const now = Date.now();
    const valid = Object.fromEntries([...load()].filter(([, entry]) => entry.expires > now));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
  } catch {}
}

function fresh(path: string) {
  const entry = load().get(path);
  return entry && entry.expires - Date.now() > RENEW_BEFORE_MS ? entry.url : undefined;
}

/** Link firmati per le foto indicate (percorso → link). Chiede a Supabase solo quelli mancanti o in scadenza. */
export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  const missing = [...new Set(paths)].filter((path) => !fresh(path) && !pending.has(path));
  if (missing.length) {
    const request = getSupabase()
      .storage.from(PHOTO_BUCKET)
      .createSignedUrls(missing, LIFETIME_SECONDS)
      .then(({ data, error }) => {
        if (error) throw error;
        const expires = Date.now() + LIFETIME_SECONDS * 1000;
        for (const item of data ?? []) {
          if (item.signedUrl && item.path) load().set(item.path, { url: item.signedUrl, expires });
        }
        persist();
      })
      .finally(() => missing.forEach((path) => pending.delete(path)));
    missing.forEach((path) => pending.set(path, request));
  }
  await Promise.all(paths.map((path) => pending.get(path)));

  const urls: Record<string, string> = {};
  for (const path of paths) {
    const url = load().get(path)?.url;
    if (url) urls[path] = url;
  }
  return urls;
}

/** Hook: link firmati per le foto indicate; si aggiorna quando cambiano i percorsi. */
export function usePhotoUrls(paths: string[]) {
  const key = paths.join("|");
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    photoUrls(key.split("|")).then(
      (result) => !cancelled && setUrls(result),
      (error) => console.warn("Foto non disponibili", error),
    );
    return () => {
      cancelled = true;
    };
  }, [key]);

  return urls;
}

/** All'uscita dall'account: i link alle foto non devono restare su questo dispositivo. */
export function clearPhotoUrlCache() {
  cache = new Map();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/** Da chiamare dopo aver eliminato una foto. */
export function forgetPhotoUrls(paths: string[]) {
  for (const path of paths) load().delete(path);
  persist();
}
