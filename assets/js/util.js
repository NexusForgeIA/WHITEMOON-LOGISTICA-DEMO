/* =========================================================================
   util.js — utilidades compartidas por las tres calculadoras
   =========================================================================
   Formato español de números e importes, lectura tolerante de campos
   numéricos y helpers de validación. Aquí no hay ni un solo precio: los
   precios viven en tarifa.js y solo ahí.
   ========================================================================= */
(function () {
  "use strict";

  var eur = new Intl.NumberFormat("es-ES", {
    style: "currency", currency: "EUR",
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  /* Los rangos de las calculadoras 2 y 3 se leen mejor sin céntimos: un
     "1.240 € – 1.790 €" comunica horquilla; un "1.240,00 €" comunica una
     precisión que esas dos calculadoras no tienen. */
  var eur0 = new Intl.NumberFormat("es-ES", {
    style: "currency", currency: "EUR",
    minimumFractionDigits: 0, maximumFractionDigits: 0
  });
  var num  = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
  /* El volumen necesita tres decimales: 1,536 m³ redondeado a 1,54 deja de
     explicar de dónde salen los 384 kg volumétricos. */
  var num3 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 3 });

  function pct(v) { return num.format(v * 100) + " %"; }
  function redondea(n) { return Math.round(n * 100) / 100; }

  function escapa(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function normaliza(s) {
    return String(s || "")
      .trim().toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ");
  }

  /*
   * Lee un número escrito por una persona española: "1,2", "1.2", "1.234,5"
   * o "  80 ". Si hay punto Y coma, el punto es separador de miles. Se exige
   * que la cadena entera sea un número: "12 cajas" no cuela como 12.
   * Devuelve NaN si el campo está vacío o no es un número limpio.
   */
  function leeNum(el) {
    if (typeof el === "string") el = document.getElementById(el);
    if (!el) return NaN;
    var t = String(el.value).trim().replace(/\s/g, "");
    if (!t) return NaN;
    if (t.indexOf(",") !== -1 && t.indexOf(".") !== -1) t = t.replace(/\./g, "");
    t = t.replace(",", ".");
    if (!/^\d*\.?\d+$/.test(t)) return NaN;
    var v = parseFloat(t);
    return isFinite(v) ? v : NaN;
  }

  function marcaError(id, hay) {
    var el = typeof id === "string" ? document.getElementById(id) : id;
    if (el) el.setAttribute("aria-invalid", hay ? "true" : "false");
  }

  function prefiereQuieto() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /* Lleva el resultado a la vista en móvil, donde el panel de resultado cae
     por debajo del formulario y si no se hace se queda fuera de pantalla. */
  function enfocaResultado(el) {
    if (!el) return;
    if (window.matchMedia("(max-width: 900px)").matches) {
      el.scrollIntoView({ behavior: prefiereQuieto() ? "auto" : "smooth", block: "start" });
    }
  }

  /* Pinta una fila del desglose. `cls` marca subtotales (sum) y total (grand). */
  function fila(th, td, cls) {
    return '<tr' + (cls ? ' class="' + cls + '"' : "") +
      '><th scope="row">' + th + "</th><td>" + td + "</td></tr>";
  }

  window.WhiteMoonUtil = {
    eur: eur, eur0: eur0, num: num, num3: num3,
    pct: pct, redondea: redondea, escapa: escapa, normaliza: normaliza,
    leeNum: leeNum, marcaError: marcaError,
    prefiereQuieto: prefiereQuieto, enfocaResultado: enfocaResultado,
    fila: fila
  };
})();
