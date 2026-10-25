// MEET DAILY auf der Startseite – was rund um die beiden Videos passiert: Reaktionen (wie bei WhatsApp), Besuche,
// Sehdauer und die Push-Anmeldung der Jugendlichen („Sag mir Bescheid, wenn das Video online ist“).
// Alles ohne Konto: das Gerät schickt eine zufällige Kennung aus seinem localStorage, gespeichert wird nur deren Hash.
//   GET  ?day=YYYY-MM-DD                        → { day, reactions: { 1: {emoji: n}, 2: {emoji: n} } }   (öffentlich, 20 s Cache)
//   POST ?op=sync      {day, device, app, hits, w, x}  → { ok, reactions? }
//        Das Gerät schickt seinen ganzen Tagesstand (idempotent, letzter Stand gewinnt – keine Zählerrennen):
//        app = als Home-Bildschirm-App geöffnet · hits = Aufrufe · w = { n: {sec, max, dur} } Sehdauer je Video ·
//        x = { n: emoji } eigene Reaktion je Video. Mit want:"reactions" kommen die Reaktionszahlen des Tages zurück.
//   POST ?op=subscribe {sub}                    → { ok, pushReady }   Push-Abo für die Morgen-Videos (lib/push.mjs notifyDaily)
//   POST ?op=stats     {days}          (PIN)    → { today, days: [{day, visitors, hits, app, videos: {1: {views, minutes, avg}, 2: …}, reactions}], subscribers }
// Schlüssel im Store meet-video: u/<day>/<gerät> · agg/<day>.json (vergangene Tage, einmal gerechnet) · ps/<hash> Push-Abo
import { createHash } from 'node:crypto';
import { readJson, writeJson, remove, listKeys, isDay } from '../lib/video-store.mjs';
import { cleanSubscription, endpointHash, pushReady } from '../lib/push.mjs';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, x-studio-pin' };
const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
const msg = (e) => (e && e.message ? e.message : String(e));

// Erlaubt ist jedes EINZELNE Emoji (ein Grapheme, z. B. auch 🙏🏽 oder ❤️‍🔥) – nicht nur die sechs schnellen aus der Leiste
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
function isEmoji(e) {
  if (typeof e !== 'string' || !e || e.length > 20) return false;
  try { let n = 0; for (const _ of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(e)) if (++n > 1) return false; }
  catch (err) { if (Array.from(e).length > 4) return false; }
  return EMOJI_RE.test(e);
}
const MAX_SEC = 2 * 3600;

const devHash = (id) => createHash('sha256').update('meet-device:' + String(id)).digest('hex').slice(0, 24);
const todayKey = () => {
  // Tag in Schweizer/deutscher Zeit, so wie ihn die Startseite bildet
  const p = new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return g('year') + '-' + g('month') + '-' + g('day');
};
const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0; };

// Tagesstand eines Geräts prüfen und auf das Nötige kürzen
function cleanRecord(b) {
  const w = {}, x = {};
  for (const n of [1, 2]) {
    const src = b.w && b.w[n];
    if (src && typeof src === 'object') {
      const dur = num(src.dur, MAX_SEC), sec = Math.min(num(src.sec, MAX_SEC), dur ? dur + 5 : MAX_SEC), max = Math.min(num(src.max, MAX_SEC), dur ? dur + 2 : MAX_SEC);
      if (sec || max) w[n] = { sec: Math.round(sec), max: Math.round(max), dur: Math.round(dur) };
    }
    const e = b.x && b.x[n];
    if (isEmoji(e)) x[n] = e;
  }
  return { at: new Date().toISOString(), app: !!b.app, hits: Math.round(num(b.hits, 1000)) || 1, w, x };
}

// Alle Geräte-Stände eines Tags lesen und zu Tageszahlen verdichten
async function aggregate(day) {
  const keys = await listKeys('u/' + day + '/');
  const recs = (await Promise.all(keys.map((k) => readJson(k, null)))).filter(Boolean);
  const out = { day, visitors: recs.length, hits: 0, app: 0, videos: { 1: { views: 0, minutes: 0, avg: 0 }, 2: { views: 0, minutes: 0, avg: 0 } }, reactions: { 1: {}, 2: {} } };
  const pct = { 1: [], 2: [] };
  for (const r of recs) {
    out.hits += Number(r.hits) || 0; if (r.app) out.app++;
    for (const n of [1, 2]) {
      const w = r.w && r.w[n];
      if (w && (w.sec >= 3 || w.max >= 3)) {
        out.videos[n].views++; out.videos[n].minutes += (w.sec || 0) / 60;
        if (w.dur > 0) pct[n].push(Math.min(1, (w.max || 0) / w.dur));
      }
      const e = r.x && r.x[n];
      if (e) out.reactions[n][e] = (out.reactions[n][e] || 0) + 1;
    }
  }
  for (const n of [1, 2]) {
    out.videos[n].minutes = Math.round(out.videos[n].minutes);
    out.videos[n].avg = pct[n].length ? Math.round(pct[n].reduce((a, b) => a + b, 0) / pct[n].length * 100) : 0;
  }
  return out;
}
// Heute wird live gerechnet (kurz im Speicher der Instanz gehalten), vergangene Tage einmal und dann unter agg/ abgelegt
const memo = new Map();
async function dayStats(day, fresh) {
  const today = todayKey();
  if (day < today) {
    const a = await readJson('agg/' + day + '.json', null);
    if (a && a.visitors != null) return a;
    const calc = await aggregate(day);
    await writeJson('agg/' + day + '.json', calc).catch(() => { });
    return calc;
  }
  const m = memo.get(day);
  if (!fresh && m && Date.now() - m.t < 15000) return m.v;
  const v = await aggregate(day);
  memo.set(day, { t: Date.now(), v });
  return v;
}
const daysBack = (n) => {
  const out = [], t = todayKey();
  const d = new Date(t + 'T12:00:00Z');
  for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1); }
  return out;
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const day = url.searchParams.get('day') || '';
    if (!isDay(day)) return json({ error: 'day fehlt (YYYY-MM-DD)' }, 400);
    try {
      const s = await dayStats(day, false);
      return json({ day, reactions: s.reactions }, 200, { 'Cache-Control': 'public, max-age=20' });
    } catch (e) { return json({ error: 'Gerade nicht erreichbar: ' + msg(e) }, 502); }
  }
  if (req.method !== 'POST') return json({ error: 'Nur GET oder POST' }, 405);

  const op = url.searchParams.get('op') || '';
  let body = {}; try { body = await req.json(); } catch (e) { }

  try {
    if (op === 'sync') {
      const day = isDay(body.day) ? body.day : '';
      const dev = typeof body.device === 'string' ? body.device.trim() : '';
      if (!day || dev.length < 8 || dev.length > 64) return json({ error: 'day oder device fehlt' }, 400);
      // Nur heute und gestern (Mitternacht, Zeitzonen) – alte Tage sind fertig gerechnet
      if (!daysBack(2).includes(day)) return json({ ok: true, ignored: true });
      await writeJson('u/' + day + '/' + devHash(dev), cleanRecord(body));
      if (body.want === 'reactions') { const s = await dayStats(day, true); return json({ ok: true, reactions: s.reactions }); }
      return json({ ok: true });
    }

    if (op === 'subscribe') {
      const sub = cleanSubscription(body.sub);
      if (!sub) return json({ error: 'Push-Abo unvollständig' }, 400);
      await writeJson('ps/' + endpointHash(sub.endpoint), { sub, at: new Date().toISOString() });
      return json({ ok: true, pushReady: await pushReady() });
    }
    if (op === 'unsubscribe') {
      const sub = cleanSubscription(body.sub);
      if (!sub) return json({ error: 'Push-Abo unvollständig' }, 400);
      await remove('ps/' + endpointHash(sub.endpoint));
      return json({ ok: true });
    }

    // Ab hier nur mit Studio-PIN (Portal)
    const pin = process.env.STUDIO_PIN || '';
    if (!pin) return json({ error: 'STUDIO_PIN ist auf Netlify nicht gesetzt' }, 503);
    let sent = ''; try { sent = decodeURIComponent(req.headers.get('x-studio-pin') || ''); } catch (e) { }
    if (sent !== pin) return json({ error: 'Studio-PIN fehlt oder falsch' }, 401);

    if (op === 'stats') {
      const n = Math.min(31, Math.max(1, Math.round(Number(body.days) || 7)));
      const days = await Promise.all(daysBack(n).map((d) => dayStats(d, false)));
      const subs = await listKeys('ps/');
      return json({ today: todayKey(), days, subscribers: subs.length, pushReady: await pushReady() });
    }
    return json({ error: 'Unbekannte Aktion' }, 400);
  } catch (e) {
    return json({ error: msg(e) }, 502);
  }
};

export const config = { path: '/.netlify/functions/daily' };
