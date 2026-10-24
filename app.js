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
      sentBody: "Dein MEET-Moment bleibt auf diesem Handy. Unter „Meine MEET-Momente“ findest du ihn wieder."
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
    reset: $("reset"), goWall: $("goWall"), homeMine: $("homeMine"), homeMineText: $("homeMineText"), minePop: $("minePop"), minePopBack: $("minePopBack"), minePopClose: $("minePopClose"), minePopList: $("minePopList"), pushBox: $("pushBox"), pushAsk: $("pushAsk"), pushHint: $("pushHint"), homeAsks: $("homeAsks"), askPast: $("askPast"), askPastNew: $("askPastNew"), askPop: $("askPop"), askPopBack: $("askPopBack"), askPopClose: $("askPopClose"), askPopList: $("askPopList"), homeWall: $("homeWall"), homeWallSub: $("homeWallSub"), homeWallNew: $("homeWallNew"),
    wallBack: $("wallBack"), wallKicker: $("wallKicker"), wallHint: $("wallHint"), wallList: $("wallList"), wallNote: $("wallNote"),
    wallMore: $("wallMore"), wallPast: $("wallPast"), wallHome: $("wallHome")
  };

  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  var state = { screen: "home", mode: "moment", texts: { moment: "", question: "" }, busy: false };

  // ---- Kopf: Datum & Bibelstelle ----
  var now = new Date();
  // Wochenende: MEET DAILY pausiert – oben steht „Am Montag geht's weiter“, darunter der Blick zurück auf die Woche
  var weekend = now.getDay() === 0 || now.getDay() === 6;
  el.dateLabel.textContent = now.getDate() + ". " + MONTHS[now.getMonth()];
  el.passage.textContent = cfg.passage;
  if (weekend) {
    // Kein Text, den man liest – also auch kein Teilen und keine Frage; stattdessen der Claim und der Blick zurück auf die Woche
    el.dayWord.textContent = now.getDay() === 6 ? "Samstag" : "Sonntag";
    el.passage.textContent = "Am Montag geht's weiter.";
    el.passage.parentNode.classList.add("day--weekend");
    el.screens.home.classList.add("screen--weekend");
    $("homeTitle").textContent = "Mit Gott Leben leben.";
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
    if (playerOpen()) { closePlayer(true); return; }
    if (!el.minePop.hidden) { closeMinePop(true); return; }
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
  // Heute-Screen zeigt nur die heute gestellten Fragen; alles davor liegt im Pop-up „Deine Fragen der letzten Tage“
  var ASK_SEEN_KEY = "meet:asks-seen"; // Zeitpunkt des letzten Blicks ins Pop-up – für „n neu“
  function askIsToday(q) { var d = new Date(q.ts); return !isNaN(d) && dayKey(d) === dayKey(new Date()); }
  function asksSeen() { var v = 0; try { v = Date.parse(localStorage.getItem(ASK_SEEN_KEY) || "") || 0; } catch (e) {} return v; }
  function renderAsks() {
    var all = readAsks();
    var asks = all.filter(askIsToday).slice(0, 3);
    var past = all.filter(function (q) { return !askIsToday(q); });
    el.homeAsks.innerHTML = "";
    el.homeAsks.hidden = !asks.length;
    asks.forEach(function (q) { el.homeAsks.appendChild(askCard(q)); });
    // Link zum Pop-up nur, wenn es frühere Fragen gibt; Badge zählt neue Antworten seit dem letzten Blick
    el.askPast.hidden = !past.length;
    var seen = asksSeen();
    var fresh = past.filter(function (q) { return q.status === "beantwortet" && Date.parse(q.answeredAt || "") > seen; }).length;
    el.askPastNew.hidden = !fresh;
    el.askPastNew.textContent = fresh + " neu";
    if (!el.askPop.hidden) renderAskPop(past);
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
  function renderAskPop(past) {
    el.askPopList.innerHTML = "";
    past.forEach(function (q) { el.askPopList.appendChild(askCard(q)); });
  }
  function openAskPop() {
    renderAskPop(readAsks().filter(function (q) { return !askIsToday(q); }));
    el.askPop.hidden = false;
    document.body.classList.add("pop-open");
    try { localStorage.setItem(ASK_SEEN_KEY, new Date().toISOString()); } catch (e) {}
    el.askPastNew.hidden = true;
    el.askPopClose.focus();
  }
  function closeAskPop() {
    if (el.askPop.hidden) return;
    el.askPop.hidden = true;
    document.body.classList.remove("pop-open");
    el.askPast.focus();
  }
  el.askPast.addEventListener("click", openAskPop);
  el.askPopClose.addEventListener("click", closeAskPop);
  el.askPopBack.addEventListener("click", closeAskPop);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAskPop(); });
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
    if (wallState.week) items = items.filter(inLastWeek);
    var hasPast = all.concat(own).some(function (m) { return !isToday(m); });
    var ownShown = items.filter(function (m) { return m.own; }).length;
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
  function updateHomeMine() {
    var n = readMine().length;
    el.homeMine.hidden = !n;
    el.homeMineText.textContent = "Meine MEET-Momente · " + n;
  }
  function mineCard(m) {
    var c = document.createElement("article"); c.className = "ask ask--mine";
    var head = document.createElement("div"); head.className = "ask-head";
    var lab = document.createElement("span"); lab.className = "label"; lab.textContent = askDay(m.ts) || "MEET-Moment";
    head.appendChild(lab);
    if (m.wall) { var st = document.createElement("span"); st.className = "ask-state"; st.textContent = "Auf der Wand geteilt"; head.appendChild(st); }
    var t = document.createElement("p"); t.className = "ask-text"; t.textContent = m.text;
    c.appendChild(head); c.appendChild(t);
    if (m.passage) { var w = document.createElement("p"); w.className = "ask-when"; w.textContent = m.passage; c.appendChild(w); }
    return c;
  }
  function openMinePop() {
    el.minePopList.innerHTML = "";
    readMine().forEach(function (m) { el.minePopList.appendChild(mineCard(m)); });
    el.minePop.hidden = false;
    document.body.style.overflow = "hidden";
    try { history.pushState({ pop: "mine" }, ""); } catch (e) {}
  }
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
  var daily = { day: "", items: [] };
  var dEl = { box: $("homeDaily"), grid: $("dailyGrid"), player: $("player"), back: $("playerBack"), close: $("playerClose"), video: $("playerVideo"), title: $("playerTitle"), kicker: $("playerKicker") };
  function fmtDur(s) { s = Math.round(s || 0); if (!s) return ""; return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60) + " Min"; }
  var PLAY_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>';
  function stepTitle(v) { return v.n === 1 ? "Still werden" : "MEETmoment" + (v.name ? " mit " + v.name : ""); }
  // Ein Schritt des Ablaufs: Nummer, Titel, Uhrzeit und Länge, Play rechts – keine Titelkarte, die Bibelstelle steht schon oben
  function clipTile(v, soon) {
    var meta = DAILY_META[v.n];
    var dur = soon ? "" : fmtDur(v.duration), sub = soon ? "kommt um " + meta.time : [meta.time, dur].filter(Boolean).join(" · ");
    var b = document.createElement(soon ? "div" : "button"); b.className = "clip" + (soon ? " clip--soon" : "");
    if (soon) b.setAttribute("aria-hidden", "true"); else { b.type = "button"; b.setAttribute("aria-label", stepTitle(v) + " · " + sub + " abspielen"); }
    var head = document.createElement("span"); head.className = "clip-head";
    var nm = document.createElement("span"); nm.className = "clip-name"; nm.textContent = soon ? meta.name : stepTitle(v);
    head.appendChild(nm);
    if (soon) { var tm = document.createElement("span"); tm.className = "clip-time"; tm.textContent = sub; head.appendChild(tm); }
    var media = document.createElement("span"); media.className = "clip-media";
    if (!soon) {
      if (v.poster) { var img = document.createElement("img"); img.className = "clip-img"; img.src = v.poster; img.alt = ""; img.decoding = "async"; media.appendChild(img); }
      var play = document.createElement("span"); play.className = "clip-play"; play.setAttribute("aria-hidden", "true"); play.innerHTML = PLAY_SVG; media.appendChild(play);
      if (dur) { var d = document.createElement("span"); d.className = "clip-dur"; d.textContent = dur.replace(" Min", ""); media.appendChild(d); }
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
        daily = { day: day, items: (j && j.items) || [] };
        try { localStorage.setItem(DAILY_CACHE, JSON.stringify(daily)); } catch (e) {}
        renderDaily();
      });
  }
  function playerOpen() { return !dEl.player.hidden; }
  function openPlayer(v) {
    var meta = DAILY_META[v.n] || { name: v.title || "Video", time: "" };
    dEl.kicker.textContent = "MEET DAILY · " + meta.time + (v.passage ? " · " + v.passage : "");
    dEl.title.textContent = stepTitle(v);
    dEl.video.poster = v.poster || "";
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
    dEl.video.removeAttribute("src"); try { dEl.video.load(); } catch (e) {}
    dEl.player.hidden = true;
    document.body.style.overflow = "";
  }
  dEl.close.addEventListener("click", function () { closePlayer(false); });
  dEl.back.addEventListener("click", function () { closePlayer(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePlayer(false); });
  try { var dc = JSON.parse(localStorage.getItem(DAILY_CACHE) || "null"); if (dc && dc.day) daily = dc; } catch (e) {}
  renderDaily();
  if (window.fetch) {
    fetchDaily().catch(function () {});
    document.addEventListener("visibilitychange", function () { if (!document.hidden) fetchDaily().catch(function () {}); });
    setInterval(function () { if (!document.hidden && state.screen === "home") fetchDaily().catch(function () {}); }, 60000);
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
