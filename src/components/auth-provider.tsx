"use client";

import type { User } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { HangerIcon } from "@/components/icons";
import { getSupabase } from "@/lib/supabase/client";

type AuthState =
  | { status: "loading"; user: null }
  | { status: "ready"; user: User | null }
  | { status: "error"; user: null; message: string };

const AuthContext = createContext<User | null>(null);

/** Pagine raggiungibili senza account. */
const PUBLIC_PATHS = ["/accedi"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });
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

    supabase.auth.getSession().then(({ data }) => {
      setState({ status: "ready", user: data.session?.user ?? null });
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ status: "ready", user: session?.user ?? null });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const redirectTo =
    state.status !== "ready" ? null : !state.user && !isPublic ? "/accedi" : state.user && isPublic ? "/" : null;

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

  if (state.status === "loading" || redirectTo) return <Splash />;

  return <AuthContext.Provider value={state.user}>{children}</AuthContext.Provider>;
}

/** Utente collegato; null solo nelle pagine pubbliche. */
export function useUser() {
  return useContext(AuthContext);
}

function Splash() {
  return (
    <div className="flex min-h-dvh px-8 items-center justify-center text-muted">
      <HangerIcon width={40} height={40} className="animate-pulse" />
    </div>
  );
}
