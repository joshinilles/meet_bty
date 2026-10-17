/* MEET · meet-bty.com – vier Screens: Heute, Schreiben, Danke, MEET WALL
   Ein Screen, eine Aufgabe. Versand als Netlify Form (POST auf "/", form-name "meet-impuls").
   Die MEET WALL (freigegebene Momente der anderen) ist nur vom Danke-Screen aus erreichbar: erst teilen, dann sehen. */
(function () {
  "use strict";

  var cfg = Object.assign(
    { passage: "Johannes 4,1–26", maxChars: 2000 },
    window.MEET_CONFIG || {}
  );

  var COPY = {
    moment: {
      label: "MEET-Moment",
      kicker: "Dein MEET-Moment",
      heading: "Schreib einfach drauflos.",
      placeholder: "Mir ist aufgefallen, dass …",
      send: "Teilen",
      sentKicker: "Moment geteilt",
      sentHeading: function (n) { return n ? "Danke fürs Teilen, " + n + "!" : "Danke fürs Teilen!"; },
      sentBody: "Vielleicht posten wir deinen MEET-Moment im Kanal."
    },
    question: {
      label: "Frage zum Text",
      kicker: "Deine Frage zum Text",
      heading: "Frag einfach drauflos.",
      placeholder: "Ich frage mich, warum …",
      send: "Frage stellen",
      sentKicker: "Frage gestellt",
      sentHeading: function (n) { return n ? "Danke für deine Frage, " + n + "!" : "Danke für deine Frage!"; },
      sentBody: "Wir greifen deine Frage im Kanal oder in MEET US auf."
    }
  };

  var MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    topbar: $("topbar"), logoLink: $("logoLink"),
    screens: { home: $("screen-home"), write: $("screen-write"), done: $("screen-done"), wall: $("screen-wall") },
    dateLabel: $("dateLabel"), passage: $("passage"),
    goMoment: $("goMoment"), goQuestion: $("goQuestion"), back: $("back"),
    form: $("panel"), fArt: $("fArt"), fPassage: $("fPassage"), fDate: $("fDate"),
    kicker: $("kicker"), heading: $("heading"), text: $("text"),
    addName: $("addName"), name: $("name"), error: $("error"), send: $("send"),
    wallRow: $("wallRow"), wall: $("wall"),
    sentKicker: $("sentKicker"), sentHeading: $("sentHeading"), sentBody: $("sentBody"),
    reset: $("reset"), goWall: $("goWall"),
    wallBack: $("wallBack"), wallList: $("wallList"), wallNote: $("wallNote"), wallMore: $("wallMore"), wallHome: $("wallHome")
  };

  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  var state = { screen: "home", mode: "moment", texts: { moment: "", question: "" }, busy: false };

  // ---- Kopf: Datum & Bibelstelle ----
  var now = new Date();
  el.dateLabel.textContent = now.getDate() + ". " + MONTHS[now.getMonth()];
  el.passage.textContent = cfg.passage;
  el.fPassage.value = cfg.passage;
  el.fDate.value = now.toISOString().slice(0, 10);
  el.text.maxLength = cfg.maxChars;

  // ---- Screens ----
  function show(name, dir) {
    if (state.screen === name) return;
    var prev = state.screen;
    state.screen = name;
    Object.keys(el.screens).forEach(function (k) {
      var s = el.screens[k];
      s.classList.remove("enter-fwd", "enter-back");
      s.hidden = k !== name;
    });
    var target = el.screens[name];
    if (!reduce && prev) {
      target.classList.add(dir === "back" ? "enter-back" : "enter-fwd");
      target.addEventListener("animationend", function h() {
        target.classList.remove("enter-fwd", "enter-back");
        target.removeEventListener("animationend", h);
      });
    }
    // Kopf: unterwegs zeigt das Logo das Signet M_
    el.topbar.classList.toggle("is-away", name !== "home");
    window.scrollTo({ top: 0, behavior: "auto" });
    window.dispatchEvent(new Event("meet:screen"));
  }

  function goWrite(mode) {
    setMode(mode);
    show("write", "fwd");
    try { history.pushState({ screen: "write" }, ""); } catch (e) {}
    setTimeout(function () { el.text.focus({ preventScroll: true }); }, reduce ? 0 : 380);
  }

  function goHome() {
    show("home", "back");
    hideError();
  }

  el.goMoment.addEventListener("click", function () { goWrite("moment"); });
  el.goQuestion.addEventListener("click", function () { goWrite("question"); });
  el.back.addEventListener("click", function () {
    if (history.state && history.state.screen === "write") history.back(); else goHome();
  });
  el.logoLink.addEventListener("click", function () {
    if (state.screen !== "home") goHome();
  });
  window.addEventListener("popstate", function () {
    if (state.screen !== "home") goHome();
  });

  // ---- Modus: MEET-Moment oder Frage ----
  function setMode(mode) {
    state.mode = mode;
    var c = COPY[mode];
    el.kicker.textContent = c.kicker;
    el.heading.textContent = c.heading;
    el.text.placeholder = c.placeholder;
    el.send.textContent = c.send;
    el.fArt.value = c.label;
    el.wallRow.hidden = mode !== "moment"; // der Haken gilt nur für MEET-Momente
    el.text.value = state.texts[mode];
    hideError();
    updateSend();
  }

  function updateSend() {
    el.send.disabled = el.text.value.trim().length === 0 || state.busy;
  }

  el.text.addEventListener("input", function () {
    if (el.text.value.length > cfg.maxChars) el.text.value = el.text.value.slice(0, cfg.maxChars);
    state.texts[state.mode] = el.text.value;
    hideError();
    updateSend();
  });

  // ---- Name: eingeklappt, bis jemand ihn will ----
  el.addName.addEventListener("click", function () {
    el.addName.hidden = true;
    el.name.hidden = false;
    el.name.focus();
  });

  function showError() { el.error.hidden = false; }
  function hideError() { el.error.hidden = true; }

  // ---- Versand ----
  function isLocalPreview() {
    var h = location.hostname;
    return location.protocol === "file:" || h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }

  el.form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var text = el.text.value.trim();
    if (!text || state.busy) return;

    state.busy = true;
    el.send.classList.add("is-busy");
    el.send.textContent = "Wird gesendet …";
    updateSend();

    var data = new URLSearchParams(new FormData(el.form));
    data.set("nachricht", text);
    if (state.mode !== "moment") data.delete("wall");
    var wantsWall = state.mode === "moment" && el.wall.checked;

    var request = fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: data.toString()
    });
    // lokal (file:// oder localhost): der Versand darf scheitern, die Erfolgskarte erscheint trotzdem als Vorschau
    if (isLocalPreview()) request = request.catch(function () { return { ok: true }; }).then(function () { return { ok: true }; });

    request
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        if (wantsWall) rememberOwn(text, cfg.passage);
        onSent(state.mode);
      })
      .catch(function (err) {
        console.warn("[MEET] Versand fehlgeschlagen:", err);
        showError();
      })
      .then(function () {
        state.busy = false;
        el.send.classList.remove("is-busy");
        el.send.textContent = COPY[state.mode].send;
        updateSend();
      });
  });

  function onSent(mode) {
    var c = COPY[mode];
    var n = el.name.value.trim();
    el.sentKicker.textContent = c.sentKicker;
    el.sentHeading.textContent = c.sentHeading(n);
    el.sentBody.textContent = c.sentBody;
    state.texts[mode] = "";
    el.text.value = "";
    el.text.blur();
    el.wall.checked = false;
    el.goWall.hidden = mode !== "moment"; // die Wand gibt es nur nach einem geteilten MEET-Moment
    show("done", "fwd");
    try { history.replaceState({ screen: "done" }, ""); } catch (e) {}
  }

  el.reset.addEventListener("click", goHome);

  // ---- MEET WALL: freigegebene Momente der anderen ----
  var WALL_URL = "/.netlify/functions/wall";
  var OWN_KEY = "meet:wall-own";
  var PAGE = 20;
  var wallState = { items: [], shown: 0, loaded: false };

  // Eigene Momente mit Haken merkt sich das Gerät (7 Tage), damit sie oben auf der Wand stehen, bevor sie geprüft sind
  function readOwn() {
    try {
      var list = JSON.parse(localStorage.getItem(OWN_KEY) || "[]");
      var cut = Date.now() - 7 * 864e5;
      return list.filter(function (m) { return m && m.text && Date.parse(m.ts) > cut; });
    } catch (e) { return []; }
  }
  function rememberOwn(text, passage) {
    var list = readOwn();
    list.unshift({ text: text, passage: passage, ts: new Date().toISOString() });
    try { localStorage.setItem(OWN_KEY, JSON.stringify(list.slice(0, 5))); } catch (e) {}
  }

  function goWall() {
    show("wall", "fwd");
    try { history.pushState({ screen: "wall" }, ""); } catch (e) {}
    if (!wallState.loaded) loadWall();
  }

  function loadWall() {
    el.wallNote.hidden = true;
    el.wallMore.hidden = true;
    el.wallList.innerHTML = "";
    renderOwn([]);
    var loading = document.createElement("p");
    loading.className = "hint wall-loading";
    loading.textContent = "Wand wird geladen …";
    el.wallList.appendChild(loading);
    fetch(WALL_URL, { headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) {
        wallState.items = (j && j.items) || [];
        wallState.shown = 0;
        wallState.loaded = true;
        renderWall();
      })
      .catch(function (err) {
        console.warn("[MEET] Wand nicht geladen:", err);
        el.wallList.innerHTML = "";
        renderOwn([]);
        note("Die Wand lässt sich gerade nicht laden. Probier es später noch einmal.");
      });
  }

  function note(text) { el.wallNote.textContent = text; el.wallNote.hidden = false; }

  function renderWall() {
    el.wallList.innerHTML = "";
    var items = wallState.items;
    renderOwn(items);
    if (!items.length) {
      note("Noch keine Momente auf der Wand. Deiner könnte der erste sein.");
      return;
    }
    el.wallNote.hidden = true;
    var ownTexts = readOwn().map(function (o) { return o.text; });
    var end = Math.min(items.length, wallState.shown + PAGE);
    var lastGroup = null;
    for (var i = 0; i < end; i++) {
      var m = items[i];
      if (ownTexts.indexOf(m.text) >= 0) continue; // eigene stehen schon oben unter „Von dir“
      var g = groupLabel(m);
      if (g !== lastGroup) {
        var h = document.createElement("div");
        h.className = "label wall-group";
        h.textContent = g;
        el.wallList.appendChild(h);
        lastGroup = g;
      }
      el.wallList.appendChild(card(m.text, timeLabel(m.ts), false));
    }
    wallState.shown = end;
    el.wallMore.hidden = end >= items.length;
  }

  function renderOwn(approved) {
    var own = readOwn();
    if (!own.length) return;
    var h = document.createElement("div");
    h.className = "label wall-group";
    h.textContent = "Von dir";
    el.wallList.appendChild(h);
    own.forEach(function (o) {
      var live = approved.some(function (m) { return m.text === o.text; });
      el.wallList.appendChild(card(o.text, live ? "Dein Moment · auf der Wand" : "Dein Moment · wird gerade geprüft", true));
    });
  }

  function card(text, meta, own) {
    var c = document.createElement("article");
    c.className = "moment" + (own ? " moment--own" : "");
    var t = document.createElement("p");
    t.className = "moment-text";
    t.textContent = text;
    var m = document.createElement("div");
    m.className = "moment-meta";
    m.textContent = meta;
    c.appendChild(t);
    c.appendChild(m);
    return c;
  }

  function dayKey(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function groupLabel(m) {
    var d = m.ts ? new Date(m.ts) : null;
    var day = "";
    if (d && !isNaN(d)) {
      var today = new Date(), yest = new Date(Date.now() - 864e5);
      day = dayKey(d) === dayKey(today) ? "Heute" : dayKey(d) === dayKey(yest) ? "Gestern" : d.getDate() + ". " + MONTHS[d.getMonth()];
    }
    return [day, m.passage].filter(Boolean).join(" · ");
  }
  function timeLabel(ts) {
    var d = ts ? new Date(ts) : null;
    if (!d || isNaN(d)) return "";
    return (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
  }

  el.goWall.addEventListener("click", goWall);
  el.wallMore.addEventListener("click", renderWall);
  el.wallBack.addEventListener("click", function () {
    if (history.state && history.state.screen === "wall") history.back(); else goHome();
  });
  el.wallHome.addEventListener("click", goHome);

  setMode("moment");
})();
