// MEET DAILY auf meet-bty.com: die beiden Morgen-Videos (05:45 Start, 06:15 MEETmoment) direkt aus dem Studio
// auf die Startseite – ohne den Umweg über WhatsApp. Die Dateien liegen bei Cloudflare R2 (lib/r2.mjs), das Studio
// lädt sie mit einer vorsignierten Adresse direkt dorthin; hier wird nur signiert und das Tagesverzeichnis geführt.
//   GET  /.netlify/functions/video?day=YYYY-MM-DD          → { day, items: [{n,title,name,passage,url,poster,size,duration,at}] }  (öffentlich, 20 s Cache)
//   POST ?op=status,  Body {day}                      (PIN) → { items }  Stand des Tages ohne Cache (Studio)
//   POST ?op=sign,    Body {day, n, kind, type, size} (PIN) → { uploadUrl, key, url, expires }  kind = video | poster
//   POST ?op=publish, Body {day, n, key, posterKey, size, duration, passage, name, title} (PIN) → { ok, items }
//   POST ?op=remove,  Body {day, n}                   (PIN) → { ok, items }  Video von der Startseite nehmen (und löschen)
//   POST ?op=check,   Body {day, origin}              (PIN) → { ok, endpoint, steps:[{step, ok, text}] }  Selbstprüfung von Konto, Schlüssel und CORS-Regel
// PIN: Header x-studio-pin = Umgebungsvariable STUDIO_PIN (dieselbe wie im Studio und bei der WALL).
// Lokal (MEET_VIDEO_LOCAL_DIR gesetzt): statt R2 nimmt der Entwicklungs-Server die Datei unter /__media/<key> an.
import { r2Config, presign, publicUrl, deleteObject, headObject, checkSetup } from '../lib/r2.mjs';
import { readDay, writeDay, publicView, isDay } from '../lib/video-store.mjs';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, x-studio-pin' };
const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
const msg = (e) => (e && e.message ? e.message : String(e));

const MAX_VIDEO = 1.5e9, MAX_POSTER = 3e6;
const SLUG = { 1: 'Start', 2: 'MEETmoment' };
const TITLE = { 1: 'Start', 2: 'MEETmoment' };
const rand = () => Math.random().toString(36).slice(2, 8);
const clean = (s, max) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const day = url.searchParams.get('day') || '';
    if (!isDay(day)) return json({ error: 'day fehlt (YYYY-MM-DD)' }, 400);
    try {
      const d = await readDay(day);
      return json({ day, items: d.items.map(publicView), updated: d.updated }, 200, { 'Cache-Control': 'public, max-age=20' });
    } catch (e) {
      return json({ error: 'Videos gerade nicht erreichbar: ' + msg(e) }, 502);
    }
  }
  if (req.method !== 'POST') return json({ error: 'Nur GET oder POST' }, 405);

  const pin = process.env.STUDIO_PIN || '';
  if (!pin) return json({ error: 'STUDIO_PIN ist auf Netlify nicht gesetzt' }, 503);
  let sent = ''; try { sent = decodeURIComponent(req.headers.get('x-studio-pin') || ''); } catch (e) { }
  if (sent !== pin) return json({ error: 'Studio-PIN fehlt oder falsch' }, 401);

  const op = url.searchParams.get('op') || '';
  let body = {}; try { body = await req.json(); } catch (e) { }
  const day = isDay(body.day) ? body.day : '';
  const n = body.n === 1 || body.n === 2 ? body.n : 0;
  if (!day) return json({ error: 'day fehlt (YYYY-MM-DD)' }, 400);

  const local = process.env.MEET_VIDEO_LOCAL_DIR || '';
  const cfg = local ? null : r2Config();
  const urlFor = (key) => (local ? '/__media/' + key : publicUrl(cfg, key));

  try {
    if (op === 'status') {
      const d = await readDay(day);
      return json({ items: d.items.map(publicView), updated: d.updated, ready: !!(local || cfg) });
    }
    // Ab hier wird der Dateispeicher gebraucht
    if (!local && !cfg) return json({ error: 'Video-Speicher nicht eingerichtet: auf Netlify fehlen R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY oder R2_PUBLIC_URL' }, 503);

    if (op === 'check') {
      if (local) return json({ ok: true, endpoint: 'lokaler Dateispeicher', steps: [{ step: 'lokal', ok: true, text: 'Lokaler Entwicklungs-Server, keine Prüfung nötig.' }] });
      return json(await checkSetup(cfg, clean(body.origin, 120)));
    }

    if (op === 'sign') {
      if (!n) return json({ error: 'n muss 1 oder 2 sein' }, 400);
      const kind = body.kind === 'poster' ? 'poster' : 'video';
      const type = clean(body.type, 60), size = Number(body.size) || 0;
      if (kind === 'video' && !/^video\/(mp4|quicktime|webm)$/.test(type)) return json({ error: 'Nur MP4-Videos (' + (type || 'unbekannt') + ')' }, 400);
      if (kind === 'poster' && !/^image\/(jpeg|png|webp)$/.test(type)) return json({ error: 'Vorschaubild nur als JPEG, PNG oder WebP' }, 400);
      if (size <= 0) return json({ error: 'Dateigrösse fehlt' }, 400);
      if (kind === 'video' && size > MAX_VIDEO) return json({ error: 'Video zu gross (' + (size / 1e6).toFixed(0) + ' MB)' }, 413);
      if (kind === 'poster' && size > MAX_POSTER) return json({ error: 'Vorschaubild zu gross' }, 413);
      const ext = kind === 'poster' ? (type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg') : (type === 'video/webm' ? 'webm' : type === 'video/quicktime' ? 'mov' : 'mp4');
      const key = 'daily/' + day + '/' + n + '-' + SLUG[n] + (kind === 'poster' ? '-karte' : '') + '-' + rand() + '.' + ext;
      const expires = 1800;
      const uploadUrl = local ? '/__media/' + key : presign(cfg, 'PUT', key, expires);
      return json({ uploadUrl, key, url: urlFor(key), expires, method: 'PUT' });
    }

    if (op === 'publish') {
      if (!n) return json({ error: 'n muss 1 oder 2 sein' }, 400);
      const key = clean(body.key, 200), posterKey = clean(body.posterKey, 200);
      const prefix = 'daily/' + day + '/' + n + '-';
      if (!key.startsWith(prefix) || /\.\./.test(key)) return json({ error: 'Schlüssel passt nicht zu Tag und Video' }, 400);
      if (posterKey && (!posterKey.startsWith(prefix) || /\.\./.test(posterKey))) return json({ error: 'Vorschaubild passt nicht zu Tag und Video' }, 400);
      let size = Number(body.size) || 0;
      if (cfg) {
        const h = await headObject(cfg, key);
        if (!h) return json({ error: 'Das Video ist im Speicher nicht angekommen – bitte noch einmal hochladen' }, 409);
        if (h.size) size = h.size;
      }
      const d = await readDay(day);
      const old = d.items.find((v) => v.n === n);
      const entry = {
        n, key, url: urlFor(key),
        posterKey: posterKey || '', poster: posterKey ? urlFor(posterKey) : '',
        size, duration: Math.max(0, Math.round(Number(body.duration) || 0)),
        passage: clean(body.passage, 120), name: clean(body.name, 40), title: clean(body.title, 40) || TITLE[n],
        at: new Date().toISOString()
      };
      const items = d.items.filter((v) => v.n !== n).concat([entry]);
      await writeDay(day, items);
      // altes Video desselben Morgens (ersetzt) aus dem Speicher nehmen – bestes Bemühen
      if (cfg && old) { for (const k of [old.key, old.posterKey]) if (k && k !== key && k !== posterKey) await deleteObject(cfg, k); }
      return json({ ok: true, items: items.map(publicView) });
    }

    if (op === 'remove') {
      if (!n) return json({ error: 'n muss 1 oder 2 sein' }, 400);
      const d = await readDay(day);
      const old = d.items.find((v) => v.n === n);
      const items = d.items.filter((v) => v.n !== n);
      await writeDay(day, items);
      if (cfg && old) { for (const k of [old.key, old.posterKey]) if (k) await deleteObject(cfg, k); }
      return json({ ok: true, items: items.map(publicView) });
    }

    return json({ error: 'Unbekannte Aktion' }, 400);
  } catch (e) {
    return json({ error: msg(e) }, 502);
  }
};

export const config = { path: '/.netlify/functions/video' };
