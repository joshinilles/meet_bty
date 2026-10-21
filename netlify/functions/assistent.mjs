// MEET_ Kalender-Assistent: nimmt einen Chat-Verlauf (gesprochen oder getippt) entgegen und lässt Claude daraus
// Kalender-Aktionen ableiten (Termin, Aufgabe, Beitrag, Abwesenheit anlegen, ändern, löschen). Ausgeführt werden die
// Aktionen von der Seite selbst (kalender/assistent.js) über den gemeinsamen Speicher – so greifen Rückgängig und
// die laufende Ansicht wie bei Handeingaben.
//   POST  (Studio-PIN)  Body { messages:[{role:"user"|"assistant", content:"…"}], kontext:{…} }
//         → { antwort:"…", aktionen:[{op, art, id?, felder}], nachfrage:boolean }
// Schlüssel: ANTHROPIC_API_KEY auf Netlify. Lokal: ASSISTENT_MOCK=1 liefert eine feste Antwort ohne API-Aufruf.
import Anthropic from '@anthropic-ai/sdk';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, x-studio-pin' };
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const msg = (e) => (e && e.message) || String(e);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const MODEL = 'claude-opus-5-5';

const SYSTEM = `Du bist der Assistent des MEET_ Kalenders – dem Planungskalender des Teams von bibletunes Youth (Niklas, Vincent und Joel, der Cutter). Die Leute sprechen oder tippen dir, was sie planen wollen; du setzt es direkt im Kalender um und antwortest kurz, freundlich, auf Deutsch (Schweizer Schreibweise: „ss“ statt „ß“, du-Form).

Du bekommst im ersten User-Block einen JSON-Kontext: heutiges Datum, wer gerade spricht („ich“), Personen, Bereiche, die Einträge der nächsten Wochen (Termine, offene Aufgaben, Beiträge, Abwesenheiten – jeweils mit id). Nutze ihn, um bestehende Einträge zu ändern oder zu löschen („verschieb den Dreh auf Freitag“, „die Aufgabe ist erledigt“) und um Abwesenheiten zu beachten (warnen, wenn jemand abwesend ist).

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Erklärtext davor oder danach, ohne Markdown-Zaun:
{"antwort": "kurze Rückmeldung in 1–2 Sätzen", "aktionen": [ … ], "nachfrage": false}

Jede Aktion: {"op": "anlegen" | "aendern" | "loeschen", "art": "termin" | "aufgabe" | "beitrag" | "abwesenheit", "id": "nur bei aendern/loeschen", "felder": { … }}
Felder je Art (nur setzen, was du weisst oder sinnvoll ableiten kannst; bei aendern nur die geänderten Felder):
- termin: titel, datum (YYYY-MM-DD), von (HH:MM), bis (HH:MM), ganztag (true/false), bereich (id), wer (id oder "beide" = alle), ort, notiz, link, wiederholung ("" | "woechentlich" | "taeglich" | "monatlich"), wiederholungBis (YYYY-MM-DD)
- aufgabe: titel, bereich, wer, prio ("normal" | "hoch"), genau eines von datum (YYYY-MM-DD) | woche (YYYY-Www, ISO-Kalenderwoche) | monat (YYYY-MM) – oder keines von dreien für „irgendwann“; erledigt (true/false), notiz, link
- beitrag: titel, bereich, wer, status ("idee" | "gedreht" | "schnitt" | "freigabe" | "veroeffentlicht"), datum (Veröffentlichung, optional), link, notiz
- abwesenheit: titel (Grund, z. B. Ferien), wer, von (YYYY-MM-DD), bis (YYYY-MM-DD), notiz

Regeln:
- Datumsangaben wie „morgen“, „nächsten Donnerstag“, „übernächste Woche“ rechnest du vom heutigen Datum aus. Wochen beginnen am Montag. „Diese Woche“ ohne Tag → Aufgabe mit woche. Ein Termin ohne Uhrzeit → ganztag true, ausser eine Uhrzeit ist genannt (Dauer ohne Ende: eine Stunde).
- Wer: wenn nichts gesagt wird, ist es die sprechende Person („ich“); „wir“/„alle“ → "beide". Bereich: aus dem Inhalt ableiten (MEET DAILY, MEET2gether, MEET US/Podcast, Studio & Dreh, Social & Content, Team), sonst "sonstiges".
- Ist etwas Wesentliches unklar (welcher Tag, welcher Eintrag gemeint ist), lege nichts an, sondern stelle eine kurze Rückfrage: "aktionen": [], "nachfrage": true.
- Mehrere Wünsche in einer Nachricht → mehrere Aktionen. Beim Löschen nur den gemeinten Eintrag (id aus dem Kontext).
- Fragen zum Kalender („was steht morgen an?“) beantwortest du aus dem Kontext ohne Aktionen.
- Die Antwort nennt, was du angelegt oder geändert hast (Wochentag, Datum, Uhrzeit), damit die Person es prüfen kann.`;

function mock(messages) {
  const last = String((messages[messages.length - 1] || {}).content || '');
  const t = new Date(); t.setDate(t.getDate() + 1);
  const d = t.toISOString().slice(0, 10);
  if (/frage|\?$/i.test(last)) return { antwort: 'Attrappe: Rückfrage – welcher Tag ist gemeint?', aktionen: [], nachfrage: true };
  return { antwort: 'Attrappe: Termin „' + last.slice(0, 40) + '“ morgen um 10:00 angelegt.', aktionen: [{ op: 'anlegen', art: 'termin', felder: { titel: last.slice(0, 60), datum: d, von: '10:00', bis: '11:00', ganztag: false, bereich: 'studio', wer: 'beide' } }], nachfrage: false };
}

function parseAnswer(text) {
  const raw = String(text || '').trim();
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a < 0 || b <= a) return { antwort: raw || 'Ich habe nichts verstanden.', aktionen: [], nachfrage: false };
  try {
    const j = JSON.parse(raw.slice(a, b + 1));
    return { antwort: String(j.antwort || ''), aktionen: Array.isArray(j.aktionen) ? j.aktionen.filter(isObj) : [], nachfrage: !!j.nachfrage };
  } catch (e) {
    return { antwort: raw, aktionen: [], nachfrage: false };
  }
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);

  const pin = process.env.STUDIO_PIN || '';
  if (!pin) return json({ error: 'STUDIO_PIN ist auf Netlify nicht gesetzt' }, 503);
  let sent = ''; try { sent = decodeURIComponent(req.headers.get('x-studio-pin') || ''); } catch (e) { }
  if (sent !== pin) return json({ error: 'Studio-PIN fehlt oder falsch' }, 401);

  let body = {}; try { body = await req.json(); } catch (e) { }
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => isObj(m) && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') return json({ error: 'Nachricht fehlt' }, 400);
  const kontext = isObj(body.kontext) ? body.kontext : {};

  if (process.env.ASSISTENT_MOCK) return json(mock(messages));
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY ist auf Netlify nicht gesetzt – der Assistent kann noch nicht antworten.' }, 503);

  // Kontext als erster User-Block, dann der Verlauf. Der erste Verlaufseintrag bekommt den Kontext vorangestellt.
  const ctxText = 'KONTEXT (JSON):\n' + JSON.stringify(kontext).slice(0, 60000) + '\n\nNACHRICHT:\n';
  const apiMessages = messages.map((m, i) => (i === 0 ? { role: 'user', content: ctxText + m.content } : m));

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: apiMessages,
    });
    if (response.stop_reason === 'refusal') return json({ antwort: 'Das kann ich hier nicht umsetzen.', aktionen: [], nachfrage: false });
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const out = parseAnswer(text);
    if (response.stop_reason === 'max_tokens') out.antwort = out.antwort || 'Die Antwort wurde abgeschnitten – bitte kürzer fragen.';
    return json(out);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'Der API-Schlüssel auf Netlify ist ungültig.' }, 503);
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Zu viele Anfragen – bitte gleich nochmals.' }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: 'Claude-Fehler ' + e.status + ': ' + msg(e) }, 502);
    return json({ error: 'Keine Verbindung zu Claude: ' + msg(e) }, 502);
  }
};
