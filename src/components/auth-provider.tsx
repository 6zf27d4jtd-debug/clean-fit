"use client";

import type { User } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { HangerIcon } from "@/components/icons";
import { clearPhotoUrlCache } from "@/lib/photo-urls";
import { getSupabase } from "@/lib/supabase/client";

type AuthState =
  | { status: "loading"; user: null }
  | { status: "ready"; user: User | null }
  | { status: "error"; user: null; message: string };

const AuthContext = createContext<User | null>(null);
const RecoveryContext = createContext<() => void>(() => {});

/** Pagine raggiungibili solo senza account (con l'account si va alla Home). */
const PUBLIC_PATHS = ["/accedi"];
/** Pagine raggiungibili da tutti, con o senza account. */
const OPEN_PATHS = ["/privacy"];

/**
 * Recupero password: il codice giusto apre la sessione, ma prima di entrare si sceglie la password nuova.
 * Finché non è scelta, l'app resta su questa pagina (anche dopo un ricaricamento, grazie a sessionStorage).
 */
export const NEW_PASSWORD_PATH = "/nuova-password";
const RECOVERY_KEY = "cleanfit:recupero";

function rememberRecovery(active: boolean) {
  try {
    if (active) sessionStorage.setItem(RECOVERY_KEY, "1");
    else sessionStorage.removeItem(RECOVERY_KEY);
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });
  const [recovering, setRecovering] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    let supabase;
    try {
      supabase = getSupabase();
    } catch (error) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- errore di configurazione noto solo nel browser
      setState({ status: "error", user: null, message: (error as Error).message });
      return;
    }

    try {
      setRecovering(sessionStorage.getItem(RECOVERY_KEY) === "1");
    } catch {}
    supabase.auth.getSession().then(({ data }) => {
      setState({ status: "ready", user: data.session?.user ?? null });
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        rememberRecovery(true);
        setRecovering(true);
      }
      if (!session) {
        clearPhotoUrlCache();
        rememberRecovery(false);
        setRecovering(false);
      }
      setState({ status: "ready", user: session?.user ?? null });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const onNewPassword = pathname === NEW_PASSWORD_PATH;
  const redirectTo =
    state.status !== "ready" || (OPEN_PATHS.includes(pathname) && !recovering)
      ? null
      : !state.user
        ? isPublic
          ? null
          : "/accedi"
        : recovering
          ? onNewPassword
            ? null
            : NEW_PASSWORD_PATH
          : isPublic || onNewPassword
            ? "/"
            : null;

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (state.status === "error") {
    return (
      <div className="flex min-h-dvh px-8 items-center justify-center text-center">
        <p className="text-[15px] text-muted">{state.message}</p>
      </div>
    );
  }

  // Le pagine restano montate (anche nascoste) così Next.js può validarle; caricano i dati solo con un utente.
  const waiting = state.status === "loading" || redirectTo !== null;

  return (
    <AuthContext.Provider value={waiting ? null : state.user}>
      <RecoveryContext.Provider
        value={() => {
          rememberRecovery(false);
          setRecovering(false);
        }}
      >
        {waiting && <Splash />}
        <div hidden={waiting}>{children}</div>
      </RecoveryContext.Provider>
    </AuthContext.Provider>
  );
}

/** Da chiamare quando la password nuova è salvata: l'app torna alla Home. */
export function useFinishRecovery() {
  return useContext(RecoveryContext);
}

/** Utente collegato; null solo nelle pagine pubbliche. */
export function useUser() {
  return useContext(AuthContext);
}

/** Schermata di attesa (gruccia): anche il ripiego del layout mentre l'indirizzo non è ancora noto. */
export function Splash() {
  return (
    <div className="flex min-h-dvh px-8 items-center justify-center text-muted">
      <HangerIcon width={40} height={40} className="animate-pulse" />
    </div>
  );
}
