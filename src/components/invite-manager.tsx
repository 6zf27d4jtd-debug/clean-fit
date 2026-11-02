"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useUser } from "@/components/auth-provider";
import { BottomSheet, SheetButton } from "@/components/bottom-sheet";
import { PlusIcon } from "@/components/icons";
import { getSupabase } from "@/lib/supabase/client";

/** Una riga di list_invites (migrazione 0008). */
type Invite = {
  code: string;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  used_by: { email: string; at: string; confirmed: boolean }[];
};

type Status = "attesa" | "usato" | "scaduto" | "disattivato";

function statusOf(invite: Invite): Status {
  if (invite.max_uses !== null && invite.uses >= invite.max_uses) return "usato";
  if (invite.revoked_at) return "disattivato";
  if (invite.expires_at && new Date(invite.expires_at) <= new Date()) return "scaduto";
  return "attesa";
}

const formatDay = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long" });

function inviteUrl(code: string) {
  return `${window.location.origin}/accedi?invito=${code}`;
}

/**
 * Apre il pannello Condividi del telefono; dove non c'è (es. sul Mac) copia il link.
 * Restituisce "copiato" se il link è stato copiato, così la pagina può dirlo.
 */
async function shareInvite(invite: Pick<Invite, "code" | "expires_at">) {
  const url = inviteUrl(invite.code);
  const expiry = invite.expires_at ? ` e scade il ${formatDay(invite.expires_at)}` : "";
  const text = `Ti invito su Clean Fit, l’app per organizzare l’armadio. Il link vale una sola volta${expiry}.`;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Invito a Clean Fit", text, url });
      return "condiviso";
    } catch (error) {
      // Chiuso senza condividere, oppure Safari non lo apre dopo un'attesa: resta il pulsante "Condividi"
      if ((error as Error).name === "AbortError" || (error as Error).name === "NotAllowedError") return "annullato";
    }
  }
  await navigator.clipboard.writeText(url);
  return "copiato";
}

export function InviteManager() {
  const userId = useUser()?.id;
  // Le pagine restano montate anche cambiando account: con un altro utente si riparte da zero
  return userId ? <Invites key={userId} userId={userId} /> : null;
}

function Invites({ userId }: { userId: string }) {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [disabling, setDisabling] = useState<Invite | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await getSupabase().rpc("list_invites");
    if (error) return setError("Impossibile caricare gli inviti. Controlla la connessione.");
    setError(null);
    setInvites(data as Invite[]);
  }, []);

  useEffect(() => {
    getSupabase()
      .rpc("is_admin")
      .then(({ data, error }) => {
        if (error) return setError("Impossibile caricare gli inviti. Controlla la connessione.");
        setAdmin(data === true);
        if (data === true) load();
      });
  }, [userId, load]);

  async function share(invite: Pick<Invite, "code" | "expires_at">) {
    try {
      if ((await shareInvite(invite)) === "copiato") setCopied(invite.code);
    } catch {
      setError("Impossibile condividere il link.");
    }
  }

  async function create() {
    setCreating(true);
    setError(null);
    setCopied(null);
    const { data, error } = await getSupabase().rpc("create_invite").single<Pick<Invite, "code" | "expires_at">>();
    setCreating(false);
    if (error || !data) return setError("Invito non creato. Controlla la connessione e riprova.");
    await load();
    await share(data);
  }

  if (admin === false) {
    return <p className="text-[15px] text-muted">Pagina non disponibile.</p>;
  }

  const pending = invites?.filter((invite) => statusOf(invite) === "attesa") ?? [];
  const others = invites?.filter((invite) => statusOf(invite) !== "attesa") ?? [];

  return (
    <div className="space-y-8 pb-6">
      <div className="space-y-2">
        <button
          type="button"
          onClick={create}
          disabled={!invites || creating}
          className="flex h-13 w-full items-center justify-center gap-1.5 rounded-2xl bg-foreground text-[16px] font-semibold text-background transition active:scale-[0.98] disabled:opacity-50"
        >
          <PlusIcon width={20} height={20} />
          {creating ? "Attendi…" : "Nuovo invito"}
        </button>
        <p className="text-center text-[13px] text-muted">Ogni link vale per una sola persona e scade dopo 7 giorni.</p>
      </div>

      {error && (
        <p role="alert" className="text-center text-[14px] text-muted">
          {error}
        </p>
      )}

      {invites === null && !error ? (
        <div className="h-32 animate-pulse rounded-3xl bg-surface-muted" />
      ) : (
        invites && (
          <>
            <InviteList title="In attesa" empty="Nessun invito in attesa.">
              {pending.map((invite) => (
                <li key={invite.code} className="px-5 py-3">
                  <p className="font-mono text-[15px] tracking-wide">{invite.code}</p>
                  <p className="text-[13px] text-muted">
                    Creato il {formatDay(invite.created_at)}
                    {invite.expires_at && ` · scade il ${formatDay(invite.expires_at)}`}
                  </p>
                  {copied === invite.code && <p className="mt-1 text-[13px] font-medium">Link copiato.</p>}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => share(invite)}
                      className="h-11 flex-1 rounded-xl bg-surface-muted text-[15px] font-medium"
                    >
                      Condividi
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisabling(invite)}
                      className="h-11 flex-1 rounded-xl text-[15px] font-medium text-muted ring-1 ring-line"
                    >
                      Disattiva
                    </button>
                  </div>
                </li>
              ))}
            </InviteList>

            <InviteList title="Usati e chiusi" empty="Ancora nessuno.">
              {others.map((invite) => (
                <li key={invite.code} className="px-5 py-3">
                  <p className="font-mono text-[15px] tracking-wide text-muted">{invite.code}</p>
                  <ClosedInvite invite={invite} />
                </li>
              ))}
            </InviteList>
          </>
        )
      )}

      {disabling && (
        <BottomSheet label="Disattiva invito" onClose={() => setDisabling(null)}>
          <DisableSheet
            invite={disabling}
            onClose={() => setDisabling(null)}
            onDone={async () => {
              setDisabling(null);
              await load();
            }}
          />
        </BottomSheet>
      )}
    </div>
  );
}

function InviteList({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[13px] font-medium tracking-wide text-muted uppercase">{title}</h2>
      {children.length ? (
        <ul className="divide-y divide-line rounded-3xl bg-surface ring-1 ring-line">{children}</ul>
      ) : (
        <p className="text-[15px] text-muted">{empty}</p>
      )}
    </section>
  );
}

function ClosedInvite({ invite }: { invite: Invite }) {
  const status = statusOf(invite);
  return (
    <div className="text-[13px] text-muted">
      {invite.used_by.map((user) => (
        <p key={user.email + user.at} className="break-all">
          Usato da <span className="font-medium text-foreground">{user.email}</span> il {formatDay(user.at)}
          {!user.confirmed && " (email non ancora confermata)"}
        </p>
      ))}
      {status === "scaduto" && invite.expires_at && <p>Scaduto il {formatDay(invite.expires_at)}</p>}
      {status === "disattivato" && invite.revoked_at && <p>Disattivato il {formatDay(invite.revoked_at)}</p>}
    </div>
  );
}

function DisableSheet({ invite, onClose, onDone }: { invite: Invite; onClose: () => void; onDone: () => void }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function disable() {
    setPending(true);
    setMessage(null);
    const { error } = await getSupabase().rpc("disable_invite", { invite: invite.code });
    setPending(false);
    if (error) return setMessage("Invito non disattivato. Controlla la connessione e riprova.");
    onDone();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[20px] font-semibold">Disattivare l’invito?</h2>
        <p className="mt-1 text-[15px] text-muted">
          Il link <span className="font-mono">{invite.code}</span> non servirà più per registrarsi. Non si può
          riattivare: se serve, crea un invito nuovo.
        </p>
      </div>
      {message && (
        <p role="alert" className="text-[14px] text-muted">
          {message}
        </p>
      )}
      <div className="space-y-2">
        <SheetButton primary onClick={disable} disabled={pending}>
          {pending ? "Attendi…" : "Disattiva"}
        </SheetButton>
        <SheetButton onClick={onClose} disabled={pending}>
          Annulla
        </SheetButton>
      </div>
    </div>
  );
}
