/*
 * lead.js — punto único de captación de leads de la demo de logística.
 *
 * Cada lead hace dos cosas EN PARALELO (no encadenadas: si una falla, la
 * otra no se entera):
 *
 *   1) INSERT en la tabla leads_web con la clave PUBLICABLE de Supabase.
 *      Es una clave de navegador, protegida por RLS (política de inserción
 *      anónima). No da acceso de lectura a los leads de nadie.
 *      Se reintenta UNA vez, a los 800 ms, si PostgREST devuelve 503 (el
 *      proyecto acaba de despertar): con un solo reintento el lead se salva
 *      sin arriesgar duplicados por insistir.
 *
 *   2) AVISO a la Edge Function logistica-notify, que notifica por Telegram.
 *      Va por navigator.sendBeacon: el navegador se lo lleva aunque el
 *      usuario cierre la pestaña justo después de dejar el teléfono, que es
 *      exactamente cuando se pierden los avisos con fetch. sendBeacon exige
 *      un tipo "CORS-safelisted", así que el cuerpo viaja como Blob
 *      text/plain (NO application/json: eso dispararía un preflight que
 *      sendBeacon no puede hacer y Chrome descartaría el POST devolviendo
 *      true igual). La función lo parsea sin problema.
 *      El token del bot vive como secret de la función, NUNCA aquí.
 *
 * Ningún token ni secreto debe añadirse a este fichero.
 *
 * Además expone `caja()` y `enlaza()`: el bloque de captación es idéntico en
 * las tres calculadoras, así que se escribe una sola vez y cada calculadora
 * le pasa su propio resumen y su propio desglose.
 */
(function () {
  "use strict";
  if (window.WhiteMoonLead) return;

  var SUPABASE_URL = "https://mlaqtniujnvfxcvcourm.supabase.co";
  var SUPABASE_KEY = "sb_publishable_6no6BuOgiA_2nonTJntAuQ_DTqEgrcV";
  var NOTIFY_URL   = SUPABASE_URL + "/functions/v1/logistica-notify";

  var EMPRESA = "WhiteMoon";
  var ORIGEN  = "demo-logistica";
  var SECTOR  = "logistica";

  var WHATSAPP = "https://wa.me/34643199580";

  /* ------------------------------------------------------------- envío (1) */

  /* INSERT en leads_web. Un único reintento ante 503. */
  function insertaLead(fila, reintentos) {
    return fetch(SUPABASE_URL + "/rest/v1/leads_web", {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(fila)
    }).then(function (r) {
      if (r.status === 503 && reintentos > 0) {
        console.warn("[WhiteMoon] leads_web 503, reintentando una vez");
        return new Promise(function (ok) { setTimeout(ok, 800); })
          .then(function () { return insertaLead(fila, reintentos - 1); });
      }
      if (!r.ok) console.warn("[WhiteMoon] leads_web:", r.status);
      return r.ok;
    }).catch(function (e) {
      console.warn("[WhiteMoon] leads_web error:", e);
      return false;
    });
  }

  /* ------------------------------------------------------------- envío (2) */

  /*
   * Aviso a la Edge Function. sendBeacon devuelve false si el navegador no
   * lo encola (cuerpo demasiado grande, o no existe la API); en ese caso se
   * cae a un fetch normal con keepalive para no perder el aviso.
   */
  function avisa(cuerpo) {
    var texto = JSON.stringify(cuerpo);
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([texto], { type: "text/plain;charset=UTF-8" });
        if (navigator.sendBeacon(NOTIFY_URL, blob)) return Promise.resolve(true);
      }
    } catch (e) {
      console.warn("[WhiteMoon] sendBeacon error:", e);
    }
    return fetch(NOTIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: texto,
      keepalive: true
    }).then(function (r) {
      if (!r.ok) console.warn("[WhiteMoon] notify:", r.status);
      return r.ok;
    }).catch(function (e) {
      console.warn("[WhiteMoon] notify error:", e);
      return false;
    });
  }

  /*
   * send({ nombre, telefono, calculadora, resumen, total, mensaje })
   *
   *   calculadora  cuál de las tres ha generado el lead
   *   resumen      ruta / tipo en una línea — va a `interes` junto a la
   *                calculadora, que es lo que se ve de un vistazo en el CRM
   *   total        importe o rango orientativo ya formateado
   *   mensaje      desglose completo del cálculo, en texto plano
   *
   * Resuelve SIEMPRE: un fallo de red no debe romper la página.
   * Devuelve [insertOk, notifyOk] para poder informar al usuario.
   */
  function send(data) {
    var nombre      = (data.nombre || "").trim();
    var telefono    = (data.telefono || "").trim();
    var calculadora = (data.calculadora || "").trim();
    var resumen     = (data.resumen || "").trim();
    var total       = (data.total || "").trim();
    var mensaje     = (data.mensaje || "").trim();

    var insert = insertaLead({
      nombre: nombre,
      telefono: telefono,
      empresa: EMPRESA,
      sector: SECTOR,
      origen: ORIGEN,
      interes: calculadora + " · " + resumen,
      mensaje: mensaje
    }, 1);

    var notify = avisa({
      empresa: EMPRESA,
      nombre: nombre,
      telefono: telefono,
      sector: SECTOR,
      origen: ORIGEN,
      calculadora: calculadora,
      resumen: resumen,
      total: total,
      mensaje: mensaje
    });

    return Promise.all([insert, notify]);
  }

  /* Móvil o fijo español: 9 dígitos empezando por 6, 7, 8 o 9,
     tolerando espacios, guiones y el prefijo +34 / 0034. */
  function normalizaTelefono(raw) {
    var d = String(raw || "").replace(/[^\d]/g, "").replace(/^(0034|34)/, "");
    return /^[6789]\d{8}$/.test(d) ? d : "";
  }

  /* ------------------------------------------------------ bloque de captación

     El HTML del bloque se genera aquí, una sola vez, y las tres calculadoras
     lo insertan al final de su resultado. Los `id` llevan el sufijo de la
     calculadora porque las tres pestañas conviven en el mismo documento: sin
     sufijo habría tres `#lead-nombre` y los <label for> apuntarían al campo
     equivocado. */
  function caja(sufijo) {
    var n = "lead-" + sufijo;
    return '' +
      '<div class="lead-box">' +
        '<h4>¿Te lo confirmamos en firme?</h4>' +
        '<p class="lead">Déjanos tu nombre y tu teléfono: te llamamos con el presupuesto en firme ' +
        'para este servicio, con fechas y todo incluido.</p>' +
        '<form id="' + n + '-form" novalidate>' +
          '<div class="row">' +
            '<div class="field">' +
              '<label for="' + n + '-nombre">Nombre</label>' +
              '<input type="text" id="' + n + '-nombre" name="nombre" autocomplete="name" required>' +
            '</div>' +
            '<div class="field">' +
              '<label for="' + n + '-tel">Teléfono</label>' +
              '<input type="tel" id="' + n + '-tel" name="telefono" autocomplete="tel" inputmode="tel" required>' +
            '</div>' +
          '</div>' +
          '<label class="consent" for="' + n + '-ok">' +
            '<input type="checkbox" id="' + n + '-ok" required>' +
            '<span>Acepto que WhiteMoon me contacte para confirmar este presupuesto. ' +
            'Demo: los datos se guardan en el CRM de pruebas de WhiteMoon.</span>' +
          '</label>' +
          '<button type="submit" class="btn btn-3" id="' + n + '-btn">Recibir presupuesto en firme</button>' +
          '<p class="form-msg" id="' + n + '-msg" role="status" aria-live="polite"></p>' +
        '</form>' +
      '</div>';
  }

  /*
   * enlaza(sufijo, datos) — engancha el submit de la caja recién pintada.
   * `datos` es una función que devuelve { calculadora, resumen, total,
   * mensaje } en el momento del envío, para que siempre viaje el último
   * cálculo y no una copia vieja.
   */
  function enlaza(sufijo, datos) {
    var n = "lead-" + sufijo;
    var f = document.getElementById(n + "-form");
    if (!f) return;

    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var msg    = document.getElementById(n + "-msg");
      var btn    = document.getElementById(n + "-btn");
      var elNom  = document.getElementById(n + "-nombre");
      var elTel  = document.getElementById(n + "-tel");
      var elOk   = document.getElementById(n + "-ok");

      var nombre = elNom.value.trim();
      var tel    = normalizaTelefono(elTel.value);

      elNom.setAttribute("aria-invalid", nombre ? "false" : "true");
      elTel.setAttribute("aria-invalid", tel ? "false" : "true");

      if (!nombre) {
        msg.className = "form-msg err";
        msg.textContent = "Escribe tu nombre para poder llamarte.";
        elNom.focus();
        return;
      }
      if (!tel) {
        msg.className = "form-msg err";
        msg.textContent = "Ese teléfono no parece válido. Nueve dígitos empezando por 6, 7, 8 o 9.";
        elTel.focus();
        return;
      }
      if (!elOk.checked) {
        msg.className = "form-msg err";
        msg.textContent = "Marca la casilla para que podamos contactarte.";
        elOk.focus();
        return;
      }

      btn.disabled = true;
      msg.className = "form-msg";
      msg.textContent = "Enviando…";

      var d = datos();
      send({
        nombre: nombre,
        telefono: tel,
        calculadora: d.calculadora,
        resumen: d.resumen,
        total: d.total,
        mensaje: d.mensaje
      }).then(function (res) {
        btn.disabled = false;
        if (res && res[0]) {
          msg.className = "form-msg ok";
          msg.textContent = "Recibido, " + nombre + ". Te llamamos al " + tel +
            " para cerrar el presupuesto de este servicio.";
          elNom.value = "";
          elTel.value = "";
          elOk.checked = false;
        } else {
          msg.className = "form-msg err";
          msg.innerHTML = "No hemos podido registrar la solicitud. Escríbenos por WhatsApp al " +
            '<a href="' + WHATSAPP + '">643 199 580</a> y lo resolvemos al momento.';
        }
      });
    });
  }

  window.WhiteMoonLead = {
    empresa: EMPRESA,
    origen: ORIGEN,
    sector: SECTOR,
    send: send,
    normalizaTelefono: normalizaTelefono,
    caja: caja,
    enlaza: enlaza
  };
})();
