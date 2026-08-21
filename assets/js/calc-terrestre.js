/* =========================================================================
   calc-terrestre.js — CALCULADORA 1 · portes terrestre nacional
   =========================================================================
   NO contiene ni un solo importe. Todos los números de precio viven en
   tarifa.js. Este fichero solo aplica la fórmula:

     Volumen (m³)    = ancho × largo × alto
     P_vol (kg)      = Volumen × densidadVolumetrica
     P_fact (kg)     = max(P_real, P_vol)
     Base (€)        = fijo_tramo + P_fact × €/kg_tramo
     Base zona (€)   = Base × factor_zona
     Subtotal (€)    = Base zona × (1 + %comb + %urg + %ADR)
                       + plataforma + reembolso
     Total (€)       = Subtotal × (1 + IVA)

   El resultado es SIEMPRE orientativo: se presenta como estimación y el
   equipo lo confirma según accesos, horarios y detalles reales.
   ========================================================================= */
(function () {
  "use strict";

  var T = window.WhiteMoonTarifa;
  var U = window.WhiteMoonUtil;
  if (!T || !U) return;

  var TARIFA = T.TERRESTRE;
  var PROVINCIAS = T.PROVINCIAS;
  var LIMITROFES = T.LIMITROFES;
  var ZONA_POR_PREFIJO = T.ZONA_POR_PREFIJO;

  var eur = U.eur, num = U.num, num3 = U.num3, pct = U.pct, redondea = U.redondea;

  /* ------------------------------------------------------------------ util */

  /* Alias frecuentes: nombres antiguos, islas y capitales que la gente
     escribe en vez del nombre oficial de la provincia. */
  var ALIAS = {
    "baleares": "07", "islas baleares": "07", "mallorca": "07",
    "menorca": "07", "ibiza": "07", "eivissa": "07", "palma": "07",
    "formentera": "07",
    "gran canaria": "35", "canarias": "35", "las palmas de gran canaria": "35",
    "lanzarote": "35", "fuerteventura": "35",
    "tenerife": "38", "la palma": "38", "la gomera": "38", "el hierro": "38",
    "santa cruz de tenerife": "38",
    "la coruna": "15", "coruna": "15", "a coruna": "15",
    "vizcaya": "48", "bilbao": "48", "guipuzcoa": "20", "san sebastian": "20",
    "alava": "01", "araba": "01", "vitoria": "01",
    "gerona": "17", "lerida": "25", "orense": "32",
    "castellon de la plana": "12", "castello": "12",
    "illes balears": "07", "islas canarias": "35",
    "santander": "39", "oviedo": "33", "gijon": "33", "logrono": "26",
    "pamplona": "31", "iruna": "31", "alacant": "03", "valencia ciudad": "46"
  };

  /* Índice nombre-de-provincia normalizado → prefijo. */
  var POR_NOMBRE = {};
  Object.keys(PROVINCIAS).forEach(function (pref) {
    POR_NOMBRE[U.normaliza(PROVINCIAS[pref])] = pref;
  });

  /*
   * resuelveLugar("28100") → { prefijo:"28", provincia:"Madrid", cp:"28100" }
   * Acepta CP de 5 dígitos, prefijo de 2 dígitos o nombre de provincia.
   * Devuelve null si no reconoce nada: la calculadora no adivina.
   */
  function resuelveLugar(raw) {
    var s = String(raw || "").trim();
    if (!s) return null;

    var soloDigitos = s.replace(/\D/g, "");
    if (soloDigitos.length === 5 || soloDigitos.length === 4) {
      // Un CP escrito sin el cero inicial (p. ej. "8001" por "08001").
      var cp = soloDigitos.length === 4 ? "0" + soloDigitos : soloDigitos;
      var pref = cp.slice(0, 2);
      if (PROVINCIAS[pref]) return { prefijo: pref, provincia: PROVINCIAS[pref], cp: cp };
      return null;
    }
    if (soloDigitos.length === 2 && PROVINCIAS[soloDigitos]) {
      return { prefijo: soloDigitos, provincia: PROVINCIAS[soloDigitos], cp: "" };
    }

    var n = U.normaliza(s);
    var p = POR_NOMBRE[n] || ALIAS[n];
    if (p) return { prefijo: p, provincia: PROVINCIAS[p], cp: "" };
    return null;
  }

  /*
   * Zona de la ruta. Las zonas insulares y las plazas de soberanía mandan
   * sobre todo lo demás: si cualquiera de los dos extremos está en Baleares
   * o en Canarias/Ceuta/Melilla, esa es la zona (y si los dos lo están, gana
   * la más alta).
   */
  function calculaZona(a, b) {
    var za = ZONA_POR_PREFIJO[a.prefijo] || 0;
    var zb = ZONA_POR_PREFIJO[b.prefijo] || 0;
    if (za || zb) return Math.max(za, zb);

    if (a.prefijo === b.prefijo) return 1;
    var vecinos = LIMITROFES[a.prefijo] || [];
    if (vecinos.indexOf(b.prefijo) !== -1) return 2;
    return 3;
  }

  function tramoPara(peso) {
    for (var i = 0; i < TARIFA.tramos.length; i++) {
      var t = TARIFA.tramos[i];
      if (peso <= t.hasta) return t;
    }
    return TARIFA.tramos[TARIFA.tramos.length - 1];
  }

  /* ------------------------------------------------------------- cotización */

  /*
   * cotiza(datos) → objeto con TODO el desglose, sin nada de presentación.
   * datos: { origen, destino, ancho, largo, alto, pesoReal, valorDeclarado,
   *          combustible, urgente, plataforma, adr }
   */
  function cotiza(d) {
    var volumen = d.ancho * d.largo * d.alto;
    var pesoVol = volumen * TARIFA.densidadVolumetrica;
    var pesoFact = Math.max(d.pesoReal, pesoVol);

    var tramo = tramoPara(pesoFact);
    var base = redondea(tramo.fijo + pesoFact * tramo.porKg);

    var zonaId = calculaZona(d.origen, d.destino);
    var zona = TARIFA.zonas[zonaId];

    /* Todo se redondea a céntimos EN CADA LÍNEA y el subtotal es la suma de
       esas líneas ya redondeadas. Si se redondease solo al final, el
       desglose que ve el cliente podría no sumar el total por un céntimo, y
       un presupuesto que no cuadra en pantalla no vale para nada. */
    var baseZona = redondea(base * zona.factor);

    var r = TARIFA.recargos;
    var lineas = [];
    var pctTotal = 0;

    if (d.combustible) {
      pctTotal += r.combustible.valor;
      lineas.push({ clave: "combustible", nombre: r.combustible.nombre, detalle: pct(r.combustible.valor), importe: redondea(baseZona * r.combustible.valor) });
    }
    if (d.urgente) {
      pctTotal += r.urgente.valor;
      lineas.push({ clave: "urgente", nombre: r.urgente.nombre, detalle: pct(r.urgente.valor), importe: redondea(baseZona * r.urgente.valor) });
    }
    if (d.adr) {
      pctTotal += r.adr.valor;
      lineas.push({ clave: "adr", nombre: r.adr.nombre, detalle: pct(r.adr.valor), importe: redondea(baseZona * r.adr.valor) });
    }

    var fijos = 0;
    if (d.plataforma) {
      fijos += r.plataforma.valor;
      lineas.push({ clave: "plataforma", nombre: r.plataforma.nombre, detalle: "importe fijo", importe: redondea(r.plataforma.valor) });
    }
    var reembolso = 0;
    if (d.valorDeclarado > 0) {
      reembolso = redondea(Math.max(d.valorDeclarado * r.reembolso.valor, r.reembolso.minimo));
      fijos += reembolso;
      lineas.push({
        clave: "reembolso",
        nombre: r.reembolso.nombre,
        detalle: pct(r.reembolso.valor) + " del valor · mín. " + eur.format(r.reembolso.minimo),
        importe: reembolso
      });
    }

    var subtotal = redondea(lineas.reduce(function (a, x) { return a + x.importe; }, baseZona));
    var iva = redondea(subtotal * TARIFA.iva);
    var total = redondea(subtotal + iva);

    return {
      volumen: volumen,
      pesoReal: d.pesoReal,
      pesoVol: pesoVol,
      pesoFact: pesoFact,
      pesoFactEs: pesoFact > d.pesoReal ? "volumétrico" : "real",
      tramo: tramo,
      base: base,
      zonaId: zonaId,
      zona: zona,
      baseZona: baseZona,
      lineas: lineas,
      pctTotal: pctTotal,
      fijos: fijos,
      subtotal: subtotal,
      iva: iva,
      total: total,
      origen: d.origen,
      destino: d.destino
    };
  }

  /* ----------------------------------------------------- texto del desglose */

  function lugarTexto(l) { return l.cp ? l.provincia + " (" + l.cp + ")" : l.provincia; }
  function rutaTexto(c) { return lugarTexto(c.origen) + " → " + lugarTexto(c.destino); }

  /* Versión en texto plano del desglose: es lo que viaja al CRM en el campo
     `mensaje` del lead. */
  function desgloseTexto(c) {
    var l = [];
    l.push("COTIZACIÓN ORIENTATIVA · PORTE TERRESTRE NACIONAL (" + T.ETIQUETA + ")");
    l.push("Ruta: " + rutaTexto(c) + " — " + c.zona.nombre + " (x" + num.format(c.zona.factor) + ")");
    l.push("Volumen: " + num3.format(c.volumen) + " m³ · peso real " + num.format(c.pesoReal) +
           " kg · peso volumétrico " + num.format(c.pesoVol) + " kg");
    l.push("Peso facturable: " + num.format(c.pesoFact) + " kg (" + c.pesoFactEs + ")");
    l.push("Tramo " + c.tramo.etiqueta + ": " + eur.format(c.tramo.fijo) + " + " +
           num.format(c.pesoFact) + " kg x " + eur.format(c.tramo.porKg) + "/kg = " + eur.format(c.base));
    l.push("Base con factor de zona: " + eur.format(c.baseZona));
    if (c.lineas.length) {
      c.lineas.forEach(function (x) {
        l.push("  + " + x.nombre + " (" + x.detalle + "): " + eur.format(x.importe));
      });
    } else {
      l.push("  Sin recargos.");
    }
    l.push("Subtotal: " + eur.format(c.subtotal));
    l.push("IVA " + pct(TARIFA.iva) + ": " + eur.format(c.iva));
    l.push("TOTAL ORIENTATIVO: " + eur.format(c.total) + " (IVA incl.)");
    l.push("Importe orientativo — lo confirma el equipo según accesos y detalles reales.");
    if (c.zonaId === 5) {
      l.push("Canarias/Ceuta/Melilla: puede llevar gestión aduanera (DUA) e IGIC, no incluidos.");
    }
    return l.join("\n");
  }

  /* Motor expuesto ANTES de montar la interfaz: así se puede verificar la
     fórmula desde la consola del navegador o desde un test sin DOM. */
  window.WhiteMoonCalcTerrestre = {
    cotiza: cotiza,
    resuelveLugar: resuelveLugar,
    calculaZona: calculaZona,
    desgloseTexto: desgloseTexto,
    rutaTexto: rutaTexto,
    TARIFA: TARIFA
  };

  /* ============================== INTERFAZ ============================== */

  var $ = function (s) { return document.getElementById(s); };

  var form = $("form-terrestre");
  if (!form) return;

  var salida   = $("res-terrestre");
  var vacio    = $("res-terrestre-vacio");
  var errorBox = $("err-terrestre");
  var ultima   = null; // última cotización, para el envío del lead

  function validar() {
    var errores = [];
    var campos = ["ancho", "largo", "alto", "peso"];

    var o = resuelveLugar($("t-origen").value);
    var d = resuelveLugar($("t-destino").value);
    U.marcaError("t-origen", !o);
    U.marcaError("t-destino", !d);
    if (!o) errores.push("Revisa el origen: escribe un código postal de 5 dígitos o el nombre de la provincia.");
    if (!d) errores.push("Revisa el destino: escribe un código postal de 5 dígitos o el nombre de la provincia.");

    var vals = {};
    campos.forEach(function (c) {
      var v = U.leeNum("t-" + c);
      var mal = !isFinite(v) || v <= 0;
      U.marcaError("t-" + c, mal);
      if (mal) {
        errores.push((c === "peso" ? "El peso real" : "La medida de " + c) +
          " tiene que ser un número mayor que cero. Puedes escribirlo con coma o con punto.");
      }
      vals[c] = v;
    });

    var valor = U.leeNum("t-valor");
    if (isNaN(valor)) valor = 0;
    if (valor < 0) { U.marcaError("t-valor", true); errores.push("El valor declarado no puede ser negativo."); }
    else U.marcaError("t-valor", false);

    return { errores: errores, origen: o, destino: d, vals: vals, valor: valor };
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var v = validar();

    if (v.errores.length) {
      errorBox.innerHTML = "<strong>No se puede calcular todavía.</strong><ul>" +
        v.errores.map(function (e) { return "<li>" + U.escapa(e) + "</li>"; }).join("") + "</ul>";
      errorBox.hidden = false;
      return;
    }
    errorBox.hidden = true;

    ultima = cotiza({
      origen: v.origen,
      destino: v.destino,
      ancho: v.vals.ancho,
      largo: v.vals.largo,
      alto: v.vals.alto,
      pesoReal: v.vals.peso,
      valorDeclarado: v.valor,
      combustible: $("t-r-combustible").checked,
      urgente: $("t-r-urgente").checked,
      plataforma: $("t-r-plataforma").checked,
      adr: $("t-r-adr").checked
    });
    pinta(ultima);
  });

  function pinta(c) {
    var fila = U.fila;
    var html = "";

    html += '<div class="total-box">' +
      '<p class="k">Importe orientativo</p>' +
      '<p class="v">' + eur.format(c.total) + ' <small>IVA incluido</small></p>' +
      '<p class="k" style="margin-top:6px">' + U.escapa(rutaTexto(c)) + " · " + c.zona.nombre + "</p>" +
      "</div>";

    html += '<div class="tabla-scroll"><table class="desglose"><caption>Desglose del cálculo</caption><tbody>';
    html += fila("Volumen (" + num3.format(c.volumen) + " m³ × " + num.format(TARIFA.densidadVolumetrica) + " kg/m³)",
                 num.format(c.pesoVol) + " kg");
    html += fila("Peso real declarado", num.format(c.pesoReal) + " kg");
    html += fila("<strong>Peso facturable</strong> (el mayor de los dos)",
                 "<strong>" + num.format(c.pesoFact) + " kg</strong>", "sum");
    html += fila("Tramo " + c.tramo.etiqueta + " · " + eur.format(c.tramo.fijo) + " + " + eur.format(c.tramo.porKg) + "/kg",
                 eur.format(c.base));
    html += fila(c.zona.nombre + " · factor ×" + num.format(c.zona.factor), eur.format(c.baseZona), "sum");

    c.lineas.forEach(function (x) {
      html += fila(x.nombre + " <small>(" + x.detalle + ")</small>", "+ " + eur.format(x.importe));
    });
    if (!c.lineas.length) html += fila("Recargos", "sin recargos");

    html += fila("Subtotal (base imponible)", eur.format(c.subtotal), "sum");
    html += fila("IVA " + pct(TARIFA.iva), eur.format(c.iva));
    html += fila("Total orientativo", eur.format(c.total), "grand");
    html += "</tbody></table></div>";

    html += '<p class="aviso"><b>Importe orientativo — lo confirma el equipo</b> según accesos y detalles reales ' +
            "(planta, ascensor, horario de descarga, espera en destino o restricciones de acceso al centro urbano). " +
            'Calculado con la <b data-etiqueta-tarifa>' + T.ETIQUETA + "</b>.</p>";

    if (c.zonaId === 5) {
      html += '<p class="aviso aviso-g"><b>Canarias, Ceuta y Melilla:</b> el envío puede llevar ' +
              "<b>gestión aduanera (DUA)</b> e <b>IGIC/IPSI</b>, que no están incluidos en esta estimación y se " +
              "presupuestan aparte una vez conocida la mercancía.</p>";
    }
    if (c.zonaId === 4) {
      html += '<p class="aviso aviso-g"><b>Baleares:</b> la estimación incluye el factor marítimo de zona, pero las ' +
              "salidas dependen del cuadro de buque de la semana. El equipo confirma el tránsito real.</p>";
    }

    /* Bloque de captación: solo aparece cuando ya hay un número que enseñar. */
    html += window.WhiteMoonLead.caja("terrestre");

    salida.innerHTML = html;
    if (vacio) vacio.hidden = true;
    salida.hidden = false;

    window.WhiteMoonLead.enlaza("terrestre", function () {
      return {
        calculadora: "Portes terrestre",
        resumen: rutaTexto(ultima) + " · " + ultima.zona.nombre + " · " +
                 num.format(ultima.pesoFact) + " kg facturables",
        total: eur.format(ultima.total) + " (IVA incl.)",
        mensaje: desgloseTexto(ultima)
      };
    });

    U.enfocaResultado(salida);
  }

  /* ------------------------------------------------------------- ejemplo */

  var btnEjemplo = $("t-ejemplo");
  if (btnEjemplo) {
    btnEjemplo.addEventListener("click", function () {
      $("t-origen").value = "28100";
      $("t-destino").value = "08001";
      $("t-ancho").value = "1,2";
      $("t-largo").value = "0,8";
      $("t-alto").value = "1,6";
      $("t-peso").value = "80";
      $("t-valor").value = "";
      $("t-r-combustible").checked = false;
      $("t-r-urgente").checked = false;
      $("t-r-plataforma").checked = false;
      $("t-r-adr").checked = false;
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { cancelable: true }));
    });
  }

  /* ------------------------------------------------ tabla de tarifa visible
     Se pinta desde TARIFA para que cambiar el fichero cambie también lo que
     el visitante lee. Nunca hay dos versiones del mismo precio. */
  function pintaTablas() {
    var tb = document.querySelector("#tabla-tramos tbody");
    if (tb) {
      tb.innerHTML = TARIFA.tramos.map(function (t) {
        return "<tr><td>" + t.etiqueta + "</td><td>" + eur.format(t.fijo) + "</td><td>" +
               eur.format(t.porKg) + " / kg</td></tr>";
      }).join("");
    }
    var tz = document.querySelector("#tabla-zonas tbody");
    if (tz) {
      tz.innerHTML = Object.keys(TARIFA.zonas).map(function (k) {
        var z = TARIFA.zonas[k];
        return "<tr><td>" + z.nombre + "</td><td>" + z.detalle + "</td><td>×" + num.format(z.factor) + "</td></tr>";
      }).join("");
    }
    var tr = document.querySelector("#tabla-recargos tbody");
    if (tr) {
      var r = TARIFA.recargos;
      tr.innerHTML = [
        [r.combustible.nombre, pct(r.combustible.valor) + " sobre la base"],
        [r.urgente.nombre, pct(r.urgente.valor) + " sobre la base"],
        [r.adr.nombre, pct(r.adr.valor) + " sobre la base"],
        [r.plataforma.nombre, eur.format(r.plataforma.valor) + " fijos"],
        [r.reembolso.nombre, pct(r.reembolso.valor) + " del valor declarado, mínimo " + eur.format(r.reembolso.minimo)],
        ["IVA", pct(TARIFA.iva)]
      ].map(function (x) { return "<tr><td>" + x[0] + "</td><td>" + x[1] + "</td></tr>"; }).join("");
    }
    var dens = document.querySelectorAll("[data-densidad]");
    Array.prototype.forEach.call(dens, function (el) { el.textContent = num.format(TARIFA.densidadVolumetrica); });
  }
  pintaTablas();
})();
