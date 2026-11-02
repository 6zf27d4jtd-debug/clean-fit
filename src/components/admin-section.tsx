"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@/components/auth-provider";
import { ChevronRightIcon } from "@/components/icons";
import { getSupabase } from "@/lib/supabase/client";

/** Voci del Profilo solo per gli amministratori (tabella app_admins); il database le protegge comunque. */
export function AdminSection() {
  const userId = useUser()?.id;
  const [admin, setAdmin] = useState<{ userId: string; value: boolean } | null>(null);

  useEffect(() => {
    if (!userId) return;
    getSupabase()
      .rpc("is_admin")
      .then(({ data }) => setAdmin({ userId, value: data === true }));
  }, [userId]);

  // Dopo un cambio di account conta solo la risposta per l'utente attuale
  if (!userId || admin?.userId !== userId || !admin.value) return null;

  return (
    <section className="mt-10 space-y-3">
      <h2 className="text-[13px] font-medium tracking-wide text-muted uppercase">Amministrazione</h2>
      <Link
        href="/invita"
        className="flex min-h-13 items-center justify-between gap-3 rounded-2xl bg-surface px-4 text-[15px] font-medium ring-1 ring-line"
      >
        <span>
          Invita amici
          <span className="block text-[13px] font-normal text-muted">Crea e condividi link d’invito</span>
        </span>
        <ChevronRightIcon width={20} height={20} className="shrink-0 text-muted" />
      </Link>
    </section>
  );
}
