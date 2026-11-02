"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/components/auth-provider";
import { getSupabase, PHOTO_BUCKET } from "@/lib/supabase/client";

const sectionTitle = "text-[13px] font-medium tracking-wide text-muted uppercase";

export function RecentDaysSetting() {
  const userId = useUser()?.id;
  const [days, setDays] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    getSupabase()
      .from("profiles")
      .select("recent_days")
      .eq("id", userId)
      .single()
      .then(({ data }) => setDays(data?.recent_days ?? 7));
  }, [userId]);

  async function change(delta: number) {
    if (days === null || !userId) return;
    const next = Math.min(90, Math.max(0, days + delta));
    setDays(next);
    await getSupabase().from("profiles").update({ recent_days: next }).eq("id", userId);
  }

  return (
    <section className="mt-10 space-y-3">
      <h2 className={sectionTitle}>Outfit</h2>
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-surface px-4 py-3 ring-1 ring-line">
        <p className="text-[15px] leading-snug">
          Non riproporre capi indossati negli ultimi{" "}
          <span className="font-semibold">{days === null ? "…" : days === 1 ? "1 giorno" : `${days} giorni`}</span>
        </p>
        <div className="flex shrink-0 gap-1">
          {[-1, 1].map((delta) => (
            <button
              key={delta}
              type="button"
              aria-label={delta < 0 ? "Meno giorni" : "Più giorni"}
              disabled={days === null}
              onClick={() => change(delta)}
              className="size-11 rounded-full bg-surface-muted text-[20px] font-medium active:scale-95 disabled:opacity-40"
            >
              {delta < 0 ? "−" : "+"}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Tutti i file sotto una cartella dello Storage, sottocartelle comprese (l'elenco dello Storage è di un livello). */
async function listFolder(prefix: string): Promise<string[]> {
  const bucket = getSupabase().storage.from(PHOTO_BUCKET);
  const paths: string[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await bucket.list(prefix, { limit: pageSize, offset });
    if (error) throw error;
    for (const entry of data) {
      // Le cartelle non hanno id
      if (entry.id) paths.push(`${prefix}/${entry.name}`);
      else paths.push(...(await listFolder(`${prefix}/${entry.name}`)));
    }
    if (data.length < pageSize) return paths;
  }
}

export function AccountSection() {
  const user = useUser();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setPending(true);
    await getSupabase().auth.signOut();
  }

  async function deleteAccount() {
    if (!user) return;
    setPending(true);
    setError(null);
    const supabase = getSupabase();

    // Prima le foto (lo Storage non si svuota a cascata), poi l'utente con tutti i suoi dati. Si svuota tutta la
    // cartella dell'utente, non solo le foto dei capi: anche i file rimasti da salvataggi interrotti.
    let paths: string[];
    try {
      paths = await listFolder(user.id);
    } catch {
      return fail();
    }
    for (let start = 0; start < paths.length; start += 100) {
      const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(paths.slice(start, start + 100));
      if (error) return fail();
    }

    const { error: deleteError } = await supabase.rpc("delete_account");
    if (deleteError) return fail();
    await supabase.auth.signOut({ scope: "local" });
  }

  function fail() {
    setError("Non è stato possibile eliminare l’account. Riprova quando sei online.");
    setPending(false);
  }

  return (
    <section className="mt-10 space-y-3">
      <h2 className={sectionTitle}>Account</h2>
      <div className="rounded-2xl bg-surface px-4 py-3 ring-1 ring-line">
        <p className="text-[13px] text-muted">Accesso effettuato come</p>
        <p className="truncate text-[15px] font-medium">{user?.email}</p>
      </div>

      <button
        type="button"
        onClick={signOut}
        disabled={pending}
        className="h-13 w-full rounded-2xl bg-surface text-[17px] font-medium ring-1 ring-line active:scale-[0.98] disabled:opacity-50"
      >
        Esci
      </button>

      {confirmingDelete ? (
        <div className="space-y-3 rounded-2xl bg-red-500/10 p-4">
          <p className="text-[15px] leading-snug">
            Verranno eliminati per sempre l’account, tutti i capi, le foto e lo storico degli outfit.
          </p>
          {error && <p className="text-[15px] text-red-600 dark:text-red-400">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={pending}
              className="h-12 rounded-xl bg-surface text-[15px] font-medium ring-1 ring-line disabled:opacity-50"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={deleteAccount}
              disabled={pending}
              className="h-12 rounded-xl bg-red-600 text-[15px] font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Elimino…" : "Elimina tutto"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="h-13 w-full rounded-2xl text-[17px] font-medium text-red-600 active:scale-[0.98] dark:text-red-400"
        >
          Elimina account
        </button>
      )}
    </section>
  );
}
