import type { AuthError } from "@supabase/supabase-js";

/**
 * Lunghezza minima delle password nuove: deve coincidere con l'impostazione di Supabase
 * (Authentication → Sign In / Providers → Email → Minimum password length).
 */
export const MIN_PASSWORD_LENGTH = 8;

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Email o password non corretti.",
  user_already_exists: "Esiste già un account con questa email.",
  email_exists: "Esiste già un account con questa email.",
  weak_password: `La password è troppo debole: usa almeno ${MIN_PASSWORD_LENGTH} caratteri.`,
  email_address_invalid: "L’indirizzo email non è valido.",
  validation_failed: "Controlla email e password.",
  email_not_confirmed: "Devi prima confermare l’email: controlla la posta.",
  over_email_send_rate_limit: "Troppi tentativi: riprova tra qualche minuto.",
  over_request_rate_limit: "Troppi tentativi: riprova tra qualche minuto.",
  signup_disabled: "Le registrazioni sono disattivate.",
  otp_expired: "Codice sbagliato o scaduto. Controlla l’ultima email ricevuta o chiedi un codice nuovo.",
  same_password: "La password nuova deve essere diversa da quella vecchia.",
};

export function authErrorMessage(error: AuthError | Error): string {
  const code = "code" in error ? error.code : undefined;
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (error.message.toLowerCase().includes("fetch")) return "Connessione assente: riprova quando sei online.";
  return "Qualcosa è andato storto. Riprova.";
}
