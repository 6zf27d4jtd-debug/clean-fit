"use client";

import { useState, type FormEvent } from "react";
import { useFinishRecovery } from "@/components/auth-provider";
import { authErrorMessage, MIN_PASSWORD_LENGTH } from "@/lib/auth-errors";
import { getSupabase } from "@/lib/supabase/client";

/** Ultimo passo del recupero: la sessione è aperta dal codice dell'email, qui si sceglie la password nuova. */
export function NewPasswordForm() {
  const finishRecovery = useFinishRecovery();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await getSupabase().auth.updateUser({ password });
    setPending(false);
    if (error) return setError(authErrorMessage(error));
    // Password salvata: AuthProvider porta alla Home
    finishRecovery();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-[32px] leading-tight font-semibold tracking-tight">Nuova password</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">Scegli la password che userai per accedere.</p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-muted">Password nuova</span>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
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
        <span className="mt-1.5 block text-[13px] text-muted">Almeno {MIN_PASSWORD_LENGTH} caratteri.</span>
      </label>

      {error && (
        <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-3 text-[15px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-13 w-full rounded-2xl bg-foreground text-[17px] font-semibold text-background transition active:scale-[0.98] disabled:opacity-50"
      >
        {pending ? "Attendi…" : "Salva la password"}
      </button>
      <button
        type="button"
        onClick={() => getSupabase().auth.signOut()}
        disabled={pending}
        className="h-11 w-full text-[15px] font-medium text-muted disabled:opacity-50"
      >
        Annulla ed esci
      </button>
    </form>
  );
}
