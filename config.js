// MEET · meet-bty.com – Tageskonfiguration
// Hier anpassen, was sich ändert. Nach dem Speichern committen und pushen – Netlify deployt automatisch.
window.MEET_CONFIG = {
  // Bibelstelle des Tages kommt aus dem MEET DAILY Jahresplan (Google Sheet, dieselbe Tabelle wie im Studio):
  // Spalten „Datum“ und „Bibelstelle“, eine Zeile pro Morgen. Leer lassen = nur „passage“ unten wird gezeigt.
  planUrl: "https://docs.google.com/spreadsheets/d/155HIyzhT3HrH0t4rUXvIo6OKAMxmB5EHVenSIdn8RBE/gviz/tq?tqx=out:csv",

  // Rückfall, falls das Sheet nicht erreichbar ist oder für heute keine Zeile hat
  // (steht gross auf dem Startscreen und wird mit jeder Nachricht mitgeschickt)
  passage: "1. Johannes 1,5–2,2",

  // Stille Obergrenze pro Nachricht (kein Zähler sichtbar, damit niemand Angst hat, zu viel zu schreiben)
  maxChars: 2000,

  // MEET WALL: seit 26.10.2026 für alle offen – die Wand ist auf dem Heute-Screen immer erreichbar, auch ohne eigenen Moment.
  // (Frühere Einstellung "always"/"day" = Freischalten erst nach dem Teilen; wird nicht mehr ausgewertet.)
  wallUnlock: "open",

  // Kanäle auf meet-bty.com/links – Reihenfolge hier = Reihenfolge auf der Seite.
  // Leere URL = der Eintrag wird nicht angezeigt. Symbol über "id": instagram, tiktok, youtube, spotify, podcast, sonst Kette.
  // "handle" nur angeben, wenn der angezeigte Name vom Link abweichen soll – sonst wird „@name“ aus dem Link gelesen.
  links: {
    // Im Fokus: die MEET App (die Startseite). Hier läuft seit Oktober 2026 alles zusammen – der WhatsApp-Kanal wird nicht mehr genannt.
    app: "/",

    // Social Media: Handle überall @meet_bty (Anzeigename „MEET_“).
    social: [
      { id: "instagram", name: "Instagram", url: "https://www.instagram.com/meet_bty" },
      { id: "tiktok",    name: "TikTok",    url: "https://www.tiktok.com/@meet_bty" },
      { id: "youtube",   name: "YouTube",   url: "https://www.youtube.com/@meet_bty" }
    ],

    // Podcast MEET US – weitere Plattformen (z. B. Apple Podcasts, id "podcast") einfach als Zeile ergänzen.
    podcast: [
      { id: "spotify", name: "Spotify", url: "https://open.spotify.com/show/7BCfZlb4OuptV75n4Jxa1f", handle: "MEET US – der Podcast" }
    ]
  },

  // Vorschau: die Startseite zeigt bis „until“ den Tag „day“ (Wochentag, Datum, Bibelstelle aus dem Jahresplan) –
  // z. B. am Sonntag schon den Montag, um ein Erklärvideo zu drehen. Läuft von selbst ab; die Videos bleiben die von heute.
  // Ohne Deploy geht dasselbe mit ?vorschau=2026-10-26 hinter der Adresse. Zum Abschalten: preview: null.
  preview: { day: "2026-10-26", until: "2026-10-26T04:00:00+01:00" },

  // Push-Benachrichtigung („Sag mir Bescheid, wenn die Antwort da ist“): öffentlicher VAPID-Schlüssel.
  // Der private Schlüssel liegt NUR auf Netlify (Umgebungsvariable VAPID_PRIVATE_KEY, dazu VAPID_SUBJECT = mailto:…).
  pushKey: "BMFvrYJWGGKhSuFYq4USrEY9Tw4ZLJQhvNOssjrgCkATdZh4P-JnenHfSAsGv769FwDbw9EF7KIKDa1N24CKtQc"
};
