import { timingSafeEqual } from "node:crypto";

/**
 * Chiamata una volta al giorno dal cron di Vercel (vercel.json) per tenere attivo il progetto gratuito di Supabase,
 * che va in pausa dopo 7 giorni senza attività. Legge una riga fissa con la funzione keepalive() (migrazione 0011).
 * Vercel firma la chiamata con `Authorization: Bearer <CRON_SECRET>`: senza la firma giusta non si tocca il database.
 */
export async function GET(request: Request) {
  if (!isFromCron(request.headers.get("authorization"))) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return Response.json({ ok: false, error: "Supabase non configurato" }, { status: 500 });

  try {
    const response = await fetch(`${url}/rest/v1/rpc/keepalive`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.error("keepalive: risposta di Supabase", response.status);
      return Response.json({ ok: false, status: response.status }, { status: 502 });
    }
    const at: unknown = await response.json();
    console.log("keepalive: ok", at);
    return Response.json({ ok: true, at });
  } catch (error) {
    console.error("keepalive: Supabase non raggiungibile", error);
    return Response.json({ ok: false }, { status: 502 });
  }
}

/** Confronta la firma a tempo costante; senza CRON_SECRET configurato rifiuta sempre. */
function isFromCron(authorization: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
