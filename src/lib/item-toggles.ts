"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { setFavorite, setInLaundry } from "@/lib/items";

// Cuoricino e cesto: lo schermo cambia subito, il database si aggiorna una richiesta alla volta per capo.
// Con tocchi veloci conta sempre l'ultimo valore scelto; se una richiesta fallisce, lo schermo torna
// all'ultimo valore confermato dal database (non a uno intermedio).

type Pending = { desired: boolean; confirmed: boolean; revert: (value: boolean) => void };

/**
 * Crea la funzione che porta un valore sì/no di un capo a `desired`. `current` è il valore mostrato prima del tocco;
 * `revert` rimette sullo schermo il valore confermato se il salvataggio fallisce.
 */
function serializedToggle(save: (itemId: string, value: boolean) => Promise<void>, failure: string) {
  const pending = new Map<string, Pending>();
  return (itemId: string, desired: boolean, current: boolean, revert: (value: boolean) => void) => {
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
          await save(itemId, target);
          state.confirmed = target;
        }
      } catch (error) {
        console.warn(failure, error);
        state.revert(state.confirmed);
      } finally {
        pending.delete(itemId);
      }
    })();
  };
}

export const requestFavorite = serializedToggle(setFavorite, "Preferito non salvato");

export const requestLaundry = serializedToggle(setInLaundry, "Cesto non aggiornato");

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

/** Per gli elenchi di capi: restituisce la funzione da collegare al pulsante cesto di ogni scheda. */
export function useLaundryToggle<T extends { id: string; in_laundry_since: string | null }>(
  setItems: Dispatch<SetStateAction<T[] | null>>,
) {
  return useCallback(
    (item: T) => {
      const inLaundry = !!item.in_laundry_since;
      const apply = (value: boolean) =>
        setItems(
          (prev) =>
            prev?.map((i) =>
              i.id === item.id
                ? { ...i, in_laundry_since: value ? (i.in_laundry_since ?? new Date().toISOString()) : null }
                : i,
            ) ?? null,
        );
      apply(!inLaundry);
      requestLaundry(item.id, !inLaundry, inLaundry, apply);
    },
    [setItems],
  );
}
