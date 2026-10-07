/* MEET · meet-bty.com – Formular-Logik
   Zwei Modi (MEET-Moment / Frage zum Text), Text pro Modus gemerkt,
   Versand als Netlify Form (POST auf "/", form-name "meet-impuls"). */
(function () {
  "use strict";

  var cfg = Object.assign(
    { passage: "Johannes 4,1–26", defaultTab: "moment", maxChars: 500 },
    window.MEET_CONFIG || {}
  );

  var COPY = {
    moment: {
      label: "MEET-Moment",
      kicker: "Dein MEET-Moment",
      heading: "Wie ist Gott dir im Text begegnet?",
      hint: "Ein Satz reicht. Ein Wort, das hängen bleibt, ein Gedanke, ein Gefühl.",
      placeholder: "Mir ist aufgefallen, dass …",
      send: "Moment teilen",
      sentKicker: "Moment geteilt",
      sentHeading: function (g) { return g + " – schön, dass du dabei bist."; },
      sentBody: "Dein MEET-Moment ist beim Team angekommen. Vielleicht taucht er morgen im Kanal auf."
    },
    question: {
      label: "Frage zum Text",
      kicker: "Deine Frage zum Text",
      heading: "Was verstehst du noch nicht?",
      hint: "Keine Frage ist zu klein. Das Team greift Fragen im Kanal oder im Podcast auf.",
      placeholder: "Ich frage mich, warum …",
      send: "Frage stellen",
      sentKicker: "Frage gestellt",
      sentHeading: function (g) { return g + " – wir schauen uns das an."; },
      sentBody: "Deine Frage ist beim Team. Antworten gibt es im Kanal oder in der nächsten MEET US-Folge."
    }
  };

  var MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    dateLabel: $("dateLabel"), passage: $("passage"),
    tabs: Array.prototype.slice.call(document.querySelectorAll(".tab")),
    form: $("panel"), fArt: $("fArt"), fPassage: $("fPassage"), fDate: $("fDate"),
    kicker: $("kicker"), heading: $("heading"), hint: $("hint"),
    text: $("text"), name: $("name"), counter: $("counter"), send: $("send"), error: $("error"),
    sent: $("sent"), sentKicker: $("sentKicker"), sentHeading: $("sentHeading"), sentBody: $("sentBody"),
    reset: $("reset")
  };

  var state = {
    mode: cfg.defaultTab === "question" ? "question" : "moment",
    texts: { moment: "", question: "" },
    busy: false
  };

  // ---- Kopf: Datum & Bibelstelle ----
  var now = new Date();
  var dateLabel = now.getDate() + ". " + MONTHS[now.getMonth()];
  el.dateLabel.textContent = dateLabel;
  el.passage.textContent = cfg.passage;
  el.fPassage.value = cfg.passage;
  el.fDate.value = now.toISOString().slice(0, 10);
  el.text.maxLength = cfg.maxChars;

  // ---- Modus wechseln ----
  function setMode(mode) {
    state.mode = mode;
    var c = COPY[mode];
    el.tabs.forEach(function (t) {
      var on = t.dataset.mode === mode;
      t.classList.toggle("is-on", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    el.form.setAttribute("aria-labelledby", "tab-" + mode);
    el.kicker.textContent = c.kicker;
    el.heading.textContent = c.heading;
    el.hint.textContent = c.hint;
    el.text.placeholder = c.placeholder;
    el.send.textContent = c.send;
    el.fArt.value = c.label;
    el.text.value = state.texts[mode];
    hideError();
    updateCounter();
  }

  el.tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      if (t.dataset.mode !== state.mode) setMode(t.dataset.mode);
    });
  });

  // ---- Zähler & Button ----
  function updateCounter() {
    var len = el.text.value.length;
    el.counter.textContent = len + " / " + cfg.maxChars;
    el.counter.classList.toggle("is-max", len >= cfg.maxChars);
    el.send.disabled = el.text.value.trim().length === 0 || state.busy;
  }

  el.text.addEventListener("input", function () {
    if (el.text.value.length > cfg.maxChars) el.text.value = el.text.value.slice(0, cfg.maxChars);
    state.texts[state.mode] = el.text.value;
    hideError();
    updateCounter();
  });

  function showError(msg) {
    if (msg) el.error.textContent = msg;
    el.error.hidden = false;
  }
  function hideError() { el.error.hidden = true; }

  // ---- Versand ----
  function isLocalPreview() {
    var h = location.hostname;
    return location.protocol === "file:" || h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }

  function submit(ev) {
    ev.preventDefault();
    var text = el.text.value.trim();
    if (!text || state.busy) return;

    state.busy = true;
    el.send.classList.add("is-busy");
    el.send.textContent = "Wird gesendet …";
    updateCounter();

    var data = new URLSearchParams(new FormData(el.form));
    data.set("nachricht", text);

    var request = isLocalPreview()
      ? Promise.resolve({ ok: true }) // lokal: nur Vorschau, nichts wird gesendet
      : fetch("/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: data.toString()
        });

    request
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        onSent(state.mode);
      })
      .catch(function (err) {
        console.warn("[MEET] Versand fehlgeschlagen:", err);
        showError("Das hat gerade nicht geklappt. Bitte probier es gleich noch einmal.");
      })
      .then(function () {
        state.busy = false;
        el.send.classList.remove("is-busy");
        el.send.textContent = COPY[state.mode].send;
        updateCounter();
      });
  }

  function onSent(mode) {
    var c = COPY[mode];
    var n = el.name.value.trim();
    var greet = n ? "Danke, " + n : "Danke";
    el.sentKicker.textContent = c.sentKicker;
    el.sentHeading.textContent = c.sentHeading(greet);
    el.sentBody.textContent = c.sentBody;

    state.texts[mode] = "";
    el.text.value = "";

    document.querySelector(".tabs").hidden = true;
    el.form.hidden = true;
    el.sent.hidden = false;
    el.sent.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  el.form.addEventListener("submit", submit);

  el.reset.addEventListener("click", function () {
    el.sent.hidden = true;
    document.querySelector(".tabs").hidden = false;
    el.form.hidden = false;
    hideError();
    updateCounter();
    el.text.focus();
  });

  setMode(state.mode);
})();
