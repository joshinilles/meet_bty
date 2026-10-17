# MEET · meet-bty.com

Landingpage mit anonymem Formular für MEET DAILY (Phase 1 laut CI-Entwurf v0.5).
Statische Seite ohne Build-Schritt: HTML, CSS, ein wenig JavaScript, Brand-Assets.

Version 2 (ab 9. Oktober 2026): drei Screens statt einer langen Seite, inspiriert von der fraenk-App.
Heute (Bibelstelle, eine Frage, ein Button), Schreiben (nur das Textfeld), Danke.
Die alte Version 1 liegt als Tag `v1.0` und Branch `v1-langseite` im Repo.
Der Stand vor der MEET WALL (17. Oktober 2026) liegt als Tag `v2.0-vor-wall` und Branch `v2-vor-wall` im Repo.

Gestaltung nach dem Claude-Design-Entwurf „MEET Impuls“ und dem MEET-Brand-Kit
(Nachtviolett `#2F1041`, Lime `#D4F65A`, körniger Verlauf, Space Grotesk / Geist / Geist Mono).

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | Die Seite: Kopf (MEET_ links, YOUTH b+ rechts) und die drei Screens Heute, Schreiben, Danke |
| `styles.css` | Design-Tokens und Styles |
| `app.js` | Screen-Wechsel, MEET-Moment oder Frage, Versand |
| `motion.js` | Logo-Intro, Sticky-Kopf mit Morph M_ ↔ MEET_, Leerstellen-Logik |
| `homescreen.js` | Hinweis „Leg MEET auf deinen Home-Bildschirm“ – nur auf dem Handy, nicht in der hinzugefügten App; Wegklicken merkt sich das Gerät (`localStorage`, Schlüssel `meet:homescreen-hint`) |
| `config.js` | **Hier täglich die Bibelstelle ändern** (`passage`), stille Zeichen-Obergrenze, **Kanal-Links für `/links`** (`links`) |
| `studio/wall/index.html` | **Freigabeseite der MEET WALL** (Studio-PIN): wartende Momente freigeben oder ablehnen, freigegebene wieder von der Wand nehmen |
| `netlify/functions/wall.mjs` | Liefert die freigegebenen Momente an die Seite (GET, anonym) und nimmt die Freigabe-Entscheidungen entgegen (POST mit PIN) |
| `netlify/functions/submission-created.mjs` | Läuft bei jeder Formular-Einsendung; legt MEET-Momente mit gesetztem Haken als „wartend“ im Speicher ab |
| `netlify/lib/wall-store.mjs` | Speicher der Wand: Netlify Blobs (Store `meet-wall`), lokal ersatzweise Dateien |
| `package.json` | Einzige Abhängigkeit `@netlify/blobs` für die Functions; `node_modules` wird nicht versioniert und auf der Website gesperrt |
| `links/index.html` | Unterseite **meet-bty.com/links**: alle Kanäle auf einen Blick – WhatsApp-Kanal MEET DAILY im Fokus, darunter Instagram, TikTok, YouTube |
| `links/links.js` | Baut die Kanal-Liste aus `config.js` (`links`), Plattform-Symbole, Kopf beim Scrollen |
| `manifest.webmanifest` | Web-App auf dem Home-Bildschirm (Icon = Signet; `assets/apple-touch-icon.png`, `icon-192.png`, `icon-maskable-512.png` sind vollflächig violett, weil iPhone und Android durchsichtige Ecken sonst schwarz oder weiss füllen) |
| `netlify.toml` | Hosting-Header (Cache, Sicherheit) |
| `assets/` | Logos, Signets, Verläufe, Schriften (SIL Open Font License 1.1) |

## Bibelstelle des Tages ändern

In `config.js` den Wert `passage` anpassen, committen, pushen. Netlify deployt automatisch.

## Kanäle auf meet-bty.com/links

Die Seite `/links` ist der Link-Baum für die Bio auf Instagram, TikTok und YouTube.
Welche Kanäle dort stehen, steht in `config.js` unter `links`:

- `whatsapp`: Einladungslink des öffentlichen WhatsApp-Kanals MEET DAILY (WhatsApp → Kanal → Kanalinfo → „Link kopieren“).
  Solange er leer ist, zeigt der grosse Knopf „Link folgt“.
- `social`: eine Zeile je Kanal mit `id` (Symbol: `instagram`, `tiktok`, `youtube`, `podcast`, sonst Pfeil), `name`, `url`,
  optional `handle` (sonst wird „@name“ aus dem Link gelesen). Einträge mit leerer `url` werden nicht angezeigt.
- Podcast-Kanäle (Spotify, Apple Podcasts) sind als Kommentar vorbereitet und werden ergänzt, sobald der Podcast eingerichtet ist.

## Formular (Netlify Forms)

Das Formular heisst `meet-impuls` und wird per Netlify Forms entgegengenommen.
Felder: `art` (MEET-Moment / Frage zum Text), `nachricht`, `vorname` (optional), `bibelstelle`, `datum`.
Ein verstecktes Honeypot-Feld `bot-field` filtert Spam.

Einmalig in Netlify prüfen:

1. Site → **Forms** → Form detection aktivieren (falls noch nicht geschehen) und einmal neu deployen.
2. Unter **Forms → Notifications** eine E-Mail-Benachrichtigung einrichten, damit das Team jede Nachricht sofort bekommt.

Lokal (file:// oder localhost) darf der Versand scheitern, die Erfolgskarte erscheint trotzdem als Vorschau.

## MEET WALL (Momente der anderen)

Wer einen MEET-Moment schreibt, kann den Haken „Mein Moment darf anonym auf der MEET WALL erscheinen“ setzen
(Opt-in, nur beim MEET-Moment, nicht bei Fragen). Die Wand öffnet sich nach dem Teilen vom Danke-Screen aus: erst teilen, dann sehen.
Danach zeigt der Heute-Screen auf diesem Gerät dauerhaft einen Zugang „MEET WALL“ mit der Zahl der neuen Momente seit dem letzten Blick
(`config.js` → `wallUnlock`: `"always"` = Gerät bleibt freigeschaltet, `"day"` = jeden Tag erst teilen). Offen lädt die Wand jede Minute nach.
Sie zeigt ausschliesslich **freigegebene** Momente, anonym (Text, Uhrzeit), als Pinnwand: kurze Momente nebeneinander, lange über die ganze Breite.
Standardmässig nur der heutige Tag; „Momente der letzten Tage ansehen“ (dezenter Textlink) blendet frühere Tage gruppiert ein.
Der eigene Moment steht sofort oben („Dein Moment · ist unterwegs“, nach der Freigabe „auf der Wand“), das merkt sich nur das Gerät (`localStorage`, Schlüssel `meet:wall-own`, 7 Tage).

Ablauf im Hintergrund:

1. Formular → Netlify Forms wie bisher (E-Mail-Benachrichtigung unverändert), neues Feld `wall` = `ja`.
2. Netlify ruft `submission-created.mjs` auf; Momente mit Haken landen als `p/<id>` („wartet“) im Blobs-Store `meet-wall`.
3. **Freigabe** unter `https://meet-bty.com/studio/wall/` mit der Studio-PIN (dieselbe wie im Studio, Umgebungsvariable `STUDIO_PIN`).
   „Freigeben“ schreibt den Moment in `index.json`, das die Wand liest; „Nicht zeigen“ legt ihn als abgelehnt ab. Freigegebene lassen sich jederzeit wieder von der Wand nehmen.
4. Die Seite holt `/.netlify/functions/wall` bei jedem Öffnen der Wand (15 s Cache, höchstens 150 Einträge, 20 pro Seite).

Voraussetzungen auf Netlify: `STUDIO_PIN` gesetzt; Blobs braucht keine Einrichtung. Datenschutz: freigegebene Momente sind öffentlich, aber ohne Namen;
auf Wunsch (Mail) in der Freigabeseite „Von der Wand nehmen“.

## Lokal ansehen

```bash
python3 -m http.server 8080
```

Dann `http://localhost:8080` öffnen.
