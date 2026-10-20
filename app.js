/* MEET · meet-bty.com – vier Screens: Heute, Schreiben, Danke, MEET WALL
   Ein Screen, eine Aufgabe. Versand als Netlify Form (POST auf "/", form-name "meet-impuls").
   Die MEET WALL (freigegebene Momente der anderen) ist nur vom Danke-Screen aus erreichbar: erst teilen, dann sehen. */
(function () {
  "use strict";

  var cfg = Object.assign(
    { passage: "1. Johannes 1,5–2,2", planUrl: "", maxChars: 2000, wallUnlock: "always" },
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
      sentBody: "Wir greifen deine Frage im Kanal oder in MEET US auf. Unsere Antwort findest du hier auf der Startseite unter „Deine Frage“."
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
    reset: $("reset"), goWall: $("goWall"), homeAsks: $("homeAsks"), homeWall: $("homeWall"), homeWallSub: $("homeWallSub"), homeWallNew: $("homeWallNew"),
    wallBack: $("wallBack"), wallKicker: $("wallKicker"), wallList: $("wallList"), wallNote: $("wallNote"),
    wallMore: $("wallMore"), wallPast: $("wallPast"), wallHome: $("wallHome")
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

  // ---- Jahresplan: Bibelstelle des Tages aus dem Google Sheet (dieselbe Tabelle wie im Studio) ----
  var PLAN_PROXY = "/.netlify/functions/plan";
  var PLAN_CACHE = "meet:plan";
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function parseCsv(text) {
    var rows = [], row = [], cur = "", q = false; text = text.replace(/^\uFEFF/, "");
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === "," || c === ";" || c === "\t") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
      else cur += c;
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return x.trim(); }); });
  }
  function planDayKey(str) {
    str = (str || "").trim();
    var m1 = str.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/);
    if (m1) { var y = m1[3]; if (y.length === 2) y = "20" + y; return y + "-" + m1[2].padStart(2, "0") + "-" + m1[1].padStart(2, "0"); }
    var m2 = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m2) return m2[1] + "-" + m2[2].padStart(2, "0") + "-" + m2[3].padStart(2, "0");
    return null;
  }
  function planLookup(csv, day) {
    var rows = parseCsv(csv); if (!rows.length) return null;
    var head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var ci = function (n) { for (var i = 0; i < head.length; i++) if (head[i].indexOf(n) === 0) return i; return -1; };
    var iD = ci("datum"), iR = ci("bibelstelle");
    if (iD < 0 || iR < 0) return null;
    for (var k = 1; k < rows.length; k++) if (planDayKey(rows[k][iD]) === day) return (rows[k][iR] || "").replace(/\s+/g, " ").trim() || null;
    return null;
  }
  function setPassage(ref) {
    if (!ref || ref === cfg.passage) return;
    cfg.passage = ref;
    el.passage.textContent = ref;
    el.fPassage.value = ref; // die Wand liest cfg.passage beim Öffnen neu
  }
  function fetchCsv(u) {
    return fetch(u, { cache: "no-store", credentials: "omit" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }).then(function (s) { if (/<html/i.test(s.slice(0, 300))) throw new Error("keine CSV"); return s; });
  }
  function loadPlan() {
    var url = (cfg.planUrl || "").trim(); if (!url || !window.fetch) return;
    var day = todayKey();
    try { var c = JSON.parse(localStorage.getItem(PLAN_CACHE) || "null"); if (c && c.csv) setPassage(planLookup(c.csv, day)); } catch (e) {}
    fetchCsv(url).catch(function () {
      if (!/docs\.google\.com/.test(url)) throw new Error("nicht erreichbar");
      return fetchCsv(PLAN_PROXY + "?u=" + encodeURIComponent(url));
    }).then(function (csv) {
      try { localStorage.setItem(PLAN_CACHE, JSON.stringify({ csv: csv, at: Date.now() })); } catch (e) {}
      setPassage(planLookup(csv, day));
    }).catch(function () { /* Rückfall: Bibelstelle aus config.js bleibt stehen */ });
  }
  loadPlan();
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") loadPlan(); });

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
        if (state.mode === "moment") unlockWall();
        if (state.mode === "question") rememberAsk(text, cfg.passage);
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

  var WALL_URL = "/.netlify/functions/wall";

  // ---- Deine Frage: gestellte Fragen merkt sich das Gerät (30 Tage) und zeigt sie auf dem Heute-Screen,
  //      mit der Antwort, sobald sie auf der Freigabeseite geschrieben wurde ----
  var ASK_KEY = "meet:asks";
  var ASK_DAYS = 30;
  function readAsks() {
    try {
      var list = JSON.parse(localStorage.getItem(ASK_KEY) || "[]");
      var cut = Date.now() - ASK_DAYS * 864e5;
      return list.filter(function (q) { return q && q.text && Date.parse(q.ts) > cut; });
    } catch (e) { return []; }
  }
  function saveAsks(list) { try { localStorage.setItem(ASK_KEY, JSON.stringify(list.slice(0, 5))); } catch (e) {} }
  function rememberAsk(text, passage) {
    var list = readAsks().filter(function (q) { return q.text !== text; });
    list.unshift({ text: text, passage: passage, ts: new Date().toISOString(), status: "offen" });
    saveAsks(list);
    renderAsks();
  }
  // Fragt nach, ob eine der offenen Fragen inzwischen beantwortet wurde
  function checkAsks() {
    var asks = readAsks();
    var open = asks.filter(function (q) { return q.status !== "beantwortet"; });
    if (!open.length || !window.fetch) return Promise.resolve(false);
    return fetch(WALL_URL + "?op=mine", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ questions: open.map(function (q) { return q.text; }) })
    })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) {
        var changed = false;
        (j.questions || []).forEach(function (st, i) {
          var q = asks.filter(function (x) { return x.text === open[i].text; })[0];
          if (!q || !st || st.status !== "beantwortet") return;
          q.status = "beantwortet";
          q.answer = st.answer || "";
          q.by = st.by || "";
          q.answeredAt = st.answeredAt || new Date().toISOString();
          changed = true;
        });
        if (changed) { saveAsks(asks); renderAsks(); }
        return changed;
      })
      .catch(function () { return false; });
  }
  function renderAsks() {
    var asks = readAsks().slice(0, 3);
    el.homeAsks.innerHTML = "";
    el.homeAsks.hidden = !asks.length;
    asks.forEach(function (q) {
      var done = q.status === "beantwortet";
      var c = document.createElement("article");
      c.className = "ask" + (done ? " ask--answered" : "");
      var head = document.createElement("div"); head.className = "ask-head";
      var lab = document.createElement("span"); lab.className = "label"; lab.textContent = "Deine Frage";
      var st = document.createElement("span"); st.className = "ask-state"; st.textContent = done ? "Beantwortet" : "Noch offen";
      head.appendChild(lab); head.appendChild(st);
      var t = document.createElement("p"); t.className = "ask-text"; t.textContent = q.text;
      c.appendChild(head); c.appendChild(t);
      if (done) {
        var a = document.createElement("p"); a.className = "ask-answer";
        var b = document.createElement("b"); b.textContent = q.by ? "Antwort von " + q.by : "Unsere Antwort";
        a.appendChild(b); a.appendChild(document.createTextNode(q.answer || "Danke für deine Frage!"));
        c.appendChild(a);
      } else {
        var h = document.createElement("p"); h.className = "ask-hint"; h.textContent = "Wir lesen deine Frage. Die Antwort erscheint hier.";
        c.appendChild(h);
      }
      var w = document.createElement("p"); w.className = "ask-when";
      w.textContent = [askDay(q.ts), q.passage].filter(Boolean).join(" · ");
      c.appendChild(w);
      el.homeAsks.appendChild(c);
    });
  }
  function askDay(ts) {
    var d = ts ? new Date(ts) : null;
    if (!d || isNaN(d)) return "";
    var today = new Date(), yest = new Date(Date.now() - 864e5);
    return dayKey(d) === dayKey(today) ? "Heute" : dayKey(d) === dayKey(yest) ? "Gestern" : d.getDate() + ". " + MONTHS[d.getMonth()];
  }

  // ---- MEET WALL: freigegebene Momente der anderen ----
  var OWN_KEY = "meet:wall-own";
  var UNLOCK_KEY = "meet:wall-unlocked"; // Tag des (letzten) Teilens – schaltet den Zugang auf dem Heute-Screen frei
  var SEEN_KEY = "meet:wall-seen";       // Zeitpunkt des letzten Blicks auf die Wand – für „n neu“
  var PAGE = 20;
  var POLL_MS = 60000;
  // Die Wand zeigt den heutigen Tag; frühere Tage erst nach Tippen auf „Momente der letzten Tage ansehen“
  var wallState = { items: [], shown: 0, loaded: false, stale: false, past: false, timer: null };

  function today() { return dayKey(new Date()); }
  function unlockWall() {
    try { localStorage.setItem(UNLOCK_KEY, today()); } catch (e) {}
    updateHomeWall();
    if (!wallState.loaded) fetchWall().catch(function () {});
  }
  function wallUnlocked() {
    var v = null;
    try { v = localStorage.getItem(UNLOCK_KEY); } catch (e) {}
    if (!v) return false;
    return cfg.wallUnlock === "day" ? v === today() : true;
  }
  function lastSeen() { var v = 0; try { v = Date.parse(localStorage.getItem(SEEN_KEY) || "") || 0; } catch (e) {} return v; }
  function markSeen() { try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch (e) {} updateHomeWall(); }

  // Heute-Screen: Zugang zur Wand (nur freigeschaltete Geräte) samt Zahl der neuen Momente seit dem letzten Blick
  function updateHomeWall() {
    var on = wallUnlocked();
    el.homeWall.hidden = !on;
    if (!on) return;
    var ownTexts = readOwn().map(function (o) { return o.text; });
    var seen = lastSeen();
    var fresh = wallState.items.filter(function (m) { return isToday(m) && ownTexts.indexOf(m.text) < 0 && Date.parse(m.ts) > seen; }).length;
    var todays = wallState.items.filter(isToday).length;
    el.homeWallNew.hidden = !fresh;
    el.homeWallNew.textContent = fresh + " neu";
    el.homeWallSub.textContent = !wallState.loaded ? "Was andere heute erlebt haben"
      : todays ? todays + (todays === 1 ? " Moment heute" : " Momente heute") : "Heute noch leer – deiner könnte der erste sein";
  }

  var LIST_KEY = "meet:wall-list"; // letzte erfolgreich geladene Wand – Rückfall, wenn der Server gerade nicht antwortet
  function fetchWall() {
    return fetch(WALL_URL, { headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) {
        wallState.items = (j && j.items) || [];
        wallState.loaded = true;
        wallState.stale = false;
        try { localStorage.setItem(LIST_KEY, JSON.stringify({ items: wallState.items, at: Date.now() })); } catch (e) {}
        updateHomeWall();
        return wallState.items;
      })
      .catch(function (err) {
        if (wallState.loaded) throw err;
        var c = null;
        try { c = JSON.parse(localStorage.getItem(LIST_KEY) || "null"); } catch (e) {}
        if (!c || !c.items || !c.items.length) throw err;
        wallState.items = c.items;
        wallState.loaded = true;
        wallState.stale = true;
        updateHomeWall();
        return wallState.items;
      });
  }

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
    list.unshift({ text: text, passage: passage, ts: new Date().toISOString(), status: "wartet" });
    saveOwn(list);
  }
  function saveOwn(list) { try { localStorage.setItem(OWN_KEY, JSON.stringify(list.slice(0, 5))); } catch (e) {} }

  // Fragt nach, was aus den eigenen Momenten geworden ist (frei, abgelehnt mit Begründung, oder noch unterwegs)
  function checkOwn() {
    var own = readOwn();
    var open = own.filter(function (o) { return o.status !== "nein" && !wallState.items.some(function (m) { return m.text === o.text; }); });
    if (!open.length) return Promise.resolve(false);
    return fetch(WALL_URL + "?op=mine", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ texts: open.map(function (o) { return o.text; }) })
    })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) {
        var changed = false;
        (j.items || []).forEach(function (st, i) {
          var o = own.filter(function (x) { return x.text === open[i].text; })[0];
          if (!o || !st || o.status === st.status) return;
          o.status = st.status;
          o.reason = st.reason || "";
          changed = true;
        });
        if (changed) saveOwn(own);
        return changed;
      });
  }

  // Die Wand lädt bei jedem Öffnen neu (Freigaben sollen sofort sichtbar sein) und holt offen alle 60 s nach
  function goWall() {
    show("wall", "fwd");
    try { history.pushState({ screen: "wall" }, ""); } catch (e) {}
    loadWall();
    clearInterval(wallState.timer);
    wallState.timer = setInterval(function () {
      if (state.screen !== "wall" || document.hidden) return;
      fetchWall().then(function () { wallState.shown = 0; renderWall(); markSeen(); }).catch(function () {});
    }, POLL_MS);
  }
  window.addEventListener("meet:screen", function () { if (state.screen !== "wall") clearInterval(wallState.timer); });

  function loadWall() {
    el.wallNote.hidden = true;
    el.wallMore.hidden = true;
    el.wallPast.hidden = true;
    el.wallList.innerHTML = "";
    if (wallState.loaded) { wallState.shown = 0; renderWall(); } // Bekanntes sofort zeigen, frisch nachladen
    else {
      renderOwn(ownToday());
      var loading = document.createElement("p");
      loading.className = "hint wall-loading";
      loading.textContent = "Wand wird geladen …";
      el.wallList.appendChild(loading);
    }
    fetchWall()
      .then(function () { wallState.shown = 0; renderWall(); markSeen(); return checkOwn(); })
      .then(function (changed) { if (changed) { wallState.shown = 0; renderWall(); } })
      .catch(function (err) {
        console.warn("[MEET] Wand nicht geladen:", err);
        if (wallState.loaded) return;
        el.wallList.innerHTML = "";
        renderOwn(ownToday());
        note("Die Wand lässt sich gerade nicht laden. Probier es später noch einmal.");
      });
  }

  function note(text) { el.wallNote.textContent = text; el.wallNote.hidden = false; }

  function isToday(m) { var d = m.ts ? new Date(m.ts) : null; return !!d && !isNaN(d) && dayKey(d) === dayKey(new Date()); }

  // Eigene Momente: heutige stehen oben unter „Von dir“, ältere wandern in die Tagesgruppen (Gestern, Datum).
  function ownEntry(o, approved) {
    var live = approved.filter(function (m) { return m.text === o.text; })[0];
    return { text: o.text, ts: (live && live.ts) || o.ts, passage: (live && live.passage) || o.passage, own: o, live: !!live };
  }
  function ownMeta(e) {
    return e.live ? "Dein MEETmoment · Danke fürs Teilen!"
      : e.own.status === "nein" ? "Dein MEETmoment · diesmal nicht auf der Wand"
      : "Dein MEETmoment · ist unterwegs";
  }
  function ownCard(e) {
    var c = card(e.text, ownMeta(e), true);
    if (!e.live && e.own.status === "nein") {
      c.classList.add("moment--no");
      var why = document.createElement("p");
      why.className = "moment-reason";
      why.textContent = (e.own.reason || "Diesmal passt er nicht auf die Wand.") + " Danke trotzdem fürs Teilen, wir haben ihn gelesen.";
      c.appendChild(why);
    }
    return c;
  }

  function ownToday() {
    return readOwn().map(function (o) { return ownEntry(o, wallState.items); }).filter(isToday);
  }

  // Eine Liste, nach Tagen gegliedert („Heute · Bibelstelle“, „Gestern · …“, Datum). Innerhalb eines Tages
  // stehen die eigenen Momente zuerst, dann die der anderen, neueste oben. Ohne „letzte Tage“ nur der heutige Tag.
  function renderWall() {
    el.wallList.innerHTML = "";
    var all = wallState.items;
    var own = readOwn().map(function (o) { return ownEntry(o, all); });
    var ownTexts = own.map(function (e) { return e.text; });
    var others = all.filter(function (m) { return ownTexts.indexOf(m.text) < 0; });
    var byTs = function (a, b) { return (Date.parse(b.ts) || 0) - (Date.parse(a.ts) || 0); };
    var items = own.sort(byTs).concat(others.sort(byTs)).sort(function (a, b) {
      var da = dayOf(a), db = dayOf(b);
      return da === db ? 0 : da < db ? 1 : -1; // Tage absteigend, Reihenfolge innerhalb eines Tages bleibt (eigene zuerst)
    });
    if (!wallState.past) items = items.filter(isToday);
    var hasPast = all.concat(own).some(function (m) { return !isToday(m); });
    var ownShown = items.filter(function (m) { return m.own; }).length;
    el.wallKicker.textContent = wallState.past ? "Heute und die letzten Tage" : "Heute · " + cfg.passage;
    el.wallPast.hidden = wallState.past || !hasPast;
    if (!items.length) {
      note(wallState.past ? "Noch keine Momente auf der Wand. Deiner könnte der erste sein."
        : "Heute noch keine Momente auf der Wand. Deiner könnte der erste sein.");
      el.wallMore.hidden = true;
      return;
    }
    if (ownShown && items.length === ownShown && !wallState.past) note("Von anderen ist heute noch nichts da. Schau später noch mal rein.");
    else if (wallState.stale) note("Die Wand zeigt den zuletzt geladenen Stand – der Server antwortet gerade nicht.");
    else el.wallNote.hidden = true;
    var end = Math.min(items.length, wallState.shown + PAGE);
    var lastGroup = null;
    for (var i = 0; i < end; i++) {
      var m = items[i];
      var g = groupLabel(m);
      if (g !== lastGroup) {
        el.wallList.appendChild(groupHead(g));
        lastGroup = g;
      }
      el.wallList.appendChild(m.own ? ownCard(m) : card(m.text, timeLabel(m.ts), false));
    }
    wallState.shown = end;
    el.wallMore.hidden = end >= items.length;
  }

  function groupHead(text) {
    var h = document.createElement("div");
    h.className = "label wall-group";
    h.textContent = text;
    return h;
  }

  function renderOwn(entries) {
    if (!entries.length) return 0;
    el.wallList.appendChild(groupHead("Heute · " + cfg.passage));
    entries.forEach(function (e) { el.wallList.appendChild(ownCard(e)); });
    return entries.length;
  }

  // Pinnwand: kurze Momente teilen sich eine Reihe, lange bekommen die ganze Breite
  function card(text, meta, own) {
    var c = document.createElement("article");
    var wide = own || text.length > 90 || text.indexOf("\n") >= 0;
    c.className = "moment" + (own ? " moment--own" : "") + (wide ? " moment--wide" : "");
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
  function dayOf(m) { var d = m.ts ? new Date(m.ts) : null; return d && !isNaN(d) ? d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate() : 0; }
  function groupLabel(m) {
    var d = m.ts ? new Date(m.ts) : null;
    var day = "Ohne Datum";
    if (d && !isNaN(d)) {
      var today = new Date(), yest = new Date(Date.now() - 864e5);
      day = dayKey(d) === dayKey(today) ? "Heute" : dayKey(d) === dayKey(yest) ? "Gestern" : d.getDate() + ". " + MONTHS[d.getMonth()];
    }
    return [day, passageFor(d) || m.passage].filter(Boolean).join(" · ");
  }
  // Bibelstelle eines Tages aus dem Jahresplan (zuletzt geladene Fassung); heute notfalls die Stelle der Startseite
  function passageFor(d) {
    if (!d || isNaN(d)) return "";
    var iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    var hit = "";
    try { var c = JSON.parse(localStorage.getItem(PLAN_CACHE) || "null"); if (c && c.csv) hit = planLookup(c.csv, iso) || ""; } catch (e) {}
    return hit || (dayKey(d) === dayKey(new Date()) ? cfg.passage : "");
  }
  function timeLabel(ts) {
    var d = ts ? new Date(ts) : null;
    if (!d || isNaN(d)) return "";
    return (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
  }

  el.goWall.addEventListener("click", goWall);
  el.homeWall.addEventListener("click", goWall);
  el.wallMore.addEventListener("click", renderWall);
  el.wallPast.addEventListener("click", function () { wallState.past = true; wallState.shown = 0; renderWall(); });
  el.wallBack.addEventListener("click", function () {
    if (history.state && history.state.screen === "wall") history.back(); else goHome();
  });
  el.wallHome.addEventListener("click", goHome);

  setMode("moment");
  updateHomeWall();
  renderAsks();
  checkAsks();
  if (wallUnlocked()) fetchWall().catch(function () {}); // Zahl der neuen Momente für den Heute-Screen
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) checkAsks();
    if (!document.hidden && wallUnlocked()) fetchWall().then(function () { if (state.screen === "wall") { wallState.shown = 0; renderWall(); markSeen(); } }).catch(function () {});
  });
})();
