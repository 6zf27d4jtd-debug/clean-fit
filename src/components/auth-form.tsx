"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { authErrorMessage, MIN_PASSWORD_LENGTH } from "@/lib/auth-errors";
import { getSupabase } from "@/lib/supabase/client";

/**
 * accedi / registrati: le due schede. verifica: codice dell'email dopo la registrazione.
 * recupero: email per la password dimenticata. recupero-codice: codice dell'email di recupero.
 * Codici a 6 cifre invece dei link: un link nell'email aprirebbe Safari, non la PWA.
 */
type Step = "accedi" | "registrati" | "verifica" | "recupero" | "recupero-codice";

/** Dopo un invio, il pulsante "Rimanda il codice" aspetta un po': Supabase limita le email per ora. */
const RESEND_WAIT_MS = 30_000;

export function AuthForm() {
  const [step, setStep] = useState<Step>("accedi");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [resendBlocked, setResendBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Link d'invito (/accedi?invito=CODICE): apre "Registrati" con il codice già scritto
  useEffect(() => {
    const invite = new URLSearchParams(window.location.search).get("invito");
    if (!invite) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- l'indirizzo si legge solo nel browser
    setInviteCode(invite);
    setStep("registrati");
  }, []);

  function go(next: Step, message: string | null = null) {
    setStep(next);
    setCode("");
    setError(null);
    setNotice(message);
  }

  function blockResend() {
    setResendBlocked(true);
    setTimeout(() => setResendBlocked(false), RESEND_WAIT_MS);
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } finally {
      setPending(false);
    }
  }

  const trimmedEmail = email.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const supabase = getSupabase();

    await run(async () => {
      if (step === "accedi") {
        const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
        if (error?.code === "email_not_confirmed") {
          // Account creato ma mai verificato: si manda un codice nuovo e si chiede quello
          await supabase.auth.resend({ type: "signup", email: trimmedEmail });
          blockResend();
          return go("verifica", "L’account non è ancora verificato: ti abbiamo mandato un codice nuovo.");
        }
        if (error) setError(authErrorMessage(error));
        // Se l'accesso riesce, AuthProvider porta alla Home.
        return;
      }

      if (step === "registrati") {
        // Il codice d'invito viene controllato dal database (trigger check_invite_code), non qui
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: { data: { invite_code: inviteCode.trim() } },
        });
        if (error) {
          return setError(
            isInviteRejected(error) ? "Codice d’invito non valido, scaduto o già usato." : authErrorMessage(error),
          );
        }
        // Con la verifica attiva non c'è ancora una sessione: serve il codice arrivato per email
        if (!data.session) {
          blockResend();
          go("verifica");
        }
        return;
      }

      if (step === "verifica") {
        const { error } = await supabase.auth.verifyOtp({ email: trimmedEmail, token: code.trim(), type: "email" });
        if (error) setError(authErrorMessage(error));
        // Codice giusto: la sessione si apre e AuthProvider porta alla Home
        return;
      }

      if (step === "recupero") {
        const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
        // Stessa risposta che l'account esista o no: nessuno deve poter scoprire chi è registrato
        if (error && isUserFacing(error)) return setError(authErrorMessage(error));
        blockResend();
        return go("recupero-codice");
      }

      // recupero-codice: il codice giusto apre una sessione di recupero; AuthProvider porta alla pagina "Nuova password"
      const { error } = await supabase.auth.verifyOtp({ email: trimmedEmail, token: code.trim(), type: "recovery" });
      if (error) setError(authErrorMessage(error));
    });
  }

  async function resend() {
    const supabase = getSupabase();
    await run(async () => {
      const { error } =
        step === "verifica"
          ? await supabase.auth.resend({ type: "signup", email: trimmedEmail })
          : await supabase.auth.resetPasswordForEmail(trimmedEmail);
      if (error && isUserFacing(error)) return setError(authErrorMessage(error));
      blockResend();
      setNotice("Codice inviato di nuovo. Usa quello dell’ultima email.");
    });
  }

  const codeStep = step === "verifica" || step === "recupero-codice";

  return (
    <form onSubmit={submit} className="space-y-4">
      {(step === "accedi" || step === "registrati") && (
        <div role="tablist" className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-muted p-1">
          {(["accedi", "registrati"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={step === value}
              onClick={() => go(value)}
              className={`h-11 rounded-xl text-[15px] font-medium transition-colors ${
                step === value ? "bg-surface text-foreground shadow-sm" : "text-muted"
              }`}
            >
              {value === "accedi" ? "Accedi" : "Registrati"}
            </button>
          ))}
        </div>
      )}

      {step === "recupero" && (
        <StepIntro title="Password dimenticata">
          Scrivi l’email del tuo account: ti mandiamo un codice per sceglierne una nuova.
        </StepIntro>
      )}
      {step === "verifica" && (
        <StepIntro title="Controlla la posta">
          Abbiamo mandato un codice a <span className="font-medium text-foreground">{trimmedEmail}</span>. Scrivilo qui
          per attivare l’account. Se non lo trovi, guarda anche nello spam.
        </StepIntro>
      )}
      {step === "recupero-codice" && (
        <StepIntro title="Controlla la posta">
          Se c’è un account con <span className="font-medium text-foreground">{trimmedEmail}</span>, ti abbiamo mandato
          un codice. Scrivilo qui, poi scegli la password nuova. Se non lo trovi, guarda anche nello spam.
        </StepIntro>
      )}

      {!codeStep && (
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
      )}

      {(step === "accedi" || step === "registrati") && (
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-muted">Password</span>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              // Solo per le password nuove: chi ha un account con una password più corta deve poter ancora accedere
              minLength={step === "registrati" ? MIN_PASSWORD_LENGTH : undefined}
              autoComplete={step === "accedi" ? "current-password" : "new-password"}
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
          {step === "registrati" && (
            <span className="mt-1.5 block text-[13px] text-muted">Almeno {MIN_PASSWORD_LENGTH} caratteri.</span>
          )}
        </label>
      )}

      {step === "registrati" && (
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

      {codeStep && (
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-muted">Codice</span>
          <input
            type="text"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,10}"
            maxLength={10}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            className="h-13 w-full rounded-2xl bg-surface px-4 text-center font-mono text-[22px] tracking-[0.3em] ring-1 ring-line outline-none focus:ring-2 focus:ring-foreground"
          />
        </label>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-3 text-[15px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-2xl bg-surface-muted px-4 py-3 text-[15px]">
          {notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-13 w-full rounded-2xl bg-foreground text-[17px] font-semibold text-background transition active:scale-[0.98] disabled:opacity-50"
      >
        {pending
          ? "Attendi…"
          : {
              accedi: "Accedi",
              registrati: "Crea account",
              verifica: "Verifica",
              recupero: "Mandami il codice",
              "recupero-codice": "Continua",
            }[step]}
      </button>

      {step === "accedi" && (
        <LinkButton onClick={() => go("recupero")} disabled={pending}>
          Password dimenticata?
        </LinkButton>
      )}
      {codeStep && (
        <LinkButton onClick={resend} disabled={pending || resendBlocked}>
          {resendBlocked ? "Codice inviato: attendi qualche secondo per rimandarlo" : "Rimanda il codice"}
        </LinkButton>
      )}
      {step !== "accedi" && step !== "registrati" && (
        <LinkButton onClick={() => go("accedi")} disabled={pending}>
          Torna all’accesso
        </LinkButton>
      )}
    </form>
  );
}

function StepIntro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-[22px] font-semibold">{title}</h2>
      <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

function LinkButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-11 w-full text-[15px] font-medium text-muted disabled:opacity-50"
    >
      {children}
    </button>
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

/** Errori da mostrare durante il recupero: troppi tentativi o rete assente. Gli altri restano nascosti. */
function isUserFacing(error: { code?: string; message: string }) {
  return (
    error.code === "over_email_send_rate_limit" ||
    error.code === "over_request_rate_limit" ||
    error.message.toLowerCase().includes("fetch")
  );
}
