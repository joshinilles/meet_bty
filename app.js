/* MEET · meet-bty.com – vier Screens: Heute, Schreiben, Danke, MEET WALL
   Die App begleitet die Stille Zeit: Videos von heute Morgen, den eigenen MEET-Moment festhalten (bleibt auf dem Gerät,
   „Meine MEET-Momente“), auf Wunsch anonym auf die Wand. Versand als Netlify Form (POST auf "/", form-name "meet-impuls").
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
      send: "Festhalten",
      sentKicker: "Moment festgehalten",
      sentHeading: function (n) { return n ? "Festgehalten, " + n + "!" : "Festgehalten!"; },
      sentBody: "Dein MEET-Moment bleibt auf diesem Handy. Du findest ihn auf der Startseite unter „Mein MEET-Moment“."
    },
    question: {
      label: "Frage zum Text",
      kicker: "Deine Frage zum Text",
      heading: "Frag einfach drauflos.",
      placeholder: "Ich frage mich, warum …",
      send: "Frage stellen",
      sentKicker: "Frage gestellt",
      sentHeading: function (n) { return n ? "Danke für deine Frage, " + n + "!" : "Danke für deine Frage!"; },
      sentBody: "Wir antworten dir. Unsere Antwort findest du hier auf der Startseite unter „Deine Frage“."
    }
  };

  var MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    topbar: $("topbar"), logoLink: $("logoLink"),
    screens: { home: $("screen-home"), write: $("screen-write"), done: $("screen-done"), wall: $("screen-wall") },
    dateLabel: $("dateLabel"), dayWord: $("dayWord"), passage: $("passage"), homeWeek: $("homeWeek"),
    goMoment: $("goMoment"), goQuestion: $("goQuestion"), back: $("back"),
    form: $("panel"), fArt: $("fArt"), fPassage: $("fPassage"), fDate: $("fDate"),
    kicker: $("kicker"), heading: $("heading"), text: $("text"),
    addName: $("addName"), name: $("name"), error: $("error"), send: $("send"),
    wallRow: $("wallRow"), wall: $("wall"),
    sentKicker: $("sentKicker"), sentHeading: $("sentHeading"), sentBody: $("sentBody"),
    reset: $("reset"), goWall: $("goWall"), homeMine: $("homeMine"), homeMineText: $("homeMineText"), minePop: $("minePop"), minePopBack: $("minePopBack"), minePopClose: $("minePopClose"), minePopTodayWrap: $("minePopTodayWrap"), minePopTodayLabel: $("minePopTodayLabel"), minePopToday: $("minePopToday"), minePopPastWrap: $("minePopPastWrap"), minePopPast: $("minePopPast"), mineMore: $("mineMore"), goMomentText: $("goMomentText"), goMomentBadge: $("goMomentBadge"), homeMineBadge: $("homeMineBadge"), pushBox: $("pushBox"), pushAsk: $("pushAsk"), pushHint: $("pushHint"), homeAsks: $("homeAsks"), homeWall: $("homeWall"), homeWallSub: $("homeWallSub"), homeWallNew: $("homeWallNew"),
    wallBack: $("wallBack"), wallKicker: $("wallKicker"), wallHint: $("wallHint"), wallList: $("wallList"), wallNote: $("wallNote"),
    wallMore: $("wallMore"), wallPast: $("wallPast"), wallHome: $("wallHome")
  };

  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  var state = { screen: "home", mode: "moment", texts: { moment: "", question: "" }, busy: false, mineMode: "write" };

  // ---- Kopf: Datum & Bibelstelle ----
  // Angezeigter Tag = heute, ausser eine Vorschau ist aktiv (?vorschau=YYYY-MM-DD oder config.js preview bis „until“).
  // Die Vorschau betrifft nur Wochentag, Datum und Bibelstelle; Videos, Zahlen und Push laufen weiter über den echten Tag.
  var now = new Date();
  (function () {
    var DAY = /^\d{4}-\d{2}-\d{2}$/, want = "";
    try { want = new URLSearchParams(location.search).get("vorschau") || ""; } catch (e) {}
    var pv = cfg.preview;
    if (!DAY.test(want) && pv && pv.day && DAY.test(pv.day) && Date.now() < new Date(pv.until || 0).getTime()) want = pv.day;
    if (DAY.test(want)) { var d = new Date(want + "T12:00:00"); if (!isNaN(d)) now = d; }
  })();
  function showKey() { return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0"); }
  // Wochenende: MEET DAILY pausiert – oben steht „Am Montag geht's weiter“, darunter der Blick zurück auf die Woche
  var weekend = now.getDay() === 0 || now.getDay() === 6;
  el.dateLabel.textContent = now.getDate() + ". " + MONTHS[now.getMonth()];
  el.passage.textContent = cfg.passage;
  if (weekend) {
    // Kein Text, den man liest – also auch kein Teilen und keine Frage; stattdessen nur der Blick zurück auf die Woche (der Claim steht immer oben)
    el.dayWord.textContent = now.getDay() === 6 ? "Samstag" : "Sonntag";
    el.passage.textContent = "Am Montag geht's weiter.";
    el.passage.parentNode.classList.add("day--weekend");
    el.screens.home.classList.add("screen--weekend");
    el.homeWeek.hidden = false;
  }
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
    if (!weekend) el.passage.textContent = ref;
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
    var day = showKey();
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

  el.goMoment.addEventListener("click", function () { if (state.mineMode === "mine") openMinePop(); else goWrite("moment"); });
  el.goQuestion.addEventListener("click", function () { goWrite("question"); });
  el.back.addEventListener("click", function () {
    if (history.state && history.state.screen === "write") history.back(); else goHome();
  });
  el.logoLink.addEventListener("click", function () {
    if (state.screen !== "home") goHome();
  });
  window.addEventListener("popstate", function () {
    if (playerOpen()) { closePlayer(true); return; }
    if (!el.minePop.hidden) { closeMinePop(true); if (mineThenWrite) { mineThenWrite = false; goWrite("moment"); } return; }
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

    // Ein MEET-Moment ohne Haken „auf die Wand“ bleibt NUR auf diesem Gerät – nichts geht an den Server (Privatsphäre).
    // Mit Haken (Wand) und bei Fragen zum Text wird wie bisher das Netlify-Formular geschickt.
    var request = (state.mode === "moment" && !wantsWall) ? Promise.resolve({ ok: true }) : fetch("/", {
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
        if (state.mode === "moment") { rememberMine(text, cfg.passage, wantsWall); unlockWall(); }
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
    showPushOffer(mode === "question");
    show("done", "fwd");
    try { history.replaceState({ screen: "done" }, ""); } catch (e) {}
  }

  el.reset.addEventListener("click", goHome);

  var WALL_URL = "/.netlify/functions/wall";

  // ---- Push-Benachrichtigung: „Sag mir Bescheid, wenn die Antwort da ist“ ----
  // Geht nur, wo der Browser Web Push kann; auf dem iPhone erst, wenn MEET auf dem Home-Bildschirm liegt.
  var PUSH_KEY = "meet:push"; // "ja" = dieses Gerät hat Push erlaubt und ein Abo hinterlegt
  var pushOk = !!(window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && cfg.pushKey);
  var isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent || "");
  var standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  var swReady = pushOk ? navigator.serviceWorker.register("/sw.js").then(function () { return navigator.serviceWorker.ready; }).catch(function () { pushOk = false; return null; }) : Promise.resolve(null);

  function pushRemembered() { try { return localStorage.getItem(PUSH_KEY) === "ja"; } catch (e) { return false; } }
  function b64ToBytes(b64) {
    var pad = "=".repeat((4 - b64.length % 4) % 4);
    var raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  // Abo holen (oder anlegen) und für die offenen Fragen dieses Geräts hinterlegen
  function subscribePush() {
    return swReady.then(function (reg) {
      if (!reg) throw new Error("kein Service Worker");
      return reg.pushManager.getSubscription().then(function (sub) {
        return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.pushKey) });
      });
    }).then(function (sub) {
      var open = readAsks().filter(function (q) { return q.status !== "beantwortet"; }).map(function (q) { return q.text; });
      return fetch(WALL_URL + "?op=subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sub: sub.toJSON ? sub.toJSON() : sub, questions: open })
      }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
    }).then(function () { try { localStorage.setItem(PUSH_KEY, "ja"); } catch (e) {} return true; });
  }
  function showPushOffer(on) {
    el.pushBox.hidden = true;
    el.pushHint.hidden = true;
    el.pushAsk.hidden = false;
    el.pushAsk.classList.remove("is-on");
    el.pushAsk.disabled = false;
    el.pushAsk.textContent = "Sag mir Bescheid, wenn die Antwort da ist";
    if (!on) return;
    if (pushOk) {
      if (Notification.permission === "denied") return;
      el.pushBox.hidden = false;
      if (Notification.permission === "granted" && pushRemembered()) {
        // Gerät hat schon zugestimmt: neue Frage still mit anmelden
        el.pushAsk.hidden = true;
        el.pushHint.textContent = "Wir sagen dir Bescheid, sobald die Antwort da ist.";
        el.pushHint.hidden = false;
        subscribePush().catch(function () {});
      }
      return;
    }
    if (isIOS && !standalone) {
      // Safari auf dem iPhone kann Push erst als App auf dem Home-Bildschirm
      el.pushBox.hidden = false;
      el.pushAsk.hidden = true;
      el.pushHint.textContent = "Leg MEET auf deinen Home-Bildschirm, dann können wir dir Bescheid sagen, sobald die Antwort da ist.";
      el.pushHint.hidden = false;
    }
  }
  el.pushAsk.addEventListener("click", function () {
    el.pushAsk.disabled = true;
    el.pushAsk.textContent = "Einen Moment …";
    Promise.resolve(Notification.requestPermission()).then(function (perm) {
      if (perm !== "granted") throw new Error("keine Erlaubnis");
      return subscribePush();
    }).then(function () {
      el.pushAsk.hidden = true;
      el.pushHint.textContent = "Wir sagen dir Bescheid, sobald die Antwort da ist.";
      el.pushHint.hidden = false;
    }).catch(function (err) {
      console.warn("[MEET] Push nicht eingerichtet:", err);
      el.pushAsk.hidden = true;
      el.pushHint.textContent = Notification.permission === "denied"
        ? "Benachrichtigungen sind für MEET ausgeschaltet. Die Antwort findest du trotzdem hier unter „Deine Frage“."
        : "Das hat gerade nicht geklappt. Die Antwort findest du trotzdem hier unter „Deine Frage“.";
      el.pushHint.hidden = false;
    });
  });

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
  // Heute-Screen zeigt nur die heute gestellten Fragen; alles davor liegt in der Ansicht „Mein MEET-Moment“ (bei den Momenten des Tages)
  var ASK_SEEN_KEY = "meet:asks-seen"; // Zeitpunkt des letzten Blicks in die Ansicht – für „n neu“ am Knopf
  function askIsToday(q) { var d = new Date(q.ts); return !isNaN(d) && dayKey(d) === dayKey(new Date()); }
  function asksSeen() { var v = 0; try { v = Date.parse(localStorage.getItem(ASK_SEEN_KEY) || "") || 0; } catch (e) {} return v; }
  // Neue Antworten seit dem letzten Blick in „Mein MEET-Moment“ – als Badge am Knopf
  function freshAnswers() {
    var seen = asksSeen();
    return readAsks().filter(function (q) { return q.status === "beantwortet" && Date.parse(q.answeredAt || "") > seen; }).length;
  }
  function renderAsks() {
    var asks = readAsks().filter(askIsToday).slice(0, 3);
    el.homeAsks.innerHTML = "";
    el.homeAsks.hidden = !asks.length;
    asks.forEach(function (q) { el.homeAsks.appendChild(askCard(q)); });
    updateHomeMine();
    if (!el.minePop.hidden) renderMinePop();
  }
  function askCard(q) {
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
    return c;
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMinePop(false); });
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
  var wallState = { items: [], shown: 0, loaded: false, stale: false, past: false, week: false, timer: null };

  function today() { return dayKey(new Date()); }
  function unlockWall() {
    try { localStorage.setItem(UNLOCK_KEY, today()); } catch (e) {}
    updateHomeWall();
    if (!wallState.loaded) fetchWall().catch(function () {});
  }
  // Seit 26.10.2026 ist die Wand für alle offen – auch ohne eigenen Moment (Vincent); UNLOCK_KEY bleibt nur als Merker
  function wallUnlocked() { return true; }
  function lastSeen() { var v = 0; try { v = Date.parse(localStorage.getItem(SEEN_KEY) || "") || 0; } catch (e) {} return v; }
  function markSeen() { try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch (e) {} updateHomeWall(); }

  // Heute-Screen: Zugang zur Wand (nur freigeschaltete Geräte) samt Zahl der neuen Momente seit dem letzten Blick
  function updateHomeWall() {
    var on = wallUnlocked() && !weekend; // am Wochenende führt nur der Kasten „letzte Woche“ zur Wand
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
    wallState.week = false;
    show("wall", "fwd");
    fetchArchive();
    try { history.pushState({ screen: "wall" }, ""); } catch (e) {}
    loadWall();
    clearInterval(wallState.timer);
    wallState.timer = setInterval(function () {
      if (state.screen !== "wall" || document.hidden) return;
      fetchWall().then(function () { wallState.shown = 0; renderWall(); markSeen(); }).catch(function () {});
    }, POLL_MS);
  }
  window.addEventListener("meet:screen", function () { if (state.screen !== "wall") clearInterval(wallState.timer); });
  // Wochenende: die Wand der letzten sieben Tage, für alle offen – „Wie ist Gott uns in der letzten Woche begegnet?“
  function goWallWeek() {
    goWall();
    wallState.week = true; wallState.past = true; wallState.shown = 0;
    if (wallState.loaded) renderWall();
  }
  function inLastWeek(m) { var t = Date.parse(m.ts || ""); return !!t && Date.now() - t < 7 * 86400000; }

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
  // ---- Archiv: die MEETmoments (Video 2) aller Tage (video.mjs ?op=archive). Auf der Wand hängt das Video des Morgens
  //      als ERSTER Pin im Bereich des jeweiligen Tages – wie ein Moment, nur mit Standbild und dem Namen darunter ----
  var ARCHIVE_CACHE = "meet:archive", archive = { seasons: [] };
  try { var ac = JSON.parse(localStorage.getItem(ARCHIVE_CACHE) || "null"); if (ac && ac.seasons) archive.seasons = ac.seasons; } catch (e) {}
  function fetchArchive() {
    if (!window.fetch) return;
    fetch(DAILY_URL + "?op=archive", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.seasons) return;
        archive.seasons = j.seasons;
        try { localStorage.setItem(ARCHIVE_CACHE, JSON.stringify({ seasons: j.seasons })); } catch (e) {}
        if (state.screen === "wall") { wallState.shown = 0; renderWall(); }
      }).catch(function () {});
  }
  var WD_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  function pinDate(day) { var d = new Date(day + "T12:00:00"); return isNaN(d) ? day : WD_SHORT[d.getDay()] + " " + d.getDate() + "." + (d.getMonth() + 1) + "."; }
  // Videos als Wand-Einträge: ts = der Morgen des Tages, damit Gruppierung und Filter (heute / Woche) wie bei Momenten greifen
  function archiveEntries() {
    var out = [];
    archive.seasons.forEach(function (se) { (se.items || []).forEach(function (v) { if (v && v.url && v.day) out.push({ video: v, ts: v.day + "T06:15:00", passage: v.passage || "", text: "" }); }); });
    return out;
  }
  function videoCard(v) {
    var c = document.createElement("article"); c.className = "moment moment--video";
    var b = document.createElement("button"); b.type = "button"; b.className = "mv";
    b.setAttribute("aria-label", "MEETmoment" + (v.name ? " mit " + v.name : "") + " vom " + pinDate(v.day) + " abspielen");
    var media = document.createElement("span"); media.className = "mv-media";
    stillInto(media, "mv-img", v, true);
    var play = document.createElement("span"); play.className = "mv-play"; play.setAttribute("aria-hidden", "true"); play.innerHTML = PLAY_SVG; media.appendChild(play);
    var dur = fmtDur(v.duration); if (dur) { var d = document.createElement("span"); d.className = "mv-dur"; d.textContent = dur.replace(" Min", ""); media.appendChild(d); }
    b.appendChild(media);
    b.addEventListener("click", function () { openPlayer({ n: 2, title: "MEETmoment", name: v.name, passage: v.passage, url: v.url, poster: v.poster, duration: v.duration, day: v.day }); });
    var m = document.createElement("div"); m.className = "moment-meta"; m.textContent = v.name || "MEETmoment";
    c.appendChild(b); c.appendChild(m);
    return c;
  }
  function renderWall() {
    el.wallList.innerHTML = "";
    var all = wallState.items;
    var own = readOwn().map(function (o) { return ownEntry(o, all); });
    var ownTexts = own.map(function (e) { return e.text; });
    var others = all.filter(function (m) { return ownTexts.indexOf(m.text) < 0; });
    var byTs = function (a, b) { return (Date.parse(b.ts) || 0) - (Date.parse(a.ts) || 0); };
    var videos = archiveEntries().sort(byTs);
    var items = videos.concat(own.sort(byTs)).concat(others.sort(byTs)).sort(function (a, b) {
      var da = dayOf(a), db = dayOf(b);
      return da === db ? 0 : da < db ? 1 : -1; // Tage absteigend; innerhalb eines Tages: Video, dann eigene, dann andere
    });
    if (!wallState.past) items = items.filter(isToday);
    if (wallState.week) items = items.filter(inLastWeek);
    var hasPast = all.concat(own).concat(videos).some(function (m) { return !isToday(m); });
    var texts = items.filter(function (m) { return !m.video; });
    var ownShown = texts.filter(function (m) { return m.own; }).length;
    el.wallKicker.textContent = wallState.week ? "Die letzte Woche" : wallState.past ? "Heute und die letzten Tage" : "Heute · " + cfg.passage;
    el.wallHint.textContent = wallState.week ? "Was andere in der letzten Woche bei MEET erlebt haben. Anonym, ohne Namen." : "Was andere heute bei MEET erlebt haben. Anonym, ohne Namen.";
    el.wallPast.hidden = wallState.past || !hasPast;
    if (!items.length) {
      note(wallState.week ? "In der letzten Woche ist noch nichts auf der Wand gelandet."
        : wallState.past ? "Noch keine Momente auf der Wand. Deiner könnte der erste sein."
        : "Heute noch keine Momente auf der Wand. Deiner könnte der erste sein.");
      el.wallMore.hidden = true;
      return;
    }
    if (ownShown && texts.length === ownShown && !wallState.past) note("Von anderen ist heute noch nichts da. Schau später noch mal rein.");
    else if (wallState.stale) note("Die Wand zeigt den zuletzt geladenen Stand – der Server antwortet gerade nicht.");
    else el.wallNote.hidden = true;
    var end = Math.min(items.length, wallState.shown + PAGE);
    // Bibelstelle je Tag: aus dem Jahresplan, sonst von irgendeinem Eintrag des Tages – so landen Video und Momente in EINER Gruppe
    var dayPassage = {};
    items.forEach(function (m) { var k = dayOf(m); if (m.passage && !dayPassage[k]) dayPassage[k] = m.passage; });
    var lastGroup = null;
    for (var i = 0; i < end; i++) {
      var m = items[i];
      var g = groupLabel(m, dayPassage[dayOf(m)]);
      if (g !== lastGroup) {
        el.wallList.appendChild(groupHead(g));
        lastGroup = g;
      }
      el.wallList.appendChild(m.video ? videoCard(m.video) : m.own ? ownCard(m) : card(m.text, timeLabel(m.ts), false));
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
  function groupLabel(m, fallback) {
    var d = m.ts ? new Date(m.ts) : null;
    var day = "Ohne Datum";
    if (d && !isNaN(d)) {
      var today = new Date(), yest = new Date(Date.now() - 864e5);
      day = dayKey(d) === dayKey(today) ? "Heute" : dayKey(d) === dayKey(yest) ? "Gestern" : d.getDate() + ". " + MONTHS[d.getMonth()];
    }
    return [day, passageFor(d) || fallback || m.passage].filter(Boolean).join(" · ");
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
  el.homeWeek.addEventListener("click", goWallWeek);
  el.wallMore.addEventListener("click", renderWall);
  el.wallPast.addEventListener("click", function () { wallState.past = true; wallState.shown = 0; renderWall(); });
  el.wallBack.addEventListener("click", function () {
    if (history.state && history.state.screen === "wall") history.back(); else goHome();
  });
  el.wallHome.addEventListener("click", goHome);

  // ---- Meine MEET-Momente: alles, was dieses Gerät festgehalten hat – bleibt lokal (localStorage), kein Ablauf ----
  var MINE_KEY = "meet:moments", MINE_MAX = 300;
  function readMine() {
    try { var l = JSON.parse(localStorage.getItem(MINE_KEY) || "[]"); return Array.isArray(l) ? l.filter(function (m) { return m && m.text; }) : []; } catch (e) { return []; }
  }
  function rememberMine(text, passage, wall) {
    var list = readMine();
    list.unshift({ text: text, passage: passage || "", ts: new Date().toISOString(), wall: !!wall });
    try { localStorage.setItem(MINE_KEY, JSON.stringify(list.slice(0, MINE_MAX))); } catch (e) {}
    updateHomeMine();
  }
  // Knopf auf der Startseite: bis heute ein Moment festgehalten ist „Meinen MEET-Moment festhalten“ (schreiben), danach
  // „Mein MEET-Moment“ (öffnet die eigene Ansicht). Frühere Momente/Fragen ohne einen von heute: dezenter Link darunter.
  var mineThenWrite = false;
  function updateHomeMine() {
    var all = readMine(), today = all.filter(askIsToday), fresh = freshAnswers();
    var pastAsks = readAsks().some(function (q) { return !askIsToday(q); });
    state.mineMode = today.length ? "mine" : "write";
    el.goMomentText.textContent = today.length ? "Mein MEET-Moment" : "Meinen MEET-Moment festhalten";
    el.goMomentBadge.hidden = !(today.length && fresh);
    el.goMomentBadge.textContent = fresh + " neu";
    el.homeMine.hidden = !!today.length || !(all.length || pastAsks);
    el.homeMineText.textContent = all.length ? "Meine früheren MEET-Momente · " + all.length : "Deine Fragen der letzten Tage";
    el.homeMineBadge.hidden = !(!today.length && fresh);
    el.homeMineBadge.textContent = fresh + " neu";
  }
  function mineCard(m, big) {
    var c = document.createElement("article"); c.className = "ask ask--mine";
    var head = document.createElement("div"); head.className = "ask-head";
    var lab = document.createElement("span"); lab.className = "label"; lab.textContent = big ? "Dein MEET-Moment" : "MEET-Moment";
    head.appendChild(lab);
    if (m.wall) { var st = document.createElement("span"); st.className = "ask-state"; st.textContent = "Auf der Wand geteilt"; head.appendChild(st); }
    var t = document.createElement("p"); t.className = "ask-text"; t.textContent = m.text;
    c.appendChild(head); c.appendChild(t);
    if (m.passage) { var w = document.createElement("p"); w.className = "ask-when"; w.textContent = m.passage; c.appendChild(w); }
    return c;
  }
  // Alles Eigene in einer Zeitleiste: Momente und Fragen, heute gross, davor klein und nach Tag gruppiert
  function mineEntries() {
    var list = readMine().map(function (m) { return { ts: m.ts, m: m }; }).concat(readAsks().map(function (q) { return { ts: q.ts, q: q }; }));
    list.sort(function (a, b) { return a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0; });
    return list;
  }
  function renderMinePop() {
    var entries = mineEntries(), tk = dayKey(new Date());
    var today = entries.filter(function (e) { return dayKey(new Date(e.ts)) === tk; }), past = entries.filter(function (e) { return dayKey(new Date(e.ts)) !== tk; });
    el.minePopToday.innerHTML = ""; el.minePopPast.innerHTML = "";
    el.minePopTodayWrap.hidden = !today.length;
    el.minePopTodayLabel.textContent = "Heute · " + el.passage.textContent;
    today.forEach(function (e) { el.minePopToday.appendChild(e.m ? mineCard(e.m, true) : askCard(e.q)); });
    el.minePopPastWrap.hidden = !past.length;
    var lastDay = "";
    past.forEach(function (e) {
      var k = dayKey(new Date(e.ts));
      if (k !== lastDay) { lastDay = k; var h = document.createElement("span"); h.className = "label mine-day"; h.textContent = askDay(e.ts) + (e.m && e.m.passage ? " · " + e.m.passage : e.q && e.q.passage ? " · " + e.q.passage : ""); el.minePopPast.appendChild(h); }
      el.minePopPast.appendChild(e.m ? mineCard(e.m, false) : askCard(e.q));
    });
  }
  function openMinePop() {
    renderMinePop();
    el.minePop.hidden = false;
    document.body.style.overflow = "hidden";
    try { history.pushState({ pop: "mine" }, ""); } catch (e) {}
    try { localStorage.setItem(ASK_SEEN_KEY, new Date().toISOString()); } catch (e) {}
    el.goMomentBadge.hidden = true; el.homeMineBadge.hidden = true;
  }
  // „Noch einen MEET-Moment festhalten“: Ansicht zu, dann schreiben (bei Verlauf erst nach dem popstate)
  function mineWrite() {
    var viaHistory = !!(history.state && history.state.pop === "mine");
    closeMinePop(false);
    if (viaHistory) mineThenWrite = true; else goWrite("moment");
  }
  el.mineMore.addEventListener("click", mineWrite);
  function closeMinePop(fromHistory) {
    if (el.minePop.hidden) return;
    if (!fromHistory && history.state && history.state.pop === "mine") { try { history.back(); return; } catch (e) {} }
    el.minePop.hidden = true;
    document.body.style.overflow = "";
  }
  el.homeMine.addEventListener("click", openMinePop);
  el.minePopBack.addEventListener("click", function () { closeMinePop(false); });
  el.minePopClose.addEventListener("click", function () { closeMinePop(false); });
  updateHomeMine();

  // ---- MEET DAILY: die beiden Videos von heute Morgen, aus dem Studio direkt hochgeladen (Function video, Dateien bei R2) ----
  var DAILY_URL = "/.netlify/functions/video", DAILY_CACHE = "meet:daily";
  var DAILY_META = { 1: { name: "Start", time: "05:45" }, 2: { name: "MEETmoment", time: "06:15" } };
  var daily = { day: "", items: [], react: {} };
  var DAILY_FN = "/.netlify/functions/daily", USE_KEY = "meet:use:", DEVICE_KEY = "meet:device", PUSH_DAILY_KEY = "meet:push-daily";
  var REACT = ["👍", "❤️", "😂", "😮", "😢", "🙏"]; // dieselben sechs wie die Schnellauswahl bei WhatsApp
  // Hinter dem Plus: häufige Emojis zum Antippen – und ein Feld für jedes andere (Emoji-Tastatur)
  var MORE_EMOJI = ["🔥", "✨", "👏", "💪", "🙌", "🫶", "🤲", "✝️", "📖", "🕊️", "💛", "💚", "💙", "💜", "🧡", "🤍", "💯", "🥰", "😍", "🤗", "😇", "🤩", "😊", "😅", "🤔", "😌", "😭", "🥲", "😔", "🥱", "🤝", "👀", "🎉", "🌅", "☀️", "🌈", "⭐", "🌟", "💡", "🎶", "☕", "🍞", "🌱", "🏔️", "🫡", "✅", "🙏🏽", "👍🏽"];
  var EMOJI_RE = null; try { EMOJI_RE = new RegExp("\\p{Extended_Pictographic}|\\p{Regional_Indicator}", "u"); } catch (e) {}
  // Erstes Zeichen (Grapheme) eines Textes, wenn es ein Emoji ist – sonst ""
  function firstEmoji(str) {
    str = String(str || "").trim(); if (!str) return "";
    var g = "";
    try {
      if (window.Intl && Intl.Segmenter) { var it = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(str)[Symbol.iterator]().next(); g = it.value ? it.value.segment : ""; }
      else g = Array.from(str)[0] || "";
    } catch (e) { g = str.slice(0, 2); }
    if (!g || g.length > 20) return "";
    if (EMOJI_RE) return EMOJI_RE.test(g) ? g : "";
    return /^[^\w\s.,;:!?\-]+$/.test(g) ? g : "";
  }
  var dEl = { box: $("homeDaily"), grid: $("dailyGrid"), player: $("player"), back: $("playerBack"), close: $("playerClose"), video: $("playerVideo"), title: $("playerTitle"), kicker: $("playerKicker"), react: $("playerReact"), pick: $("playerPick"), pickGrid: $("pickGrid"), pickInput: $("pickInput"), pickClose: $("pickClose") };
  function fmtDur(s) { s = Math.round(s || 0); if (!s) return ""; return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60) + " Min"; }
  var PLAY_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>';
  function stepTitle(v) { return v.n === 1 ? "Wir werden still" : "MEETmoment" + (v.name ? " mit " + v.name : ""); }
  // Standbild einer Kachel: das Vorschaubild aus dem Studio – fehlt es, lädt es nicht oder ist es schwarz (iOS lieferte dem Studio
  // am 27.10.2026 leere Bilder), zeigt die Kachel stattdessen ein Bild aus dem Video selbst (Sekunde 1,5; lädt nur den Anfang).
  var badPoster = {};
  function imgDark(img) {
    try {
      var c = document.createElement("canvas"); c.width = 18; c.height = 32; var x = c.getContext("2d"); x.drawImage(img, 0, 0, 18, 32);
      var d = x.getImageData(0, 0, 18, 32).data, sum = 0;
      for (var i = 0; i < d.length; i += 4) sum += (d[i] * 3 + d[i + 1] * 6 + d[i + 2]) / 10;
      return sum / (d.length / 4) < 10;
    } catch (e) { return false; } // fremde Herkunft ohne CORS: nicht messbar, Bild bleibt
  }
  function stillInto(media, cls, v, lazy) {
    function useVideo() {
      if (!v.url || media.querySelector("video")) return;
      var old = media.querySelector("img"); if (old) old.remove();
      var vid = document.createElement("video"); vid.className = cls; vid.muted = true; vid.setAttribute("muted", ""); vid.playsInline = true; vid.setAttribute("playsinline", "");
      vid.preload = "metadata"; vid.setAttribute("aria-hidden", "true"); vid.tabIndex = -1; vid.disablePictureInPicture = true; vid.disableRemotePlayback = true;
      vid.addEventListener("loadedmetadata", function () { try { if (vid.currentTime < 1) vid.currentTime = 1.5; } catch (e) {} });
      vid.src = v.url + "#t=1.5";
      media.insertBefore(vid, media.firstChild);
    }
    function useImg(cors) {
      var img = document.createElement("img"); img.className = cls; img.alt = ""; img.decoding = "async"; if (lazy) img.loading = "lazy";
      if (cors) img.crossOrigin = "anonymous";
      img.addEventListener("load", function () { if (cors && imgDark(img)) { badPoster[v.poster] = true; useVideo(); } });
      img.addEventListener("error", function () { img.remove(); if (cors) useImg(false); else useVideo(); }); // ohne CORS-Freigabe (z. B. andere Domain) schlicht anzeigen
      img.src = v.poster;
      media.insertBefore(img, media.firstChild);
    }
    if (!v.poster || badPoster[v.poster]) useVideo(); else useImg(true);
  }
  // Ein Schritt des Ablaufs: Nummer, Titel, Uhrzeit und Länge, Play rechts – keine Titelkarte, die Bibelstelle steht schon oben
  function clipTile(v, soon) {
    var meta = DAILY_META[v.n];
    var dur = soon ? "" : fmtDur(v.duration), sub = soon ? "kommt um " + meta.time : [meta.time, dur].filter(Boolean).join(" · ");
    var b = document.createElement(soon ? "div" : "button"); b.className = "clip" + (soon ? " clip--soon" : "");
    if (soon) b.setAttribute("aria-hidden", "true"); else { b.type = "button"; b.setAttribute("aria-label", stepTitle(v) + " · " + sub + " abspielen"); }
    var head = document.createElement("span"); head.className = "clip-head";
    var nm = document.createElement("span"); nm.className = "clip-name"; nm.textContent = soon ? meta.name : stepTitle(v);
    // „mit Niklas“ immer auf eine eigene zweite Zeile – so steht „MEETmoment“ auf einer Höhe mit „Wir werden still“
    if (!soon && v.n === 2 && v.name) { nm.textContent = "MEETmoment"; var who = document.createElement("span"); who.className = "clip-who"; who.textContent = "mit " + v.name; nm.appendChild(who); }
    head.appendChild(nm);
    if (soon) { var tm = document.createElement("span"); tm.className = "clip-time"; tm.textContent = sub; head.appendChild(tm); }
    var media = document.createElement("span"); media.className = "clip-media";
    if (!soon) {
      stillInto(media, "clip-img", v, false);
      var play = document.createElement("span"); play.className = "clip-play"; play.setAttribute("aria-hidden", "true"); play.innerHTML = PLAY_SVG; media.appendChild(play);
      if (dur) { var d = document.createElement("span"); d.className = "clip-dur"; d.textContent = dur.replace(" Min", ""); media.appendChild(d); }
      if (v.n === 2) { var rp = reactPill(2); if (rp) media.appendChild(rp); }
      b.addEventListener("click", function () { openPlayer(v); });
    }
    b.appendChild(head); b.appendChild(media);
    return b;
  }
  function renderDaily() {
    var items = daily.day === todayKey() ? daily.items.filter(function (v) { return v && v.url && (v.n === 1 || v.n === 2); }) : [];
    dEl.box.hidden = !items.length;
    dEl.grid.textContent = "";
    if (!items.length) return;
    var byN = {}; items.forEach(function (v) { byN[v.n] = v; });
    [1, 2].forEach(function (n) {
      if (byN[n]) dEl.grid.appendChild(clipTile(byN[n], false));
      else if (n === 2) dEl.grid.appendChild(clipTile({ n: 2 }, true)); // der MEETmoment folgt um 06:15 – der Platz dafür steht schon
    });
  }
  function fetchDaily() {
    var day = todayKey();
    return fetch(DAILY_URL + "?day=" + day, { headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) {
        daily = { day: day, items: ((j && j.items) || []).map(function (v) { v.day = day; return v; }), react: daily.day === day ? daily.react || {} : {} };
        saveDaily();
        renderDaily(); maybeDeepPlay();
      });
  }
  function playerOpen() { return !dEl.player.hidden; }
  function openPlayer(v) {
    var meta = DAILY_META[v.n] || { name: v.title || "Video", time: "" };
    if (!v.day) v.day = daily.day || todayKey();
    var old = v.day !== todayKey();
    dEl.kicker.textContent = "MEET DAILY · " + (old ? pinDate(v.day) : meta.time) + (v.passage ? " · " + v.passage : "");
    dEl.title.textContent = stepTitle(v);
    playerItem = v; watch.last = -1; renderReact("");
    dEl.video.poster = (v.poster && !badPoster[v.poster]) ? v.poster : "";
    dEl.video.src = v.url;
    dEl.player.hidden = false;
    document.body.style.overflow = "hidden";
    try { history.pushState({ player: true }, ""); } catch (e) {}
    var p = dEl.video.play(); if (p && p.catch) p.catch(function () {});
  }
  function closePlayer(fromHistory) {
    if (!playerOpen()) return;
    if (!fromHistory && history.state && history.state.player) { try { history.back(); return; } catch (e) {} }
    try { dEl.video.pause(); } catch (e) {}
    saveWatch(true); playerItem = null; renderReact("");
    dEl.video.removeAttribute("src"); try { dEl.video.load(); } catch (e) {}
    dEl.player.hidden = true;
    document.body.style.overflow = "";
  }
  dEl.close.addEventListener("click", function () { closePlayer(false); });
  dEl.back.addEventListener("click", function () { closePlayer(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePlayer(false); });
  function saveDaily() { try { localStorage.setItem(DAILY_CACHE, JSON.stringify(daily)); } catch (e) {} }

  // ---- Nutzung: eine zufällige Gerätekennung (nur auf diesem Handy, der Server speichert ihren Hash) und der Tagesstand
  //      mit Aufrufen, Sehdauer je Video und der eigenen Reaktion. Das Gerät schickt immer seinen ganzen Stand (?op=sync). ----
  function deviceId() {
    try {
      var d = localStorage.getItem(DEVICE_KEY);
      if (!d) {
        var a = new Uint8Array(12);
        if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
        d = ""; for (var k = 0; k < a.length; k++) d += ("0" + a[k].toString(16)).slice(-2);
        localStorage.setItem(DEVICE_KEY, d);
      }
      return d;
    } catch (e) { return ""; }
  }
  var use = { day: todayKey(), hits: 0, w: {}, x: {}, lastHit: 0 };
  try { var uc = JSON.parse(localStorage.getItem(USE_KEY + use.day) || "null"); if (uc && uc.day === use.day) use = uc; } catch (e) {}
  try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(USE_KEY) === 0 && k !== USE_KEY + use.day) localStorage.removeItem(k); }); } catch (e) {}
  use.w = use.w || {}; use.x = use.x || {};
  function saveUse() { try { localStorage.setItem(USE_KEY + use.day, JSON.stringify(use)); } catch (e) {} }
  function syncUse(want) {
    var dev = deviceId(); if (!dev || !window.fetch) return Promise.resolve(null);
    var body = JSON.stringify({ day: use.day, device: dev, app: standalone, hits: use.hits, w: use.w, x: use.x, want: want || "" });
    if (!want && navigator.sendBeacon) { try { if (navigator.sendBeacon(DAILY_FN + "?op=sync", new Blob([body], { type: "application/json" }))) return Promise.resolve(null); } catch (e) {} }
    return fetch(DAILY_FN + "?op=sync", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: body, keepalive: true })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  // Ein Aufruf = Seite geöffnet oder nach mindestens 10 Minuten wieder in den Vordergrund geholt
  function hit() { var t = Date.now(); if (t - (use.lastHit || 0) < 10 * 60000) return; use.lastHit = t; use.hits = (use.hits || 0) + 1; saveUse(); syncUse(); }
  hit();
  document.addEventListener("visibilitychange", function () { if (document.hidden) { if (playerOpen()) saveWatch(true); } else hit(); });

  // ---- Reaktionen (nur MEETmoment): eine pro Gerät, nochmal tippen nimmt sie zurück; Zahlen kommen von ?day= ----
  function reactCounts(n) { return (daily.react && daily.react[n]) || {}; }
  // Blase auf der Kachel: zu = die zwei häufigsten Emojis + Zahl; Antippen klappt sie auf (alle Emojis mit Zahl),
  // ohne das Video zu starten; nach 6 s oder beim nächsten Tipp klappt sie wieder zu
  function reactPill(n) {
    var c = reactCounts(n), keys = Object.keys(c).filter(function (k) { return c[k] > 0; }).sort(function (a, b) { return c[b] - c[a]; });
    if (!keys.length) return null;
    var t = 0; keys.forEach(function (k) { t += c[k]; });
    var p = document.createElement("span"); p.className = "clip-react";
    p.setAttribute("role", "button"); p.tabIndex = 0; p.setAttribute("aria-label", t + " Reaktionen anzeigen"); p.setAttribute("aria-expanded", "false");
    var sum = document.createElement("span"); sum.className = "cr-sum";
    keys.slice(0, 2).forEach(function (k) { var e = document.createElement("span"); e.className = "e"; e.textContent = k; sum.appendChild(e); });
    sum.appendChild(document.createTextNode(String(t)));
    var all = document.createElement("span"); all.className = "cr-all";
    keys.forEach(function (k) {
      var it = document.createElement("span"); it.className = "cr-item";
      var e = document.createElement("span"); e.className = "e"; e.textContent = k;
      var b = document.createElement("b"); b.textContent = String(c[k]);
      it.appendChild(e); it.appendChild(b); all.appendChild(it);
    });
    p.appendChild(sum); p.appendChild(all);
    var timer = null;
    function setOpen(open) { p.classList.toggle("is-open", open); p.setAttribute("aria-expanded", open ? "true" : "false"); clearTimeout(timer); if (open) timer = setTimeout(function () { setOpen(false); }, 6000); }
    function toggle(ev) { ev.preventDefault(); ev.stopPropagation(); setOpen(!p.classList.contains("is-open")); }
    p.addEventListener("click", toggle);
    p.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") toggle(ev); });
    return p;
  }
  function setReaction(n, e) {
    var old = use.x[n] || "";
    if (e && !firstEmoji(e)) return;
    if (old === e) e = "";
    var c = daily.react[n] = daily.react[n] || {};
    if (old && c[old]) c[old]--;
    if (e) c[e] = (c[e] || 0) + 1;
    if (e) use.x[n] = e; else delete use.x[n];
    saveUse(); saveDaily(); renderReact(e); renderDaily();
    syncUse("reactions").then(function (j) { if (j && j.reactions) { daily.react = j.reactions; saveDaily(); renderReact(""); renderDaily(); } });
  }
  function renderReact(pop) {
    var on = !!(playerItem && playerItem.n === 2 && playerItem.day === todayKey()); // Reaktionen nur auf das Video von heute
    dEl.react.hidden = !on;
    if (!on) hidePick();
    dEl.player.querySelector(".player-box").classList.toggle("has-react", on);
    if (!on) return;
    var c = reactCounts(2), mine = use.x[2] || "";
    // Die sechs Schnellen, dazu andere Emojis mit Stimmen (höchstens vier) und die eigene – dann das Plus
    var extra = Object.keys(c).filter(function (k) { return c[k] > 0 && REACT.indexOf(k) < 0; }).sort(function (a, b) { return c[b] - c[a]; }).slice(0, 4);
    if (mine && REACT.indexOf(mine) < 0 && extra.indexOf(mine) < 0) extra.unshift(mine);
    dEl.react.textContent = "";
    REACT.concat(extra).forEach(function (e) {
      var b = document.createElement("button"); b.type = "button";
      b.className = "react-btn" + (mine === e ? " is-on" : "") + (pop === e ? " pop" : "");
      b.setAttribute("aria-label", "Mit " + e + " reagieren"); b.setAttribute("aria-pressed", mine === e ? "true" : "false");
      var s1 = document.createElement("span"); s1.className = "e"; s1.textContent = e;
      var s2 = document.createElement("span"); s2.className = "c"; s2.textContent = c[e] ? String(c[e]) : "";
      b.appendChild(s1); b.appendChild(s2);
      b.addEventListener("click", function () { setReaction(2, e); });
      dEl.react.appendChild(b);
    });
    var more = document.createElement("button"); more.type = "button"; more.className = "react-btn react-btn--more";
    more.setAttribute("aria-label", "Anderes Emoji wählen"); more.setAttribute("aria-expanded", dEl.pick.hidden ? "false" : "true");
    var me = document.createElement("span"); me.className = "e"; me.textContent = "+"; more.appendChild(me);
    var mc = document.createElement("span"); mc.className = "c"; more.appendChild(mc);
    more.addEventListener("click", function () { if (dEl.pick.hidden) showPick(); else hidePick(); });
    dEl.react.appendChild(more);
  }
  // Auswahl für alle anderen Emojis: Raster zum Antippen und ein Feld für die Emoji-Tastatur
  function showPick() {
    if (!dEl.pickGrid.childNodes.length) {
      MORE_EMOJI.forEach(function (e) {
        var b = document.createElement("button"); b.type = "button"; b.textContent = e; b.setAttribute("aria-label", "Mit " + e + " reagieren");
        b.addEventListener("click", function () { hidePick(); setReaction(2, e); });
        dEl.pickGrid.appendChild(b);
      });
    }
    dEl.pick.hidden = false; dEl.pickInput.value = "";
    dEl.player.querySelector(".player-box").classList.add("has-pick");
    var m = dEl.react.querySelector(".react-btn--more"); if (m) m.setAttribute("aria-expanded", "true");
  }
  function hidePick() {
    dEl.pick.hidden = true;
    dEl.player.querySelector(".player-box").classList.remove("has-pick");
    var m = dEl.react.querySelector(".react-btn--more"); if (m) m.setAttribute("aria-expanded", "false");
  }
  dEl.pickClose.addEventListener("click", hidePick);
  dEl.pickInput.addEventListener("input", function () {
    var e = firstEmoji(dEl.pickInput.value);
    if (e) { dEl.pickInput.value = ""; dEl.pickInput.blur(); hidePick(); setReaction(2, e); }
    else if (dEl.pickInput.value.length > 4) dEl.pickInput.value = "";
  });
  function fetchReact() {
    return fetch(DAILY_FN + "?day=" + todayKey(), { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.reactions && daily.day === todayKey()) { daily.react = j.reactions; saveDaily(); renderReact(""); renderDaily(); } })
      .catch(function () {});
  }
  function refreshDaily() { return fetchDaily().then(fetchReact, fetchReact); }

  // ---- Sehdauer: gespielte Sekunden (sec), weiteste Stelle (max) und Länge (dur) je Video – gesendet bei Pause, Ende, Schliessen ----
  var playerItem = null, watch = { last: -1, synced: 0 };
  function curW(n) { return use.w[n] = use.w[n] || { sec: 0, max: 0, dur: 0 }; }
  function saveWatch(send) { if (!playerItem || playerItem.day !== todayKey()) return; saveUse(); if (send) { watch.synced = Date.now(); syncUse(); } }
  dEl.video.addEventListener("timeupdate", function () {
    if (!playerItem || playerItem.day !== todayKey() || dEl.video.paused || dEl.video.seeking) return; // Sehdauer nur für heute
    var t = dEl.video.currentTime, w = curW(playerItem.n);
    if (watch.last >= 0) { var dt = t - watch.last; if (dt > 0 && dt < 2) w.sec += dt; }
    watch.last = t;
    if (t > w.max) w.max = t;
    if (isFinite(dEl.video.duration) && dEl.video.duration > 0) w.dur = dEl.video.duration;
    if (Date.now() - watch.synced > 30000) saveWatch(true); else if (Math.floor(t) % 5 === 0) saveUse();
  });
  dEl.video.addEventListener("play", function () { watch.last = dEl.video.currentTime; });
  dEl.video.addEventListener("seeked", function () { watch.last = dEl.video.currentTime; });
  dEl.video.addEventListener("pause", function () { saveWatch(true); });
  dEl.video.addEventListener("ended", function () { if (playerItem) { var w = curW(playerItem.n); if (w.dur) w.max = w.dur; } saveWatch(true); });

  // ---- Push „Sag mir Bescheid“: Abo für die Morgen-Videos (video.mjs schickt beim ersten Eintrag des Tages) ----
  function dailyPushRemembered() { try { return localStorage.getItem(PUSH_DAILY_KEY) === "ja"; } catch (e) { return false; } }
  function subscribeDaily() {
    return swReady.then(function (reg) {
      if (!reg) throw new Error("kein Service Worker");
      return reg.pushManager.getSubscription().then(function (sub) {
        return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.pushKey) });
      });
    }).then(function (sub) {
      return fetch(DAILY_FN + "?op=subscribe", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ sub: sub.toJSON ? sub.toJSON() : sub }) })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
    }).then(function () { try { localStorage.setItem(PUSH_DAILY_KEY, "ja"); } catch (e) {} return true; });
  }
  var hp = $("homePush"), hpName = $("homePushName"), hpSub = $("homePushSub");
  function showDailyPush() {
    if (!pushOk || Notification.permission === "denied") { hp.hidden = true; return; }
    hp.hidden = dailyPushRemembered() && Notification.permission === "granted";
  }
  hp.addEventListener("click", function () {
    hp.disabled = true; hpSub.textContent = "Einen Moment …";
    Promise.resolve(Notification.requestPermission()).then(function (perm) {
      if (perm !== "granted") throw new Error("keine Erlaubnis");
      return subscribeDaily();
    }).then(function () {
      hp.classList.add("is-done"); hpName.textContent = "Alles klar!"; hpSub.textContent = "Wir sagen dir Bescheid, sobald das Video da ist.";
      setTimeout(function () { hp.hidden = true; }, 3500);
    }).catch(function (err) {
      console.warn("[MEET] Push nicht eingerichtet:", err);
      hp.disabled = false;
      hpSub.textContent = Notification.permission === "denied" ? "Benachrichtigungen sind für MEET ausgeschaltet." : "Das hat gerade nicht geklappt – versuch es später nochmal.";
      if (Notification.permission === "denied") setTimeout(function () { hp.hidden = true; }, 3500);
    });
  });
  showDailyPush();
  // Gerät hat schon zugestimmt: Abo einmal am Tag still auffrischen, falls der Browser es erneuert hat
  if (pushOk && dailyPushRemembered() && Notification.permission === "granted") {
    try { if (localStorage.getItem(PUSH_DAILY_KEY + "-at") !== todayKey()) { localStorage.setItem(PUSH_DAILY_KEY + "-at", todayKey()); subscribeDaily().catch(function () {}); } } catch (e) {}
  }

  // ---- Aus der Push getippt: /?play=1|2 öffnet das Video, sobald die Liste da ist ----
  var playWant = 0; try { playWant = Number(new URLSearchParams(location.search).get("play")) || 0; } catch (e) {}
  function maybeDeepPlay() {
    if (!playWant || daily.day !== todayKey()) return;
    var v = daily.items.filter(function (x) { return x && x.n === playWant && x.url; })[0];
    if (!v) return;
    playWant = 0; try { history.replaceState(null, "", location.pathname); } catch (e) {}
    openPlayer(v);
  }

  try { var dc = JSON.parse(localStorage.getItem(DAILY_CACHE) || "null"); if (dc && dc.day) daily = dc; } catch (e) {}
  daily.react = daily.react || {};
  renderDaily(); maybeDeepPlay();
  if (window.fetch) {
    refreshDaily();
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refreshDaily(); });
    setInterval(function () { if (!document.hidden && state.screen === "home") refreshDaily(); }, 60000);
  }

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
