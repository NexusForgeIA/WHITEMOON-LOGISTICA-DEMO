/* =========================================================================
   calc-contenedores.js — CALCULADORA 2 · contenedores por carretera
   =========================================================================
   Devuelve un RANGO, nunca un número cerrado. El precio real de un porta-
   contenedores depende del camión que haya libre ese día, de si el camión
   tiene carga de retorno y de la fecha, y ninguna de esas tres cosas se
   sabe en un formulario web.

     Franja (€/km)  = franja del tipo de equipo (tarifa.js)
     Rango (€)      = distancia × franja × factor internacional
     Suelo (€)      = mínimo de servicio: ningún extremo baja de ahí

   Los extremos se redondean a la decena — hacia abajo el mínimo y hacia
   arriba el máximo — porque una horquilla con céntimos aparenta una
   precisión que este cálculo no tiene.
   ========================================================================= */
(function () {
  "use strict";

  var T = window.WhiteMoonTarifa;
  var U = window.WhiteMoonUtil;
  if (!T || !U) return;

  var TARIFA = T.CONTENEDORES;
  var eur = U.eur, eur0 = U.eur0, num = U.num;

  function tipoPorId(id) {
    for (var i = 0; i < TARIFA.tipos.length; i++) {
      if (TARIFA.tipos[i].id === id) return TARIFA.tipos[i];
    }
    return TARIFA.tipos[0];
  }

  /* ------------------------------------------------------------- cotización */

  /* estima({ km, tipoId, internacional }) → desglose completo, sin HTML. */
  function estima(d) {
    var tipo = tipoPorId(d.tipoId);
    var factor = d.internacional ? TARIFA.factorInternacional : 1;

    var porKmMin = tipo.min * factor;
    var porKmMax = tipo.max * factor;

    var brutoMin = d.km * porKmMin;
    var brutoMax = d.km * porKmMax;

    /* Redondeo a la decena y suelo del mínimo de servicio. */
    var min = Math.max(Math.floor(brutoMin / 10) * 10, TARIFA.minimoServicio);
    var max = Math.max(Math.ceil(brutoMax / 10) * 10, TARIFA.minimoServicio);
    if (max < min) max = min;

    return {
      km: d.km,
      tipo: tipo,
      internacional: !!d.internacional,
      factor: factor,
      porKmMin: porKmMin,
      porKmMax: porKmMax,
      brutoMin: brutoMin,
      brutoMax: brutoMax,
      min: min,
      max: max,
      /* Cuando el trayecto es tan corto que ambos extremos chocan con el
         mínimo de servicio, deja de haber horquilla: hay un suelo. */
      enMinimo: min === TARIFA.minimoServicio && max === TARIFA.minimoServicio,
      minimoServicio: TARIFA.minimoServicio
    };
  }

  function rangoTexto(c) {
    return c.enMinimo
      ? "desde " + eur0.format(c.minimoServicio)
      : eur0.format(c.min) + " – " + eur0.format(c.max);
  }

  function resumenTexto(c) {
    return c.tipo.nombre + " · " + num.format(c.km) + " km" +
           (c.internacional ? " · internacional UE" : " · nacional");
  }

  function desgloseTexto(c) {
    var l = [];
    l.push("ESTIMACIÓN ORIENTATIVA · CONTENEDOR POR CARRETERA (" + T.ETIQUETA + ")");
    l.push("Equipo: " + c.tipo.nombre);
    l.push("Distancia: " + num.format(c.km) + " km" + (c.internacional ? " (con tramo internacional UE)" : " (nacional)"));
    l.push("Franja base: " + eur.format(c.tipo.min) + " – " + eur.format(c.tipo.max) + " por km");
    if (c.internacional) {
      l.push("Factor internacional UE ×" + num.format(TARIFA.factorInternacional) + ": " +
             eur.format(c.porKmMin) + " – " + eur.format(c.porKmMax) + " por km");
    }
    l.push("Cálculo: " + num.format(c.km) + " km × franja = " +
           eur0.format(Math.round(c.brutoMin)) + " – " + eur0.format(Math.round(c.brutoMax)));
    l.push("Mínimo de servicio: " + eur0.format(c.minimoServicio));
    l.push("RANGO ORIENTATIVO: " + rangoTexto(c) + " (sin IVA)");
    l.push("Orientativo, según tipo de camión y disponibilidad — lo confirma el equipo.");
    return l.join("\n");
  }

  window.WhiteMoonCalcContenedores = {
    estima: estima,
    rangoTexto: rangoTexto,
    resumenTexto: resumenTexto,
    desgloseTexto: desgloseTexto,
    TARIFA: TARIFA
  };

  /* ============================== INTERFAZ ============================== */

  var $ = function (s) { return document.getElementById(s); };

  var form = $("form-contenedores");
  if (!form) return;

  var salida   = $("res-contenedores");
  var vacio    = $("res-contenedores-vacio");
  var errorBox = $("err-contenedores");
  var ultima   = null;

  /* El <select> de tipos se rellena desde tarifa.js: añadir un equipo nuevo
     allí lo hace aparecer aquí sin tocar el HTML. */
  var sel = $("c-tipo");
  if (sel && !sel.options.length) {
    sel.innerHTML = TARIFA.tipos.map(function (t) {
      return '<option value="' + t.id + '">' + U.escapa(t.nombre) + "</option>";
    }).join("");
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();

    var km = U.leeNum("c-km");
    var mal = !isFinite(km) || km <= 0;
    U.marcaError("c-km", mal);

    if (mal) {
      errorBox.innerHTML = "<strong>No se puede estimar todavía.</strong><ul>" +
        "<li>La distancia tiene que ser un número de kilómetros mayor que cero. " +
        "Si no la sabes exacta, una aproximación sirve: el resultado es una horquilla.</li></ul>";
      errorBox.hidden = false;
      return;
    }
    errorBox.hidden = true;

    ultima = estima({
      km: km,
      tipoId: $("c-tipo").value,
      internacional: $("c-internacional").checked
    });
    pinta(ultima);
  });

  function pinta(c) {
    var fila = U.fila;
    var html = "";

    html += '<div class="total-box">' +
      '<p class="k">Rango orientativo · sin IVA</p>' +
      '<p class="v">' + rangoTexto(c) + "</p>" +
      '<p class="k" style="margin-top:6px">' + U.escapa(resumenTexto(c)) + "</p>" +
      "</div>";

    html += '<div class="tabla-scroll"><table class="desglose"><caption>De dónde sale la horquilla</caption><tbody>';
    html += fila("Equipo", U.escapa(c.tipo.nombre));
    html += fila("Distancia", num.format(c.km) + " km");
    html += fila("Franja base del equipo", eur.format(c.tipo.min) + " – " + eur.format(c.tipo.max) + " / km");
    if (c.internacional) {
      html += fila("Factor internacional UE ×" + num.format(TARIFA.factorInternacional),
                   eur.format(c.porKmMin) + " – " + eur.format(c.porKmMax) + " / km", "sum");
    }
    html += fila(num.format(c.km) + " km × franja",
                 eur0.format(Math.round(c.brutoMin)) + " – " + eur0.format(Math.round(c.brutoMax)), "sum");
    html += fila("Mínimo de servicio", eur0.format(c.minimoServicio));
    html += fila("Rango orientativo", rangoTexto(c), "grand");
    html += "</tbody></table></div>";

    if (c.enMinimo) {
      html += '<p class="aviso aviso-g"><b>Trayecto corto:</b> a esta distancia el cálculo por kilómetro cae por ' +
              "debajo del mínimo de servicio, así que el punto de partida es el propio mínimo de " +
              eur0.format(c.minimoServicio) + ". El equipo ajusta el importe según la maniobra concreta.</p>";
    }

    html += '<p class="aviso"><b>Orientativo, según tipo de camión y disponibilidad</b> — no es un precio cerrado. ' +
            "El importe final depende del camión asignado, de si hay carga de retorno, de los peajes de la ruta y " +
            "de la fecha. " + U.escapa(c.tipo.nota) + " Calculado con la <b>" + T.ETIQUETA + "</b>.</p>";

    html += window.WhiteMoonLead.caja("contenedores");

    salida.innerHTML = html;
    if (vacio) vacio.hidden = true;
    salida.hidden = false;

    window.WhiteMoonLead.enlaza("contenedores", function () {
      return {
        calculadora: "Contenedor por carretera",
        resumen: resumenTexto(ultima),
        total: rangoTexto(ultima) + " (sin IVA)",
        mensaje: desgloseTexto(ultima)
      };
    });

    U.enfocaResultado(salida);
  }

  /* ------------------------------------------------------------- ejemplo */

  var btnEjemplo = $("c-ejemplo");
  if (btnEjemplo) {
    btnEjemplo.addEventListener("click", function () {
      $("c-km").value = "620";
      $("c-tipo").value = "40";
      $("c-internacional").checked = false;
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { cancelable: true }));
    });
  }

  /* --------------------------------------------- tabla de franjas visible */
  var tb = document.querySelector("#tabla-franjas tbody");
  if (tb) {
    tb.innerHTML = TARIFA.tipos.map(function (t) {
      return "<tr><td>" + U.escapa(t.nombre) + "</td><td>" +
             eur.format(t.min) + " – " + eur.format(t.max) + " / km</td></tr>";
    }).join("") +
      "<tr><td>Tramo internacional UE</td><td>×" + num.format(TARIFA.factorInternacional) + " sobre la franja</td></tr>" +
      "<tr><td>Mínimo de servicio</td><td>" + eur0.format(TARIFA.minimoServicio) + "</td></tr>";
  }
})();
