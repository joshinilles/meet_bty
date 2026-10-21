// MEET_ Kalender (meet-bty.com/kalender): gemeinsamer Speicher für Termine, Aufgaben, Beiträge, Abwesenheiten,
// Wochen-/Monatsfokus, Ablage-Links, Kommentare und Einstellungen von Niklas, Vincent und Joel.
// Alle Aufrufe sind POST mit Studio-PIN (Header x-studio-pin = Umgebungsvariable STUDIO_PIN, wie bei der MEET WALL).
//   POST ?op=all     Body {rev}                      → { rev, data:{<sammlung>:{<id>:doc}} }  oder { rev, unchanged:true }
//   POST ?op=add     Body {coll, doc}                → { ok, rev, id, doc }
//   POST ?op=set     Body {coll, id, doc}            → { ok, rev, id, doc }   (ersetzt oder legt an)
//   POST ?op=update  Body {coll, id, patch}          → { ok, rev, id, doc }   (Felder zusammenführen; legt an, wenn es den Eintrag nicht gibt)
//   POST ?op=delete  Body {coll, id}                 → { ok, rev, id }
// Speicher: Netlify Blobs, Store "meet-kalender", ein einziger Eintrag data.json mit allen Sammlungen.
// Geschrieben wird nur, wenn sich der Eintrag seit dem Lesen nicht geändert hat (ETag, onlyIfMatch) – sonst nochmals lesen und wiederholen.
// rev = ETag des Eintrags; die Seite fragt alle paar Sekunden mit ihrer rev nach und bekommt nur bei Änderung die Daten.
// Lokal (Entwicklungs-Server) ersetzt MEET_WALL_LOCAL_DIR die Blobs durch die Datei kalender/data.json in diesem Ordner.
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const COLLS = ['termine', 'aufgaben', 'beitraege', 'abwesenheiten', 'wochen', 'monate', 'links', 'kommentare', 'einstellungen'];
const KEY = 'data.json';
const MAX_DOC_BYTES = 24 * 1024;      // ein Eintrag (Einstellungen mit Vorlagen sind die grössten)
const MAX_DOCS_PER_COLL = 20000;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024; // Obergrenze für data.json – weit über dem, was drei Leute in Jahren eintragen

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, x-studio-pin' };
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const msg = (e) => (e && e.message) || String(e);
const newId = () => Date.now().toString(36).padStart(9, '0') + '-' + Math.random().toString(36).slice(2, 8);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,60}$/.test(id);

// Der Store wird bei jedem Zugriff neu angelegt (kurzlebiges Token pro Aufruf, siehe wall-store.mjs).
function store() {
  const dir = process.env.MEET_WALL_LOCAL_DIR;
  if (dir) return fileStore(path.join(dir, 'kalender'));
  return getStore({ name: 'meet-kalender', consistency: 'strong' });
}

// Liest data.json samt ETag; leerer Speicher → leere Sammlungen.
async function readAll() {
  const r = await store().getWithMetadata(KEY, { type: 'json' });
  const data = r && isObj(r.data) ? r.data : {};
  for (const c of COLLS) if (!isObj(data[c])) data[c] = {};
  return { data, etag: r ? r.etag || '' : '' };
}

// Schreibt data.json nur, wenn der Eintrag seit dem Lesen unverändert ist (sonst null → nochmals versuchen).
async function writeAll(data, etag) {
  const text = JSON.stringify(data);
  if (text.length > MAX_TOTAL_BYTES) { const e = new Error('Der Kalender-Speicher ist voll. Bitte alte Einträge löschen.'); e.code = 'quota_exceeded'; throw e; }
  const s = store();
  const opts = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
  const r = await s.set(KEY, text, opts);
  if (r && r.modified === false) return null;
  return (r && r.etag) || createHash('sha1').update(text).digest('hex');
}

// Eine Änderung mit bis zu fünf Wiederholungen bei gleichzeitigen Schreibzugriffen.
async function mutate(fn) {
  for (let i = 0; i < 5; i++) {
    const { data, etag } = await readAll();
    const out = fn(data);
    const rev = await writeAll(data, etag);
    if (rev) return { rev, ...out };
    await new Promise((r) => setTimeout(r, 60 + Math.random() * 120));
  }
  throw new Error('Gleichzeitige Änderung – bitte nochmals versuchen.');
}

function cleanDoc(doc) {
  if (!isObj(doc)) { const e = new Error('Eintrag fehlt oder ist kein Objekt'); e.code = 'invalid_argument'; throw e; }
  const { id, ...rest } = doc; // die id steckt im Schlüssel, nie im Eintrag
  const text = JSON.stringify(rest);
  if (text.length > MAX_DOC_BYTES) { const e = new Error('Der Eintrag ist zu gross'); e.code = 'invalid_argument'; throw e; }
  return JSON.parse(text);
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);

  const pin = process.env.STUDIO_PIN || '';
  if (!pin) return json({ error: 'STUDIO_PIN ist auf Netlify nicht gesetzt' }, 503);
  let sent = ''; try { sent = decodeURIComponent(req.headers.get('x-studio-pin') || ''); } catch (e) { }
  if (sent !== pin) return json({ error: 'Studio-PIN fehlt oder falsch' }, 401);

  const op = new URL(req.url).searchParams.get('op') || '';
  let body = {}; try { body = await req.json(); } catch (e) { }
  if (!isObj(body)) body = {};

  try {
    if (op === 'all') {
      const { data, etag } = await readAll();
      if (etag && typeof body.rev === 'string' && body.rev === etag) return json({ rev: etag, unchanged: true });
      return json({ rev: etag, data });
    }
    const coll = typeof body.coll === 'string' && COLLS.includes(body.coll) ? body.coll : '';
    if (!coll) return json({ error: 'Unbekannte Sammlung' }, 400);

    if (op === 'add') {
      const doc = cleanDoc(body.doc);
      const id = newId();
      const r = await mutate((data) => {
        if (Object.keys(data[coll]).length >= MAX_DOCS_PER_COLL) { const e = new Error('Zu viele Einträge'); e.code = 'quota_exceeded'; throw e; }
        data[coll][id] = doc; return { id, doc };
      });
      return json({ ok: true, ...r });
    }
    if (!validId(body.id)) return json({ error: 'id fehlt oder ungültig' }, 400);
    const id = body.id;

    if (op === 'set') {
      const doc = cleanDoc(body.doc);
      const r = await mutate((data) => { data[coll][id] = doc; return { id, doc }; });
      return json({ ok: true, ...r });
    }
    if (op === 'update') {
      const patch = cleanDoc(body.patch);
      const r = await mutate((data) => { const doc = { ...(isObj(data[coll][id]) ? data[coll][id] : {}), ...patch }; data[coll][id] = doc; return { id, doc }; });
      return json({ ok: true, ...r });
    }
    if (op === 'delete') {
      const r = await mutate((data) => { delete data[coll][id]; return { id }; });
      return json({ ok: true, ...r });
    }
    return json({ error: 'Unbekannte Operation' }, 400);
  } catch (e) {
    const status = e && e.code === 'invalid_argument' ? 400 : e && e.code === 'quota_exceeded' ? 413 : 502;
    return json({ error: msg(e), code: (e && e.code) || '' }, status);
  }
};

// ---- Datei-Speicher für die lokale Vorschau (dieselben zwei Methoden wie der Blobs-Store) ----
function fileStore(dir) {
  const file = path.join(dir, KEY);
  const etagOf = (t) => createHash('sha1').update(t).digest('hex');
  return {
    async getWithMetadata(k, o) {
      try { const t = await fs.readFile(file, 'utf8'); return { data: o && o.type === 'json' ? JSON.parse(t) : t, etag: etagOf(t) }; } catch (e) { return null; }
    },
    async set(k, text, opts) {
      let cur = null; try { cur = etagOf(await fs.readFile(file, 'utf8')); } catch (e) { }
      if (opts && opts.onlyIfMatch && opts.onlyIfMatch !== cur) return { modified: false };
      if (opts && opts.onlyIfNew && cur) return { modified: false };
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file, text);
      return { modified: true, etag: etagOf(text) };
    }
  };
}
