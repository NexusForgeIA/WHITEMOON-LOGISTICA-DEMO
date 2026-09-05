/* =========================================================================
   hugo.js — el agente IA de la demo, en el navegador
   =========================================================================
   Aquí NO se calcula nada. Este fichero:

     1) manda la conversación a la Edge Function logistica-chat,
     2) pinta lo que Hugo escribe,
     3) pinta la ficha de métricas TAL CUAL viene del servidor, donde la ha
        calculado calculo.ts en TypeScript,
     4) y cuando el servidor devuelve un contacto validado, dispara el lead
        por lead.js — el único sitio de la demo que habla con leads_web y con
        logistica-notify.

   Las cifras que se ven en pantalla salen del objeto `metricas`. Este
   fichero las FORMATEA (miles, decimales, es-ES) pero no las deriva: si un
   número no está en `metricas`, no se pinta.

   Aquí no hay ninguna clave de API. La de Anthropic vive como secret de la
   Edge Function y no sale de allí.
   ========================================================================= */
(function () {
  "use strict";

  var U = window.WhiteMoonUtil;
  var L = window.WhiteMoonLead;
  if (!U || !L) return;

  var CHAT_URL = "https://mlaqtniujnvfxcvcourm.supabase.co/functions/v1/logistica-chat";
  var WHATSAPP = "https://wa.me/34643199580";

  var log     = document.getElementById("hugo-log");
  var form    = document.getElementById("hugo-form");
  var entrada = document.getElementById("hugo-input");
  var boton   = document.getElementById("hugo-btn");
  if (!log || !form || !entrada || !boton) return;

  /* Historial que viaja al servidor: solo texto plano, sin la ficha. El
     saludo inicial NO entra, porque la API espera que el primer mensaje sea
     de la persona. */
  var historial = [];

  /* Lo último que el servidor calculó, para adjuntarlo al lead. */
  var ultimoResumen = "";
  var ultimasMetricas = null;

  /* Un evento, una notificación: en cuanto el lead sale, no se repite por
     mucho que la conversación siga. */
  var leadEnviado = false;

  var esperando = false;

  /* ------------------------------------------------------------- pintado */

  function alFinal() {
    log.scrollTop = log.scrollHeight;
  }

  function burbuja(quien, html) {
    var div = document.createElement("div");
    div.className = "msg msg-" + quien;
    div.innerHTML =
      '<span class="msg-quien">' + (quien === "hugo" ? "Hugo" : "Tú") + "</span>" +
      '<div class="msg-cuerpo">' + html + "</div>";
    log.appendChild(div);
    alFinal();
    return div;
  }

  /* El texto de Hugo llega en párrafos separados por saltos de línea. Se
     escapa entero: nada de lo que devuelve el modelo se interpreta como
     HTML. */
  function parrafos(texto) {
    return String(texto || "")
      .split(/\n{1,}/)
      .map(function (t) { return t.trim(); })
      .filter(Boolean)
      .map(function (t) { return "<p>" + U.escapa(t) + "</p>"; })
      .join("");
  }

  function dice(texto) { return burbuja("hugo", parrafos(texto)); }

  function pensando() {
    return burbuja("hugo",
      '<p class="puntos" aria-label="Hugo está escribiendo">' +
      "<span></span><span></span><span></span></p>");
  }

  /* ------------------------------------------------------ ficha de métricas

     Cada cifra sale de `m`, que viene del servidor. Lo único que se hace
     aquí es formatear en español y ordenar la tabla del cómo. */
  function fichaMetricas(m) {
    var kg  = function (v) { return U.num.format(v) + " kg"; };
    var m3  = function (v) { return U.num3.format(v) + " m³"; };
    var cm3 = m.largoCm * m.anchoCm * m.altoCm;   // las mismas tres medidas

    var dims = U.num.format(m.largoCm) + " × " + U.num.format(m.anchoCm) +
               " × " + U.num.format(m.altoCm) + " cm";

    var manda = m.criterio === "volumetrico" ? "volumétrico" : "real";

    var pales = m.sobredimensionado
      ? "Cada bulto excede el sobre estándar de un europalet (" +
        U.num.format(m.paletLargoCm) + " × " + U.num.format(m.paletAnchoCm) +
        " × " + U.num.format(m.alturaUtilCm) + " cm), así que va uno por palet."
      : U.num.format(m.bultosPorBase) + " por capa × " +
        U.num.format(m.capasPorPalet) + (m.capasPorPalet === 1 ? " capa" : " capas") +
        " = " + U.num.format(m.bultosPorPalet) + " bulto(s) por europalet";

    return '' +
      '<div class="metricas">' +
        '<p class="metricas-h">Métricas de tu envío</p>' +
        '<ul class="metricas-grid">' +
          '<li><span>Volumen total</span><b>' + m3(m.volumenTotalM3) + "</b></li>" +
          '<li><span>Peso volumétrico</span><b>' + kg(m.pesoVolumetricoKg) + "</b></li>" +
          '<li><span>Peso facturable</span><b class="destaca">' + kg(m.pesoFacturableKg) + "</b></li>" +
          '<li><span>Palés estimados</span><b>' + U.num.format(m.palesEstimados) +
            ' <small>estimado</small></b></li>' +
        "</ul>" +

        '<table class="desglose">' +
          "<caption>De dónde sale cada cifra</caption><tbody>" +
          U.fila("Carga declarada",
            U.num.format(m.bultos) + " bulto(s) de " + dims + ", " + kg(m.pesoRealKg)) +
          U.fila("Volumen por bulto",
            U.num.format(cm3) + " cm³ ÷ 1.000.000 = " + m3(m.volumenBultoM3)) +
          U.fila("Volumen total",
            m3(m.volumenBultoM3) + " × " + U.num.format(m.bultos) + " = " + m3(m.volumenTotalM3), "sum") +
          U.fila("Peso volumétrico por bulto",
            U.num.format(cm3) + " cm³ ÷ " + U.num.format(m.factorVolumetrico) + " = " +
            kg(m.pesoVolumetricoBultoKg)) +
          U.fila("Peso volumétrico total",
            kg(m.pesoVolumetricoBultoKg) + " × " + U.num.format(m.bultos) + " = " +
            kg(m.pesoVolumetricoKg), "sum") +
          U.fila("Peso facturable",
            "el mayor de " + kg(m.pesoRealKg) + " y " + kg(m.pesoVolumetricoKg) +
            " → manda el peso " + manda, "grand") +
          U.fila("Palés estimados", pales) +
          "</tbody>" +
        "</table>" +

        '<p class="aviso aviso-g">' +
          "<b>Cálculo real, no inventado.</b> Volumen, peso volumétrico (factor " +
          U.num.format(m.factorVolumetrico) + ") y peso facturable son fórmulas " +
          "estándar del sector y las hace el código, no el modelo de lenguaje. " +
          "Los palés son una <b>estimación geométrica</b> por footprint de europalet " +
          U.num.format(m.paletLargoCm) + " × " + U.num.format(m.paletAnchoCm) +
          " cm y altura útil " + U.num.format(m.alturaUtilCm) +
          " cm: no tiene en cuenta el límite de peso por palet ni si la mercancía " +
          "es apilable. Aquí no se calcula ningún precio." +
        "</p>" +
      "</div>";
  }

  /* --------------------------------------------------------------- lead */

  /* Etiqueta corta de la carga para el CRM. Solo formatea campos de `m`. */
  function etiquetaCarga(m) {
    if (!m) return "conversación con el agente";
    return U.num.format(m.bultos) + " bulto(s) · " +
           U.num3.format(m.volumenTotalM3) + " m³ · " +
           U.num.format(m.pesoFacturableKg) + " kg facturables";
  }

  function mandaLead(contacto) {
    if (leadEnviado) return;
    leadEnviado = true;

    L.send({
      nombre: contacto.nombre,
      telefono: contacto.telefono,
      calculadora: "Agente IA Hugo",
      resumen: etiquetaCarga(ultimasMetricas),
      total: ultimasMetricas
        ? U.num.format(ultimasMetricas.pesoFacturableKg) + " kg facturables"
        : "sin cálculo",
      mensaje: ultimoResumen || "Contacto dejado en el chat del agente sin cálculo previo."
    }).then(function (res) {
      if (res && res[0]) {
        burbuja("hugo",
          '<p class="ok-lead">Contacto registrado: <b>' + U.escapa(contacto.nombre) +
          "</b> · " + U.escapa(contacto.telefono) + ". El equipo te llama con el " +
          "presupuesto en firme.</p>");
      } else {
        /* Si el registro falla, se dice. No se finge un "recibido". */
        leadEnviado = false;
        burbuja("hugo",
          '<p class="err-lead">No he podido registrar tu contacto. Escríbenos por ' +
          'WhatsApp al <a href="' + WHATSAPP + '" rel="noopener">643 199 580</a> ' +
          "y lo resolvemos al momento.</p>");
      }
    });
  }

  /* ------------------------------------------------------------- diálogo */

  function bloquea(si) {
    esperando = si;
    entrada.disabled = si;
    boton.disabled = si;
  }

  function envia(texto) {
    var t = String(texto || "").trim();
    if (!t || esperando) return;

    burbuja("tu", "<p>" + U.escapa(t) + "</p>");
    historial.push({ role: "user", content: t });
    entrada.value = "";
    bloquea(true);

    var espera = pensando();

    fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: historial })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        espera.remove();

        var reply = (d && d.reply) ||
          "No he entendido eso. ¿Me lo repites?";
        dice(reply);
        historial.push({ role: "assistant", content: reply });

        if (d && d.metricas) {
          ultimasMetricas = d.metricas;
          ultimoResumen = d.resumen || "";
          burbuja("hugo", fichaMetricas(d.metricas));
        }
        if (d && d.contacto) mandaLead(d.contacto);
      })
      .catch(function (e) {
        console.warn("[WhiteMoon] hugo:", e);
        espera.remove();
        burbuja("hugo",
          '<p>Se me ha caído la conexión. Escríbenos por WhatsApp al ' +
          '<a href="' + WHATSAPP + '" rel="noopener">643 199 580</a> ' +
          "y seguimos por ahí.</p>");
      })
      .then(function () {
        bloquea(false);
        entrada.focus();
        alFinal();
      });
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    envia(entrada.value);
  });

  /* Atajos de ejemplo: rellenan el campo, no envían solos. Quien enseña la
     demo delante de un cliente quiere ver el texto antes de mandarlo. */
  Array.prototype.forEach.call(document.querySelectorAll("[data-hugo-ejemplo]"), function (b) {
    b.addEventListener("click", function () {
      entrada.value = b.getAttribute("data-hugo-ejemplo");
      entrada.focus();
    });
  });

  /* Saludo. Fuera del historial: la conversación con la API empieza cuando
     escribe la persona. */
  dice(
    "Soy Hugo, el agente de IA del equipo. Te saco el volumen, el peso " +
    "volumétrico, el peso facturable y los palés de tu carga.\n" +
    "¿Qué tienes que mover?"
  );
})();
