// MEET_ Portal-Leiste: ein schwebender Knopf unten links auf Studio, WALL-Freigabe und Kalender.
// Antippen öffnet die Liste der Werkzeuge (Portal, Studio, WALL-Freigabe, Kalender) mit dem Stand der WALL
// (wie viele Momente warten, wie viele Fragen offen sind). Der Zähler steht auch als Punkt am Knopf.
// Nutzt die Studio-PIN aus dem Browser-Speicher (meetstudio:settings:v2); ohne PIN gibt es nur die Links.
// Der Stand wird höchstens alle 90 Sekunden abgefragt und seitenübergreifend in sessionStorage gemerkt.
(function () {
  "use strict";
  if (window.MEET_PORTAL_BAR) return; window.MEET_PORTAL_BAR = true;
  var WALL = "/.netlify/functions/wall", SETTINGS_KEY = "meetstudio:settings:v2", CACHE_KEY = "meetportal:counts", MAX_AGE = 90000;
  var PAGES = [
    { id: "portal", href: "/portal/", name: "Portal", sub: "Übersicht" },
    { id: "studio", href: "/studio/", name: "Studio", sub: "MEET DAILY aufnehmen" },
    { id: "wall", href: "/studio/wall/", name: "WALL-Freigabe", sub: "" },
    { id: "kalender", href: "/kalender/", name: "Kalender", sub: "Planung" }
  ];
  var path = location.pathname;
  var current = path.indexOf("/studio/wall") === 0 ? "wall" : path.indexOf("/studio") === 0 ? "studio" : path.indexOf("/kalender") === 0 ? "kalender" : path.indexOf("/portal") === 0 ? "portal" : "";
  if (current === "portal") return;

  var st = document.createElement("style");
  st.textContent =
    ".pbar{position:fixed;left:max(14px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));z-index:40;font-family:'Space Grotesk',system-ui,sans-serif}" +
    ".pbar-btn{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 14px 0 12px;border:0;border-radius:22px;background:#2F1041;color:#fff;box-shadow:0 4px 18px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.14);cursor:pointer;font:inherit;font-weight:700;font-size:14px;letter-spacing:-.01em}" +
    ".pbar-btn:hover{box-shadow:0 4px 18px rgba(0,0,0,.35),0 0 0 1.5px #D4F65A}" +
    ".pbar-m{font-size:17px;line-height:1}.pbar-m i{display:inline-block;width:.5em;height:.15em;background:#D4F65A;margin-left:.08em;vertical-align:baseline}" +
    ".pbar-n{min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:#FF8A3D;color:#2F1041;font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;font-weight:700;display:none;align-items:center;justify-content:center}" +
    ".pbar-n.is-on{display:inline-flex}" +
    ".pbar-sheet{position:absolute;left:0;bottom:54px;width:min(300px,calc(100vw - 28px));padding:8px;border-radius:16px;background:#3D1B55;color:#fff;box-shadow:0 10px 36px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.12);display:none;flex-direction:column;gap:2px}" +
    ".pbar-sheet.is-open{display:flex}" +
    ".pbar-a{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;color:#fff;text-decoration:none;font-weight:700;font-size:14.5px}" +
    ".pbar-a:hover{background:rgba(255,255,255,.08);color:#D4F65A}.pbar-a.is-cur{background:rgba(212,246,90,.12);color:#D4F65A}" +
    ".pbar-a small{font-family:'Geist Mono',ui-monospace,monospace;font-weight:500;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#B9A6CC;white-space:nowrap}.pbar-a small.is-hot{color:#FFC49B}" +
    ".pbar[hidden]{display:none!important}" +
    "body.has-pbar .screen{padding-bottom:max(84px,env(safe-area-inset-bottom))}"; // Platz, damit der Knopf keine Schaltfläche am Seitenende verdeckt
  document.head.appendChild(st);

  var bar = document.createElement("div"); bar.className = "pbar";
  var btn = document.createElement("button"); btn.type = "button"; btn.className = "pbar-btn"; btn.setAttribute("aria-label", "MEET Portal – Werkzeuge"); btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = '<span class="pbar-m">M<i></i></span><span>Portal</span><span class="pbar-n" id="pbarN"></span>';
  var sheet = document.createElement("div"); sheet.className = "pbar-sheet";
  var subs = {};
  PAGES.forEach(function (p) {
    var a = document.createElement("a"); a.className = "pbar-a" + (p.id === current ? " is-cur" : ""); a.href = p.href;
    a.appendChild(document.createTextNode(p.name));
    var s = document.createElement("small"); s.textContent = p.sub; a.appendChild(s); subs[p.id] = s;
    sheet.appendChild(a);
  });
  bar.appendChild(sheet); bar.appendChild(btn);
  var n = btn.querySelector(".pbar-n");
  btn.addEventListener("click", function () { var o = !sheet.classList.contains("is-open"); sheet.classList.toggle("is-open", o); btn.setAttribute("aria-expanded", String(o)); if (o) refresh(true); });
  document.addEventListener("click", function (e) { if (!bar.contains(e.target)) { sheet.classList.remove("is-open"); btn.setAttribute("aria-expanded", "false"); } });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { sheet.classList.remove("is-open"); btn.setAttribute("aria-expanded", "false"); } });

  function pin() { try { return (JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}).studioPin || ""; } catch (e) { return ""; } }
  function show(c) {
    var total = (c.pending || 0) + (c.questions || 0);
    n.textContent = total; n.classList.toggle("is-on", total > 0);
    subs.wall.textContent = c.pending || c.questions ? (c.pending || 0) + " wartet · " + (c.questions || 0) + (c.questions === 1 ? " Frage" : " Fragen") : "Alles geprüft";
    subs.wall.classList.toggle("is-hot", total > 0);
  }
  function refresh(force) {
    var p = pin(); if (!p) { subs.wall.textContent = "PIN fehlt"; return; }
    var c = null; try { c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null"); } catch (e) { }
    if (c && Date.now() - c.at < (force ? 15000 : MAX_AGE)) { show(c); return; }
    var call = function (op) { return fetch(WALL + "?op=" + op, { method: "POST", headers: { "Content-Type": "application/json", "x-studio-pin": encodeURIComponent(p) }, body: "{}" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); };
    Promise.all([call("pending"), call("questions")]).then(function (r) {
      var c2 = { at: Date.now(), pending: (r[0].items || []).length, questions: (r[1].items || []).length };
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(c2)); } catch (e) { }
      show(c2);
    }).catch(function () { if (c) show(c); });
  }

  function mount() {
    document.body.appendChild(bar); document.body.classList.add("has-pbar");
    refresh(false);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(false); });
    // Im Studio nur auf dem Startscreen zeigen – nie über Kamera, Verarbeitung oder Ergebnis
    var home = document.getElementById("s-home");
    if (home) {
      var sync = function () { bar.hidden = home.hidden; };
      sync(); new MutationObserver(sync).observe(home, { attributes: true, attributeFilter: ["hidden"] });
    }
  }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
