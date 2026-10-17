// MEET · meet-bty.com – Tageskonfiguration
// Hier anpassen, was sich ändert. Nach dem Speichern committen und pushen – Netlify deployt automatisch.
window.MEET_CONFIG = {
  // Bibelstelle des Tages (steht gross auf dem Startscreen und wird mit jeder Nachricht mitgeschickt)
  passage: "Johannes 4,1–26",

  // Stille Obergrenze pro Nachricht (kein Zähler sichtbar, damit niemand Angst hat, zu viel zu schreiben)
  maxChars: 2000,

  // Kanäle auf meet-bty.com/links – Reihenfolge hier = Reihenfolge auf der Seite.
  // Leere URL = der Eintrag wird nicht angezeigt (beim WhatsApp-Kanal steht dann „Link folgt“ auf dem Knopf).
  links: {
    // Einladungslink des öffentlichen WhatsApp-Kanals MEET DAILY:
    // WhatsApp → Kanal öffnen → Kanalinfo → „Link kopieren“ (sieht so aus: https://whatsapp.com/channel/0029V…)
    whatsapp: "https://whatsapp.com/channel/0029Vb9lrj9E50UouYa6c20h",

    // Social Media: Handle überall @meet_bty (Anzeigename „MEET_“). "handle" nur angeben, wenn der
    // angezeigte Name vom Link abweichen soll – sonst wird er aus dem Link gelesen.
    social: [
      { id: "instagram", name: "Instagram", url: "https://www.instagram.com/meet_bty" },
      { id: "tiktok",    name: "TikTok",    url: "https://www.tiktok.com/@meet_bty" },
      { id: "youtube",   name: "YouTube",   url: "https://www.youtube.com/@meet_bty" }
      // Podcast MEET US – folgt, sobald eingerichtet (Komma oben ergänzen, Zeilen einkommentieren):
      // { id: "podcast", name: "Spotify",        url: "", handle: "MEET US" },
      // { id: "podcast", name: "Apple Podcasts", url: "", handle: "MEET US" }
    ]
  }
};
