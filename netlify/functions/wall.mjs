// MEET WALL: liefert die freigegebenen Momente aus (GET, öffentlich, anonym) und
// nimmt die Freigabe-Entscheidungen der Prüfseite entgegen (POST mit Studio-PIN, ?op=…).
//   GET  /.netlify/functions/wall                      → { items: [{id,text,passage,date,ts}], updated }
//   POST ?op=pending   (PIN)                            → { items: wartende Momente }
//   POST ?op=approved  (PIN)                            → { items: freigegebene Momente }
//   POST ?op=approve, Body {id}                         → { ok, id }
//   POST ?op=reject | unpublish, Body {id, reason}      → { ok, id }  (reason = kurze Begründung für den Absender)
//   POST ?op=questions (PIN)                           → { items: offene Fragen zum Text (mit Name, nie auf der Wand) }
//   POST ?op=questions-done (PIN)                      → { items: erledigte Fragen, neueste zuerst (mit Antwort) }
//   POST ?op=question-answer, Body {id, answer, by}     → { ok, id }  (Frage beantworten: q/ → qd/, Antwort unter qa/<hash> für den Fragenden; by = Name)
//   POST ?op=question-done, Body {id}                   → { ok, id }  (Frage ohne Antwort ablegen: q/ → qd/)
//   POST ?op=subscribe, Body {sub:{endpoint,keys}, questions:[…]} (ohne PIN)
//        → { ok, n }  Push-Abo für die eigenen offenen Fragen hinterlegen (s/<hash>); bei der Antwort geht eine Push raus
//   POST ?op=mine, Body {texts:[…], questions:[…]} (ohne PIN)
//        → { items: [{status: frei|nein|wartet, reason}], questions: [{status: offen|beantwortet, answer, by, answeredAt}] }
//          Stand der eigenen Momente und Fragen (nur bei exakt bekanntem Text)
// PIN: Header x-studio-pin = Umgebungsvariable STUDIO_PIN (dieselbe wie im MEET DAILY Studio).
import { readJson, writeJson, remove, listKeys, readIndex, writeIndex, publicView, normText, textHash } from '../lib/wall-store.mjs';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, x-studio-pin' };
const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  if (req.method === 'GET') {
    try {
      const items = (await readIndex()).map(publicView);
      return json({ items, updated: new Date().toISOString() }, 200, { 'Cache-Control': 'public, max-age=15' });
    } catch (e) {
      return json({ error: 'Wand gerade nicht erreichbar: ' + msg(e) }, 502);
    }
  }
  if (req.method !== 'POST') return json({ error: 'Nur GET oder POST' }, 405);

  const op = new URL(req.url).searchParams.get('op') || '';
  let body = {}; try { body = await req.json(); } catch (e) { }

  // Ohne PIN: das Gerät des Absenders fragt nach dem Stand seiner eigenen Momente (nur bei exakt bekanntem Text)
  // Ohne PIN: Push-Abo für die eigenen Fragen hinterlegen („Sag mir Bescheid, wenn die Antwort da ist“)
  if (op === 'subscribe') {
    const sub = body.sub && typeof body.sub === 'object' ? body.sub : null;
    const qs = Array.isArray(body.questions) ? body.questions.filter((t) => typeof t === 'string' && t.trim()).slice(0, 5) : [];
    if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      return json({ error: 'Push-Abo unvollständig' }, 400);
    }
    if (!qs.length) return json({ ok: true, n: 0 });
    try {
      const clean = { endpoint: sub.endpoint.slice(0, 1000), keys: { p256dh: String(sub.keys.p256dh).slice(0, 200), auth: String(sub.keys.auth).slice(0, 100) } };
      await Promise.all(qs.map((t) => writeJson('s/' + textHash(t), { sub: clean, at: new Date().toISOString() })));
      return json({ ok: true, n: qs.length });
    } catch (e) {
      return json({ error: msg(e) }, 502);
    }
  }

  if (op === 'mine') {
    const strs = (a) => (Array.isArray(a) ? a.filter((t) => typeof t === 'string').slice(0, 5) : []);
    const texts = strs(body.texts), qs = strs(body.questions);
    try {
      const approved = texts.length ? new Set((await readIndex()).map((m) => normText(m.text))) : new Set();
      const items = await Promise.all(texts.map(async (t) => {
        if (approved.has(normText(t))) return { status: 'frei' };
        const r = await readJson('r/' + textHash(t), null);
        return r ? { status: 'nein', reason: r.reason || '' } : { status: 'wartet' };
      }));
      const questions = await Promise.all(qs.map(async (t) => {
        const a = await readJson('qa/' + textHash(t), null);
        return a ? { status: 'beantwortet', answer: a.answer || '', by: a.by || '', answeredAt: a.answeredAt || '' } : { status: 'offen' };
      }));
      return json({ items, questions });
    } catch (e) {
      return json({ error: msg(e) }, 502);
    }
  }

  const pin = process.env.STUDIO_PIN || '';
  if (!pin) return json({ error: 'STUDIO_PIN ist auf Netlify nicht gesetzt' }, 503);
  let sent = ''; try { sent = decodeURIComponent(req.headers.get('x-studio-pin') || ''); } catch (e) { }
  if (sent !== pin) return json({ error: 'Studio-PIN fehlt oder falsch' }, 401);

  const id = typeof body.id === 'string' && /^[a-z0-9-]{6,40}$/.test(body.id) ? body.id : '';
  const reason = typeof body.reason === 'string' ? body.reason.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  const answer = typeof body.answer === 'string' ? body.answer.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, 1200) : '';
  const by = typeof body.by === 'string' ? body.by.replace(/\s+/g, ' ').trim().slice(0, 40) : '';

  try {
    if (op === 'pending') {
      const keys = await listKeys('p/');
      const items = (await Promise.all(keys.map((k) => readJson(k, null)))).filter(Boolean);
      items.sort((a, b) => (a.ts < b.ts ? 1 : -1));
      return json({ items });
    }
    if (op === 'approved') return json({ items: await readIndex() });
    if (op === 'questions') {
      const keys = await listKeys('q/');
      const items = (await Promise.all(keys.map((k) => readJson(k, null)))).filter(Boolean);
      items.sort((a, b) => (a.ts < b.ts ? 1 : -1));
      return json({ items });
    }
    if (op === 'questions-done') {
      const keys = await listKeys('qd/');
      const items = (await Promise.all(keys.map((k) => readJson(k, null)))).filter(Boolean);
      items.sort((a, b) => ((a.doneAt || a.ts) < (b.doneAt || b.ts) ? 1 : -1));
      return json({ items: items.slice(0, 100) });
    }
    if (!id) return json({ error: 'id fehlt' }, 400);

    // Frage beantworten (Antwort landet beim Fragenden) oder ohne Antwort ablegen
    if (op === 'question-answer' || op === 'question-done') {
      if (op === 'question-answer' && !answer) return json({ error: 'Bitte eine Antwort schreiben' }, 400);
      const q = await readJson('q/' + id, null) || await readJson('qd/' + id, null);
      if (!q) return json({ error: 'Frage nicht gefunden' }, 404);
      q.doneAt = new Date().toISOString();
      if (op === 'question-answer') {
        q.answer = answer;
        q.by = by;
        q.answeredAt = q.doneAt;
        await writeJson('qa/' + textHash(q.text), { answer, by, answeredAt: q.answeredAt, id });
      }
      await writeJson('qd/' + id, q);
      await remove('q/' + id);
      // Push an das Gerät, das gefragt hat (falls es eins hinterlegt hat); scheitert leise, die Antwort steht trotzdem
      let pushed = false;
      if (op === 'question-answer') pushed = await pushAnswer(q);
      return json({ ok: true, id, pushed });
    }

    if (op === 'approve' || op === 'reject') {
      if (op === 'reject' && !reason) return json({ error: 'Bitte eine kurze Begründung angeben' }, 400);
      const m = await readJson('p/' + id, null) || await readJson('d/' + id, null);
      if (!m) return json({ error: 'Moment nicht gefunden' }, 404);
      m.status = op === 'approve' ? 'frei' : 'nein';
      m.decidedAt = new Date().toISOString();
      if (op === 'reject') m.reason = reason;
      await writeJson('d/' + id, m);
      await remove('p/' + id);
      if (op === 'reject') await writeJson('r/' + textHash(m.text), { reason, decidedAt: m.decidedAt });
      else await remove('r/' + textHash(m.text));
      const idx = (await readIndex()).filter((x) => x.id !== id);
      if (m.status === 'frei') idx.unshift(publicView(m));
      await writeIndex(idx);
      return json({ ok: true, id, status: m.status });
    }
    if (op === 'unpublish') {
      if (!reason) return json({ error: 'Bitte eine kurze Begründung angeben' }, 400);
      const m = await readJson('d/' + id, null);
      if (m) {
        m.status = 'nein'; m.reason = reason; m.decidedAt = new Date().toISOString();
        await writeJson('d/' + id, m);
        await writeJson('r/' + textHash(m.text), { reason, decidedAt: m.decidedAt });
      }
      await writeIndex((await readIndex()).filter((x) => x.id !== id));
      return json({ ok: true, id, status: 'nein' });
    }
    return json({ error: 'Unbekannte Aktion' }, 400);
  } catch (e) {
    return json({ error: msg(e) }, 502);
  }
};

const msg = (e) => (e && e.message ? e.message : String(e));

// Schickt die Antwort als Push-Benachrichtigung an das Gerät, das die Frage gestellt hat.
// Braucht auf Netlify VAPID_PRIVATE_KEY (und VAPID_SUBJECT, mailto:…); der öffentliche Schlüssel steht in config.js (pushKey).
// Rückgabe: true = Push verschickt, false = kein Abo / keine Schlüssel / Versand gescheitert.
async function pushAnswer(q) {
  const key = 's/' + textHash(q.text);
  const priv = process.env.VAPID_PRIVATE_KEY || '';
  const pub = process.env.VAPID_PUBLIC_KEY || await publicKeyFromConfig();
  if (!priv || !pub) { console.warn('[push] VAPID-Schlüssel fehlen (VAPID_PRIVATE_KEY auf Netlify setzen)'); return false; }
  const s = await readJson(key, null);
  if (!s || !s.sub) return false;
  try {
    const webpush = (await import('web-push')).default;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hallo@bibletunes.com', pub, priv);
    const body = String(q.answer || '').replace(/\s+/g, ' ').trim();
    const payload = JSON.stringify({
      title: q.by ? 'Antwort von ' + q.by : 'Deine Frage wurde beantwortet',
      body: body.length > 140 ? body.slice(0, 137).trimEnd() + '…' : body,
      url: '/',
      tag: 'meet-antwort-' + q.id
    });
    await webpush.sendNotification(s.sub, payload, { TTL: 7 * 86400, urgency: 'normal' });
    await remove(key);
    return true;
  } catch (e) {
    const code = e && e.statusCode;
    console.warn('[push] Versand gescheitert:', code || '', msg(e));
    if (code === 404 || code === 410) await remove(key); // Abo ist weg (App gelöscht, Erlaubnis entzogen)
    return false;
  }
}

// Der öffentliche Schlüssel steht in config.js; die Funktion liest ihn von dort, damit er nur an einer Stelle gepflegt wird
let pubKeyCache = '';
async function publicKeyFromConfig() {
  if (pubKeyCache) return pubKeyCache;
  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const candidates = [path.join(here, '../../config.js'), path.join(here, '../config.js'), path.join(here, 'config.js'), path.join(process.cwd(), 'config.js')];
    for (const file of candidates) {
      try {
        const txt = await fs.readFile(file, 'utf8');
        const m = txt.match(/pushKey:\s*"([A-Za-z0-9_-]{80,100})"/);
        if (m) return (pubKeyCache = m[1]);
      } catch (e) { }
    }
  } catch (e) { }
  return '';
}
export const config = { path: '/.netlify/functions/wall' };
