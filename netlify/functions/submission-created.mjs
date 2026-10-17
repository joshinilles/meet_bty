// Läuft bei jeder geprüften Formular-Einsendung (Netlify Forms, Formular "meet-impuls").
// Nur MEET-Momente mit gesetztem Haken "wall" landen als wartender Moment im Speicher der MEET WALL;
// Fragen zum Text und Momente ohne Haken werden hier ignoriert (die E-Mail-Benachrichtigung bleibt davon unberührt).
import { wallStore, writeJson, newId } from '../lib/wall-store.mjs';

const clean = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');

export async function storeSubmission(data) {
  if (!data || clean(data.wall, 10).toLowerCase() !== 'ja') return { stored: false, why: 'kein Haken' };
  if (clean(data.art, 40) !== 'MEET-Moment') return { stored: false, why: 'keine MEET-Moment-Einsendung' };
  const text = clean(data.nachricht, 2000);
  if (!text) return { stored: false, why: 'leerer Text' };
  const m = {
    id: newId(),
    text,
    passage: clean(data.bibelstelle, 80),
    date: clean(data.datum, 10),
    ts: new Date().toISOString(),
    status: 'wartet'
  };
  wallStore();
  await writeJson('p/' + m.id, m);
  return { stored: true, id: m.id };
}

export default {
  async formSubmitted(event) {
    try {
      const r = await storeSubmission(event && event.data);
      console.log('[wall] Einsendung', r.stored ? 'gespeichert ' + r.id : 'übersprungen (' + r.why + ')');
    } catch (e) {
      console.error('[wall] Speichern fehlgeschlagen:', e && e.message ? e.message : e);
    }
  }
};
