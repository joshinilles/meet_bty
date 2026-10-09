# MEET · meet-bty.com

Landingpage mit anonymem Formular für MEET DAILY (Phase 1 laut CI-Entwurf v0.5).
Statische Seite ohne Build-Schritt: HTML, CSS, ein wenig JavaScript, Brand-Assets.

Version 2 (ab 9. Oktober 2026): drei Screens statt einer langen Seite, inspiriert von der fraenk-App.
Heute (Bibelstelle, eine Frage, ein Button), Schreiben (nur das Textfeld), Danke.
Die alte Version 1 liegt als Tag `v1.0` und Branch `v1-langseite` im Repo.

Gestaltung nach dem Claude-Design-Entwurf „MEET Impuls“ und dem MEET-Brand-Kit
(Nachtviolett `#2F1041`, Lime `#D4F65A`, körniger Verlauf, Space Grotesk / Geist / Geist Mono).

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | Die Seite: Kopf (MEET_ links, YOUTH b+ rechts) und die drei Screens Heute, Schreiben, Danke |
| `styles.css` | Design-Tokens und Styles |
| `app.js` | Screen-Wechsel, MEET-Moment oder Frage, Versand |
| `motion.js` | Logo-Intro, Sticky-Kopf mit Morph M_ ↔ MEET_, Leerstellen-Logik |
| `homescreen.js` | Hinweis „MEET auf den Home-Bildschirm“ fürs Handy |
| `homescreen.js` | Hinweis „Leg MEET auf deinen Home-Bildschirm“ – nur auf dem Handy, nicht in der hinzugefügten App; Wegklicken merkt sich das Gerät (`localStorage`, Schlüssel `meet:homescreen-hint`) |
| `config.js` | **Hier täglich die Bibelstelle ändern** (`passage`), stille Zeichen-Obergrenze |
| `manifest.webmanifest` | Web-App auf dem Home-Bildschirm (Icon = Signet; `assets/apple-touch-icon.png`, `icon-192.png`, `icon-maskable-512.png` sind vollflächig violett, weil iPhone und Android durchsichtige Ecken sonst schwarz oder weiss füllen) |
| `netlify.toml` | Hosting-Header (Cache, Sicherheit) |
| `assets/` | Logos, Signets, Verläufe, Schriften (SIL Open Font License 1.1) |

## Bibelstelle des Tages ändern

In `config.js` den Wert `passage` anpassen, committen, pushen. Netlify deployt automatisch.

## Formular (Netlify Forms)

Das Formular heisst `meet-impuls` und wird per Netlify Forms entgegengenommen.
Felder: `art` (MEET-Moment / Frage zum Text), `nachricht`, `vorname` (optional), `bibelstelle`, `datum`.
Ein verstecktes Honeypot-Feld `bot-field` filtert Spam.

Einmalig in Netlify prüfen:

1. Site → **Forms** → Form detection aktivieren (falls noch nicht geschehen) und einmal neu deployen.
2. Unter **Forms → Notifications** eine E-Mail-Benachrichtigung einrichten, damit das Team jede Nachricht sofort bekommt.

Lokal (file:// oder localhost) wird nichts gesendet, die Erfolgskarte erscheint trotzdem als Vorschau.

## Lokal ansehen

```bash
python3 -m http.server 8080
```

Dann `http://localhost:8080` öffnen.
