// Läuft bei jeder geprüften Formular-Einsendung (Netlify Forms, Formular "meet-impuls").
// MEET-Momente mit gesetztem Haken "wall" landen als wartender Moment im Speicher der MEET WALL (p/<id>).
// Fragen zum Text landen unter q/<id>, damit die Moderatoren sie auf der Prüfseite im Überblick sehen (nie auf der Wand).
// Momente ohne Haken werden ignoriert (die E-Mail-Benachrichtigung bleibt in allen Fällen unberührt).
import { writeJson, newId } from '../lib/wall-store.mjs';

const clean = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');

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
    await writeJson('q/' + q.id, q);
    return { stored: true, id: q.id, kind: 'frage' };
  }
  if (clean(data.wall, 10).toLowerCase() !== 'ja') return { stored: false, why: 'kein Haken' };
  if (art !== 'MEET-Moment') return { stored: false, why: 'keine MEET-Moment-Einsendung' };
  const m = {
    id: newId(),
    text,
    passage: clean(data.bibelstelle, 80),
    date: clean(data.datum, 10),
    ts: new Date().toISOString(),
    status: 'wartet'
  };
  await writeJson('p/' + m.id, m);
  return { stored: true, id: m.id };
}

export default {
  async formSubmitted(event) {
    try {
      const r = await storeSubmission(event && event.data);
      console.log('[wall] Einsendung', r.stored ? 'gespeichert ' + (r.kind || 'moment') + ' ' + r.id : 'übersprungen (' + r.why + ')');
    } catch (e) {
      console.error('[wall] Speichern fehlgeschlagen:', e && e.message ? e.message : e);
    }
  }
};
