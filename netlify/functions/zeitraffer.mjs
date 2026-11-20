// Zeitraffer-Reel „Komm mit in meine Stille Zeit“: Rohmaterial aus dem Studio (studio/zeitraffer/) – das stumme
// Zeitraffer-Video der Stillen Zeit und das eingesprochene Voice-over. Beides liegt nur KURZ bei Cloudflare R2:
// Claude holt es am Mac ab (Skill meet-tiktok, scripts/studio_zeitraffer.py), schneidet, legt alles im Drive ab und
// löscht es hier sofort wieder (op=remove). Nichts davon erscheint auf der Startseite; es gibt keinen öffentlichen Abruf.
// Alles per POST mit Studio-PIN (Header x-studio-pin = STUDIO_PIN):
//   ?op=status,      Body {day}                          → { day, items:[{kind,url,size,type,at,startedAt,realSec,clipSec,speed,mode,name}], ready }
//   ?op=pending,     Body {}                             → { days:[{day, kinds:[…]}] }  alle Tage, an denen noch etwas liegt
//   ?op=sign,        Body {day, kind, type, size}        → { uploadUrl, key }           kind = video | vo (kleine Dateien in einem Stück)
//   ?op=mp-start,    Body {day, kind, type, size}        → { key, uploadId, partSize, parts:[{partNumber,url}] }
//        mit stream:true (ohne size): Upload schon WÄHREND der Aufnahme – die Grösse steht erst am Ende fest, die Adressen
//        der Stücke kommen nach und nach über op=mp-parts; jedes Stück ausser dem letzten ist genau partSize gross
//   ?op=mp-parts,    Body {day, kind, key, uploadId, from, count} → { parts:[{partNumber,url}] }  Adressen für die nächsten Stücke
//   ?op=mp-complete, Body {day, kind, key, uploadId, size} → { ok, size }
//   ?op=mp-abort,    Body {day, kind, key, uploadId}     → { ok }
//   ?op=publish,     Body {day, kind, key, size, type, startedAt, realSec, clipSec, speed, mode, name} → { ok, items }
//        ersetzt eine frühere Aufnahme derselben Art am selben Tag (die alte Datei wird gelöscht)
//   ?op=remove,      Body {day, kind?}                   → { ok, items, deleted }  Dateien löschen (ohne kind: alles vom Tag)
// Die Adressen in „items“ sind vorsignierte Abruf-Adressen (1 h gültig) – die Dateien haben keine dauerhafte öffentliche Adresse nötig.
// Sicherheitsnetz: Was länger als 6 Tage liegt, räumt jedes publish weg.
// Lokal (MEET_VIDEO_LOCAL_DIR gesetzt): der Entwicklungs-Server spielt den Speicher unter /__media/<key>.
import crypto from 'node:crypto';
import { r2Config, presign, deleteObject, headObject, PART_SIZE, multipartStart, multipartPartUrl, multipartListParts, multipartComplete, multipartAbort } from '../lib/r2.mjs';
import { isDay, readJson, writeJson, remove as removeKey, listKeys } from '../lib/video-store.mjs';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, x-studio-pin' };
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const msg = (e) => (e && e.message ? e.message : String(e));
const clean = (s, max) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const num = (v, max) => Math.max(0, Math.min(max, Number(v) || 0));

const MAX = { video: 2e9, vo: 60e6 };
const KEEP_DAYS = 6;
const TYPES = {
  video: { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' },
  vo: { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav' }
};
const baseType = (t) => clean(t, 80).split(';')[0].trim().toLowerCase();
const recKey = (day) => 'z/' + day + '.json';

async function readRec(day) {
  const v = await readJson(recKey(day), null);
  return { day, items: v && Array.isArray(v.items) ? v.items : [], updated: (v && v.updated) || '' };
}
const writeRec = (day, items) => (items.length ? writeJson(recKey(day), { day, items, updated: new Date().toISOString() }) : removeKey(recKey(day)));

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);

  const pin = process.env.STUDIO_PIN || '';
  if (!pin) return json({ error: 'STUDIO_PIN ist auf Netlify nicht gesetzt' }, 503);
  let sent = ''; try { sent = decodeURIComponent(req.headers.get('x-studio-pin') || ''); } catch (e) { }
  if (sent !== pin) return json({ error: 'Studio-PIN fehlt oder falsch' }, 401);

  const op = new URL(req.url).searchParams.get('op') || '';
  let body = {}; try { body = await req.json(); } catch (e) { }

  const local = process.env.MEET_VIDEO_LOCAL_DIR || '';
  const localBase = process.env.MEET_VIDEO_LOCAL_URL || '';
  const cfg = local ? null : r2Config();
  const getUrl = (key) => (local ? '/__media/' + key : presign(cfg, 'GET', key, 3600));
  // Löscht die Datei und meldet, ob sie danach wirklich weg ist
  const drop = async (key) => {
    if (!key) return true;
    if (local) { if (!localBase) return true; const r = await fetch(localBase + '/__media/' + key, { method: 'DELETE' }); return r.ok || r.status === 404; }
    if (!(await deleteObject(cfg, key))) return false;
    return (await headObject(cfg, key)) === null;
  };
  const sizeOf = async (key) => {
    if (local) { if (!localBase) return -1; const h = await fetch(localBase + '/__media/' + key, { method: 'HEAD' }); return h.ok ? Number(h.headers.get('content-length') || 0) : null; }
    const h = await headObject(cfg, key); return h ? h.size : null;
  };
  const view = (v) => ({ kind: v.kind, url: getUrl(v.key), size: v.size || 0, type: v.type || '', ext: v.ext || '', at: v.at || '', startedAt: v.startedAt || '', realSec: v.realSec || 0, clipSec: v.clipSec || 0, speed: v.speed || 0, mode: v.mode || '', name: v.name || '' });

  try {
    if (op === 'pending') {
      const keys = (await listKeys('z/')).filter((k) => /^z\/\d{4}-\d{2}-\d{2}\.json$/.test(k));
      const days = [];
      for (const k of keys) { const r = await readRec(k.slice(2, 12)); if (r.items.length) days.push({ day: r.day, kinds: r.items.map((v) => v.kind), updated: r.updated }); }
      return json({ days });
    }

    const day = isDay(body.day) ? body.day : '';
    if (!day) return json({ error: 'day fehlt (YYYY-MM-DD)' }, 400);
    const kind = body.kind === 'video' || body.kind === 'vo' ? body.kind : '';
    const prefix = 'zeitraffer/' + day + '/';
    const keyOk = (key) => key.startsWith(prefix + kind + '-') && !/\.\./.test(key);

    if (op === 'status') {
      const r = await readRec(day);
      return json({ day, items: (local || cfg) ? r.items.map(view) : [], updated: r.updated, ready: !!(local || cfg) });
    }
    if (!local && !cfg) return json({ error: 'Video-Speicher nicht eingerichtet: auf Netlify fehlen die R2-Variablen' }, 503);

    if (op === 'sign' || op === 'mp-start') {
      if (!kind) return json({ error: 'kind muss video oder vo sein' }, 400);
      const type = baseType(body.type), ext = TYPES[kind][type], stream = op === 'mp-start' && body.stream === true;
      const size = stream ? 1 : Number(body.size) || 0;
      if (!ext) return json({ error: (kind === 'video' ? 'Nur MP4-, MOV- oder WebM-Videos' : 'Nur Tonaufnahmen (M4A, MP3, WAV, WebM)') + ' – bekommen: ' + (type || 'unbekannt') }, 400);
      if (size <= 0) return json({ error: 'Dateigrösse fehlt' }, 400);
      if (size > MAX[kind]) return json({ error: 'Datei zu gross (' + (size / 1e6).toFixed(0) + ' MB)' }, 413);
      const key = prefix + kind + '-' + crypto.randomBytes(9).toString('hex') + '.' + ext;
      if (op === 'sign') return json({ uploadUrl: local ? '/__media/' + key : presign(cfg, 'PUT', key, 1800), key, expires: 1800, method: 'PUT' });
      const count = stream ? 0 : Math.max(1, Math.ceil(size / PART_SIZE)), expires = 3600;
      let uploadId;
      if (local) {
        const r = await fetch(localBase + '/__media/' + key + '?uploads', { method: 'POST' });
        uploadId = (/<UploadId>([^<]*)<\/UploadId>/.exec(await r.text()) || [])[1];
        if (!uploadId) return json({ error: 'Lokaler Speicher startet den Upload nicht' }, 502);
      } else uploadId = await multipartStart(cfg, key, type);
      const parts = [];
      for (let i = 1; i <= count; i++) parts.push({ partNumber: i, url: local ? '/__media/' + key + '?partNumber=' + i + '&uploadId=' + encodeURIComponent(uploadId) : multipartPartUrl(cfg, key, uploadId, i, expires) });
      return json({ key, uploadId, partSize: PART_SIZE, parts, expires });
    }

    if (op === 'mp-parts') {
      const key = clean(body.key, 200), uploadId = clean(body.uploadId, 400);
      if (!kind || !keyOk(key) || !uploadId) return json({ error: 'Schlüssel passt nicht zu Tag und Art' }, 400);
      const from = Math.max(1, Math.floor(Number(body.from) || 1)), count = Math.max(1, Math.min(16, Math.floor(Number(body.count) || 1)));
      if (from + count - 1 > 10000 || (from + count - 1) * PART_SIZE > MAX[kind] + PART_SIZE) return json({ error: 'Aufnahme zu lang' }, 413);
      const parts = [];
      for (let i = from; i < from + count; i++) parts.push({ partNumber: i, url: local ? '/__media/' + key + '?partNumber=' + i + '&uploadId=' + encodeURIComponent(uploadId) : multipartPartUrl(cfg, key, uploadId, i, 3600) });
      return json({ parts, partSize: PART_SIZE });
    }

    if (op === 'mp-complete' || op === 'mp-abort') {
      const key = clean(body.key, 200), uploadId = clean(body.uploadId, 400);
      if (!kind || !keyOk(key) || !uploadId) return json({ error: 'Schlüssel passt nicht zu Tag und Art' }, 400);
      if (op === 'mp-abort') {
        if (local) await fetch(localBase + '/__media/' + key + '?uploadId=' + encodeURIComponent(uploadId), { method: 'DELETE' }); else await multipartAbort(cfg, key, uploadId);
        return json({ ok: true });
      }
      const want = Number(body.size) || 0;
      if (local) {
        const r = await fetch(localBase + '/__media/' + key + '?uploadId=' + encodeURIComponent(uploadId), { method: 'POST' });
        if (!r.ok) return json({ error: 'Lokaler Speicher setzt die Datei nicht zusammen (HTTP ' + r.status + ')' }, 502);
      } else {
        const parts = await multipartListParts(cfg, key, uploadId);
        const have = parts.reduce((a, p) => a + p.size, 0);
        if (want && have !== want) { await multipartAbort(cfg, key, uploadId); return json({ error: 'Im Speicher sind nur ' + (have / 1048576).toFixed(1) + ' von ' + (want / 1048576).toFixed(1) + ' MB angekommen – bitte noch einmal hochladen' }, 409); }
        await multipartComplete(cfg, key, uploadId, parts);
      }
      const got = await sizeOf(key);
      if (want && got !== want) { await drop(key); return json({ error: 'Die Datei ist im Speicher unvollständig – bitte noch einmal hochladen' }, 409); }
      return json({ ok: true, size: got || 0 });
    }

    if (op === 'publish') {
      const key = clean(body.key, 200);
      if (!kind || !keyOk(key)) return json({ error: 'Schlüssel passt nicht zu Tag und Art' }, 400);
      let size = Number(body.size) || 0;
      const got = await sizeOf(key);
      if (got === null || got === 0) return json({ error: 'Die Datei ist im Speicher nicht angekommen – bitte noch einmal hochladen' }, 409);
      if (got > 0 && size && got !== size) { await drop(key); return json({ error: 'Die Datei ist im Speicher unvollständig angekommen (' + (got / 1048576).toFixed(1) + ' von ' + (size / 1048576).toFixed(1) + ' MB) – bitte noch einmal hochladen' }, 409); }
      if (got > 0) size = got;
      const r = await readRec(day);
      const old = r.items.find((v) => v.kind === kind);
      const type = baseType(body.type);
      const entry = {
        kind, key, size, type, ext: TYPES[kind][type] || key.split('.').pop(),
        at: new Date().toISOString(),
        startedAt: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(body.startedAt || '') ? body.startedAt : '',
        realSec: Math.round(num(body.realSec, 86400)), clipSec: Math.round(num(body.clipSec, 86400) * 10) / 10,
        speed: Math.round(num(body.speed, 1000) * 100) / 100, mode: clean(body.mode, 20), name: clean(body.name, 40)
      };
      const items = r.items.filter((v) => v.kind !== kind).concat([entry]).sort((a, b) => (a.kind < b.kind ? 1 : -1));
      await writeRec(day, items);
      if (old && old.key !== key) { try { await drop(old.key); } catch (e) { console.warn('[zeitraffer] alte Datei nicht gelöscht:', msg(e)); } }
      // Sicherheitsnetz: liegengebliebenes Rohmaterial älterer Tage wegräumen
      try {
        const limit = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
        for (const k of await listKeys('z/')) {
          const d = k.slice(2, 12);
          if (!isDay(d) || d >= limit || d === day) continue;
          const o = await readRec(d);
          for (const v of o.items) await drop(v.key);
          await removeKey(recKey(d));
        }
      } catch (e) { console.warn('[zeitraffer] Aufräumen:', msg(e)); }
      return json({ ok: true, items: items.map(view) });
    }

    if (op === 'remove') {
      const r = await readRec(day);
      const gone = r.items.filter((v) => !kind || v.kind === kind);
      // Erst die Dateien löschen, dann den Eintrag – schlägt das Löschen fehl, bleibt der Eintrag stehen und man sieht es
      const deleted = [], failed = [];
      for (const v of gone) ((await drop(v.key)) ? deleted : failed).push(v);
      const items = r.items.filter((v) => !deleted.includes(v));
      await writeRec(day, items);
      const short = (v) => ({ kind: v.kind, size: v.size || 0 });
      if (failed.length) return json({ error: 'Nicht gelöscht: ' + failed.map((v) => v.kind).join(', ') + ' – bitte noch einmal versuchen', items: items.map(view), deleted: deleted.map(short) }, 502);
      return json({ ok: true, items: items.map(view), deleted: deleted.map(short) });
    }

    return json({ error: 'Unbekannte Aktion' }, 400);
  } catch (e) {
    return json({ error: msg(e) }, 502);
  }
};

export const config = { path: '/.netlify/functions/zeitraffer' };
