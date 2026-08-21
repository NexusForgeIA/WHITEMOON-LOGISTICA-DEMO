import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// logistica-notify — notifica por Telegram un nuevo lead de la demo de
// transporte y logística (WHITEMOON-LOGISTICA-DEMO). El lead ya se inserta en
// leads_web desde el cliente (origen='demo-logistica'); esta función SOLO
// envía la notificación vía Telegram Bot API, manteniendo el token
// EXCLUSIVAMENTE server-side.
//
// Recibe (POST): { nombre, telefono, calculadora, resumen, total, sector,
//                  origen, mensaje }.
//
// El cliente envía con navigator.sendBeacon y un Blob "text/plain;charset=
// UTF-8" — NO application/json: ese tipo dispararía un preflight CORS que
// sendBeacon no puede hacer, Chrome descartaría el POST y sendBeacon
// devolvería true igual. El cuerpo sigue siendo JSON, así que req.json() lo
// parsea sin problema (no mira el Content-Type), y si aun así fallara se
// reintenta leyéndolo como texto.
//
// Secrets usados (nunca en cliente):
//   - TELEGRAM_BOT_TOKEN : token del bot de Telegram
//   - TELEGRAM_CHAT_ID   : chat destino del aviso
//
// Regla del proyecto: si el envío falla → console.warn, nunca interrumpe nada.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    try {
      payload = JSON.parse(await req.text());
    } catch {
      payload = {};
    }
  }

  const data = (payload.args ?? payload) as Record<string, unknown>;
  const nombre = String(data.nombre ?? "").trim();
  const telefono = String(data.telefono ?? "").trim();
  const calculadora = String(data.calculadora ?? "sin especificar").trim();
  const resumen = String(data.resumen ?? "").trim();
  const total = String(data.total ?? "").trim();

  // Guard de lead incompleto — estándar WhiteMoon.
  if (!nombre || !telefono) {
    return json({ ok: false, error: "lead incompleto" }, 400);
  }

  const message =
    `🚚 Nueva cotización logística (${calculadora})\n` +
    `Contacto: ${nombre} · ${telefono}\n` +
    `${resumen || "-"}\n` +
    `Total orientativo: ${total || "-"}`;

  let notified = false;
  try {
    const tgToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const tgChat = Deno.env.get("TELEGRAM_CHAT_ID");
    if (tgToken && tgChat) {
      const r = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: tgChat, text: message }),
      });
      notified = r.ok;
      if (!r.ok) {
        console.warn("[logistica-notify] Telegram falló:", r.status, await r.text());
      }
    } else {
      console.warn("[logistica-notify] sin TELEGRAM_BOT_TOKEN/CHAT_ID, mensaje:", message);
    }
  } catch (e) {
    console.warn("[logistica-notify] error enviando Telegram:", e);
  }

  return json({ ok: true, notified });
});
