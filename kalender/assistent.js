// MEET_ Kalender – Sprach- und Chat-Assistent. Schwebender Knopf unten rechts in jeder Ansicht; öffnet ein Chat-Feld
// mit Mikrofon (Spracherkennung des Browsers) und Textfeld. Die Nachricht geht samt Kalender-Kontext an
// netlify/functions/assistent.mjs (Claude). Die zurückkommenden Aktionen führt diese Datei über den gemeinsamen
// Speicher aus (window.claude.use("db") aus sync.js) – damit erscheinen die Einträge sofort in der Ansicht.
// Jede Antwort mit Aktionen hat ihren eigenen „Rückgängig“-Knopf.
(function () {
  "use strict";
  var API = "/.netlify/functions/assistent";
  var SETTINGS_KEY = "meetstudio:settings:v2", ICH_KEY = "meet_kal_ich";
  var COLL = { termin: "termine", aufgabe: "aufgaben", beitrag: "beitraege", abwesenheit: "abwesenheiten" };
  var ART_NAME = { termin: "Termin", aufgabe: "Aufgabe", beitrag: "Beitrag", abwesenheit: "Abwesenheit" };
  var DEFAULT_PERSONEN = [{ id: "beide", name: "Alle" }, { id: "niklas", name: "Niklas" }, { id: "vincent", name: "Vincent" }, { id: "joel", name: "Joel" }];
  var DEFAULT_BEREICHE = [{ id: "daily", name: "MEET DAILY" }, { id: "2gether", name: "MEET2gether" }, { id: "us", name: "MEET US" }, { id: "studio", name: "Studio & Dreh" }, { id: "social", name: "Social & Content" }, { id: "team", name: "Team" }, { id: "sonstiges", name: "Sonstiges" }];
  var MONTHS = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];
  var DOWS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

  var db = null, history = [], busy = false, rec = null, listening = false, recFinal = "";
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, c, text) { var e = document.createElement(tag); if (c) e.className = c; if (text != null) e.textContent = text; return e; };
  var pad = function (n) { return String(n).padStart(2, "0"); };
  var key = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  var addDays = function (d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; };
  function pin() { try { return (JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}).studioPin || ""; } catch (e) { return ""; } }
  function me() { try { return localStorage.getItem(ICH_KEY) || ""; } catch (e) { return ""; } }
  function fmtDate(s) { if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || ""; var p = s.split("-").map(Number), d = new Date(p[0], p[1] - 1, p[2]); return DOWS[d.getDay()] + " " + d.getDate() + ". " + MONTHS[d.getMonth()]; }

  // ---------- Oberfläche ----------
  var css = ".asst-fab{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:20;display:inline-flex;align-items:center;gap:8px;background:var(--accent);color:var(--on-accent);border:0;border-radius:var(--r-pill);padding:12px 18px;font:inherit;font-weight:650;cursor:pointer;box-shadow:0 8px 28px rgba(0,0,0,.35)}" +
    ".asst-fab:hover{filter:brightness(1.05)}.asst-fab svg{width:18px;height:18px;flex:none}" +
    ".asst{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:21;width:min(440px,calc(100vw - 32px));max-height:min(620px,calc(100vh - 32px - env(safe-area-inset-bottom,0px)));background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:0 12px 40px rgba(0,0,0,.4);display:flex;flex-direction:column;overflow:hidden}" +
    ".asst-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line)}" +
    ".asst-head h2{font-size:1.05rem}.asst-head .x{background:none;border:0;color:var(--muted);font-size:1.3rem;cursor:pointer;padding:0 4px;line-height:1}" +
    ".asst-log{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px;min-height:160px}" +
    ".asst-msg{max-width:88%;padding:9px 12px;border-radius:14px;line-height:1.4;overflow-wrap:anywhere;white-space:pre-wrap;font-size:.95rem}" +
    ".asst-msg.me{align-self:flex-end;background:var(--accent);color:var(--on-accent);border-bottom-right-radius:4px}" +
    ".asst-msg.bot{align-self:flex-start;background:var(--surface-2);border-bottom-left-radius:4px}" +
    ".asst-msg.err{align-self:flex-start;background:transparent;border:1px solid var(--bad);color:var(--bad)}" +
    ".asst-msg .acts{display:flex;flex-direction:column;gap:4px;margin-top:8px;font-size:.84rem;color:var(--muted)}" +
    ".asst-msg .acts span::before{content:\"✓ \";color:var(--good)}.asst-msg .acts span.fail::before{content:\"✗ \";color:var(--bad)}" +
    ".asst-msg .undo{align-self:flex-start;margin-top:8px;background:transparent;border:1px solid var(--line);color:var(--fg);border-radius:var(--r-pill);padding:3px 11px;font:inherit;font-size:.82rem;cursor:pointer}" +
    ".asst-msg .undo:hover{border-color:var(--accent)}.asst-msg .undo:disabled{opacity:.5;cursor:default}" +
    ".asst-wait{align-self:flex-start;color:var(--muted);font-size:.85rem;padding:4px 12px}" +
    ".asst-form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--line);align-items:flex-end}" +
    ".asst-form textarea{flex:1;resize:none;min-height:40px;max-height:120px;background:var(--input);border:1px solid var(--input-line);border-radius:var(--r-input);padding:9px 10px;font:inherit;color:inherit;line-height:1.35}" +
    ".asst-form button{flex:none;height:40px;border-radius:var(--r-pill);border:1px solid var(--line);background:transparent;color:var(--fg);font:inherit;font-weight:500;cursor:pointer;padding:0 14px;display:inline-flex;align-items:center;gap:6px}" +
    ".asst-form button.send{background:var(--accent);border-color:var(--accent);color:var(--on-accent);font-weight:650}" +
    ".asst-form button.mic{width:44px;padding:0;justify-content:center}.asst-form button.mic svg{width:20px;height:20px}" +
    ".asst-form button.mic.on{background:var(--bad);border-color:var(--bad);color:#fff;animation:asst-pulse 1.2s infinite}" +
    "@keyframes asst-pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,138,115,.6)}50%{box-shadow:0 0 0 8px rgba(255,138,115,0)}}" +
    ".asst-form button:disabled{opacity:.45;cursor:default}" +
    ".asst-hint{padding:0 14px 10px;color:var(--muted);font-size:.78rem}" +
    "@media (max-width:600px){.asst{right:0;left:0;bottom:0;width:100%;max-height:min(85vh,calc(100vh - 60px));border-radius:var(--r-lg) var(--r-lg) 0 0;padding-bottom:env(safe-area-inset-bottom,0px)}.asst-fab{right:12px}}";
  var MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4"/><path d="M8 21h8"/></svg>';

  var fab, box, log, input, micBtn, sendBtn, hint;
  function build() {
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    fab = el("button", "asst-fab"); fab.type = "button"; fab.innerHTML = MIC + '<span>Sag’s mir</span>'; fab.title = "Assistent: sprechen oder tippen, was in den Kalender soll";
    fab.onclick = function () { open(); };
    box = el("div", "asst"); box.hidden = true; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Kalender-Assistent");
    box.innerHTML = '<div class="asst-head"><div><span class="eyebrow">MEET_ · Assistent</span><h2>Was soll in den Kalender?</h2></div><button type="button" class="x" aria-label="Schliessen">×</button></div>' +
      '<div class="asst-log" id="asstLog"></div>' +
      '<form class="asst-form" id="asstForm"><button type="button" class="mic" id="asstMic" title="Sprechen (nochmals antippen zum Stoppen)" aria-label="Sprechen">' + MIC + '</button>' +
      '<textarea id="asstIn" rows="1" placeholder="z. B. Dreh am Donnerstag um 14 Uhr im Studio, Joel schneidet bis Montag" autocomplete="off"></textarea>' +
      '<button type="submit" class="send" id="asstSend">Los</button></form>' +
      '<div class="asst-hint" id="asstHint"></div>';
    document.body.appendChild(fab); document.body.appendChild(box);
    log = $("asstLog"); input = $("asstIn"); micBtn = $("asstMic"); sendBtn = $("asstSend"); hint = $("asstHint");
    box.querySelector(".x").onclick = close;
    $("asstForm").addEventListener("submit", function (ev) { ev.preventDefault(); send(input.value); });
    input.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); send(input.value); } });
    input.addEventListener("input", function () { input.style.height = "auto"; input.style.height = Math.min(120, input.scrollHeight) + "px"; });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !box.hidden) close(); });
    initSpeech();
    bot("Hallo! Sag oder tipp mir, was in den Kalender soll – zum Beispiel „Podcast-Aufnahme nächsten Dienstag 18 Uhr“ oder „Joel ist nächste Woche in den Ferien“. Du kannst auch fragen, was ansteht.");
  }
  function open() { box.hidden = false; fab.hidden = true; setTimeout(function () { input.focus(); }, 50); }
  function close() { stopRec(); box.hidden = true; fab.hidden = false; }
  function scroll() { log.scrollTop = log.scrollHeight; }
  function bubble(cls, text) { var m = el("div", "asst-msg " + cls, text); log.appendChild(m); scroll(); return m; }
  function bot(text) { return bubble("bot", text); }

  // ---------- Spracherkennung ----------
  function initSpeech() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { micBtn.hidden = true; hint.textContent = "Spracheingabe gibt es in diesem Browser nicht – auf dem iPhone in Safari öffnen, oder einfach tippen."; return; }
    rec = new SR(); rec.lang = "de-DE"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    rec.onresult = function (ev) {
      var interim = "", fin = "";
      for (var i = ev.resultIndex; i < ev.results.length; i++) { var t = ev.results[i][0].transcript; if (ev.results[i].isFinal) fin += t; else interim += t; }
      if (fin) recFinal += fin;
      input.value = (recFinal + " " + interim).trim(); input.dispatchEvent(new Event("input"));
    };
    rec.onerror = function (ev) {
      listening = false; micBtn.classList.remove("on");
      hint.textContent = ev.error === "not-allowed" ? "Mikrofon nicht erlaubt – in den Browser-Einstellungen freigeben." : ev.error === "no-speech" ? "Nichts gehört. Nochmals antippen und sprechen." : "Spracherkennung: " + ev.error;
    };
    rec.onend = function () {
      var was = listening; listening = false; micBtn.classList.remove("on");
      if (was && recFinal.trim()) { send(recFinal.trim()); } else if (was && input.value.trim()) { send(input.value.trim()); }
      recFinal = "";
    };
    micBtn.onclick = function () { if (listening) { stopRec(); } else { startRec(); } };
  }
  function startRec() {
    if (!rec || busy) return;
    recFinal = ""; input.value = ""; hint.textContent = "Ich höre zu … sprich jetzt. Beim Verstummen schicke ich es ab.";
    try { rec.start(); listening = true; micBtn.classList.add("on"); } catch (e) { hint.textContent = "Mikrofon konnte nicht gestartet werden."; }
  }
  function stopRec() { if (rec && listening) { try { rec.stop(); } catch (e) { } } }

  // ---------- Kontext für Claude ----------
  function snap(coll) { return db.collection(coll).get().then(function (s) { return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }); }
  function kontext() {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var tk = key(today), from = key(addDays(today, -7)), to = key(addDays(today, 70));
    return Promise.all([snap("termine"), snap("aufgaben"), snap("beitraege"), snap("abwesenheiten"), db.doc("einstellungen/kalender").get()]).then(function (r) {
      var set = r[4].exists ? (r[4].data() || {}) : {};
      var personen = Array.isArray(set.personen) && set.personen.length ? [{ id: "beide", name: "Alle" }].concat(set.personen) : DEFAULT_PERSONEN;
      var bereiche = Array.isArray(set.bereiche) && set.bereiche.length ? set.bereiche.map(function (b) { return { id: b.id, name: b.name }; }) : DEFAULT_BEREICHE;
      var pick = function (o, keys) { var x = {}; keys.forEach(function (k) { if (o[k] !== undefined && o[k] !== "" && o[k] !== null && o[k] !== false) x[k] = o[k]; }); return x; };
      var termine = r[0].filter(function (t) { return t.wiederholung ? t.datum <= to && (!t.wiederholungBis || t.wiederholungBis >= from) : t.datum >= from && t.datum <= to; })
        .sort(function (a, b) { return a.datum.localeCompare(b.datum); }).slice(0, 120)
        .map(function (t) { return pick(t, ["id", "titel", "datum", "von", "bis", "ganztag", "bereich", "wer", "ort", "notiz", "wiederholung", "wiederholungBis"]); });
      var aufgaben = r[1].filter(function (t) { return !t.erledigt; }).slice(0, 120).map(function (t) { return pick(t, ["id", "titel", "bereich", "wer", "prio", "datum", "woche", "monat", "notiz"]); });
      var beitraege = r[2].filter(function (b) { return b.status !== "veroeffentlicht"; }).slice(0, 60).map(function (b) { return pick(b, ["id", "titel", "bereich", "wer", "status", "datum", "notiz"]); });
      var abw = r[3].filter(function (a) { return (a.bis || a.von) >= from; }).map(function (a) { return pick(a, ["id", "titel", "wer", "von", "bis"]); });
      var view = ""; try { view = localStorage.getItem("meet_kal_view") || ""; } catch (e) { }
      return { heute: tk, wochentag: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"][today.getDay()], ich: me() || "unbekannt", ansicht: view, personen: personen, bereiche: bereiche, termine: termine, aufgaben: aufgaben, beitraege: beitraege, abwesenheiten: abw };
    });
  }

  // ---------- Aktionen ausführen ----------
  function describe(a, doc) {
    var f = doc || a.felder || {}, art = ART_NAME[a.art] || a.art, when = "";
    if (a.art === "abwesenheit") when = fmtDate(f.von) + (f.bis && f.bis !== f.von ? " – " + fmtDate(f.bis) : "");
    else if (f.datum) when = fmtDate(f.datum) + (f.von ? " " + f.von + (f.bis ? "–" + f.bis : "") : "");
    else if (f.woche) when = "KW " + String(f.woche).slice(6); else if (f.monat) when = f.monat;
    var verb = a.op === "anlegen" ? "angelegt" : a.op === "loeschen" ? "gelöscht" : "geändert";
    return art + " " + verb + ": " + (f.titel || "(ohne Titel)") + (when ? " · " + when : "");
  }
  function clean(f, art) {
    var out = {}; if (!f || typeof f !== "object") return out;
    Object.keys(f).forEach(function (k) { var v = f[k]; if (v === undefined || v === null) return; if (typeof v === "object") return; out[k] = v; });
    if (art === "termin" && out.ganztag === undefined && out.von === undefined && "titel" in out) out.ganztag = true;
    if (art === "aufgabe") { ["datum", "woche", "monat"].forEach(function (k) { if (out[k] === undefined && (f.datum !== undefined || f.woche !== undefined || f.monat !== undefined)) out[k] = ""; }); }
    return out;
  }
  function defaults(art) {
    var now = Date.now(), who = me() || "beide";
    if (art === "termin") return { titel: "", datum: "", von: "", bis: "", ganztag: true, bereich: "sonstiges", wer: who, ort: "", notiz: "", link: "", wiederholung: "", wiederholungBis: "", ausnahmen: [], erstelltAm: now, erstelltVon: me() || null };
    if (art === "aufgabe") return { titel: "", bereich: "sonstiges", wer: who, prio: "normal", erledigt: false, erledigtAm: null, datum: "", woche: "", monat: "", notiz: "", link: "", erstelltAm: now, erstelltVon: me() || null };
    if (art === "beitrag") return { titel: "", bereich: "social", wer: who, status: "idee", statusAm: now, datum: "", link: "", notiz: "", erstelltAm: now, erstelltVon: me() || null };
    return { titel: "", wer: who, von: "", bis: "", notiz: "", erstelltAm: now, erstelltVon: me() || null };
  }
  function runActions(aktionen, msgEl) {
    var undo = [], lines = el("div", "acts");
    var seq = Promise.resolve();
    aktionen.forEach(function (a) {
      if (!COLL[a.art] || !/^(anlegen|aendern|loeschen)$/.test(a.op)) return;
      seq = seq.then(function () {
        var coll = db.collection(COLL[a.art]), f = clean(a.felder, a.art);
        if (a.op === "anlegen") {
          var body = Object.assign(defaults(a.art), f);
          if (a.art === "aufgabe" && f.erledigt) body.erledigtAm = Date.now();
          if (a.art === "abwesenheit" && !body.bis) body.bis = body.von;
          return coll.add(body).then(function (ref) { undo.push(function () { return ref.delete(); }); lines.appendChild(el("span", null, describe(a, body))); });
        }
        var id = String(a.id || ""); if (!id) { lines.appendChild(el("span", "fail", describe(a) + " – kein Eintrag gefunden")); return; }
        return coll.doc(id).get().then(function (s) {
          if (!s.exists) { lines.appendChild(el("span", "fail", describe(a) + " – gibt es nicht mehr")); return; }
          var prev = JSON.parse(JSON.stringify(s.data()));
          if (a.op === "loeschen") return coll.doc(id).delete().then(function () { undo.push(function () { return coll.doc(id).set(prev); }); lines.appendChild(el("span", null, describe(a, prev))); });
          if (a.art === "aufgabe" && f.erledigt !== undefined) f.erledigtAm = f.erledigt ? Date.now() : null;
          if (a.art === "beitrag" && f.status !== undefined && f.status !== prev.status) f.statusAm = Date.now();
          return coll.doc(id).update(f).then(function () { undo.push(function () { return coll.doc(id).set(prev); }); lines.appendChild(el("span", null, describe(a, Object.assign({}, prev, f)))); });
        });
      }).catch(function (e) { lines.appendChild(el("span", "fail", describe(a) + " – " + ((e && e.message) || "fehlgeschlagen"))); });
    });
    return seq.then(function () {
      if (lines.childNodes.length) msgEl.appendChild(lines);
      if (undo.length) {
        var u = el("button", "undo", "Rückgängig"); u.type = "button";
        u.onclick = function () { u.disabled = true; u.textContent = "Mache rückgängig …"; Promise.all(undo.map(function (fn) { return fn().catch(function () { }); })).then(function () { u.textContent = "Rückgängig gemacht"; history.push({ role: "user", content: "(Die letzten Aktionen wurden rückgängig gemacht.)" }, { role: "assistant", content: '{"antwort":"Okay, rückgängig gemacht.","aktionen":[],"nachfrage":false}' }); }); };
        msgEl.appendChild(u);
      }
      scroll();
    });
  }

  // ---------- Senden ----------
  function send(text) {
    text = String(text || "").trim(); if (!text || busy || !db) return;
    stopRec();
    input.value = ""; input.style.height = "auto"; hint.textContent = "";
    bubble("me", text); history.push({ role: "user", content: text });
    busy = true; sendBtn.disabled = true; micBtn.disabled = true;
    var wait = el("div", "asst-wait", "Überlege …"); log.appendChild(wait); scroll();
    kontext().then(function (ctx) {
      return fetch(API, { method: "POST", headers: { "Content-Type": "application/json", "x-studio-pin": encodeURIComponent(pin()) }, body: JSON.stringify({ messages: history.slice(-16), kontext: ctx }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ("Fehler " + r.status)); return j; }); });
    }).then(function (j) {
      wait.remove();
      var m = bot(j.antwort || (j.aktionen && j.aktionen.length ? "Erledigt." : "Hm, dazu fällt mir nichts ein."));
      history.push({ role: "assistant", content: JSON.stringify({ antwort: j.antwort || "", aktionen: j.aktionen || [], nachfrage: !!j.nachfrage }) });
      if (history.length > 24) history = history.slice(-24);
      return runActions(Array.isArray(j.aktionen) ? j.aktionen : [], m);
    }).catch(function (e) {
      wait.remove(); bubble("err", (e && e.message) || "Keine Verbindung.");
      history.pop();
    }).then(function () { busy = false; sendBtn.disabled = false; micBtn.disabled = false; if (!box.hidden) input.focus(); });
  }

  // Start, sobald der Speicher bereit ist (sync.js: PIN und Name eingegeben)
  function start() {
    if (!window.claude || !window.claude.use) return;
    window.claude.use("db").then(function (d) { db = d; build(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
