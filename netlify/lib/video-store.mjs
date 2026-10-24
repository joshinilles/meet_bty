// Verzeichnis der MEET-DAILY-Videos (Netlify Blobs, Store "meet-video"). Die Videodateien selbst liegen
// bei Cloudflare R2 (lib/r2.mjs); hier steht nur, welches Video an welchem Tag unter welcher Adresse liegt.
// Schlüssel:  d/<YYYY-MM-DD>.json  → { day, items: [{ n, title, name, passage, key, url, posterKey, poster, size, duration, at }] }
// Lokal (Entwicklungs-Server) ersetzt MEET_VIDEO_LOCAL_DIR die Blobs durch Dateien auf der Platte.
import { getStore } from '@netlify/blobs';
import fs from 'node:fs/promises';
import path from 'node:path';

let localStore;
function store() {
  const dir = process.env.MEET_VIDEO_LOCAL_DIR;
  if (dir) return (localStore = localStore || fileStore(path.join(dir, 'index')));
  // Store bei jedem Zugriff neu anlegen: Netlify gibt der Funktion pro Aufruf ein kurzlebiges Token (siehe wall-store.mjs)
  return getStore({ name: 'meet-video', consistency: 'strong' });
}

export const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function readDay(day) {
  const v = await store().get('d/' + day + '.json', { type: 'json' });
  const items = v && Array.isArray(v.items) ? v.items : [];
  return { day, items: items.sort((a, b) => a.n - b.n), updated: (v && v.updated) || '' };
}
export async function writeDay(day, items) {
  await store().setJSON('d/' + day + '.json', { day, items: items.sort((a, b) => a.n - b.n), updated: new Date().toISOString() });
}

// Öffentliche Sicht: Adresse, Titel, Name, Bibelstelle, Länge – kein Speicher-Schlüssel
export const publicView = (v) => ({ n: v.n, title: v.title || '', name: v.name || '', passage: v.passage || '', url: v.url, poster: v.poster || '', size: v.size || 0, duration: v.duration || 0, at: v.at || '' });

function fileStore(dir) {
  const file = (k) => path.join(dir, k.replace(/[^a-zA-Z0-9._\/-]/g, '_'));
  return {
    async get(k, o) { try { const t = await fs.readFile(file(k), 'utf8'); return o && o.type === 'json' ? JSON.parse(t) : t; } catch (e) { return null; } },
    async setJSON(k, v) { await fs.mkdir(path.dirname(file(k)), { recursive: true }); await fs.writeFile(file(k), JSON.stringify(v)); }
  };
}
