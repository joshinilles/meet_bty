/* MEET · meet-bty.com – Bewegung
   1) Intro: Wortmarke erscheint mittig, fliegt an ihren Platz, Inhalt folgt gestaffelt.
   2) Sticky-Kopf: beim Scrollen verschwimmt MEET_ in das kleine Signet M_.
   3) Leerstelle: der Balken blinkt, solange das Feld leer ist – und steht, sobald geschrieben wird. */
(function () {
  "use strict";
  var root = document.documentElement;
  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  // ---- 1) Intro ----
  function finishIntro() {
    root.classList.add("ready");
    root.classList.remove("intro");
  }
  if (root.classList.contains("intro")) {
    var splash = document.getElementById("splashLogo");
    var target = document.getElementById("wordmark");
    var minDelay = new Promise(function (r) { setTimeout(r, 650); });
    var loaded = new Promise(function (r) {
      if (document.readyState === "complete") r(); else window.addEventListener("load", r, { once: true });
    });
    var fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    var safety = new Promise(function (r) { setTimeout(r, 2600); });

    Promise.race([Promise.all([minDelay, loaded, fonts]), safety]).then(function () {
      if (!splash || !target || !splash.animate) { finishIntro(); return; }
      var from = splash.getBoundingClientRect();
      var to = target.getBoundingClientRect();
      if (!from.width || !to.width) { finishIntro(); return; }
      // Position einfrieren, dann per Transform zum Ziel
      splash.style.transform = "none";
      splash.style.left = from.left + "px";
      splash.style.top = from.top + "px";
      splash.style.transformOrigin = "top left";
      var s = to.height / from.height;
      var anim = splash.animate(
        [{ transform: "translate(0,0) scale(1)" },
         { transform: "translate(" + (to.left - from.left) + "px," + (to.top - from.top) + "px) scale(" + s + ")" }],
        { duration: 720, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" }
      );
      var done = false;
      var end = function () { if (done) return; done = true; finishIntro(); };
      anim.onfinish = end;
      anim.oncancel = end;
      setTimeout(end, 1200);
    });
  }

  // ---- 2) Sticky-Kopf & Morph ----
  var topbar = document.getElementById("topbar");
  var compact = false, ticking = false;
  function applyScroll() {
    var y = window.scrollY || window.pageYOffset || 0;
    if (!compact && y > 60) { compact = true; topbar.classList.add("is-compact"); }
    else if (compact && y < 12) { compact = false; topbar.classList.remove("is-compact"); }
    ticking = false;
  }
  if (topbar) {
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(applyScroll); }
    }, { passive: true });
    applyScroll();
  }

  var logoLink = document.getElementById("logoLink");
  if (logoLink) {
    logoLink.addEventListener("click", function (ev) {
      ev.preventDefault();
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    });
  }

  // ---- 3) Leerstelle: blinkt, bis geschrieben wird ----
  var stack = document.getElementById("logoStack");
  var text = document.getElementById("text");
  function syncCursor() {
    if (!stack || !text) return;
    stack.classList.toggle("is-solid", text.value.trim().length > 0);
  }
  if (text) {
    text.addEventListener("input", syncCursor);
    document.addEventListener("click", function (ev) {
      if (ev.target.closest && ev.target.closest(".tab, #reset, #send")) setTimeout(syncCursor, 0);
    });
    syncCursor();
  }

  // ---- 4) Tab-Wechsel: Karteninhalt blendet kurz über ----
  var form = document.getElementById("panel");
  var tabsBox = document.querySelector(".tabs");
  if (form && tabsBox) {
    // Capture-Phase am Container: läuft vor dem Tab-Handler in app.js
    tabsBox.addEventListener("click", function (ev) {
      var t = ev.target.closest ? ev.target.closest(".tab") : null;
      if (!t || reduce || t.classList.contains("is-on")) return;
      form.classList.add("is-switching");
      setTimeout(function () { form.classList.remove("is-switching"); }, 190);
    }, true);
  }
})();
