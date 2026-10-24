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
| `kalender/index.html` | **meet-bty.com/kalender** – interner Planungskalender für Niklas, Vincent und Joel (Studio-PIN): Tag/Woche/Monat/Jahr, Aufgaben, Beiträge-Board „Produktion“, Vorlagen, Abwesenheiten, Ablage-Links, Kommentare. Seite aus dem Claude-Artefakt „MEET_ Kalender“ |
| `kalender/sync.js` | Verbindung der Kalender-Seite zum gemeinsamen Speicher (stellt `window.claude.use("db")` wie im Artefakt bereit, fragt alle 20 s nach Änderungen); Schleier für PIN und „Wer bist du?“ |
| `kalender/assistent.js` | Sprach- und Chat-Assistent im Kalender („Sag’s mir“ unten rechts): Spracherkennung des Browsers, schickt Nachricht samt Kalender-Kontext an die Function `assistent`, führt die Aktionen im Speicher aus, Rückgängig je Antwort |
| `netlify/functions/assistent.mjs` | Claude (Opus 5.5, `@anthropic-ai/sdk`) leitet aus dem Chat Kalender-Aktionen ab (anlegen/ändern/löschen von Termin, Aufgabe, Beitrag, Abwesenheit); braucht `ANTHROPIC_API_KEY` auf Netlify; POST mit Studio-PIN |
| `netlify/functions/kalender.mjs` | Speicher des Kalenders: Netlify Blobs (Store `meet-kalender`, ein Eintrag `data.json`, Schreiben nur bei unverändertem ETag), POST mit Studio-PIN |
| `studio/wall/index.html` | **Freigabeseite der MEET WALL** (Studio-PIN): wartende Momente freigeben oder ablehnen, freigegebene wieder von der Wand nehmen |
| `netlify/functions/video.mjs` | **MEET DAILY Videos**: vorsignierte Upload-Adressen für das Studio (PIN), Tagesverzeichnis der beiden Morgen-Videos (GET für die Startseite) |
| `netlify/lib/r2.mjs` | Cloudflare R2 ohne SDK: AWS-Signature-V4-Adressen für PUT/HEAD/DELETE, öffentliche Adresse |
| `netlify/lib/video-store.mjs` | Verzeichnis der Videos: Netlify Blobs (Store `meet-video`), lokal ersatzweise Dateien |
| `netlify/functions/wall.mjs` | Liefert die freigegebenen Momente an die Seite (GET, anonym) und nimmt die Freigabe-Entscheidungen entgegen (POST mit PIN) |
| `netlify/functions/submission-created.mjs` | Läuft bei jeder Formular-Einsendung; legt MEET-Momente mit gesetztem Haken als „wartend“ im Speicher ab |
| `netlify/lib/wall-store.mjs` | Speicher der Wand: Netlify Blobs (Store `meet-wall`), lokal ersatzweise Dateien |
| `package.json` | Abhängigkeiten der Functions (`@netlify/blobs`, `web-push`, `@anthropic-ai/sdk`); `node_modules` wird nicht versioniert und auf der Website gesperrt |
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

## MEET DAILY Videos auf der Startseite

Die beiden Morgen-Videos (05:45 Start, 06:15 MEETmoment) lassen sich im Studio nach dem Export mit
**„Auf meet-bty.com stellen“** direkt hochladen (Studio-PIN nötig). Die Startseite zeigt die Videos des Tages
als Ablauf in zwei Zeilen über „MEET-Moment teilen“: „1 Still werden“ (05:45) und „2 MEETmoment mit Name“ (06:15),
links ein Standbild aus dem Video (das Studio greift es kurz nach der Titelkarte ab) mit Schrittzahl und Play, rechts Titel,
Uhrzeit und Länge; Antippen öffnet den Player. Solange nur das erste Video da ist, steht Schritt 2 gestrichelt als
„MEETmoment · kommt um 06:15“. Ohne Video des Tages ist der Block unsichtbar.
Am **Wochenende** steht oben statt der Bibelstelle „Am Montag geht's weiter.“ und darunter der Zugang
„Wie ist Gott uns in der letzten Woche begegnet?“ – die MEET WALL der letzten sieben Tage, für alle offen.

Dateien: `netlify/functions/video.mjs` (signieren, Tagesverzeichnis, PIN), `netlify/lib/r2.mjs` (vorsignierte
Adressen für Cloudflare R2, AWS Signature V4 ohne SDK), `netlify/lib/video-store.mjs` (Verzeichnis in Netlify Blobs,
Store `meet-video`, Schlüssel `d/<Tag>.json`). Die Videodateien selbst liegen **nicht** auf Netlify (Functions nehmen
höchstens 6 MB an, Bandbreite kostet), sondern bei **Cloudflare R2** (kostenlos bis 10 GB, kein Traffic-Entgelt).
Das Studio lädt mit einer vorsignierten Adresse direkt vom Handy in den Bucket. Pro Morgen und Video gibt es einen
Eintrag; erneutes Hochladen ersetzt das Video, „Von der Startseite nehmen“ löscht es.

Einmalige Einrichtung (Cloudflare-Konto, ca. 10 Minuten):

1. Cloudflare → **R2** → Bucket anlegen, z. B. `meet-daily` (Standort: automatisch / EU).
2. Bucket → **Settings → Public access**: entweder „r2.dev subdomain“ aktivieren (Adresse `https://pub-….r2.dev`)
   oder eine eigene Domain verbinden (z. B. `video.meet-bty.com`, dann über Cloudflare-DNS).
3. Bucket → **Settings → CORS policy** eintragen, damit das Handy direkt hochladen darf:
   ```json
   [{ "AllowedOrigins": ["https://meet-bty.com", "https://www.meet-bty.com"],
      "AllowedMethods": ["PUT", "GET", "HEAD"],
      "AllowedHeaders": ["content-type"],
      "MaxAgeSeconds": 3600 }]
   ```
4. R2 → **Manage R2 API Tokens** → Token anlegen mit „Object Read & Write“, nur für diesen Bucket.
   Notieren: Access Key ID, Secret Access Key; die Account ID steht rechts auf der R2-Übersicht.
5. Netlify → Site → **Environment variables**: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET` (= Name aus Schritt 1), `R2_PUBLIC_URL` (= die echte Adresse aus Schritt 2, z. B. `https://pub-3f9a…c2.r2.dev`
   in voller Länge, ohne Schrägstrich am Ende). `R2_ACCOUNT_ID` darf auch die ganze S3-Adresse sein, die Function liest die ID heraus.
   Wurde der Bucket mit Standort **EU** angelegt, zusätzlich `R2_JURISDICTION` = `eu`.
   Danach einmal neu deployen (Deploys → Trigger deploy).
6. Im Studio nach einem Export unter „meet-bty.com“ auf **„Einrichtung prüfen“** tippen: die Function testet Konto,
   Schlüssel und CORS-Regel und sagt, was fehlt. Schlägt ein Upload fehl, läuft diese Prüfung automatisch.

Solange die Variablen fehlen, meldet der Knopf im Studio „Video-Speicher nicht eingerichtet“; die Startseite bleibt unverändert.

## MEET WALL (Momente der anderen)

Wer einen MEET-Moment schreibt, kann den Haken „Mein Moment darf anonym auf der MEET WALL erscheinen“ setzen
(Opt-in, nur beim MEET-Moment, nicht bei Fragen). Die Wand öffnet sich nach dem Teilen vom Danke-Screen aus: erst teilen, dann sehen.
Danach zeigt der Heute-Screen auf diesem Gerät dauerhaft einen Zugang „MEET WALL“ mit der Zahl der neuen Momente seit dem letzten Blick
(`config.js` → `wallUnlock`: `"always"` = Gerät bleibt freigeschaltet, `"day"` = jeden Tag erst teilen). Offen lädt die Wand jede Minute nach.
Sie zeigt ausschliesslich **freigegebene** Momente, anonym (Text, Uhrzeit), als Pinnwand: kurze Momente nebeneinander, lange über die ganze Breite.
Standardmässig nur der heutige Tag; „Momente der letzten Tage ansehen“ (dezenter Textlink) blendet frühere Tage gruppiert ein.
Der eigene Moment steht sofort oben („Dein MEETmoment · ist unterwegs“, nach der Freigabe „Danke fürs Teilen!“), das merkt sich nur das Gerät (`localStorage`, Schlüssel `meet:wall-own`, 7 Tage).

Ablauf im Hintergrund:

1. Formular → Netlify Forms wie bisher (E-Mail-Benachrichtigung unverändert), neues Feld `wall` = `ja`.
2. Netlify ruft `submission-created.mjs` auf; Momente mit Haken landen als `p/<id>` („wartet“) im Blobs-Store `meet-wall`.
3. **Freigabe** unter `https://meet-bty.com/studio/wall/` mit der Studio-PIN (dieselbe wie im Studio, Umgebungsvariable `STUDIO_PIN`).
   „Freigeben“ schreibt den Moment in `index.json`, das die Wand liest. „Nicht zeigen“ und „Von der Wand nehmen“ verlangen eine kurze Begründung
   (Vorschläge zum Antippen oder eigener Text); sie wird unter `r/<Hash des Textes>` abgelegt, und das Gerät des Absenders fragt sie über `?op=mine`
   (ohne PIN, nur bei exakt bekanntem Text) ab und zeigt sie unter dem eigenen Moment: „diesmal nicht auf der Wand“ plus Begründung.
4. Die Seite holt `/.netlify/functions/wall` bei jedem Öffnen der Wand (15 s Cache, höchstens 150 Einträge, 20 pro Seite).

Voraussetzungen auf Netlify: `STUDIO_PIN` gesetzt; Blobs braucht keine Einrichtung. Datenschutz: freigegebene Momente sind öffentlich, aber ohne Namen;
auf Wunsch (Mail) in der Freigabeseite „Von der Wand nehmen“.

## Lokal ansehen

```bash
python3 -m http.server 8080
```

Dann `http://localhost:8080` öffnen.
