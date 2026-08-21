/* =========================================================================
   tarifa.js — FUENTE ÚNICA DE TARIFAS DE LAS TRES CALCULADORAS
   =========================================================================

   ⚠️  TARIFA DEMO — ORIENTATIVA.

   Todos los importes de este fichero son una tabla de EJEMPLO construida
   para la demo de WhiteMoon. NO son las tarifas de ninguna empresa real,
   no están copiadas de ningún operador y no deben citarse como precio de
   mercado. La empresa que contrate la web sustituye ESTE ÚNICO FICHERO por
   su tarifa y las tres calculadoras quedan actualizadas: no hay ni un solo
   número de precio repetido en el HTML, en el CSS ni en el resto del JS.

   Qué se puede tocar aquí sin romper nada:
     · TERRESTRE.densidadVolumetrica  kg por m³ que aplica el transportista
     · TERRESTRE.tramos               escalado por peso facturable
     · TERRESTRE.zonas                factor multiplicador por destino
     · TERRESTRE.recargos             porcentajes y fijos
     · CONTENEDORES.tipos             franjas €/km por tipo de equipo
     · CONTENEDORES.factorInternacional / minimoServicio
     · MARITIMO.equipos               franjas de flete base por contenedor
     · MARITIMO.puertosDestino / origenesFrecuentes / incoterms
     · iva                            tipo impositivo

   Lo único que NO se debe tocar es el orden de `TERRESTRE.tramos`: van de
   menor a mayor y se evalúan de arriba a abajo.
   ========================================================================= */
(function () {
  "use strict";

  /* Etiqueta que se pinta en toda la web para que nadie confunda estas
     tablas con una tarifa cerrada. Se lee desde [data-etiqueta-tarifa]. */
  var ETIQUETA = "Tarifa demo orientativa · v2026-08";

  var IVA = 0.21;

  /* =======================================================================
     CALCULADORA 1 · PORTES TERRESTRE (nacional)
     Cálculo cerrado y verificable. Es la única de las tres que devuelve un
     importe concreto, y aun así se presenta como orientativo.
     ======================================================================= */
  var TERRESTRE = {
    /* Volumen (m³)    = ancho × largo × alto (metros)
       Peso vol. (kg)  = Volumen × densidadVolumetrica
       Peso facturable = max(peso real, peso volumétrico) */
    densidadVolumetrica: 250, // kg/m³

    /* Precio base = fijo del tramo + peso facturable × €/kg del tramo.

       El cuarto tramo (>1.000 kg) lleva fijo 105 € y no 0 €: con 0 € un
       envío de 1.001 kg saldría por 100,10 € frente a los 205 € de uno de
       1.000 kg, y el precio bajaría al subir el peso. Con 105 € la curva es
       continua — en 1.000 kg ambos tramos dan exactamente 205 € — y el
       €/kg del tramo sigue siendo el 0,10 €/kg de la especificación. */
    tramos: [
      { desde: 0,    hasta: 100,      fijo: 25,  porKg: 0.25, etiqueta: "0 – 100 kg" },
      { desde: 100,  hasta: 500,      fijo: 45,  porKg: 0.18, etiqueta: "101 – 500 kg" },
      { desde: 500,  hasta: 1000,     fijo: 85,  porKg: 0.12, etiqueta: "501 – 1.000 kg" },
      { desde: 1000, hasta: Infinity, fijo: 105, porKg: 0.10, etiqueta: "Más de 1.000 kg" }
    ],

    /* Las zonas multiplican el precio base ya calculado. */
    zonas: {
      1: { nombre: "Zona 1 · Local",     detalle: "Misma provincia",       factor: 0.75 },
      2: { nombre: "Zona 2 · Limítrofe", detalle: "Provincias limítrofes", factor: 0.88 },
      3: { nombre: "Zona 3 · Península", detalle: "Resto de la península", factor: 1.00 },
      4: { nombre: "Zona 4 · Baleares",  detalle: "Illes Balears (07xxx)", factor: 1.70 },
      5: { nombre: "Zona 5 · Canarias, Ceuta y Melilla", detalle: "35xxx · 38xxx · 51xxx · 52xxx", factor: 2.30 }
    },

    /* Los porcentuales se aplican sobre la base ya zonificada.
       Los fijos se suman después, antes de IVA. */
    recargos: {
      combustible: { tipo: "pct",       valor: 0.12, nombre: "Recargo de combustible (BAF)" },
      urgente:     { tipo: "pct",       valor: 0.20, nombre: "Servicio urgente 24 h" },
      adr:         { tipo: "pct",       valor: 0.25, nombre: "Mercancía peligrosa (ADR)" },
      plataforma:  { tipo: "fijo",      valor: 25,   nombre: "Plataforma elevadora" },
      reembolso:   { tipo: "pct_valor", valor: 0.03, minimo: 3, nombre: "Gestión de reembolso" }
    },

    iva: IVA
  };

  /* =======================================================================
     CALCULADORA 2 · CONTENEDORES POR CARRETERA (por kilómetro)
     Devuelve un RANGO, nunca un número cerrado: el precio real depende del
     camión disponible, del retorno y de la fecha.
     ======================================================================= */
  var CONTENEDORES = {
    tipos: [
      { id: "20",   nombre: "Contenedor 20 pies",        corto: "20'",    min: 0.90, max: 1.30,
        nota: "Porta-contenedores estándar. Hasta unas 28 t de carga útil según tara y ruta." },
      { id: "40",   nombre: "Contenedor 40 pies",        corto: "40'",    min: 1.10, max: 1.60,
        nota: "Plataforma extensible. Mismo camión para 40' estándar y 40' High Cube." },
      { id: "obra", nombre: "Contenedor de obra",        corto: "obra",   min: 1.20, max: 1.80,
        nota: "Incluye la maniobra de carga y descarga con la grúa del propio camión." }
    ],
    /* Un tramo internacional dentro de la UE encarece el kilómetro: peajes,
       tiempos de conducción y posicionamiento del retorno en vacío. */
    factorInternacional: 1.15,
    /* Por debajo de este importe no compensa mover el equipo: cualquier
       servicio arranca aquí, por corto que sea el trayecto. */
    minimoServicio: 150,
    iva: IVA
  };

  /* =======================================================================
     CALCULADORA 3 · MARÍTIMO (import / export de contenedores)
     Cotización guiada. El flete marítimo cambia por naviera, ruta y semana:
     aquí solo se enseña una horquilla de partida y la LISTA DE CONCEPTOS
     que compone el precio final, sin cifra cerrada en ninguno de ellos.
     ======================================================================= */
  var MARITIMO = {
    equipos: [
      { id: "20",   nombre: "Contenedor 20 pies (20' DV)",      corto: "20'",    min: 600, max: 1400 },
      { id: "40",   nombre: "Contenedor 40 pies (40' DV)",      corto: "40'",    min: 900, max: 2100 },
      { id: "40hc", nombre: "Contenedor 40 pies High Cube",     corto: "40'HC",  min: 900, max: 2100 }
    ],

    puertosDestino: [
      { id: "valencia",  nombre: "Valencia",   detalle: "Mediterráneo · principal puerto de contenedor de España" },
      { id: "barcelona", nombre: "Barcelona",  detalle: "Mediterráneo · noreste peninsular" },
      { id: "algeciras", nombre: "Algeciras",  detalle: "Estrecho · gran volumen de transbordo" },
      { id: "bilbao",    nombre: "Bilbao",     detalle: "Atlántico norte · tráficos con el norte de Europa y América" },
      { id: "laspalmas", nombre: "Las Palmas", detalle: "Canarias · territorio aduanero propio, con IGIC", canarias: true }
    ],

    origenesFrecuentes: [
      "Shanghái (China)", "Ningbo (China)", "Shenzhen (China)", "Qingdao (China)",
      "Ho Chi Minh (Vietnam)", "Nhava Sheva (India)", "Estambul (Turquía)",
      "Casablanca (Marruecos)", "Alejandría (Egipto)", "Nueva York (EE. UU.)",
      "Veracruz (México)", "Cartagena (Colombia)", "Santos (Brasil)",
      "Buenos Aires (Argentina)", "Callao (Perú)", "Durban (Sudáfrica)"
    ],

    incoterms: [
      {
        id: "EXW",
        nombre: "EXW · En fábrica",
        resumen: "Recogemos en las instalaciones del proveedor: a partir de su puerta, todo lo organizamos nosotros.",
        conceptos: [
          { nombre: "Recogida y transporte interior en origen", detalle: "Del almacén del proveedor al puerto de embarque." },
          { nombre: "Despacho de exportación en origen", detalle: "Trámite aduanero de salida del país vendedor." },
          { nombre: "THC en el puerto de origen", detalle: "Manipulación del contenedor en la terminal de carga." }
        ]
      },
      {
        id: "FOB",
        nombre: "FOB · Franco a bordo",
        resumen: "Tu proveedor entrega la mercancía ya cargada en el buque. Desde ahí gestionamos flete, llegada y despacho.",
        conceptos: []
      },
      {
        id: "CIF",
        nombre: "CIF · Coste, seguro y flete",
        resumen: "El flete y el seguro hasta el puerto de destino van por cuenta del vendedor: aquí gestionamos la llegada.",
        conceptos: []
      }
    ],

    /* Conceptos que SIEMPRE forman parte del precio final y que se enumeran
       sin cifra: ponerles un número sería inventar una tarifa de naviera. */
    conceptosBase: [
      { nombre: "THC en destino", detalle: "Manipulación en la terminal del puerto español de llegada." },
      { nombre: "BAF · recargo de combustible", detalle: "Lo fija la naviera y se revisa periódicamente." },
      { nombre: "Despacho de aduana de importación (DUA)", detalle: "Honorarios del agente de aduanas, más aranceles e IVA a la importación." },
      { nombre: "Transporte terrestre desde el puerto", detalle: "Se estima aparte, en la calculadora de contenedores por carretera." }
    ],

    conceptoCanarias: {
      nombre: "IGIC y despacho canario",
      detalle: "Canarias tiene territorio aduanero propio: el envío lleva DUA e IGIC en lugar del IVA peninsular."
    },
    conceptoPeligrosa: {
      nombre: "Recargo de mercancía peligrosa (IMO / IMDG)",
      detalle: "Depende de la clase IMDG, del embalaje y de la naviera. Exige declaración de mercancía peligrosa."
    },

    iva: IVA
  };

  /* =======================================================================
     MAPA DE PROVINCIAS POR PREFIJO DE CÓDIGO POSTAL
     Los dos primeros dígitos del CP español identifican la provincia.
     ======================================================================= */
  var PROVINCIAS = {
    "01": "Álava", "02": "Albacete", "03": "Alicante", "04": "Almería",
    "05": "Ávila", "06": "Badajoz", "07": "Illes Balears", "08": "Barcelona",
    "09": "Burgos", "10": "Cáceres", "11": "Cádiz", "12": "Castellón",
    "13": "Ciudad Real", "14": "Córdoba", "15": "A Coruña", "16": "Cuenca",
    "17": "Girona", "18": "Granada", "19": "Guadalajara", "20": "Gipuzkoa",
    "21": "Huelva", "22": "Huesca", "23": "Jaén", "24": "León",
    "25": "Lleida", "26": "La Rioja", "27": "Lugo", "28": "Madrid",
    "29": "Málaga", "30": "Murcia", "31": "Navarra", "32": "Ourense",
    "33": "Asturias", "34": "Palencia", "35": "Las Palmas", "36": "Pontevedra",
    "37": "Salamanca", "38": "Santa Cruz de Tenerife", "39": "Cantabria",
    "40": "Segovia", "41": "Sevilla", "42": "Soria", "43": "Tarragona",
    "44": "Teruel", "45": "Toledo", "46": "Valencia", "47": "Valladolid",
    "48": "Bizkaia", "49": "Zamora", "50": "Zaragoza", "51": "Ceuta",
    "52": "Melilla"
  };

  /* =======================================================================
     ADYACENCIA SIMPLIFICADA (fronteras terrestres peninsulares)
     Sirve para decidir la Zona 2. Es una simplificación consciente de la
     demo: no contempla enclaves (Treviño, Llívia) ni fronteras marítimas.
     Baleares (07), Las Palmas (35), Tenerife (38), Ceuta (51) y Melilla
     (52) no tienen vecinos terrestres: siempre caen en Z4 / Z5.
     ======================================================================= */
  var LIMITROFES = {
    "01": ["09", "20", "26", "31", "48"],
    "02": ["03", "13", "16", "18", "30", "46"],
    "03": ["02", "30", "46"],
    "04": ["18", "30"],
    "05": ["10", "28", "37", "40", "45", "47"],
    "06": ["10", "13", "14", "21", "41", "45"],
    "07": [],
    "08": ["17", "25", "43"],
    "09": ["01", "24", "26", "34", "39", "40", "42", "47"],
    "10": ["05", "06", "37", "45"],
    "11": ["21", "29", "41"],
    "12": ["43", "44", "46"],
    "13": ["02", "06", "14", "16", "23", "45"],
    "14": ["06", "13", "18", "21", "23", "29", "41"],
    "15": ["27", "36"],
    "16": ["02", "13", "19", "44", "45", "46"],
    "17": ["08", "25"],
    "18": ["02", "04", "14", "23", "29"],
    "19": ["16", "28", "40", "42", "44", "45", "50"],
    "20": ["01", "31", "48"],
    "21": ["06", "11", "41"],
    "22": ["25", "31", "44", "50"],
    "23": ["02", "04", "13", "14", "18"],
    "24": ["09", "27", "32", "33", "34", "37", "49"],
    "25": ["08", "17", "22", "43", "44"],
    "26": ["01", "09", "31", "42", "50"],
    "27": ["15", "24", "32", "33", "36"],
    "28": ["05", "16", "19", "40", "45"],
    "29": ["11", "14", "18", "41"],
    "30": ["02", "03", "04"],
    "31": ["01", "20", "22", "26", "50"],
    "32": ["24", "27", "36", "49"],
    "33": ["24", "27", "39"],
    "34": ["09", "24", "39", "47", "49"],
    "35": [],
    "36": ["15", "27", "32"],
    "37": ["05", "10", "24", "47", "49"],
    "38": [],
    "39": ["09", "33", "34", "48"],
    "40": ["05", "09", "19", "28", "42", "47"],
    "41": ["06", "11", "14", "21", "29"],
    "42": ["09", "19", "26", "40", "50"],
    "43": ["08", "12", "25", "44", "50"],
    "44": ["12", "16", "19", "22", "43", "46", "50"],
    "45": ["05", "06", "10", "13", "16", "19", "28"],
    "46": ["02", "03", "12", "16", "44"],
    "47": ["05", "09", "34", "37", "40", "49"],
    "48": ["01", "20", "39"],
    "49": ["24", "32", "34", "37", "47"],
    "50": ["19", "22", "26", "31", "42", "43", "44"],
    "51": [],
    "52": []
  };

  /* Prefijos que fuerzan zona insular / plazas de soberanía, con
     independencia de qué haya al otro lado de la ruta. */
  var ZONA_POR_PREFIJO = { "07": 4, "35": 5, "38": 5, "51": 5, "52": 5 };

  window.WhiteMoonTarifa = {
    ETIQUETA: ETIQUETA,
    IVA: IVA,
    TERRESTRE: TERRESTRE,
    CONTENEDORES: CONTENEDORES,
    MARITIMO: MARITIMO,
    PROVINCIAS: PROVINCIAS,
    LIMITROFES: LIMITROFES,
    ZONA_POR_PREFIJO: ZONA_POR_PREFIJO
  };
})();
