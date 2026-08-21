/* =========================================================================
   calc-maritimo.js — CALCULADORA 3 · marítimo import / export
   =========================================================================
   Esta calculadora NO cierra un precio, y no lo hace a propósito. El flete
   marítimo lo publica cada naviera por ruta y por semana: cualquier número
   cerrado que saliera de aquí estaría mal al día siguiente.

   Lo que sí hace, que es lo útil:
     · Enseña la horquilla de flete base del equipo elegido (tarifa.js).
     · Enumera, como CONCEPTOS y sin cifra, todo lo que se suma al flete:
       THC, BAF, despacho de aduana (DUA), transporte terrestre, IGIC si el
       destino es Canarias y recargo IMO si la mercancía es peligrosa.
     · Explica qué cubre el incoterm elegido y qué queda fuera.
     · Recoge los parámetros de la operación junto al contacto, que es lo
       que el equipo necesita para pedir tarifa real a las navieras.
   ========================================================================= */
(function () {
  "use strict";

  var T = window.WhiteMoonTarifa;
  var U = window.WhiteMoonUtil;
  if (!T || !U) return;

  var TARIFA = T.MARITIMO;
  var eur0 = U.eur0;

  function porId(lista, id) {
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return lista[0];
  }

  /* ------------------------------------------------------------- cotización */

  /* cotiza({ origen, destinoId, equipoId, incotermId, peligrosa }) */
  function cotiza(d) {
    var equipo   = porId(TARIFA.equipos, d.equipoId);
    var destino  = porId(TARIFA.puertosDestino, d.destinoId);
    var incoterm = porId(TARIFA.incoterms, d.incotermId);

    /* Los conceptos se acumulan en el orden en que ocurren en la operación:
       primero lo de origen (según incoterm), después lo común, y al final
       los específicos del destino y de la mercancía. */
    var conceptos = incoterm.conceptos.slice();
    conceptos = conceptos.concat(TARIFA.conceptosBase);
    if (destino.canarias) conceptos.push(TARIFA.conceptoCanarias);
    if (d.peligrosa) conceptos.push(TARIFA.conceptoPeligrosa);

    return {
      origen: String(d.origen || "").trim(),
      destino: destino,
      equipo: equipo,
      incoterm: incoterm,
      peligrosa: !!d.peligrosa,
      fleteMin: equipo.min,
      fleteMax: equipo.max,
      conceptos: conceptos
    };
  }

  function fleteTexto(c) { return eur0.format(c.fleteMin) + " – " + eur0.format(c.fleteMax); }

  function rutaTexto(c) { return c.origen + " → " + c.destino.nombre; }

  function resumenTexto(c) {
    return rutaTexto(c) + " · " + c.equipo.corto + " · " + c.incoterm.id +
           (c.peligrosa ? " · mercancía peligrosa" : "");
  }

  function desgloseTexto(c) {
    var l = [];
    l.push("COTIZACIÓN GUIADA ORIENTATIVA · MARÍTIMO (" + T.ETIQUETA + ")");
    l.push("Ruta: " + rutaTexto(c) + " (" + c.destino.detalle + ")");
    l.push("Equipo: " + c.equipo.nombre);
    l.push("Incoterm: " + c.incoterm.nombre + " — " + c.incoterm.resumen);
    l.push("Mercancía peligrosa: " + (c.peligrosa ? "sí" : "no"));
    l.push("Flete base orientativo: " + fleteTexto(c) + " (solo flete, sin recargos ni impuestos)");
    l.push("Conceptos que se suman al flete, sin cifra cerrada:");
    c.conceptos.forEach(function (x) { l.push("  · " + x.nombre + " — " + x.detalle); });
    l.push("El flete marítimo varía según naviera, ruta y fecha. Estimación orientativa:");
    l.push("el equipo confirma la tarifa real con las navieras de esa ruta.");
    return l.join("\n");
  }

  window.WhiteMoonCalcMaritimo = {
    cotiza: cotiza,
    fleteTexto: fleteTexto,
    resumenTexto: resumenTexto,
    desgloseTexto: desgloseTexto,
    TARIFA: TARIFA
  };

  /* ============================== INTERFAZ ============================== */

  var $ = function (s) { return document.getElementById(s); };

  var form = $("form-maritimo");
  if (!form) return;

  var salida   = $("res-maritimo");
  var vacio    = $("res-maritimo-vacio");
  var errorBox = $("err-maritimo");
  var ultima   = null;

  /* Selects y datalist se rellenan desde tarifa.js: añadir un puerto o un
     equipo allí lo hace aparecer aquí sin tocar el HTML. */
  var selDestino = $("m-destino");
  if (selDestino && !selDestino.options.length) {
    selDestino.innerHTML = TARIFA.puertosDestino.map(function (p) {
      return '<option value="' + p.id + '">' + U.escapa(p.nombre) + "</option>";
    }).join("");
  }
  var selEquipo = $("m-equipo");
  if (selEquipo && !selEquipo.options.length) {
    selEquipo.innerHTML = TARIFA.equipos.map(function (e) {
      return '<option value="' + e.id + '">' + U.escapa(e.nombre) + "</option>";
    }).join("");
  }
  var selInco = $("m-incoterm");
  if (selInco && !selInco.options.length) {
    selInco.innerHTML = TARIFA.incoterms.map(function (i) {
      return '<option value="' + i.id + '">' + U.escapa(i.nombre) + "</option>";
    }).join("");
  }
  var lista = $("m-origenes");
  if (lista && !lista.options.length) {
    lista.innerHTML = TARIFA.origenesFrecuentes.map(function (o) {
      return '<option value="' + U.escapa(o) + '"></option>';
    }).join("");
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();

    var origen = $("m-origen").value.trim();
    var mal = origen.length < 3;
    U.marcaError("m-origen", mal);

    if (mal) {
      errorBox.innerHTML = "<strong>Falta el origen.</strong><ul>" +
        "<li>Escribe el puerto o el país de salida de la mercancía. Si aún no lo sabes con precisión, " +
        "el país basta para empezar a pedir tarifa.</li></ul>";
      errorBox.hidden = false;
      return;
    }
    errorBox.hidden = true;

    ultima = cotiza({
      origen: origen,
      destinoId: $("m-destino").value,
      equipoId: $("m-equipo").value,
      incotermId: $("m-incoterm").value,
      peligrosa: $("m-peligrosa").checked
    });
    pinta(ultima);
  });

  function pinta(c) {
    var fila = U.fila;
    var html = "";

    html += '<div class="total-box">' +
      '<p class="k">Flete base orientativo · sin recargos ni impuestos</p>' +
      '<p class="v">' + fleteTexto(c) + "</p>" +
      '<p class="k" style="margin-top:6px">' + U.escapa(resumenTexto(c)) + "</p>" +
      "</div>";

    html += '<p class="aviso aviso-g"><b>El flete marítimo varía según naviera, ruta y fecha.</b> ' +
            "Esto es una estimación orientativa; el equipo te confirma la tarifa real después de " +
            "consultar a las navieras que cubren esa ruta esa semana.</p>";

    html += '<div class="tabla-scroll"><table class="desglose"><caption>Parámetros de la operación</caption><tbody>';
    html += fila("Origen", U.escapa(c.origen));
    html += fila("Puerto de destino", U.escapa(c.destino.nombre) + " <small>(" + U.escapa(c.destino.detalle) + ")</small>");
    html += fila("Equipo", U.escapa(c.equipo.nombre));
    html += fila("Incoterm", U.escapa(c.incoterm.nombre));
    html += fila("Mercancía peligrosa", c.peligrosa ? "sí" : "no");
    html += fila("Flete base orientativo", fleteTexto(c), "grand");
    html += "</tbody></table></div>";

    html += '<p class="aviso"><b>' + U.escapa(c.incoterm.nombre) + ".</b> " + U.escapa(c.incoterm.resumen) + "</p>";

    html += '<h4 class="conceptos-h">Además del flete, la operación lleva estos conceptos</h4>' +
            '<p class="conceptos-nota">Se enumeran sin cifra a propósito: cada uno lo fija la naviera, la terminal ' +
            "o la aduana, y ponerle aquí un número sería inventarlo.</p>";
    html += '<ul class="conceptos">' + c.conceptos.map(function (x) {
      return "<li><b>" + U.escapa(x.nombre) + "</b><span>" + U.escapa(x.detalle) + "</span></li>";
    }).join("") + "</ul>";

    html += '<p class="aviso">Horquilla de flete de la <b>' + T.ETIQUETA + "</b>. " +
            "<b>Importe orientativo — lo confirma el equipo.</b></p>";

    html += window.WhiteMoonLead.caja("maritimo");

    salida.innerHTML = html;
    if (vacio) vacio.hidden = true;
    salida.hidden = false;

    window.WhiteMoonLead.enlaza("maritimo", function () {
      return {
        calculadora: "Marítimo import/export",
        resumen: resumenTexto(ultima),
        total: "Flete base " + fleteTexto(ultima) + " (sin recargos ni impuestos)",
        mensaje: desgloseTexto(ultima)
      };
    });

    U.enfocaResultado(salida);
  }

  /* ------------------------------------------------------------- ejemplo */

  var btnEjemplo = $("m-ejemplo");
  if (btnEjemplo) {
    btnEjemplo.addEventListener("click", function () {
      $("m-origen").value = "Shanghái (China)";
      $("m-destino").value = "valencia";
      $("m-equipo").value = "40hc";
      $("m-incoterm").value = "FOB";
      $("m-peligrosa").checked = false;
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { cancelable: true }));
    });
  }

  /* ------------------------------------------- tabla de fletes base visible */
  var tb = document.querySelector("#tabla-fletes tbody");
  if (tb) {
    tb.innerHTML = TARIFA.equipos.map(function (e) {
      return "<tr><td>" + U.escapa(e.nombre) + "</td><td>" +
             eur0.format(e.min) + " – " + eur0.format(e.max) + "</td></tr>";
    }).join("");
  }
})();
