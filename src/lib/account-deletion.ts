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
/**
 * Utente per cui questo telefono ha avviato l'eliminazione: se all'apertura il controllo non arriva al database
 * (niente rete, timeout), la schermata mostra comunque "Riprova" invece dell'app.
 */
const STARTED_KEY = "cleanfit:eliminazione-avviata";

function rememberStarted(userId: string | null) {
  try {
    if (userId) localStorage.setItem(STARTED_KEY, userId);
    else localStorage.removeItem(STARTED_KEY);
  } catch {}
}

export function deletionStartedHere(userId: string) {
  try {
    return localStorage.getItem(STARTED_KEY) === userId;
  } catch {
    return false;
  }
}

export async function runAccountDeletion(onStep?: (step: DeletionStep) => void) {
  const supabase = getSupabase();
  const { data: session } = await supabase.auth.getSession();
  if (session.session) rememberStarted(session.session.user.id);
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
      rememberStarted(null);
      return;
    }
    // Un file arrivato nel frattempo (caricamento già partito prima dell'avvio): si rifà l'elenco
    if ((deleteError as { hint?: string }).hint !== "foto_rimaste") throw deleteError;
  }
  throw new Error("Nella cartella restano delle foto");
}

/**
 * Eliminazione avviata e non ancora finita per questo utente. Senza profilo l'account non esiste più (il profilo
 * nasce con l'utente e sparisce con lui): succede se la risposta di delete_account si è persa. Il token sul telefono
 * vale ancora fino a un'ora, quindi si esce qui dall'account invece di mostrare un armadio vuoto.
 */
export async function isDeletionPending(userId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(QUERIES.profileDeletion.table)
    .select(QUERIES.profileDeletion.select)
    .eq("id", userId)
    .maybeSingle();
  // Errore di rete, timeout o risposta d'errore: non si sa niente, quindi non si esce (la schermata mostra "Riprova")
  if (error) throw error;
  // Solo una risposta vera di Supabase senza righe vuol dire "profilo eliminato"
  if (!data) {
    await supabase.auth.signOut({ scope: "local" });
    rememberStarted(null);
    return false;
  }
  if (!data.deletion_requested_at) rememberStarted(null);
  return !!data.deletion_requested_at;
}
