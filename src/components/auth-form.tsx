"use client";

import { useEffect, useState, type FormEvent } from "react";
import { authErrorMessage } from "@/lib/auth-errors";
import { getSupabase } from "@/lib/supabase/client";

type Mode = "accedi" | "registrati";

export function AuthForm() {
  const [mode, setMode] = useState<Mode>("accedi");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Link d'invito (/accedi?invito=CODICE): apre "Registrati" con il codice già scritto
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("invito");
    if (!code) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- l'indirizzo si legge solo nel browser
    setInviteCode(code);
    setMode("registrati");
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    const supabase = getSupabase();
    const credentials = { email: email.trim(), password };

    if (mode === "accedi") {
      const { error } = await supabase.auth.signInWithPassword(credentials);
      if (error) setError(authErrorMessage(error));
    } else {
      // Il codice viene controllato dal database (trigger check_invite_code), non qui
      const { data, error } = await supabase.auth.signUp({
        ...credentials,
        options: { data: { invite_code: inviteCode.trim() } },
      });
      if (error) {
        setError(
          isInviteRejected(error) ? "Codice d’invito non valido, scaduto o già usato." : authErrorMessage(error),
        );
      }
      else if (!data.session) setNotice("Ti abbiamo inviato un’email: conferma l’indirizzo, poi accedi.");
    }
    // Se l'accesso riesce, AuthProvider porta alla Home.
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-muted p-1">
        {(["accedi", "registrati"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => {
              setMode(value);
              setError(null);
              setNotice(null);
            }}
            className={`h-11 rounded-xl text-[15px] font-medium transition-colors ${
              mode === value ? "bg-surface text-foreground shadow-sm" : "text-muted"
            }`}
          >
            {value === "accedi" ? "Accedi" : "Registrati"}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-muted">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-13 w-full rounded-2xl bg-surface px-4 text-[16px] ring-1 ring-line outline-none focus:ring-2 focus:ring-foreground"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-muted">Password</span>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            required
            minLength={6}
            autoComplete={mode === "accedi" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-13 w-full rounded-2xl bg-surface pr-20 pl-4 text-[16px] ring-1 ring-line outline-none focus:ring-2 focus:ring-foreground"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute inset-y-0 right-0 px-4 text-[14px] font-medium text-muted"
          >
            {showPassword ? "Nascondi" : "Mostra"}
          </button>
        </div>
        {mode === "registrati" && <span className="mt-1.5 block text-[13px] text-muted">Almeno 6 caratteri.</span>}
      </label>

      {mode === "registrati" && (
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-muted">Codice d’invito</span>
          <input
            type="text"
            required
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={40}
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            className="h-13 w-full rounded-2xl bg-surface px-4 font-mono text-[16px] tracking-wider uppercase ring-1 ring-line outline-none focus:ring-2 focus:ring-foreground"
          />
          <span className="mt-1.5 block text-[13px] text-muted">Clean Fit è su invito: chiedilo a chi ti ha mandato il link.</span>
        </label>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-3 text-[15px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {notice && <p className="rounded-2xl bg-surface-muted px-4 py-3 text-[15px]">{notice}</p>}

      <button
        type="submit"
        disabled={pending}
        className="h-13 w-full rounded-2xl bg-foreground text-[17px] font-semibold text-background transition active:scale-[0.98] disabled:opacity-50"
      >
        {pending ? "Attendi…" : mode === "accedi" ? "Accedi" : "Crea account"}
      </button>
    </form>
  );
}

/**
 * Il trigger che controlla il codice blocca la creazione dell'utente. Supabase inoltra il suo messaggio
 * ("Codice d'invito non valido", codice P0001); le versioni più vecchie rispondono con un errore generico del database.
 */
function isInviteRejected(error: { code?: string; message: string }) {
  return (
    error.code === "P0001" ||
    /codice d.invito/i.test(error.message) ||
    error.code === "unexpected_failure" ||
    /database error saving new user/i.test(error.message)
  );
}
