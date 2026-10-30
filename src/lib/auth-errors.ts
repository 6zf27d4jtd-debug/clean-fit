import type { AuthError } from "@supabase/supabase-js";

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Email o password non corretti.",
  user_already_exists: "Esiste già un account con questa email.",
  email_exists: "Esiste già un account con questa email.",
  weak_password: "La password è troppo debole: usa almeno 6 caratteri.",
  email_address_invalid: "L’indirizzo email non è valido.",
  validation_failed: "Controlla email e password.",
  email_not_confirmed: "Devi prima confermare l’email: controlla la posta.",
  over_email_send_rate_limit: "Troppi tentativi: riprova tra qualche minuto.",
  over_request_rate_limit: "Troppi tentativi: riprova tra qualche minuto.",
  signup_disabled: "Le registrazioni sono disattivate.",
};

export function authErrorMessage(error: AuthError | Error): string {
  const code = "code" in error ? error.code : undefined;
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (error.message.toLowerCase().includes("fetch")) return "Connessione assente: riprova quando sei online.";
  return "Qualcosa è andato storto. Riprova.";
}
