// MEET DAILY auf meet-bty.com: die beiden Morgen-Videos (05:45 Start, 06:15 MEETmoment) direkt aus dem Studio
// auf die Startseite – ohne den Umweg über WhatsApp. Die Dateien liegen bei Cloudflare R2 (lib/r2.mjs), das Studio
// lädt sie mit einer vorsignierten Adresse direkt dorthin; hier wird nur signiert und das Tagesverzeichnis geführt.
//   GET  /.netlify/functions/video?day=YYYY-MM-DD          → { day, items: [{n,title,name,passage,url,poster,size,duration,at}] }  (öffentlich, 20 s Cache)
//   POST ?op=status,  Body {day}                      (PIN) → { items }  Stand des Tages ohne Cache (Studio)
//   POST ?op=sign,    Body {day, n, kind, type, size} (PIN) → { uploadUrl, key, url, expires }  kind = video | poster
//   POST ?op=mp-start, Body {day, n, type, size}      (PIN) → { key, uploadId, partSize, parts:[{partNumber, url}] }  grosse Videos in Stücken (S3 Multipart)
//   POST ?op=mp-complete, Body {day, n, key, uploadId, size} (PIN) → { ok, size }  Stücke zusammensetzen (ETags holt die Function selbst – kein ExposeHeaders in CORS nötig)
//   POST ?op=mp-abort, Body {day, n, key, uploadId}   (PIN) → { ok }
//   POST ?op=publish, Body {day, n, key, posterKey, size, duration, passage, name, title} (PIN) → { ok, items }
//   POST ?op=remove,  Body {day, n}                   (PIN) → { ok, items }  Video von der Startseite nehmen (und löschen)
//   POST ?op=check,   Body {day, origin}              (PIN) → { ok, endpoint, steps:[{step, ok, text}] }  Selbstprüfung von Konto, Schlüssel und CORS-Regel
// PIN: Header x-studio-pin = Umgebungsvariable STUDIO_PIN (dieselbe wie im Studio und bei der WALL).
// Lokal (MEET_VIDEO_LOCAL_DIR gesetzt): statt R2 nimmt der Entwicklungs-Server die Datei unter /__media/<key> an.
import { r2Config, presign, publicUrl, deleteObject, headObject, checkSetup, fetchWhy, PART_SIZE, multipartStart, multipartPartUrl, multipartListParts, multipartComplete, multipartAbort } from '../lib/r2.mjs';
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
// Adressen immer aus dem Schlüssel und der AKTUELLEN R2_PUBLIC_URL bilden – so greift eine korrigierte Variable auch für
// schon hochgeladene Videos. Gespeicherte url/poster sind nur der Rückfall, falls die Einrichtung gerade fehlt.
function withUrls(items) {
  const local = process.env.MEET_VIDEO_LOCAL_DIR || '', cfg = local ? null : r2Config();
  const f = (key) => (local ? '/__media/' + key : cfg ? publicUrl(cfg, key) : '');
  return items.map((v) => ({ ...v, url: (v.key && f(v.key)) || v.url, poster: (v.posterKey && f(v.posterKey)) || v.poster || '' }));
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);

  if (req.method === 'GET') {
    // Erreichbarkeit des Speicher-Endpunkts von Netlify aus (ohne PIN, ohne Schlüssel, nennt weder Konto noch Bucket)
    if (url.searchParams.get('op') === 'ping') {
      const cfg = r2Config();
      if (!cfg) return json({ configured: false });
      const t0 = Date.now();
      try { const r = await fetch('https://' + cfg.host + '/', { method: 'HEAD' }); return json({ configured: true, reachable: true, status: r.status, ms: Date.now() - t0, node: process.version }); }
      catch (e) { return json({ configured: true, reachable: false, error: fetchWhy(e), ms: Date.now() - t0, node: process.version }); }
    }
    const day = url.searchParams.get('day') || '';
    if (!isDay(day)) return json({ error: 'day fehlt (YYYY-MM-DD)' }, 400);
    try {
      const d = await readDay(day);
      return json({ day, items: withUrls(d.items).map(publicView), updated: d.updated }, 200, { 'Cache-Control': 'public, max-age=20' });
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
  // Lokal spielt der Entwicklungs-Server den Speicher (MEET_VIDEO_LOCAL_URL, z. B. http://127.0.0.1:8095) – auch für Multipart
  const localBase = process.env.MEET_VIDEO_LOCAL_URL || '';
  const keyFor = (kind, type) => {
    const ext = kind === 'poster' ? (type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg') : (type === 'video/webm' ? 'webm' : type === 'video/quicktime' ? 'mov' : 'mp4');
    return 'daily/' + day + '/' + n + '-' + SLUG[n] + (kind === 'poster' ? '-karte' : '') + '-' + rand() + '.' + ext;
  };
  const keyOk = (key) => key.startsWith('daily/' + day + '/' + n + '-') && !/\.\./.test(key);

  try {
    if (op === 'status') {
      const d = await readDay(day);
      return json({ items: withUrls(d.items).map(publicView), updated: d.updated, ready: !!(local || cfg) });
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
      const key = keyFor(kind, type);
      const expires = 1800;
      const uploadUrl = local ? '/__media/' + key : presign(cfg, 'PUT', key, expires);
      return json({ uploadUrl, key, url: urlFor(key), expires, method: 'PUT' });
    }

    if (op === 'mp-start') {
      if (!n) return json({ error: 'n muss 1 oder 2 sein' }, 400);
      const type = clean(body.type, 60), size = Number(body.size) || 0;
      if (!/^video\/(mp4|quicktime|webm)$/.test(type)) return json({ error: 'Nur MP4-Videos (' + (type || 'unbekannt') + ')' }, 400);
      if (size <= 0) return json({ error: 'Dateigrösse fehlt' }, 400);
      if (size > MAX_VIDEO) return json({ error: 'Video zu gross (' + (size / 1e6).toFixed(0) + ' MB)' }, 413);
      const key = keyFor('video', type), count = Math.max(1, Math.ceil(size / PART_SIZE)), expires = 3600;
      let uploadId;
      if (local) {
        const r = await fetch(localBase + '/__media/' + key + '?uploads', { method: 'POST' });
        uploadId = (/<UploadId>([^<]*)<\/UploadId>/.exec(await r.text()) || [])[1];
        if (!uploadId) return json({ error: 'Lokaler Speicher startet den Upload nicht' }, 502);
      } else uploadId = await multipartStart(cfg, key, type);
      const parts = [];
      for (let i = 1; i <= count; i++) parts.push({ partNumber: i, url: local ? '/__media/' + key + '?partNumber=' + i + '&uploadId=' + encodeURIComponent(uploadId) : multipartPartUrl(cfg, key, uploadId, i, expires) });
      return json({ key, uploadId, partSize: PART_SIZE, parts, expires, url: urlFor(key) });
    }

    if (op === 'mp-complete' || op === 'mp-abort') {
      if (!n) return json({ error: 'n muss 1 oder 2 sein' }, 400);
      const key = clean(body.key, 200), uploadId = clean(body.uploadId, 400);
      if (!keyOk(key) || !uploadId) return json({ error: 'Schlüssel passt nicht zu Tag und Video' }, 400);
      if (op === 'mp-abort') {
        if (local) await fetch(localBase + '/__media/' + key + '?uploadId=' + encodeURIComponent(uploadId), { method: 'DELETE' }); else await multipartAbort(cfg, key, uploadId);
        return json({ ok: true });
      }
      const want = Number(body.size) || 0;
      let got = 0;
      if (local) {
        const r = await fetch(localBase + '/__media/' + key + '?uploadId=' + encodeURIComponent(uploadId), { method: 'POST' });
        if (!r.ok) return json({ error: 'Lokaler Speicher setzt das Video nicht zusammen (HTTP ' + r.status + ')' }, 502);
        const h = await fetch(localBase + '/__media/' + key, { method: 'HEAD' }); got = Number(h.headers.get('content-length') || 0);
      } else {
        const parts = await multipartListParts(cfg, key, uploadId);
        const have = parts.reduce((a, p) => a + p.size, 0);
        if (want && have !== want) { await multipartAbort(cfg, key, uploadId); return json({ error: 'Im Speicher sind nur ' + (have / 1048576).toFixed(1) + ' von ' + (want / 1048576).toFixed(1) + ' MB angekommen (' + parts.length + ' Teile) – bitte noch einmal hochladen' }, 409); }
        await multipartComplete(cfg, key, uploadId, parts);
        const h = await headObject(cfg, key); got = h ? h.size : 0;
      }
      if (want && got !== want) { if (cfg) await deleteObject(cfg, key); return json({ error: 'Das Video ist im Speicher unvollständig (' + (got / 1048576).toFixed(1) + ' von ' + (want / 1048576).toFixed(1) + ' MB) – bitte noch einmal hochladen' }, 409); }
      return json({ ok: true, size: got });
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
        // Grösse muss stimmen: Safari schickt grosse Dateien manchmal als leeren Körper (0 Byte kommen an)
        if (size && h.size !== size) { await deleteObject(cfg, key); return json({ error: 'Das Video ist im Speicher unvollständig angekommen (' + (h.size / 1048576).toFixed(1) + ' von ' + (size / 1048576).toFixed(1) + ' MB) – bitte noch einmal hochladen' }, 409); }
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
      return json({ ok: true, items: withUrls(items).map(publicView) });
    }

    if (op === 'remove') {
      if (!n) return json({ error: 'n muss 1 oder 2 sein' }, 400);
      const d = await readDay(day);
      const old = d.items.find((v) => v.n === n);
      const items = d.items.filter((v) => v.n !== n);
      await writeDay(day, items);
      if (cfg && old) { for (const k of [old.key, old.posterKey]) if (k) await deleteObject(cfg, k); }
      return json({ ok: true, items: withUrls(items).map(publicView) });
    }

    return json({ error: 'Unbekannte Aktion' }, 400);
  } catch (e) {
    return json({ error: msg(e) }, 502);
  }
};

export const config = { path: '/.netlify/functions/video' };
