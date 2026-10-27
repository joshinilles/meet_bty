/* MEET · meet-bty.com/links – alle Kanäle auf einen Blick.
   Die Links selbst stehen in config.js (links). Hier: Plattform-Symbole,
   Aufbau der Liste, Kopf beim Scrollen (MEET_ wird zum Signet M_). */
(function () {
  "use strict";

  var cfg = (window.MEET_CONFIG && window.MEET_CONFIG.links) || {};

  // Plattform-Symbole, einfarbig (Instagram und YouTube vereinfacht gezeichnet,
  // TikTok und Spotify nach den offiziellen Umrissen). Unbekannte Kanäle bekommen das Ketten-Symbol.
  var ICONS = {
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4L15.8 12l-6.2 3.6z"/></svg>',
    spotify: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>',
    podcast: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>'
  };
  var ARROW = '<svg class="row-arrow" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>';

  // "@name" aus dem Link ableiten, wenn kein eigener Handle angegeben ist
  function handleFrom(url) {
    try {
      var u = new URL(url);
      var seg = u.pathname.split("/").filter(Boolean).pop();
      if (!seg) return u.hostname.replace(/^www\./, "");
      seg = decodeURIComponent(seg);
      return seg.charAt(0) === "@" ? seg : "@" + seg;
    } catch (e) { return ""; }
  }

  // ---- MEET App (im Fokus): Ziel aus config.js, sonst die Startseite ----
  var app = document.getElementById("appLink");
  if (app && cfg.app) app.href = cfg.app;

  // ---- Social Media und Podcast: eine Zeile je Kanal, Einträge ohne Link bleiben weg ----
  function renderRows(listId, sectionId, items) {
    var list = document.getElementById(listId);
    (items || []).forEach(function (c) {
      if (!c || !c.url || !c.name) return;
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.className = "row";
      a.href = c.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.innerHTML =
        '<span class="row-icon">' + (ICONS[c.id] || ICONS.link) + '</span>' +
        '<span class="row-text"><span class="row-name"></span><span class="row-handle"></span></span>' +
        ARROW;
      a.querySelector(".row-name").textContent = c.name;
      a.querySelector(".row-handle").textContent = c.handle || handleFrom(c.url);
      li.appendChild(a);
      list.appendChild(li);
    });
    if (!list.children.length) document.getElementById(sectionId).hidden = true;
  }
  renderRows("social", "socialSection", cfg.social);
  renderRows("podcast", "podcastSection", cfg.podcast);

  // ---- Kopf: beim Scrollen kompakt, MEET_ wird zum Signet M_ (wie auf der Startseite) ----
  var topbar = document.getElementById("topbar");
  var logo = document.getElementById("headerLogo");
  var compact = null;
  function onScroll() {
    var y = window.scrollY || window.pageYOffset || 0;
    var on = compact ? y > 24 : y > 64; // kleine Hysterese gegen Flackern
    if (on === compact) return;
    compact = on;
    topbar.classList.toggle("is-compact", on);
    if (logo) logo.classList.toggle("is-signet", on);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();
