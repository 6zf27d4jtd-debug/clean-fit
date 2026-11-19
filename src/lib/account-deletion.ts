import { QUERIES } from "@/lib/queries";
import { getSupabase, PHOTO_BUCKET } from "@/lib/supabase/client";

/**
 * Eliminazione dell'account (migrazione 0012). Ogni passaggio si può ripetere senza danni, quindi se la connessione
 * cade a metà basta rilanciarla: l'app lo fa da sola alla prossima apertura (DeletionGate).
 * 1. start_account_deletion: segna l'eliminazione nel profilo; da qui il database rifiuta capi e foto nuove.
 * 2. my_photo_paths: tutti i file della cartella con una richiesta, poi via a blocchi di 100.
 * 3. delete_account: elimina l'utente solo se la cartella è vuota (altrimenti 'foto_rimaste' e si ripete).
 * Prima le foto e poi l'account: un'interruzione lascia al massimo un account a metà, mai foto senza proprietario.
 */
export type DeletionStep = "foto" | "account";

const BATCH = 100;
const ATTEMPTS = 3;
/** Avvisa la schermata di ripresa (DeletionGate) che un'eliminazione è avviata ma non finita. */
export const DELETION_EVENT = "cleanfit:eliminazione";

export async function runAccountDeletion(onStep?: (step: DeletionStep) => void) {
  const supabase = getSupabase();
  const { error: startError } = await supabase.rpc("start_account_deletion");
  if (startError) throw startError;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    onStep?.("foto");
    const { data, error } = await supabase.rpc("my_photo_paths");
    if (error) throw error;
    const paths = data as string[];
    for (let start = 0; start < paths.length; start += BATCH) {
      const { error: removeError } = await supabase.storage.from(PHOTO_BUCKET).remove(paths.slice(start, start + BATCH));
      if (removeError) throw removeError;
    }

    onStep?.("account");
    const { error: deleteError } = await supabase.rpc("delete_account");
    if (!deleteError) {
      // L'utente non esiste più: il server può rispondere con un errore, ma la sessione sul telefono si chiude lo stesso
      await supabase.auth.signOut({ scope: "local" });
      return;
    }
    // Un file arrivato nel frattempo (caricamento già partito prima dell'avvio): si rifà l'elenco
    if ((deleteError as { hint?: string }).hint !== "foto_rimaste") throw deleteError;
  }
  throw new Error("Nella cartella restano delle foto");
}

/** Eliminazione avviata e non ancora finita per questo utente. */
export async function isDeletionPending(userId: string) {
  const { data, error } = await getSupabase()
    .from(QUERIES.profileDeletion.table)
    .select(QUERIES.profileDeletion.select)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return !!data?.deletion_requested_at;
}
