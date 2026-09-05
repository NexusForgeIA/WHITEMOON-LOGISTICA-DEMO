/* =========================================================================
   tests/hugo.test.js — verificación de las métricas que devuelve Hugo
   =========================================================================
   Se ejecuta con:  node tests/hugo.test.js

   Importa directamente el MISMO calculo.ts que corre en la Edge Function
   (Node 24 quita los tipos por su cuenta), así que lo que se prueba aquí es
   exactamente la aritmética que ve el usuario, no una copia.

   Cada aserto lleva la cuenta hecha a mano al lado. Si algún día alguien
   cambia una fórmula, aquí se entera.
   ========================================================================= */
"use strict";

const assert = require("assert");
const C = require("../supabase/functions/logistica-chat/calculo.ts");

let pasadas = 0;
function prueba(nombre, fn) {
  try {
    fn();
    pasadas++;
    console.log("  ok  " + nombre);
  } catch (e) {
    console.error("  FALLA  " + nombre + "\n        " + e.message);
    process.exitCode = 1;
  }
}

function metricas(entrada) {
  const r = C.calculaEnvio(entrada);
  assert.ok(r.ok, "esperaba un cálculo válido: " + (r.ok ? "" : r.error));
  return r.metricas;
}

/* ===================================================== caso de referencia */
console.log("\nCaso de referencia · 6 bultos de 120×80×100 cm, 900 kg reales");

/* A mano:
     volumen bulto  = 120 × 80 × 100 / 1.000.000            = 0,96 m³
     volumen total  = 0,96 × 6                              = 5,76 m³
     vol. por bulto = 120 × 80 × 100 / 5000                 = 192 kg
     peso volum.    = 192 × 6                               = 1.152 kg
     facturable     = max(900; 1.152)                       = 1.152 kg
     base europalet = floor(120/120) × floor(80/80)         = 1 bulto
     capas          = floor(180/100)                        = 1
     palés          = ceil(6 / 1)                           = 6            */
const REF = metricas({ pesoRealKg: 900, largoCm: 120, anchoCm: 80, altoCm: 100, bultos: 6 });

prueba("volumen por bulto = 0,96 m³", () => {
  assert.strictEqual(REF.volumenBultoM3, 0.96);
});
prueba("volumen total = 5,76 m³", () => {
  assert.strictEqual(REF.volumenTotalM3, 5.76);
});
prueba("peso volumétrico por bulto = 192 kg (factor 5000)", () => {
  assert.strictEqual(REF.pesoVolumetricoBultoKg, 192);
  assert.strictEqual(REF.factorVolumetrico, 5000);
});
prueba("peso volumétrico total = 1.152 kg", () => {
  assert.strictEqual(REF.pesoVolumetricoKg, 1152);
});
prueba("peso facturable = 1.152 kg y manda el volumétrico", () => {
  assert.strictEqual(REF.pesoFacturableKg, 1152);
  assert.strictEqual(REF.criterio, "volumetrico");
});
prueba("palés estimados = 6, uno por bulto", () => {
  assert.strictEqual(REF.bultosPorBase, 1);
  assert.strictEqual(REF.capasPorPalet, 1);
  assert.strictEqual(REF.palesEstimados, 6);
  assert.strictEqual(REF.sobredimensionado, false);
});

/* ============================================== manda el peso real, no el volumétrico */
console.log("\nCarga densa · manda el peso real");

/* 4 cajas de 40×30×30 cm con 500 kg:
     vol. bulto  = 40 × 30 × 30 / 1.000.000                 = 0,036 m³
     volumétrico = 36.000 / 5000 = 7,2 kg × 4               = 28,8 kg
     facturable  = max(500; 28,8)                           = 500 kg       */
prueba("500 kg en 4 cajas pequeñas facturan por peso real", () => {
  const m = metricas({ pesoRealKg: 500, largoCm: 40, anchoCm: 30, altoCm: 30, bultos: 4 });
  assert.strictEqual(m.volumenBultoM3, 0.036);
  assert.strictEqual(m.pesoVolumetricoKg, 28.8);
  assert.strictEqual(m.pesoFacturableKg, 500);
  assert.strictEqual(m.criterio, "real");
});

/* ================================================================= palés */
console.log("\nPalés estimados · footprint de europalet 120×80, altura útil 180 cm");

/* 24 cajas de 60×40×45 cm:
     base: floor(120/60) × floor(80/40) = 2 × 2             = 4 por capa
     capas: floor(180/45)                                   = 4
     por palet: 4 × 4                                       = 16
     palés: ceil(24/16)                                     = 2            */
prueba("24 cajas de 60×40×45 caben en 2 palés", () => {
  const m = metricas({ pesoRealKg: 300, largoCm: 60, anchoCm: 40, altoCm: 45, bultos: 24 });
  assert.strictEqual(m.bultosPorBase, 4);
  assert.strictEqual(m.capasPorPalet, 4);
  assert.strictEqual(m.bultosPorPalet, 16);
  assert.strictEqual(m.palesEstimados, 2);
});

prueba("prueba las dos orientaciones sobre la base del palet", () => {
  /* 80×120 es el mismo palet girado: floor(120/80)×floor(80/120) = 1×0 = 0,
     pero girado floor(120/120)×floor(80/80) = 1. Debe salir 1, no 0. */
  const m = metricas({ pesoRealKg: 200, largoCm: 80, anchoCm: 120, altoCm: 90, bultos: 3 });
  assert.strictEqual(m.bultosPorBase, 1);
  assert.strictEqual(m.capasPorPalet, 2);
  assert.strictEqual(m.palesEstimados, 2); // ceil(3/2)
});

prueba("un bulto más grande que el palet se marca sobredimensionado", () => {
  const m = metricas({ pesoRealKg: 1200, largoCm: 300, anchoCm: 140, altoCm: 120, bultos: 2 });
  assert.strictEqual(m.sobredimensionado, true);
  assert.strictEqual(m.bultosPorPalet, 1);
  assert.strictEqual(m.palesEstimados, 2);
});

prueba("un bulto más alto que la altura útil también es sobredimensionado", () => {
  const m = metricas({ pesoRealKg: 400, largoCm: 100, anchoCm: 60, altoCm: 200, bultos: 1 });
  assert.strictEqual(m.sobredimensionado, true);
  assert.strictEqual(m.palesEstimados, 1);
});

/* ================================================== el máximo no se redondea antes */
console.log("\nEl peso facturable se decide sin redondear");

prueba("un volumétrico de 899,91 kg gana a 899,9 kg reales", () => {
  /* 1 bulto de 99×101×450 cm → 4.499.550 cm³ / 5000 = 899,91 kg */
  const m = metricas({ pesoRealKg: 899.9, largoCm: 99, anchoCm: 101, altoCm: 450, bultos: 1 });
  assert.strictEqual(m.criterio, "volumetrico");
  assert.strictEqual(m.pesoFacturableKg, 899.91);
});

/* =============================================================== validación */
console.log("\nEntradas imposibles");

[
  ["peso cero", { pesoRealKg: 0, largoCm: 100, anchoCm: 80, altoCm: 60, bultos: 1 }],
  ["medida negativa", { pesoRealKg: 100, largoCm: -10, anchoCm: 80, altoCm: 60, bultos: 1 }],
  ["bultos decimales", { pesoRealKg: 100, largoCm: 100, anchoCm: 80, altoCm: 60, bultos: 2.5 }],
  ["peso absurdo", { pesoRealKg: 900000, largoCm: 100, anchoCm: 80, altoCm: 60, bultos: 1 }],
  ["medida absurda", { pesoRealKg: 100, largoCm: 9000, anchoCm: 80, altoCm: 60, bultos: 1 }],
  ["texto en vez de número", { pesoRealKg: NaN, largoCm: 100, anchoCm: 80, altoCm: 60, bultos: 1 }],
].forEach(([nombre, entrada]) => {
  prueba("rechaza " + nombre + " con un mensaje, no con un número inventado", () => {
    const r = C.calculaEnvio(entrada);
    assert.strictEqual(r.ok, false);
    assert.ok(typeof r.error === "string" && r.error.length > 10);
  });
});

/* ================================================================ teléfono */
console.log("\nValidación de teléfono, en el servidor");

prueba("acepta móvil y fijo españoles con y sin prefijo", () => {
  assert.strictEqual(C.normalizaTelefono("699 72 72 18"), "699727218");
  assert.strictEqual(C.normalizaTelefono("+34 643-199-580"), "643199580");
  assert.strictEqual(C.normalizaTelefono("0034917654321"), "917654321");
});

prueba("rechaza lo que no es un teléfono español", () => {
  assert.strictEqual(C.normalizaTelefono("123"), "");
  assert.strictEqual(C.normalizaTelefono("512345678"), "");
  assert.strictEqual(C.normalizaTelefono("no te lo doy"), "");
  assert.strictEqual(C.normalizaTelefono(null), "");
});

/* ================================================================= resumen */
console.log("\nResumen para el CRM");

prueba("el resumen lleva las cifras reales y dice que es orientativo", () => {
  const t = C.resumenCarga(REF, "palés de azulejos");
  assert.ok(/palés de azulejos/.test(t));
  assert.ok(/5\.76 m³|5,76 m³|5.76 m³/.test(t));
  assert.ok(/1152 kg/.test(t));
  assert.ok(/orientativ/i.test(t));
  assert.ok(/confirmar por el equipo/i.test(t));
});

prueba("el resumen no contiene ni un importe en euros", () => {
  assert.ok(!/€|\beuros?\b/i.test(C.resumenCarga(REF, "palés de azulejos")));
});

console.log("\n" + pasadas + " pruebas correctas.\n");
