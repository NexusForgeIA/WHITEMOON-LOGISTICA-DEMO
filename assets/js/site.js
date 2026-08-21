/* =========================================================================
   site.js — pestañas accesibles, reveal al hacer scroll y año del pie
   =========================================================================
   No toca precios ni cálculos: solo comportamiento de interfaz.
   ========================================================================= */
(function () {
  "use strict";

  /* ------------------------------------------------------------- pestañas

     Patrón ARIA de tabs completo: el tablist es una única parada de
     tabulación (roving tabindex) y las flechas mueven entre pestañas, que
     es lo que espera quien navega con teclado o con lector de pantalla.
     Sin esto, tres formularios ocultos seguirían siendo tabulables y la
     página se volvería un laberinto. */
  var tablist = document.querySelector('[role="tablist"]');
  if (tablist) {
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));

    function panelDe(tab) {
      return document.getElementById(tab.getAttribute("aria-controls"));
    }

    function activa(tab, mueveFoco) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.setAttribute("tabindex", on ? "0" : "-1");
        var p = panelDe(t);
        if (p) p.hidden = !on;
      });
      if (mueveFoco) tab.focus();
    }

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () { activa(tab, false); });

      tab.addEventListener("keydown", function (ev) {
        var i = tabs.indexOf(tab);
        var destino = null;
        if (ev.key === "ArrowRight" || ev.key === "ArrowDown") destino = tabs[(i + 1) % tabs.length];
        else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") destino = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (ev.key === "Home") destino = tabs[0];
        else if (ev.key === "End") destino = tabs[tabs.length - 1];
        if (destino) { ev.preventDefault(); activa(destino, true); }
      });
    });

    /* Enlace directo a una calculadora concreta: /#calc-maritimo abre esa
       pestaña. Sirve para mandar a un cliente justo a la que le interesa. */
    function abrePorHash() {
      var h = (location.hash || "").replace("#", "");
      if (!h) return;
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].getAttribute("aria-controls") === h || tabs[i].id === h) {
          activa(tabs[i], false);
          return;
        }
      }
    }
    abrePorHash();
    window.addEventListener("hashchange", abrePorHash);

    /* Los enlaces internos que apuntan a una pestaña la abren antes de que
       el navegador salte al ancla. */
    Array.prototype.forEach.call(document.querySelectorAll('a[data-tab]'), function (a) {
      a.addEventListener("click", function () {
        var id = a.getAttribute("data-tab");
        for (var i = 0; i < tabs.length; i++) {
          if (tabs[i].getAttribute("aria-controls") === id) { activa(tabs[i], false); return; }
        }
      });
    });
  }

  /* ------------------------------------------------- etiqueta de la tarifa

     La etiqueta ("Tarifa demo orientativa · v2026-08") se escribe una sola
     vez, en tarifa.js. Aquí se vuelca en cada [data-etiqueta-tarifa] del
     HTML para que cambiar la versión de la tarifa cambie todos los sitios
     donde se anuncia, y no queden dos etiquetas distintas conviviendo. */
  if (window.WhiteMoonTarifa) {
    var et = window.WhiteMoonTarifa.ETIQUETA;
    Array.prototype.forEach.call(document.querySelectorAll("[data-etiqueta-tarifa]"), function (el) {
      el.textContent = et;
    });
  }

  /* --------------------------------------------------------------- reveal */

  var quieto = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var reveals = document.querySelectorAll(".rv");

  if (quieto || !("IntersectionObserver" in window)) {
    Array.prototype.forEach.call(reveals, function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.05 });
    Array.prototype.forEach.call(reveals, function (el) { io.observe(el); });
  }

  /* ----------------------------------------------------------------- año */

  var y = document.getElementById("anio");
  if (y) y.textContent = String(new Date().getFullYear());
})();
