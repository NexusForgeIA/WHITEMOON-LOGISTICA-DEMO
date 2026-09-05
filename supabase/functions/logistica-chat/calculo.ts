/* =========================================================================
   calculo.ts — métricas de envío. TODA la aritmética de Hugo vive aquí.
   =========================================================================
   Este fichero es la ÚNICA fuente de las métricas que el agente devuelve.
   El modelo de lenguaje NO calcula nada: extrae los datos de la conversación,
   llama a la herramienta y este código hace las cuentas. Los modelos fallan
   en aritmética; una multiplicación mal hecha en una cotización es una
   mentira, así que la multiplicación la hace el código.

   Las cuatro fórmulas son las ESTÁNDAR del sector, no invenciones:

     · Volumen por bulto (m³)   = L × A × H (cm) / 1.000.000
     · Peso volumétrico (kg)    = L × A × H (cm) / 5000, por bulto
     · Peso facturable (kg)     = max(peso real, peso volumétrico)
     · Palés estimados          = por footprint de europalet 120 × 80 cm

   El factor 5000 es el divisor volumétrico habitual en grupaje y courier
   (1 m³ = 200 kg). Se expone en la salida para que quien lea la ficha pueda
   rehacer la cuenta a mano.

   Aquí no hay ni un precio, ni una tarifa, ni un importe en euros: Hugo
   devuelve métricas de la carga, nunca dinero.
   ========================================================================= */

/** Divisor volumétrico estándar del sector, en cm³/kg. */
export const FACTOR_VOLUMETRICO = 5000;

/** Europalet: 120 × 80 cm de base. */
export const PALET_LARGO_CM = 120;
export const PALET_ANCHO_CM = 80;

/**
 * Altura útil de apilado SOBRE el palet, en cm. 180 cm es la altura de carga
 * con la que se cotiza un palet completo en grupaje nacional. Un bulto más
 * alto que esto no entra en el sobre estándar y se marca como
 * sobredimensionado en vez de forzar el número.
 */
export const ALTURA_UTIL_CM = 180;

/* Límites de cordura. No son reglas de negocio: solo evitan que una errata
   ("peso: 80000000") produzca una ficha absurda con aire de dato bueno. */
const MAX_PESO_KG = 200000;
const MAX_DIM_CM = 1500;
const MAX_BULTOS = 5000;

export interface EntradaEnvio {
  pesoRealKg: number;
  largoCm: number;
  anchoCm: number;
  altoCm: number;
  bultos: number;
}

export interface Metricas {
  /* Datos de entrada, devueltos tal cual para que la ficha sea auditable. */
  pesoRealKg: number;
  largoCm: number;
  anchoCm: number;
  altoCm: number;
  bultos: number;

  /* Las cuatro métricas. */
  volumenBultoM3: number;
  volumenTotalM3: number;
  pesoVolumetricoBultoKg: number;
  pesoVolumetricoKg: number;
  pesoFacturableKg: number;
  palesEstimados: number;

  /* Cómo se ha llegado a cada una. */
  criterio: "real" | "volumetrico";
  bultosPorBase: number;
  capasPorPalet: number;
  bultosPorPalet: number;
  sobredimensionado: boolean;

  /* Constantes usadas, para poder rehacer la cuenta. */
  factorVolumetrico: number;
  paletLargoCm: number;
  paletAnchoCm: number;
  alturaUtilCm: number;
}

export type Resultado =
  | { ok: true; metricas: Metricas }
  | { ok: false; error: string };

/** Redondeo a `d` decimales sin arrastrar el ruido binario de los float. */
function redondea(n: number, d: number): number {
  const f = Math.pow(10, d);
  return Math.round((n + Number.EPSILON) * f) / f;
}

function numeroValido(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * calculaEnvio — las cuatro métricas a partir de la carga.
 *
 * Los redondeos se aplican SOLO al final: el peso facturable se decide
 * comparando los valores completos, no los ya redondeados, para que un
 * 899,996 kg volumétrico no pierda contra un 900 kg real por un decimal.
 */
export function calculaEnvio(entrada: EntradaEnvio): Resultado {
  const { pesoRealKg, largoCm, anchoCm, altoCm, bultos } = entrada;

  if (!numeroValido(pesoRealKg)) {
    return { ok: false, error: "El peso real total debe ser un número mayor que cero, en kilos." };
  }
  if (!numeroValido(largoCm) || !numeroValido(anchoCm) || !numeroValido(altoCm)) {
    return { ok: false, error: "Las tres medidas del bulto (largo, ancho y alto) deben ser números mayores que cero, en centímetros." };
  }
  if (!numeroValido(bultos) || !Number.isInteger(bultos)) {
    return { ok: false, error: "El número de bultos debe ser un entero mayor que cero." };
  }
  if (pesoRealKg > MAX_PESO_KG) {
    return { ok: false, error: "Ese peso supera los " + MAX_PESO_KG + " kg. Confírmame la cifra, porque parece una errata." };
  }
  if (largoCm > MAX_DIM_CM || anchoCm > MAX_DIM_CM || altoCm > MAX_DIM_CM) {
    return { ok: false, error: "Alguna medida supera los " + MAX_DIM_CM + " cm. Confírmame las medidas en centímetros." };
  }
  if (bultos > MAX_BULTOS) {
    return { ok: false, error: "Son más de " + MAX_BULTOS + " bultos. Para ese volumen lo vemos directamente con el equipo." };
  }

  const cm3PorBulto = largoCm * anchoCm * altoCm;

  /* 1 · Volumen. */
  const volumenBultoM3 = cm3PorBulto / 1_000_000;
  const volumenTotalM3 = volumenBultoM3 * bultos;

  /* 2 · Peso volumétrico, factor 5000. */
  const pesoVolumetricoBultoKg = cm3PorBulto / FACTOR_VOLUMETRICO;
  const pesoVolumetricoKg = pesoVolumetricoBultoKg * bultos;

  /* 3 · Peso facturable: el mayor de los dos, comparado sin redondear. */
  const pesoFacturableKg = Math.max(pesoRealKg, pesoVolumetricoKg);
  const criterio: "real" | "volumetrico" =
    pesoVolumetricoKg > pesoRealKg ? "volumetrico" : "real";

  /* 4 · Palés estimados, por footprint de europalet.

     Se prueban las dos orientaciones del bulto sobre la base 120 × 80 y se
     queda la que más bultos mete. Luego se apila hasta la altura útil. Es
     una estimación GEOMÉTRICA: no considera el límite de peso por palet ni
     si la mercancía es apilable, y por eso se etiqueta como estimada. */
  const porOrientacionA =
    Math.floor(PALET_LARGO_CM / largoCm) * Math.floor(PALET_ANCHO_CM / anchoCm);
  const porOrientacionB =
    Math.floor(PALET_LARGO_CM / anchoCm) * Math.floor(PALET_ANCHO_CM / largoCm);
  const bultosPorBase = Math.max(porOrientacionA, porOrientacionB);
  const capasPorPalet = Math.floor(ALTURA_UTIL_CM / altoCm);

  /* Si el bulto no entra en la base o pasa de la altura útil, no se fuerza
     el número: cada bulto va como una unidad sobredimensionada. */
  const sobredimensionado = bultosPorBase < 1 || capasPorPalet < 1;
  const bultosPorPalet = sobredimensionado ? 1 : bultosPorBase * capasPorPalet;
  const palesEstimados = Math.ceil(bultos / bultosPorPalet);

  return {
    ok: true,
    metricas: {
      pesoRealKg: redondea(pesoRealKg, 2),
      largoCm: redondea(largoCm, 1),
      anchoCm: redondea(anchoCm, 1),
      altoCm: redondea(altoCm, 1),
      bultos,

      volumenBultoM3: redondea(volumenBultoM3, 3),
      volumenTotalM3: redondea(volumenTotalM3, 3),
      pesoVolumetricoBultoKg: redondea(pesoVolumetricoBultoKg, 2),
      pesoVolumetricoKg: redondea(pesoVolumetricoKg, 2),
      pesoFacturableKg: redondea(pesoFacturableKg, 2),
      palesEstimados,

      criterio,
      bultosPorBase: sobredimensionado ? 0 : bultosPorBase,
      capasPorPalet: sobredimensionado ? 0 : capasPorPalet,
      bultosPorPalet,
      sobredimensionado,

      factorVolumetrico: FACTOR_VOLUMETRICO,
      paletLargoCm: PALET_LARGO_CM,
      paletAnchoCm: PALET_ANCHO_CM,
      alturaUtilCm: ALTURA_UTIL_CM,
    },
  };
}

/**
 * normalizaTelefono — móvil o fijo español. Misma regla que assets/js/lead.js:
 * nueve dígitos empezando por 6, 7, 8 o 9, tolerando espacios, guiones y el
 * prefijo +34 / 0034. Devuelve "" si no cuela.
 *
 * Se valida aquí, en el servidor, y no se deja al modelo: "es un teléfono
 * válido" es una comprobación, no una opinión.
 */
export function normalizaTelefono(raw: unknown): string {
  const d = String(raw ?? "").replace(/[^\d]/g, "").replace(/^(0034|34)/, "");
  return /^[6789]\d{8}$/.test(d) ? d : "";
}

/**
 * resumenCarga — una línea de texto plano con la carga y sus métricas, para
 * el campo `mensaje` del lead y para el aviso de Telegram. La escribe el
 * código, no el modelo, así que lo que llega al CRM son las cifras reales.
 */
export function resumenCarga(m: Metricas, tipoCarga: string): string {
  const partes = [
    tipoCarga ? "Carga: " + tipoCarga : "",
    m.bultos + " bulto(s) de " + m.largoCm + "×" + m.anchoCm + "×" + m.altoCm + " cm",
    "Peso real: " + m.pesoRealKg + " kg",
    "Volumen total: " + m.volumenTotalM3 + " m³",
    "Peso volumétrico (factor " + m.factorVolumetrico + "): " + m.pesoVolumetricoKg + " kg",
    "Peso facturable: " + m.pesoFacturableKg + " kg (manda el peso " +
      (m.criterio === "volumetrico" ? "volumétrico" : "real") + ")",
    "Palés estimados: " + m.palesEstimados +
      (m.sobredimensionado ? " (bulto fuera del sobre estándar 120×80×180)" : ""),
    "Métricas orientativas calculadas por el agente; presupuesto pendiente de confirmar por el equipo.",
  ];
  return partes.filter(Boolean).join(" · ");
}
