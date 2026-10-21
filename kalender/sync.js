// MEET_ Kalender – Verbindung zum gemeinsamen Speicher (netlify/functions/kalender.mjs).
// Die Kalender-Seite stammt aus einem Claude-Artefakt und spricht die Datenbank über window.claude.use("db") an
// (collection / doc / add / set / update / delete / onSnapshot). Diese Datei stellt genau diese Schnittstelle bereit,
// dahinter liegt die Netlify-Funktion mit Studio-PIN. Statt Live-Verbindung fragt die Seite alle 20 Sekunden
// (und nach jeder eigenen Änderung, beim Zurückkehren in den Tab) mit ihrer rev nach, ob sich etwas geändert hat.
// Vor dem ersten Laden fragt ein Schleier nach Studio-PIN (dieselbe wie im Studio, Schlüssel meetstudio:settings:v2)
// und danach, wer am Gerät sitzt (Niklas, Vincent, Joel) – für Kommentare und „Wer“-Vorbelegung.
(function () {
  "use strict";
  var API = "/.netlify/functions/kalender";
  var SETTINGS_KEY = "meetstudio:settings:v2"; // dieselbe PIN wie im MEET DAILY Studio und bei der WALL-Freigabe
  var ICH_KEY = "meet_kal_ich";
  var POLL_MS = 20000;
  var DEFAULT_PERSONEN = [{ id: "niklas", name: "Niklas" }, { id: "vincent", name: "Vincent" }, { id: "joel", name: "Joel" }];
  var COLLS = ["termine", "aufgaben", "beitraege", "abwesenheiten", "wochen", "monate", "links", "kommentare", "einstellungen"];

  var pin = "", me = "", rev = "", data = {}, pullTimer = null, pollTimer = null, pulling = null;
  var collListeners = {}, docListeners = {};
  COLLS.forEach(function (c) { data[c] = {}; });

  function settings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function savePin(p) { try { var s = settings(); s.studioPin = p; localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { } }
  pin = settings().studioPin || "";
  try { me = localStorage.getItem(ICH_KEY) || ""; } catch (e) { }

  var readyResolve; var ready = new Promise(function (r) { readyResolve = r; });

  // ---------- Netz ----------
  function call(op, body) {
    return fetch(API + "?op=" + op, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-studio-pin": encodeURIComponent(pin) },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { var e = new Error(j.error || "PIN falsch"); e.code = "unauthorized"; throw e; }
        if (!r.ok) { var e2 = new Error(j.error || ("Fehler " + r.status)); e2.code = j.code || (r.status === 413 ? "quota_exceeded" : r.status === 400 ? "invalid_argument" : "unavailable"); throw e2; }
        return j;
      });
    });
  }
  function personen() {
    var s = data.einstellungen && data.einstellungen.kalender;
    var list = s && Array.isArray(s.personen) && s.personen.length ? s.personen.filter(function (p) { return p && p.id && p.name && p.id !== "beide"; }) : DEFAULT_PERSONEN;
    return list.map(function (p) { return { id: String(p.id), name: String(p.name) }; });
  }

  // ---------- Abgleich ----------
  function pull() {
    if (pulling) return pulling;
    pulling = call("all", { rev: rev }).then(function (r) {
      if (r.unchanged) return;
      var old = data, changed = [];
      rev = r.rev || "";
      data = {};
      COLLS.forEach(function (c) {
        data[c] = r.data && r.data[c] && typeof r.data[c] === "object" ? r.data[c] : {};
        if (JSON.stringify(data[c]) !== JSON.stringify(old[c] || {})) changed.push(c);
      });
      changed.forEach(notify);
    }).catch(function (e) {
      if (e && e.code === "unauthorized") { showGate("Die Studio-PIN stimmt nicht mehr."); }
      throw e;
    }).finally(function () { pulling = null; });
    return pulling;
  }
  function schedulePull(ms) { clearTimeout(pullTimer); pullTimer = setTimeout(function () { pull().catch(function () { }); }, ms || 1500); }
  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(function () { if (!document.hidden) pull().catch(function () { }); }, POLL_MS);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) schedulePull(200); });
    window.addEventListener("focus", function () { schedulePull(200); });
    window.addEventListener("online", function () { schedulePull(200); });
  }

  // ---------- Zuhörer (onSnapshot) ----------
  function collSnap(coll) {
    var docs = Object.keys(data[coll] || {}).map(function (id) { var d = data[coll][id]; return { id: id, data: function () { return d; } }; });
    return { docs: docs, size: docs.length, empty: !docs.length };
  }
  function docSnap(coll, id) {
    var d = data[coll] ? data[coll][id] : undefined;
    return { id: id, exists: d !== undefined, data: function () { return d; } };
  }
  function notify(coll) {
    (collListeners[coll] || []).forEach(function (cb) { try { cb(collSnap(coll)); } catch (e) { console.error(e); } });
    Object.keys(docListeners).forEach(function (k) {
      if (k.indexOf(coll + "/") !== 0) return;
      var id = k.slice(coll.length + 1);
      docListeners[k].forEach(function (cb) { try { cb(docSnap(coll, id)); } catch (e) { console.error(e); } });
    });
  }
  function applyWrite(coll, r) {
    if (r.rev) rev = r.rev;
    if (r.doc) data[coll][r.id] = r.doc; else delete data[coll][r.id];
    notify(coll);
    schedulePull(1500);
  }

  // ---------- Datenbank-Schnittstelle wie im Artefakt ----------
  function checkColl(coll) { if (COLLS.indexOf(coll) < 0) { var e = new Error("Unbekannte Sammlung " + coll); e.code = "invalid_argument"; throw e; } }
  function docRef(coll, id) {
    checkColl(coll);
    return {
      id: id,
      set: function (doc) { return call("set", { coll: coll, id: id, doc: doc }).then(function (r) { applyWrite(coll, r); }); },
      update: function (patch) { return call("update", { coll: coll, id: id, patch: patch }).then(function (r) { applyWrite(coll, r); }); },
      delete: function () { return call("delete", { coll: coll, id: id }).then(function (r) { applyWrite(coll, r); }); },
      get: function () { return Promise.resolve(docSnap(coll, id)); },
      onSnapshot: function (cb, err) {
        var k = coll + "/" + id; (docListeners[k] = docListeners[k] || []).push(cb);
        try { cb(docSnap(coll, id)); } catch (e) { if (err) err(e); }
        return function () { docListeners[k] = (docListeners[k] || []).filter(function (x) { return x !== cb; }); };
      }
    };
  }
  function collection(coll) {
    checkColl(coll);
    return {
      add: function (doc) { return call("add", { coll: coll, doc: doc }).then(function (r) { applyWrite(coll, r); return docRef(coll, r.id); }); },
      doc: function (id) { return docRef(coll, id); },
      get: function () { return Promise.resolve(collSnap(coll)); },
      onSnapshot: function (cb, err) {
        (collListeners[coll] = collListeners[coll] || []).push(cb);
        try { cb(collSnap(coll)); } catch (e) { if (err) err(e); }
        return function () { collListeners[coll] = (collListeners[coll] || []).filter(function (x) { return x !== cb; }); };
      }
    };
  }
  var db = {
    collection: collection,
    doc: function (p) { var parts = String(p).split("/"); return docRef(parts[0], parts.slice(1).join("/")); }
  };
  var user = {
    id: function () { return Promise.resolve(me || null); },
    canEdit: function () { return Promise.resolve(true); },
    can: function () { return Promise.resolve(true); },
    profiles: function (ids) {
      var out = {}; var ps = personen();
      (ids || []).forEach(function (id) { var p = ps.filter(function (x) { return x.id === id; })[0]; if (p) out[id] = { name: p.name }; });
      return Promise.resolve(out);
    }
  };
  window.claude = {
    use: function (ns) { return ready.then(function () { return ns === "db" ? db : ns === "user" ? user : null; }); }
  };

  // ---------- Schleier: PIN und „Wer bist du?“ ----------
  var gate = null, gateMsg = null, gatePin = null, gateWho = null, gateWhoSel = "";
  function buildGate() {
    if (gate) return;
    var st = document.createElement("style");
    st.textContent = ".gate{position:fixed;inset:0;z-index:50;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:16px}" +
      ".gate .box{background:var(--surface);border-radius:var(--r-lg);padding:24px;width:min(100%,420px);display:flex;flex-direction:column;gap:14px}" +
      ".gate h2{font-size:1.5rem}.gate .f label{display:block;margin-bottom:5px}.gate .who{display:flex;gap:6px;flex-wrap:wrap}" +
      ".gate .who button{flex:1}.gate .who button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:var(--on-accent);font-weight:650}" +
      ".gate input{font-family:var(--font-num);letter-spacing:.12em}.gate .msg{min-height:1.2em}";
    document.head.appendChild(st);
    gate = document.createElement("div"); gate.className = "gate"; gate.hidden = true;
    gate.innerHTML = '<form class="box" novalidate><span class="eyebrow">MEET_ · Kalender</span><h2>Wer bist du?</h2>' +
      '<div class="f"><label for="gWho">Dein Name</label><div class="who" id="gWho"></div></div>' +
      '<div class="f"><label for="gPin">Studio-PIN</label><input type="text" id="gPin" placeholder="Dieselbe PIN wie im Studio" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="numeric"></div>' +
      '<span class="msg" id="gMsg" role="status"></span>' +
      '<div class="formactions"><button type="submit" class="btn primary">Kalender öffnen</button></div></form>';
    document.body.appendChild(gate);
    gateMsg = gate.querySelector("#gMsg"); gatePin = gate.querySelector("#gPin"); gateWho = gate.querySelector("#gWho");
    gate.querySelector("form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var p = gatePin.value.trim();
      if (!gateWhoSel) { gateMsg.textContent = "Bitte deinen Namen antippen."; return; }
      if (!p) { gateMsg.textContent = "Bitte die Studio-PIN eintragen."; gatePin.focus(); return; }
      pin = p; gateMsg.textContent = "Verbinde …";
      pull().then(function () {
        savePin(p); me = gateWhoSel; try { localStorage.setItem(ICH_KEY, me); } catch (e) { }
        hideGate(); finishReady();
      }).catch(function (e) {
        gateMsg.textContent = e && e.code === "unauthorized" ? "Die Studio-PIN stimmt nicht." : "Keine Verbindung: " + ((e && e.message) || e);
      });
    });
  }
  function renderWho() {
    gateWho.innerHTML = "";
    personen().forEach(function (p) {
      var b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.textContent = p.name;
      b.setAttribute("aria-pressed", gateWhoSel === p.id);
      b.onclick = function () { gateWhoSel = p.id; renderWho(); };
      gateWho.appendChild(b);
    });
  }
  function showGate(message) {
    buildGate(); gateWhoSel = me; renderWho(); gatePin.value = pin; gateMsg.textContent = message || "";
    gate.hidden = false; (me ? gatePin : gateWho.firstChild || gatePin).focus();
  }
  function hideGate() { if (gate) gate.hidden = true; }

  var started = false;
  function finishReady() {
    if (!started) { started = true; startPolling(); }
    updateIchBtn(); readyResolve();
  }
  function updateIchBtn() {
    var b = document.getElementById("ichBtn"); if (!b) return;
    var p = personen().filter(function (x) { return x.id === me; })[0];
    b.textContent = p ? p.name : "Wer?"; b.title = "Angemeldet als " + (p ? p.name : "niemand") + " – antippen zum Wechseln"; b.hidden = false;
    b.onclick = function () { showGate(""); };
  }

  // Start: PIN und Name vorhanden → still verbinden; sonst Schleier.
  function start() {
    if (pin && me) {
      pull().then(finishReady).catch(function (e) { showGate(e && e.code === "unauthorized" ? "Die Studio-PIN stimmt nicht mehr." : "Keine Verbindung: " + ((e && e.message) || e)); });
    } else showGate("");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
