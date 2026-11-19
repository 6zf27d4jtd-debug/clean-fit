"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DELETION_EVENT, isDeletionPending, runAccountDeletion, type DeletionStep } from "@/lib/account-deletion";

type GateState = "nessuna" | DeletionStep | "errore";

const STEP_TEXT: Record<DeletionStep, string> = { foto: "Elimino le foto…", account: "Elimino l’account…" };

/**
 * Eliminazione dell'account avviata e non finita (connessione caduta, app chiusa, avviata da un altro dispositivo):
 * copre l'app e la riprende da sola. Si controlla all'apertura, quando l'app torna in primo piano e quando il
 * Profilo segnala un'eliminazione interrotta.
 */
export function DeletionGate({ userId }: { userId: string }) {
  const [state, setState] = useState<GateState>("nessuna");
  const running = useRef(false);

  const resume = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      if (!(await isDeletionPending(userId))) return setState("nessuna");
      setState("foto");
      await runAccountDeletion(setState);
      // Finita: l'uscita dall'account porta su Accedi
    } catch (error) {
      console.warn("Eliminazione dell'account non completata", error);
      setState((current) => (current === "nessuna" ? current : "errore"));
    } finally {
      running.current = false;
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- controllo all'apertura, dati solo dal browser
    resume();
    const onVisible = () => document.visibilityState === "visible" && resume();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(DELETION_EVENT, resume);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(DELETION_EVENT, resume);
    };
  }, [resume]);

  if (state === "nessuna") return null;

  return (
    <div
      role="alertdialog"
      aria-labelledby="eliminazione-titolo"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background px-8 text-center"
    >
      <h1 id="eliminazione-titolo" className="text-[22px] font-semibold">
        Eliminazione dell’account in corso
      </h1>
      {state === "errore" ? (
        <>
          <p role="alert" className="text-[15px] leading-snug text-muted">
            L’eliminazione si è interrotta. Controlla la connessione e tocca Riprova: riprende anche da sola alla
            prossima apertura dell’app.
          </p>
          <button
            type="button"
            onClick={resume}
            className="h-13 w-full max-w-xs rounded-2xl bg-foreground text-[17px] font-semibold text-background"
          >
            Riprova
          </button>
        </>
      ) : (
        <>
          <p role="status" className="text-[17px]">
            {STEP_TEXT[state]}
          </p>
          <p className="text-[14px] text-muted">Non chiudere l’app finché non è finita.</p>
        </>
      )}
    </div>
  );
}
