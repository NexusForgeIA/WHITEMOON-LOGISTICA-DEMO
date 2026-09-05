# WHITEMOON-LOGISTICA-DEMO — demo de empresa de transporte y logística

Landing de captación de una sola página para **empresas de transporte y
logística**, con una **suite de tres calculadoras en pestañas** como pieza
central. Marca: **WhiteMoon** (la propia agencia).

**En vivo:** https://nexusforgeia.github.io/WHITEMOON-LOGISTICA-DEMO/

HTML5 + CSS plano + JS vanilla. Sin React, Vite, Framer ni Tailwind.
Sin paso de build: GitHub Pages sirve el repo tal cual.

---

## Regla de oro: honestidad

Esta demo **no inventa datos**. No hay años de experiencia, flota, reseñas,
testimonios, clientes reales ni cifras de resultados. No hay ni un dato, ni
una marca, ni una tarifa copiada de ninguna empresa externa.

Las tres tarifas de las calculadoras son **tablas de ejemplo**, etiquetadas
como *"Tarifa demo orientativa"* en la propia página, en cada desplegable de
tarifa, en el pie y en `llms.txt`. Todo resultado se presenta como **importe
orientativo que confirma el equipo**, y dos de las tres calculadoras devuelven
un **rango** en lugar de un número, precisamente porque un número cerrado ahí
sería mentira.

---

## Estructura

```
index.html                                landing completa
assets/css/styles.css                     sistema de diseño + @font-face de Sora
assets/fonts/sora-{latin,latin-ext}.woff2
assets/js/tarifa.js                       ÚNICA fuente de tarifas de las 3 calculadoras
assets/js/util.js                         formato es-ES y helpers compartidos
assets/js/lead.js                         captación — ÚNICO sitio con config de Supabase
assets/js/calc-terrestre.js               calculadora 1 · portes terrestre
assets/js/calc-contenedores.js            calculadora 2 · contenedores por carretera
assets/js/calc-maritimo.js                calculadora 3 · marítimo import/export
assets/js/hugo.js                         agente IA Hugo — solo pinta, no calcula
assets/js/site.js                         pestañas accesibles, reveal y año del pie
assets/img/                               11 fotos locales + og:image + favicons
supabase/functions/logistica-chat/        Edge Function del agente Hugo
  index.ts                                conversación, herramientas y CORS
  calculo.ts                              ÚNICA fuente de las métricas de envío
supabase/functions/logistica-notify/      Edge Function del aviso por Telegram
tests/calc.test.js                        verificación de las 3 fórmulas sin navegador
tests/hugo.test.js                        verificación de las métricas del agente
robots.txt  sitemap.xml  llms.txt  .nojekyll
```

Orden de secciones: **Hero · Servicios · Calculadoras · Agente IA · Cómo
funciona · Rutas y zonas · FAQ · Contacto**.

Todo el contenido va dentro de un único `<main id="contenido">`; el `<header>`
y el `<footer>` quedan fuera, así que hay un solo landmark principal.

---

## La suite de calculadoras

Las tres viven en el mismo bloque, en **pestañas con el patrón ARIA completo**
(`role="tablist"`, roving `tabindex`, flechas, `Home`/`End`). Los paneles
inactivos van con `hidden`, así que sus formularios tampoco son tabulables.
Se puede enlazar directamente a una: `/#panel-maritimo` abre esa pestaña.

### 1 · Portes terrestre (nacional) — cálculo cerrado

La única que devuelve un importe concreto.

```
Volumen (m³)    = ancho × largo × alto
Peso vol. (kg)  = Volumen × 250 kg/m³
Peso facturable = max(peso real, peso volumétrico)
Base (€)        = fijo del tramo + peso facturable × €/kg del tramo
Base zona (€)   = Base × factor de zona
Subtotal (€)    = Base zona × (1 + %comb + %urg + %ADR) + plataforma + reembolso
Total (€)       = Subtotal × (1 + IVA)
```

Cada línea del desglose se redondea a céntimos y el subtotal es la suma de las
líneas ya redondeadas: un presupuesto que no cuadra en pantalla no vale para
nada.

**Caso de referencia** — palé de colchones de 1,2 × 0,8 × 1,6 m y 80 kg:
1,536 m³ → 384 kg volumétricos → peso facturable 384 kg → tramo 101–500 kg →
45 € + 384 × 0,18 = **114,12 €** de base en península antes de recargos e IVA.
Está cubierto por un test.

**Nota sobre el tramo de más de 1.000 kg.** La especificación pedía
`>1000 kg → 0,10 €/kg` sin importe fijo. Con fijo 0, un envío de 1.001 kg
costaría 100,10 € frente a los 205 € de uno de 1.000 kg: el precio bajaría al
subir el peso. El tramo lleva por eso un fijo de **105 €**, que hace la curva
continua (en 1.000 kg ambos tramos dan exactamente 205 €) manteniendo el
0,10 €/kg pedido. Hay un test que recorre de 1 a 3.000 kg comprobando que el
total nunca decrece.

### 2 · Contenedores por carretera — rango por kilómetro

Devuelve una **horquilla**. Franjas demo: 20' 0,90–1,30 €/km · 40' (y 40' HC)
1,10–1,60 €/km · contenedor de obra 1,20–1,80 €/km. Tramo internacional UE
×1,15. Mínimo de servicio 150 €, que actúa de suelo en los dos extremos: en un
trayecto muy corto el resultado deja de ser horquilla y pasa a ser
*"desde 150 €"*. Los extremos se redondean a la decena — abajo el mínimo,
arriba el máximo — porque una horquilla con céntimos aparenta una precisión
que este cálculo no tiene. Importes sin IVA.

### 3 · Marítimo import/export — cotización guiada

**No cierra un precio a propósito.** Enseña la horquilla de flete base del
equipo (20' 600–1.400 € · 40' y 40' HC 900–2.100 €) y enumera **sin cifra** los
conceptos que se suman: THC en destino, BAF, despacho de aduana (DUA),
transporte terrestre desde el puerto, IGIC y despacho canario si el destino es
Las Palmas, y recargo IMO si la mercancía es peligrosa. Con incoterm EXW se
añaden recogida en origen, despacho de exportación y THC de origen.

Su objetivo real es **captar el lead con los parámetros de la operación**, que
es justo lo que el equipo necesita para pedir tarifa a las navieras.

### Una sola fuente de precios

`assets/js/tarifa.js` es el **único** fichero con importes. Ni el HTML, ni el
CSS, ni las tres calculadoras repiten un número: las tablas de tarifa que se
ven en la web se pintan desde ahí, igual que la etiqueta
*"Tarifa demo orientativa · v2026-08"*. Cambiar ese fichero cambia la web
entera. Sustituirlo por la tarifa real de un cliente es todo el trabajo de
personalización.

### Tests

```bash
node tests/calc.test.js
```

27 asertos sobre las tres fórmulas, sin navegador y sin dependencias: el DOM
se sustituye por un objeto que devuelve `null` en todo, así que cada
calculadora expone su motor y se detiene antes de montar la interfaz.

---

## El agente IA · Hugo

Hugo es la cuarta pieza de la demo, en `#agente`, debajo de las calculadoras.
**Conversa como un agente y calcula como un programa.** Recoge los datos de la
carga hablando y devuelve cuatro métricas del envío. No da precios.

### El reparto de trabajo, que es lo que importa

| Quién | Qué hace |
|---|---|
| El modelo (`claude-haiku-4-5-20251001`) | Conversa, pregunta lo que falta y **extrae** los números de la carga. |
| `calculo.ts` (TypeScript) | **Hace toda la aritmética.** |
| El navegador | Pinta la ficha de métricas y dispara el lead por `lead.js`. |

Los modelos de lenguaje fallan multiplicando, así que no se les pide que
multipliquen. El modelo llama a la herramienta `calcular_metricas_envio` con
los datos que ha entendido; la Edge Function ejecuta el cálculo en código,
devuelve la ficha en el campo `metricas` de la respuesta y el navegador la
pinta desde ahí. **Ninguna cifra de las que se ven en pantalla ha pasado por
el modelo**, y el prompt le prohíbe explícitamente repetirlas en su texto.

### Las cuatro métricas

```
Volumen por bulto (m³) = largo × ancho × alto (cm) / 1.000.000
Volumen total (m³)     = volumen por bulto × nº de bultos
Peso volumétrico (kg)  = largo × ancho × alto (cm) / 5000, por bulto
Peso facturable (kg)   = max(peso real, peso volumétrico)
Palés estimados        = bultos por capa sobre europalet 120 × 80 cm,
                         apilados hasta 180 cm de altura útil
```

Son las fórmulas **estándar del sector**, no invenciones de la demo. El factor
5000 es el divisor volumétrico habitual en grupaje y courier (1 m³ = 200 kg) y
se muestra explícito en la ficha para que cualquiera pueda rehacer la cuenta.

Los palés son lo único aproximado y por eso van etiquetados como **estimado**:
es una estimación *geométrica* —bultos por capa probando las dos orientaciones
sobre la base del europalet, apilados hasta la altura útil— que no considera
el límite de peso por palet ni si la mercancía es apilable. Un bulto que no
entra en ese sobre se marca como sobredimensionado en vez de forzar el número.

Ejemplo verificable a mano: 6 bultos de 120 × 80 × 100 cm con 900 kg reales →
0,96 m³ por bulto → 5,76 m³ · 192 kg volumétricos por bulto → 1.152 kg ·
peso facturable 1.152 kg (manda el volumétrico) · 6 palés estimados.

### Qué no hace

Ni un euro. Hugo no cotiza importes, no aplica tarifas y no inventa plazos.
Para un número en euros están las tres calculadoras, con su tarifa demo
etiquetada. Cierra siempre diciendo que es una estimación de las métricas y
que el presupuesto lo confirma el equipo.

### La Edge Function `logistica-chat`

`verify_jwt: false` (la llama un navegador anónimo desde GitHub Pages), CORS
abierto, `max_tokens: 450` y las últimas **12** entradas del historial. La
`ANTHROPIC_API_KEY` vive como *secret* de la función y **nunca** sale de ahí:
en el cliente no hay ninguna clave de API.

Dos herramientas, las dos ejecutadas en código:

- `calcular_metricas_envio` → `calculo.ts`.
- `registrar_contacto` → valida el teléfono con la **misma** regla que
  `lead.js` (nueve dígitos empezando por 6, 7, 8 o 9) y devuelve el contacto
  ya normalizado. La validación es una comprobación, no una opinión, así que
  tampoco se le deja al modelo.

Si algo falla —sin clave, Anthropic caído, red rota— la función responde 200
con un mensaje de Hugo y el WhatsApp. El usuario nunca ve una pantalla en
blanco.

### Tests del agente

```bash
node tests/hugo.test.js
```

22 asertos que importan **el mismo `calculo.ts`** que corre en producción
(Node 24 quita los tipos por su cuenta), así que se prueba la aritmética real
y no una copia. Cada aserto lleva la cuenta hecha a mano al lado.

---

## Captación del lead

Tras cualquiera de los tres cálculos aparece un bloque de contacto, y el
agente Hugo pide nombre y teléfono al terminar sus métricas. Los dos caminos
pasan por el mismo `lead.js`, así que la captación se escribe una sola vez.
Al enviarlo se disparan **dos cosas en paralelo**, no encadenadas:

1. **INSERT en `leads_web`** (Supabase `mlaqtniujnvfxcvcourm`) por REST con la
   *publishable key*, protegida por RLS. **Un reintento a los 800 ms si
   PostgREST devuelve 503**: el proyecto devuelve 503 transitorios y sin
   reintento ese lead se pierde. Mapeo:
   `nombre` · `telefono` · `sector='logistica'` · `origen='demo-logistica'` ·
   `interes` = calculadora + resumen de ruta/tipo · `mensaje` = desglose
   completo del cálculo en texto plano.
2. **Aviso a Telegram** vía la Edge Function `logistica-notify`, con
   `navigator.sendBeacon` y un Blob `text/plain;charset=UTF-8`. **No
   `application/json`**: ese tipo dispara un preflight CORS que `sendBeacon` no
   puede hacer, Chrome descarta el POST y `sendBeacon` devuelve `true` igual →
   silencio. Fallback a `fetch` con `keepalive`.

Ningún token ni secreto vive en el cliente. `TELEGRAM_BOT_TOKEN` y
`TELEGRAM_CHAT_ID` son Secrets de la Edge Function, que va con
`verify_jwt: false` y un guard de lead incompleto (sin nombre + teléfono
devuelve 400).

Formato del aviso:

```
🚚 Nueva cotización logística ({calculadora})
Contacto: {nombre} · {telefono}
{resumen ruta/tipo}
Total orientativo: {total}
```

Despliegue de la función:

```bash
supabase functions deploy logistica-notify \
  --project-ref mlaqtniujnvfxcvcourm --no-verify-jwt
```

---

## Imágenes

Las 11 fotos son de **Unsplash** con licencia libre y están **descargadas y
servidas en local** (`assets/img/`), nunca por hotlink. Son imágenes de stock
de transporte y logística en general: se descartaron las tomas con marcas de
navieras o de fabricantes legibles, y los `alt` describen exactamente lo que se
ve en cada foto.

Todas se sirven ya recortadas a su tamaño final, con `width` y `height`
declarados para que no haya *layout shift*, y con `loading="lazy"` salvo el
hero, que va con `fetchpriority="high"` y precargado.

---

## Accesibilidad

- Skip link a `#contenido`; un solo `<main>`.
- Pestañas con el patrón ARIA completo: roving `tabindex`, flechas, `Home`,
  `End`, y los paneles ocultos con `hidden` para que no sean tabulables.
- Contraste verificado sobre el fondo `#08080d`: texto `--text` y `--muted`
  (5,8:1), acentos en `--p2` (5,9:1) y `--g` (10,5:1). El morado `--p` solo se
  usa como fondo de botón (4,8:1 con texto blanco) o como decoración, nunca
  como color de texto pequeño.
- `:focus-visible` explícito en todo lo enfocable, con `outline-offset`.
- Todos los campos con `<label>` asociado; errores de validación en un
  `role="alert"` y cada resultado en un `role="status" aria-live="polite"`.
- `aria-invalid` en los campos que fallan la validación.
- Objetivos táctiles de 48 px mínimo.
- `<noscript>` con vía alternativa de contacto para las calculadoras.
- `prefers-reduced-motion: reduce` desactiva animaciones, transiciones, el
  reveal al hacer scroll y el scroll suave.

---

## SEO / GEO / AEO

- `<title>`, meta description, canonical y Open Graph con imagen 1200×630.
- JSON-LD: `WebSite`, `Organization`, `WebPage` (con
  `disambiguatingDescription` advirtiendo de que la tarifa es de demostración)
  y `FAQPage` con las cinco preguntas principales.
- `robots.txt` indexable, con `Allow` explícito para GPTBot, ClaudeBot,
  PerplexityBot y Google-Extended.
- `sitemap.xml` con la imagen destacada.
- `llms.txt` con el resumen en lenguaje natural, las tres fórmulas completas y
  la advertencia de que la tarifa es de demostración y no debe citarse como
  precio de mercado.

---

## Responsive

Mobile-first, con dos cortes: **900 px** (el panel de resultado deja de ser
*sticky* y las rejillas pasan a una columna) y **600 px** (las filas de campos
se apilan y el `tablist` rueda en horizontal en vez de partirse en tres
líneas, que taparían el formulario).
