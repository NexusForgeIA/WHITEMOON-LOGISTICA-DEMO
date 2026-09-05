import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/* =========================================================================
   logistica-chat — Hugo, el agente IA de la demo de transporte y logística
   =========================================================================
   Hugo CONVERSA. Hugo NO CALCULA.

   El modelo (claude-haiku-4-5-20251001) se encarga de lo que sabe hacer:
   entender lo que escribe la persona, pedir el dato que falta y extraer los
   números de la carga. En cuanto los tiene, llama a la herramienta
   `calcular_metricas_envio` y es `calculo.ts` —TypeScript, determinista—
   quien hace la aritmética. Los modelos de lenguaje fallan multiplicando;
   una cotización mal multiplicada es una mentira, así que la multiplicación
   no se le pide al modelo.

   Las cifras que ve el usuario viajan en el campo `metricas` de la respuesta
   y las pinta el cliente. El texto de Hugo las acompaña, no las repite: así
   ninguna cifra de la pantalla ha pasado nunca por el modelo.

   Contrato HTTP
   -------------
   POST  { messages: [{ role: "user" | "assistant", content: string }, …] }
   200   { reply, metricas | null, resumen | null, contacto | null }

   `metricas`  ficha calculada en TS, si en este turno se ha calculado.
   `resumen`   la misma ficha en una línea, para el CRM y el aviso.
   `contacto`  { nombre, telefono } ya validados, si la persona los ha dejado.
               El INSERT en leads_web y el aviso de Telegram los dispara el
               cliente (assets/js/hugo.js) reutilizando lead.js, que es donde
               vive la captación de esta demo.

   Secrets (nunca en cliente):
     - ANTHROPIC_API_KEY

   verify_jwt: false — la llama un navegador anónimo desde GitHub Pages.
   ========================================================================= */

import { calculaEnvio, normalizaTelefono, resumenCarga } from "./calculo.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const MODELO = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 450;
const MAX_HISTORIAL = 12;   // últimos 12 mensajes: suficiente para la carga
const MAX_VUELTAS = 3;      // llamada + herramienta + cierre

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const CAIDA =
  "Ahora mismo no puedo seguir la conversación. Escríbenos por WhatsApp al " +
  "643 199 580 y te atendemos al momento.";

const SYSTEM = `Eres Hugo, el agente de IA de una empresa de transporte y logística. Esto es una DEMO de WhiteMoon Agencia IA.

TU ÚNICO TRABAJO
Recoger los datos de la carga y devolver las métricas del envío. Nada más.

DATOS QUE NECESITAS
1. Tipo de carga (qué es la mercancía)
2. Peso real total, en kilos
3. Medidas de un bulto: largo × ancho × alto, en centímetros
4. Número de bultos

CÓMO PREGUNTAS
- UNA sola pregunta por mensaje. Máximo 3 frases. Tono cercano y directo.
- No repitas lo que ya te han dicho ni resumas antes de tiempo.
- Si te dan varios datos de golpe, los aprovechas todos y preguntas solo lo que falte.
- Si los bultos no son todos iguales, pide la medida del bulto tipo o del más grande y dilo claramente.
- El tipo de carga es útil pero NO bloquea: si tienes peso, las tres medidas y el número de bultos, calcula ya.

LA HERRAMIENTA DE CÁLCULO
- En cuanto tengas peso, largo, ancho, alto y número de bultos, llama a calcular_metricas_envio. No esperes a tener nada más.
- Si la persona corrige un dato, vuelve a llamarla con los datos corregidos.

PROHIBIDO CALCULAR TÚ
- NUNCA escribas un número de volumen, peso volumétrico, peso facturable o palés que no venga de la herramienta.
- Las cifras se muestran al usuario en una ficha aparte que pinta la web. TÚ NO LAS REPITES: no escribas las cifras en tu texto.
- Tras el cálculo, tu mensaje dice en una frase qué manda (peso real o volumétrico) SIN dar la cifra, y sigue.

PROHIBIDO INVENTAR
- NADA de precios, tarifas, importes en euros, plazos de entrega, ni cifras de la empresa.
- Si te piden precio: el presupuesto lo confirma el equipo, tú das las métricas de la carga.
- Nunca te inventes datos de la empresa, ni flota, ni rutas, ni clientes.

DESPUÉS DEL CÁLCULO
- Cierra SIEMPRE con esta idea, con estas palabras: "es una estimación de las métricas de tu envío; el presupuesto final lo confirma nuestro equipo".
- Y en el mismo mensaje pide el nombre y el teléfono para que el equipo llame con el presupuesto en firme.
- Cuando te den nombre y teléfono, llama a registrar_contacto. Si la herramienta dice que el teléfono no es válido, pídelo otra vez sin dramatizar.
- Cuando el contacto quede registrado, da las gracias en una frase y para.

WHATSAPP DE CONTACTO: 643 199 580`;

const HERRAMIENTAS = [
  {
    name: "calcular_metricas_envio",
    description:
      "Calcula las métricas del envío con fórmulas estándar del sector. " +
      "Devuelve volumen total, peso volumétrico, peso facturable y palés estimados. " +
      "Úsala en cuanto tengas el peso real, las tres medidas del bulto y el número de bultos.",
    input_schema: {
      type: "object",
      properties: {
        peso_real_kg: { type: "number", description: "Peso real TOTAL de la carga, en kilos." },
        largo_cm: { type: "number", description: "Largo de UN bulto, en centímetros." },
        ancho_cm: { type: "number", description: "Ancho de UN bulto, en centímetros." },
        alto_cm: { type: "number", description: "Alto de UN bulto, en centímetros." },
        bultos: { type: "integer", description: "Número de bultos iguales." },
        tipo_carga: { type: "string", description: "Qué es la mercancía, en pocas palabras. Cadena vacía si no lo han dicho." },
      },
      required: ["peso_real_kg", "largo_cm", "ancho_cm", "alto_cm", "bultos"],
    },
  },
  {
    name: "registrar_contacto",
    description:
      "Registra el nombre y el teléfono de la persona para que el equipo la llame con el presupuesto en firme. " +
      "Úsala solo cuando tengas los dos datos.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre de la persona." },
        telefono: { type: "string", description: "Teléfono tal cual lo ha escrito." },
      },
      required: ["nombre", "telefono"],
    },
  },
];

/* ------------------------------------------------------------------ tipos */

type Bloque = { type: string; [k: string]: unknown };
type Mensaje = { role: "user" | "assistant"; content: unknown };

/* ---------------------------------------------------------------- helpers */

/*
 * El historial llega del navegador, así que se sanea: solo roles conocidos,
 * solo texto, recortado, y como mucho los últimos MAX_HISTORIAL mensajes.
 * Anthropic exige además que el primero sea del usuario.
 */
function saneaHistorial(bruto: unknown): Mensaje[] {
  const lista = Array.isArray(bruto) ? bruto : [];
  const limpios: Mensaje[] = [];

  for (const m of lista) {
    const rol = (m as { role?: unknown })?.role;
    const txt = (m as { content?: unknown })?.content;
    if (rol !== "user" && rol !== "assistant") continue;
    if (typeof txt !== "string") continue;
    const t = txt.trim().slice(0, 2000);
    if (!t) continue;
    limpios.push({ role: rol, content: t });
  }

  const recorte = limpios.slice(-MAX_HISTORIAL);
  while (recorte.length && recorte[0].role !== "user") recorte.shift();
  return recorte;
}

function textoDe(bloques: unknown): string {
  if (!Array.isArray(bloques)) return "";
  return bloques
    .filter((b: Bloque) => b?.type === "text")
    .map((b: Bloque) => String(b.text ?? ""))
    .join("\n")
    .trim();
}

async function llamaAnthropic(mensajes: Mensaje[]) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      tools: HERRAMIENTAS,
      messages: mensajes,
    }),
  });

  if (!r.ok) {
    console.warn("[logistica-chat] Anthropic", r.status, await r.text());
    return null;
  }
  return await r.json();
}

/* -------------------------------------------------------------- servidor */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  /* Un fallo nunca deja al usuario en blanco: Hugo se disculpa y da el
     WhatsApp. Por eso el estado sigue siendo 200. */
  const caida = () => json({ reply: CAIDA, metricas: null, resumen: null, contacto: null });

  if (!ANTHROPIC_API_KEY) {
    console.warn("[logistica-chat] falta ANTHROPIC_API_KEY");
    return caida();
  }

  try {
    const cuerpo = await req.json().catch(() => ({}));
    const mensajes = saneaHistorial((cuerpo as { messages?: unknown }).messages);
    if (!mensajes.length) {
      return json({
        reply: "Cuéntame qué tienes que mover y te saco las métricas del envío.",
        metricas: null, resumen: null, contacto: null,
      });
    }

    /* Lo que este turno haya calculado de verdad, en TypeScript. */
    let metricas: unknown = null;
    let resumen: string | null = null;
    let contacto: { nombre: string; telefono: string } | null = null;

    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const data = await llamaAnthropic(mensajes);
      if (!data) return caida();

      if (data.stop_reason !== "tool_use") {
        const reply = textoDe(data.content) || CAIDA;
        return json({ reply, metricas, resumen, contacto });
      }

      /* El modelo pide herramienta: se guarda su turno y se ejecutan las
         llamadas AQUÍ, en código. */
      mensajes.push({ role: "assistant", content: data.content });

      const resultados: unknown[] = [];
      for (const bloque of data.content as Bloque[]) {
        if (bloque.type !== "tool_use") continue;
        const args = (bloque.input ?? {}) as Record<string, unknown>;
        let salida: unknown;

        if (bloque.name === "calcular_metricas_envio") {
          const r = calculaEnvio({
            pesoRealKg: Number(args.peso_real_kg),
            largoCm: Number(args.largo_cm),
            anchoCm: Number(args.ancho_cm),
            altoCm: Number(args.alto_cm),
            bultos: Math.round(Number(args.bultos)),
          });
          if (r.ok) {
            metricas = r.metricas;
            resumen = resumenCarga(r.metricas, String(args.tipo_carga ?? "").trim());
            /* Al modelo se le devuelve la ficha para que sepa que salió bien
               y de qué hablar, pero el prompt le prohíbe repetir las cifras:
               las pinta el cliente desde este mismo objeto. */
            salida = { ok: true, ...r.metricas };
          } else {
            salida = { ok: false, error: r.error };
          }
        } else if (bloque.name === "registrar_contacto") {
          const nombre = String(args.nombre ?? "").trim().slice(0, 80);
          const telefono = normalizaTelefono(args.telefono);
          if (!nombre) {
            salida = { ok: false, error: "Falta el nombre." };
          } else if (!telefono) {
            salida = { ok: false, error: "El teléfono no es válido: deben ser nueve dígitos empezando por 6, 7, 8 o 9." };
          } else {
            contacto = { nombre, telefono };
            salida = { ok: true, mensaje: "Contacto registrado. El equipo llamará con el presupuesto en firme." };
          }
        } else {
          salida = { ok: false, error: "Herramienta desconocida." };
        }

        resultados.push({
          type: "tool_result",
          tool_use_id: bloque.id,
          content: JSON.stringify(salida),
        });
      }

      mensajes.push({ role: "user", content: resultados });
    }

    /* Se acabaron las vueltas sin respuesta de texto: no se deja al usuario
       colgado, pero sí se avisa en el log. */
    console.warn("[logistica-chat] agotadas las vueltas de herramienta");
    return json({
      reply: "Ya tengo las métricas de tu envío. ¿Me dejas tu nombre y tu teléfono " +
             "y el equipo te llama con el presupuesto en firme?",
      metricas, resumen, contacto,
    });
  } catch (e) {
    console.warn("[logistica-chat] error:", e);
    return caida();
  }
});
