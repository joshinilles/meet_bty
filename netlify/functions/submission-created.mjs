// Läuft bei jeder geprüften Formular-Einsendung (Netlify Forms, Formular "meet-impuls").
// MEET-Momente mit gesetztem Haken "wall" landen als wartender Moment im Speicher der MEET WALL (p/<id>).
// Fragen zum Text landen unter q/<id>, damit die Moderatoren sie auf der Prüfseite im Überblick sehen (nie auf der Wand).
// Momente OHNE Haken werden NICHT gespeichert (seit 26.10.2026, Privatsphäre): die App schickt sie gar nicht erst ab; kommt
// trotzdem einer an (alte App-Fassung), wird er hier übersprungen.
// Nach dem Speichern bekommen die angemeldeten Moderator-Geräte (Portal → „Bescheid sagen“) eine Push-Benachrichtigung.
import { writeJson, newId } from '../lib/wall-store.mjs';
import { notifyModerators, moderatorPayload } from '../lib/push.mjs';

const clean = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');
// Schreiben mit drei Anläufen: ein kurzer Aussetzer bei Netlify Blobs darf keine Frage verschlucken (die E-Mail kommt unabhängig davon)
async function writeRetry(key, obj) {
  let last;
  for (let i = 0; i < 3; i++) {
    try { await writeJson(key, obj); return; }
    catch (e) { last = e; console.warn('[wall] Schreiben von ' + key + ' gescheitert (Versuch ' + (i + 1) + '):', e && e.message ? e.message : e); await new Promise((r) => setTimeout(r, 400 * (i + 1))); }
  }
  throw last;
}

export async function storeSubmission(data) {
  if (!data) return { stored: false, why: 'keine Daten' };
  const art = clean(data.art, 40);
  const text = clean(data.nachricht, 2000);
  if (!text) return { stored: false, why: 'leerer Text' };
  if (art === 'Frage zum Text') {
    const q = {
      id: newId(),
      text,
      name: clean(data.vorname, 40),
      passage: clean(data.bibelstelle, 80),
      date: clean(data.datum, 10),
      ts: new Date().toISOString()
    };
    await writeRetry('q/' + q.id, q);
    const push = await notifyModerators(moderatorPayload.question(q));
    return { stored: true, id: q.id, kind: 'frage', push };
  }
  if (art !== 'MEET-Moment') return { stored: false, why: 'keine MEET-Moment-Einsendung' };
  if (clean(data.wall, 10).toLowerCase() !== 'ja') return { stored: false, why: 'privater Moment (ohne Haken) – wird nicht gespeichert' };
  const m = {
    id: newId(),
    text,
    passage: clean(data.bibelstelle, 80),
    date: clean(data.datum, 10),
    ts: new Date().toISOString(),
    status: 'wartet'
  };
  await writeRetry('p/' + m.id, m);
  const push = await notifyModerators(moderatorPayload.moment(m));
  return { stored: true, id: m.id, push };
}

export default {
  async formSubmitted(event) {
    try {
      const r = await storeSubmission(event && event.data);
      console.log('[wall] Einsendung', r.stored ? 'gespeichert ' + (r.kind || 'moment') + ' ' + r.id + (r.push ? ' · Push an ' + r.push.sent + '/' + r.push.total + ' Moderator-Geräte' : '') : 'übersprungen (' + r.why + ')');
    } catch (e) {
      console.error('[wall] Speichern fehlgeschlagen:', e && e.message ? e.message : e);
    }
  }
};
