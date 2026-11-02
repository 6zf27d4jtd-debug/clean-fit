"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/components/auth-provider";
import { BackLink } from "@/components/page-header";

/**
 * La privacy si apre dal Profilo (con l'account) o dalla registrazione (senza): si torna da dove si è venuti.
 * Dalla registrazione il codice d'invito viaggia nell'indirizzo (?invito=…), così tornando non va riscritto.
 */
export function PrivacyBackLink() {
  const user = useUser();
  const [signUpHref, setSignUpHref] = useState("/accedi");

  useEffect(() => {
    const invite = new URLSearchParams(window.location.search).get("invito");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- l'indirizzo si legge solo nel browser
    if (invite) setSignUpHref(`/accedi?invito=${encodeURIComponent(invite)}`);
  }, []);

  return user ? <BackLink href="/profilo" label="Profilo" /> : <BackLink href={signUpHref} label="Registrati" />;
}
