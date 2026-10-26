// MEET WALL: liefert die freigegebenen Momente aus (GET, öffentlich, anonym) und
// nimmt die Freigabe-Entscheidungen der Prüfseite entgegen (POST mit Studio-PIN, ?op=…).
//   GET  /.netlify/functions/wall                      → { items: [{id,text,passage,date,ts}], updated }
//   POST ?op=pending   (PIN)                            → { items: wartende Momente }
//   POST ?op=approved  (PIN)                            → { items: freigegebene Momente }
//   POST ?op=approve, Body {id}                         → { ok, id }
//   POST ?op=reject | unpublish, Body {id, reason}      → { ok, id }  (reason = kurze Begründung für den Absender)
//   POST ?op=private   (PIN)                            → { items: Momente ohne Haken (mit Name, nie auf der Wand), neueste zuerst }
//   POST ?op=questions (PIN)                           → { items: offene Fragen zum Text (mit Name, nie auf der Wand) }
//   POST ?op=questions-done (PIN)                      → { items: erledigte Fragen, neueste zuerst (mit Antwort) }
//   POST ?op=question-answer, Body {id, answer, by}     → { ok, id }  (Frage beantworten: q/ → qd/, Antwort unter qa/<hash> für den Fragenden; by = Name)
//   POST ?op=question-done, Body {id}                   → { ok, id }  (Frage ohne Antwort ablegen: q/ → qd/)
//   POST ?op=subscribe, Body {sub:{endpoint,keys}, questions:[…]} (ohne PIN)
//        → { ok, n }  Push-Abo für die eigenen offenen Fragen hinterlegen (s/<hash>); bei der Antwort geht eine Push raus
//   POST ?op=mod-subscribe, Body {sub:{endpoint,keys}, name} (PIN)
//        → { ok, items, pushReady }  dieses Gerät als Moderator anmelden: Push bei neuem MEETmoment / neuer Frage (mod/<hash Endpoint>)
//   POST ?op=mod-unsubscribe, Body {endpoint} (PIN)  → { ok, items }   Abo dieses Geräts wieder löschen
//   POST ?op=mod-subs (PIN)                          → { items: [{name, at, hash}], pushReady }  wer bekommt Bescheid
//   POST ?op=mod-test, Body {endpoint} (PIN)         → { ok, pushed, why }  Test-Push an dieses Gerät
//   POST ?op=mine, Body {texts:[…], questions:[…]} (ohne PIN)
//        → { items: [{status: frei|nein|wartet, reason}], questions: [{status: offen|beantwortet, answer, by, answeredAt}] }
//          Stand der eigenen Momente und Fragen (nur bei exakt bekanntem Text)
// PIN: Header x-studio-pin = Umgebungsvariable STUDIO_PIN (dieselbe wie im MEET DAILY Studio).
import { readJson, writeJson, remove, listKeys, readIndex, writeIndex, publicView, normText, textHash } from '../lib/wall-store.mjs';
import { sendPush, pushReady, cleanSubscription, endpointHash, listModerators, moderatorPayload } from '../lib/push.mjs';

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
    const clean = cleanSubscription(body.sub);
    const qs = Array.isArray(body.questions) ? body.questions.filter((t) => typeof t === 'string' && t.trim()).slice(0, 5) : [];
    if (!clean) return json({ error: 'Push-Abo unvollständig' }, 400);
    if (!qs.length) return json({ ok: true, n: 0 });
    try {
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

  // Moderatoren-Push: Niklas und Vincent melden ihr Gerät an und bekommen Bescheid, sobald etwas wartet
  if (op === 'mod-subscribe' || op === 'mod-unsubscribe' || op === 'mod-subs' || op === 'mod-test') {
    try {
      const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
      const endpoint = typeof body.endpoint === 'string' ? body.endpoint : (body.sub && typeof body.sub.endpoint === 'string' ? body.sub.endpoint : '');
      if (op === 'mod-subscribe') {
        const clean = cleanSubscription(body.sub);
        if (!clean) return json({ error: 'Push-Abo unvollständig' }, 400);
        await writeJson('mod/' + endpointHash(clean.endpoint), { sub: clean, name, at: new Date().toISOString() });
      }
      if (op === 'mod-unsubscribe') {
        if (!endpoint) return json({ error: 'endpoint fehlt' }, 400);
        await remove('mod/' + endpointHash(endpoint));
      }
      if (op === 'mod-test') {
        if (!endpoint) return json({ error: 'endpoint fehlt' }, 400);
        const m = await readJson('mod/' + endpointHash(endpoint), null);
        if (!m || !m.sub) return json({ error: 'Dieses Gerät ist nicht angemeldet' }, 404);
        const r = await sendPush(m.sub, moderatorPayload.test(m.name), { ttl: 600, urgency: 'high' });
        if (r.gone) await remove('mod/' + endpointHash(endpoint));
        return json({ ok: true, pushed: r.ok, why: r.ok ? '' : (r.why || '') });
      }
      const items = (await listModerators()).map((m) => ({ name: m.name || '', at: m.at || '', hash: endpointHash(m.sub.endpoint) }));
      items.sort((a, b) => (a.at < b.at ? 1 : -1));
      return json({ ok: true, items, pushReady: await pushReady() });
    } catch (e) {
      return json({ error: msg(e) }, 502);
    }
  }

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
    // Private Momente (ohne Haken) gibt es seit 26.10.2026 nicht mehr auf dem Server; alte Einträge unter n/ werden gelöscht
    if (op === 'private-purge') {
      const keys = await listKeys('n/');
      for (const k of keys) await remove(k);
      return json({ ok: true, removed: keys.length });
    }
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

// Schickt die Antwort als Push-Benachrichtigung an das Gerät, das die Frage gestellt hat (Abo unter s/<hash Fragetext>).
// Rückgabe: true = Push verschickt, false = kein Abo / keine Schlüssel / Versand gescheitert. Versand: lib/push.mjs.
async function pushAnswer(q) {
  const key = 's/' + textHash(q.text);
  const s = await readJson(key, null);
  if (!s || !s.sub) return false;
  const body = String(q.answer || '').replace(/\s+/g, ' ').trim();
  const r = await sendPush(s.sub, {
    title: q.by ? 'Antwort von ' + q.by : 'Deine Frage wurde beantwortet',
    body: body.length > 140 ? body.slice(0, 137).trimEnd() + '…' : body,
    url: '/',
    tag: 'meet-antwort-' + q.id
  });
  if (r.ok || r.gone) await remove(key); // nach dem Versand bzw. wenn das Abo weg ist (App gelöscht, Erlaubnis entzogen)
  return r.ok;
}
export const config = { path: '/.netlify/functions/wall' };
