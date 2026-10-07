/* MEET · meet-bty.com – Hinweis "MEET auf den Home-Bildschirm"
   Erscheint nur auf dem Handy im Browser, nicht in der schon hinzugefügten
   App. Wer ihn wegklickt (oder MEET hinzufügt), sieht ihn auf diesem Gerät
   nicht wieder. */
(function () {
  "use strict";

  var KEY = "meet:homescreen-hint";
  var DELAY = 2500; // erst kurz ankommen lassen

  var box = document.getElementById("a2hs");
  if (!box) return;

  function remembered() {
    try { return localStorage.getItem(KEY) === "erledigt"; } catch (e) { return false; }
  }
  function remember() {
    try { localStorage.setItem(KEY, "erledigt"); } catch (e) { /* privates Fenster: dann eben nur für jetzt */ }
  }

  var ua = navigator.userAgent || "";
  var isIOS = /iPhone|iPod/.test(ua);
  var isAndroid = /Android/.test(ua) && /Mobile/.test(ua);
  var standalone = window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);

  if (!(isIOS || isAndroid) || standalone || remembered()) return;

  // In Instagram, TikTok & Co. fehlt "Zum Home-Bildschirm" – erst in den Browser wechseln
  var inApp = /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|BytedanceWebview|Snapchat|Line\//i.test(ua);

  // Jedes Handy mit seinem eigenen Wort
  var SCREEN = isIOS ? "Home-Bildschirm" : "Startbildschirm";
  var MENU = isIOS ? "•••" : "⋮";

  var SHARE = '<svg class="a2hs-share" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';

  var HOW = {
    ios: "Tippe auf " + SHARE + "<b>Teilen</b> – in Safari unten, manchmal hinter <b>•••</b> – und dann auf <b>„Zum Home-Bildschirm“</b>.",
    android: "Tippe oben rechts auf <b>⋮</b> und dann auf <b>„App installieren“</b> oder <b>„Zum Startbildschirm hinzufügen“</b>.",
    androidPrompt: "Ein Tipp, und MEET liegt wie eine App auf deinem Startbildschirm.",
    inApp: "Öffne meet-bty.com zuerst in deinem Browser (Menü <b>" + MENU + "</b> → <b>„Im Browser öffnen“</b>). Dort kannst du MEET dann auf deinen " + SCREEN + " legen."
  };

  var el = {
    title: document.getElementById("a2hsTitle"),
    how: document.getElementById("a2hsHow"),
    add: document.getElementById("a2hsAdd"),
    close: document.getElementById("a2hsClose")
  };
  var state = { shown: false, fieldFocus: false, prompt: null };

  function render() {
    var key = inApp ? "inApp" : isIOS ? "ios" : state.prompt ? "androidPrompt" : "android";
    el.title.textContent = "Leg MEET auf deinen " + SCREEN + ".";
    el.how.innerHTML = HOW[key];
    el.add.hidden = key !== "androidPrompt";
  }

  function update() {
    box.hidden = !state.shown || state.fieldFocus;
  }

  function show() {
    if (remembered()) return;
    render();
    state.shown = true;
    update();
  }

  function done() {
    remember();
    state.shown = false;
    update();
  }

  // Android/Chrome: eigenes Installieren-Fenster statt Anleitung
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    state.prompt = e;
    if (state.shown) render();
  });
  window.addEventListener("appinstalled", done);

  el.add.addEventListener("click", function () {
    if (!state.prompt) return;
    state.prompt.prompt();
    state.prompt.userChoice.then(done, done);
    state.prompt = null;
  });

  el.close.addEventListener("click", done);

  // Beim Schreiben nicht im Weg sein – die Tastatur schiebt den Hinweis sonst übers Feld
  document.addEventListener("focusin", function (e) {
    if (e.target.matches && e.target.matches("textarea, input")) { state.fieldFocus = true; update(); }
  });
  document.addEventListener("focusout", function (e) {
    if (e.target.matches && e.target.matches("textarea, input")) { state.fieldFocus = false; update(); }
  });

  setTimeout(show, DELAY);
})();
