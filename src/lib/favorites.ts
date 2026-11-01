"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { setFavorite } from "@/lib/items";

// Cuoricino: lo schermo cambia subito, il database si aggiorna una richiesta alla volta per capo.
// Con tocchi veloci conta sempre l'ultimo valore scelto; se una richiesta fallisce, lo schermo torna
// all'ultimo valore confermato dal database (non a uno intermedio).

type Pending = { desired: boolean; confirmed: boolean; revert: (value: boolean) => void };

const pending = new Map<string, Pending>();

/**
 * Chiede di portare il preferito di un capo a `desired`. `current` è il valore mostrato prima del tocco;
 * `revert` rimette sullo schermo il valore confermato se il salvataggio fallisce.
 */
export function requestFavorite(itemId: string, desired: boolean, current: boolean, revert: (value: boolean) => void) {
  const running = pending.get(itemId);
  if (running) {
    running.desired = desired;
    running.revert = revert;
    return;
  }
  const state: Pending = { desired, confirmed: current, revert };
  pending.set(itemId, state);
  (async () => {
    try {
      while (state.confirmed !== state.desired) {
        const target = state.desired;
        await setFavorite(itemId, target);
        state.confirmed = target;
      }
    } catch (error) {
      console.warn("Preferito non salvato", error);
      state.revert(state.confirmed);
    } finally {
      pending.delete(itemId);
    }
  })();
}

/** Per gli elenchi di capi: restituisce la funzione da collegare al cuoricino di ogni scheda. */
export function useFavoriteToggle<T extends { id: string; favorite: boolean }>(
  setItems: Dispatch<SetStateAction<T[] | null>>,
) {
  return useCallback(
    (item: T) => {
      const apply = (value: boolean) =>
        setItems((prev) => prev?.map((i) => (i.id === item.id ? { ...i, favorite: value } : i)) ?? null);
      apply(!item.favorite);
      requestFavorite(item.id, !item.favorite, item.favorite, apply);
    },
    [setItems],
  );
}
