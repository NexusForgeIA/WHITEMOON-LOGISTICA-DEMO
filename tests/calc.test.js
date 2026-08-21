/* =========================================================================
   tests/calc.test.js — verificación de las tres calculadoras sin navegador
   =========================================================================
   Se ejecuta con:  node tests/calc.test.js

   No hay framework: son asertos con `assert` de Node. Los tres ficheros de
   calculadora se cargan sobre un `document` de mentira que devuelve null en
   todo, así que cada uno expone su motor y se para justo antes de montar la
   interfaz. Lo que se prueba aquí es la aritmética, que es lo que no puede
   salir mal.
   ========================================================================= */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const JS = path.join(__dirname, "..", "assets", "js");

/* Un DOM de mentira: todo devuelve null o lista vacía. Con esto los ficheros
   de calculadora exponen su motor y salen antes de tocar la interfaz. */
const documentoFalso = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
};

const contexto = {
  window: null,
  document: documentoFalso,
  navigator: { sendBeacon: null },
  console,
  Intl,
  Math,
  Date,
  JSON,
  setTimeout,
};
contexto.window = contexto;
vm.createContext(contexto);

for (const f of ["tarifa.js", "util.js", "calc-terrestre.js", "calc-contenedores.js", "calc-maritimo.js"]) {
  vm.runInContext(fs.readFileSync(path.join(JS, f), "utf8"), contexto, { filename: f });
}

const T  = contexto.window.WhiteMoonTarifa;
const CT = contexto.window.WhiteMoonCalcTerrestre;
const CC = contexto.window.WhiteMoonCalcContenedores;
const CM = contexto.window.WhiteMoonCalcMaritimo;

let pasadas = 0;
function prueba(nombre, fn) {
  try {
    fn();
    pasadas++;
    console.log("  ok  " + nombre);
  } catch (e) {
    console.error("  FALLO  " + nombre + "\n        " + e.message);
    process.exitCode = 1;
  }
}

/* ===================================================== 1 · PORTES TERRESTRE */
console.log("\nCalculadora 1 · portes terrestre");

const madrid = CT.resuelveLugar("28100");
const barcelona = CT.resuelveLugar("08001");

prueba("un CP de 5 dígitos se resuelve a su provincia", () => {
  assert.strictEqual(madrid.prefijo, "28");
  assert.strictEqual(madrid.provincia, "Madrid");
  assert.strictEqual(madrid.cp, "28100");
});

prueba("un nombre de provincia también vale como entrada", () => {
  assert.strictEqual(CT.resuelveLugar("Barcelona").prefijo, "08");
  assert.strictEqual(CT.resuelveLugar("mallorca").prefijo, "07");
});

prueba("lo que no se reconoce devuelve null, no un valor por defecto", () => {
  assert.strictEqual(CT.resuelveLugar("Lisboa"), null);
  assert.strictEqual(CT.resuelveLugar(""), null);
});

prueba("las zonas salen de la adyacencia y de las islas", () => {
  assert.strictEqual(CT.calculaZona(CT.resuelveLugar("28001"), CT.resuelveLugar("28100")), 1); // misma provincia
  assert.strictEqual(CT.calculaZona(CT.resuelveLugar("28001"), CT.resuelveLugar("45001")), 2); // Madrid–Toledo
  assert.strictEqual(CT.calculaZona(madrid, barcelona), 3);                                     // península
  assert.strictEqual(CT.calculaZona(madrid, CT.resuelveLugar("07001")), 4);                     // Baleares
  assert.strictEqual(CT.calculaZona(madrid, CT.resuelveLugar("38001")), 5);                     // Tenerife
  assert.strictEqual(CT.calculaZona(madrid, CT.resuelveLugar("51001")), 5);                     // Ceuta
});

/* El caso de referencia del proyecto: el palé de colchones.
   1,2 × 0,8 × 1,6 m = 1,536 m³ → 384 kg volumétricos frente a 80 kg reales.
   Tramo 101–500 kg: 45 € + 384 × 0,18 = 114,12 € en península (factor 1,0). */
const pale = CT.cotiza({
  origen: madrid, destino: barcelona,
  ancho: 1.2, largo: 0.8, alto: 1.6,
  pesoReal: 80, valorDeclarado: 0,
  combustible: false, urgente: false, plataforma: false, adr: false,
});

prueba("palé de colchones: volumen 1,536 m³", () => {
  assert.ok(Math.abs(pale.volumen - 1.536) < 1e-9);
});

prueba("palé de colchones: peso facturable 384 kg (volumétrico)", () => {
  assert.strictEqual(pale.pesoVol, 384);
  assert.strictEqual(pale.pesoFact, 384);
  assert.strictEqual(pale.pesoFactEs, "volumétrico");
});

prueba("palé de colchones: base 114,12 € en península antes de recargos e IVA", () => {
  assert.strictEqual(pale.tramo.etiqueta, "101 – 500 kg");
  assert.strictEqual(pale.base, 114.12);
  assert.strictEqual(pale.zonaId, 3);
  assert.strictEqual(pale.baseZona, 114.12);
});

prueba("palé de colchones: sin recargos, el total es la base más el 21 % de IVA", () => {
  assert.strictEqual(pale.subtotal, 114.12);
  assert.strictEqual(pale.iva, 23.97);
  assert.strictEqual(pale.total, 138.09);
});

prueba("el peso real manda cuando supera al volumétrico", () => {
  const c = CT.cotiza({
    origen: madrid, destino: barcelona,
    ancho: 1, largo: 1, alto: 1, pesoReal: 400, valorDeclarado: 0,
    combustible: false, urgente: false, plataforma: false, adr: false,
  });
  assert.strictEqual(c.pesoVol, 250);
  assert.strictEqual(c.pesoFact, 400);
  assert.strictEqual(c.pesoFactEs, "real");
});

prueba("los recargos porcentuales se aplican sobre la base zonificada", () => {
  const c = CT.cotiza({
    origen: madrid, destino: barcelona,
    ancho: 1.2, largo: 0.8, alto: 1.6, pesoReal: 80, valorDeclarado: 0,
    combustible: true, urgente: true, plataforma: false, adr: false,
  });
  // 114,12 × 12 % = 13,69  ·  114,12 × 20 % = 22,82
  assert.strictEqual(c.lineas[0].importe, 13.69);
  assert.strictEqual(c.lineas[1].importe, 22.82);
  assert.strictEqual(c.subtotal, 150.63);
});

prueba("el reembolso respeta su mínimo", () => {
  const c = CT.cotiza({
    origen: madrid, destino: barcelona,
    ancho: 1, largo: 1, alto: 1, pesoReal: 50, valorDeclarado: 20,
    combustible: false, urgente: false, plataforma: false, adr: false,
  });
  const linea = c.lineas.find((x) => x.clave === "reembolso");
  assert.strictEqual(linea.importe, 3); // 3 % de 20 € = 0,60 € → mínimo 3 €
});

prueba("la curva de precio nunca baja al subir el peso", () => {
  const comun = {
    origen: madrid, destino: barcelona, ancho: 0.1, largo: 0.1, alto: 0.1,
    valorDeclarado: 0, combustible: false, urgente: false, plataforma: false, adr: false,
  };
  let anterior = 0;
  for (let kg = 1; kg <= 3000; kg += 1) {
    const t = CT.cotiza(Object.assign({}, comun, { pesoReal: kg })).total;
    assert.ok(t >= anterior - 1e-9, "el total baja al pasar de " + (kg - 1) + " a " + kg + " kg");
    anterior = t;
  }
});

prueba("Canarias multiplica por el factor de la zona 5", () => {
  const c = CT.cotiza({
    origen: madrid, destino: CT.resuelveLugar("35001"),
    ancho: 1.2, largo: 0.8, alto: 1.6, pesoReal: 80, valorDeclarado: 0,
    combustible: false, urgente: false, plataforma: false, adr: false,
  });
  assert.strictEqual(c.zonaId, 5);
  assert.strictEqual(c.baseZona, 262.48); // 114,12 × 2,3
});

prueba("el desglose en texto lleva siempre la palabra orientativo", () => {
  assert.ok(/orientativ/i.test(CT.desgloseTexto(pale)));
});

/* ============================================ 2 · CONTENEDORES POR CARRETERA */
console.log("\nCalculadora 2 · contenedores por carretera");

prueba("el resultado es un rango, no un número", () => {
  const c = CC.estima({ km: 620, tipoId: "40", internacional: false });
  // 620 × 1,10 = 682 → 680 ; 620 × 1,60 = 992 → 1000
  assert.strictEqual(c.min, 680);
  assert.strictEqual(c.max, 1000);
  assert.ok(c.max > c.min);
});

prueba("el mínimo nunca supera al máximo y ambos respetan el suelo de servicio", () => {
  for (const tipo of T.CONTENEDORES.tipos) {
    for (const km of [1, 5, 50, 120, 300, 900, 2500]) {
      for (const intl of [false, true]) {
        const c = CC.estima({ km, tipoId: tipo.id, internacional: intl });
        assert.ok(c.min <= c.max, tipo.id + " " + km + " km: min > max");
        assert.ok(c.min >= T.CONTENEDORES.minimoServicio, tipo.id + " " + km + " km: por debajo del mínimo");
      }
    }
  }
});

prueba("un trayecto corto cae en el mínimo de servicio", () => {
  const c = CC.estima({ km: 40, tipoId: "20", internacional: false });
  assert.strictEqual(c.enMinimo, true);
  assert.strictEqual(c.min, T.CONTENEDORES.minimoServicio);
  assert.ok(/^desde /.test(CC.rangoTexto(c)));
});

prueba("el factor internacional encarece el kilómetro", () => {
  const nac = CC.estima({ km: 900, tipoId: "20", internacional: false });
  const ue  = CC.estima({ km: 900, tipoId: "20", internacional: true });
  assert.ok(ue.min > nac.min && ue.max > nac.max);
  assert.ok(Math.abs(ue.porKmMin / nac.porKmMin - T.CONTENEDORES.factorInternacional) < 1e-9);
});

prueba("un equipo más grande nunca sale más barato que uno menor", () => {
  const veinte = CC.estima({ km: 800, tipoId: "20", internacional: false });
  const cuarenta = CC.estima({ km: 800, tipoId: "40", internacional: false });
  assert.ok(cuarenta.min >= veinte.min);
  assert.ok(cuarenta.max >= veinte.max);
});

prueba("el texto del desglose avisa de que es orientativo", () => {
  assert.ok(/orientativ/i.test(CC.desgloseTexto(CC.estima({ km: 620, tipoId: "40", internacional: false }))));
});

/* ============================================================= 3 · MARÍTIMO */
console.log("\nCalculadora 3 · marítimo");

prueba("devuelve una horquilla de flete, nunca un importe cerrado", () => {
  const c = CM.cotiza({ origen: "Shanghái (China)", destinoId: "valencia", equipoId: "40hc", incotermId: "FOB", peligrosa: false });
  assert.strictEqual(c.fleteMin, 900);
  assert.strictEqual(c.fleteMax, 2100);
  assert.ok(c.fleteMax > c.fleteMin);
  assert.ok(/–/.test(CM.fleteTexto(c)));
});

prueba("EXW añade los conceptos de origen que FOB no tiene", () => {
  const exw = CM.cotiza({ origen: "Ningbo", destinoId: "valencia", equipoId: "20", incotermId: "EXW", peligrosa: false });
  const fob = CM.cotiza({ origen: "Ningbo", destinoId: "valencia", equipoId: "20", incotermId: "FOB", peligrosa: false });
  assert.ok(exw.conceptos.length > fob.conceptos.length);
  assert.ok(exw.conceptos.some((x) => /exportación/i.test(x.nombre)));
});

prueba("un destino canario añade el concepto de IGIC", () => {
  const c = CM.cotiza({ origen: "Casablanca", destinoId: "laspalmas", equipoId: "20", incotermId: "CIF", peligrosa: false });
  assert.ok(c.conceptos.some((x) => /IGIC/i.test(x.nombre)));
});

prueba("la mercancía peligrosa añade el recargo IMO", () => {
  const c = CM.cotiza({ origen: "Estambul", destinoId: "barcelona", equipoId: "40", incotermId: "FOB", peligrosa: true });
  assert.ok(c.conceptos.some((x) => /IMO/i.test(x.nombre)));
});

prueba("ningún concepto lleva un importe: solo nombre y explicación", () => {
  const c = CM.cotiza({ origen: "Santos", destinoId: "bilbao", equipoId: "40", incotermId: "EXW", peligrosa: true });
  for (const x of c.conceptos) {
    assert.deepStrictEqual(Object.keys(x).sort(), ["detalle", "nombre"]);
  }
});

prueba("el desglose deja claro que el flete varía por naviera, ruta y fecha", () => {
  const texto = CM.desgloseTexto(CM.cotiza({ origen: "Callao", destinoId: "valencia", equipoId: "20", incotermId: "FOB", peligrosa: false }));
  assert.ok(/naviera, ruta y fecha/i.test(texto));
  assert.ok(/orientativ/i.test(texto));
});

/* ======================================================= etiqueta de tarifa */
console.log("\nEtiquetado de la tarifa demo");

prueba("la etiqueta de la tarifa dice que es demo y orientativa", () => {
  assert.ok(/demo/i.test(T.ETIQUETA));
  assert.ok(/orientativ/i.test(T.ETIQUETA));
});

console.log("\n" + pasadas + " pruebas correctas.\n");
