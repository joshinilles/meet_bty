// Speicher der MEET WALL (Netlify Blobs, Store "meet-wall").
// Schlüssel:  p/<id>      wartender Moment (noch nicht geprüft)
//             d/<id>      entschiedener Moment (status "frei" oder "nein")
//             index.json  freigegebene Momente, neueste zuerst, höchstens INDEX_MAX Einträge – das liest die Wand
//             q/<id>      offene Frage zum Text (nur für die Prüfseite, mit Vorname – nie auf der Wand)
//             qd/<id>     erledigte Frage (beantwortet oder ohne Antwort abgelegt; Antwort in .answer)
//             qa/<hash>   beantwortete Frage (Hash des Fragetexts → Antwort), damit das Gerät des Fragenden sie abrufen kann
//             s/<hash>    Push-Abo des Geräts, das diese Frage gestellt hat (Hash des Fragetexts → Web-Push-Subscription);
//                         wird nach der Antwort-Push wieder gelöscht
//             mod/<hash>  Push-Abo eines Moderator-Geräts (Hash des Endpoints → {sub, name, at}); bekommt Bescheid bei
//                         neuem MEETmoment / neuer Frage (Portal → „Bescheid sagen“, lib/push.mjs)
//             r/<hash>    abgelehnter Moment (Hash des Textes → Begründung), damit das Gerät des Absenders Bescheid weiss
// Lokal (Entwicklungs-Server) ersetzt MEET_WALL_LOCAL_DIR die Blobs durch Dateien auf der Platte.
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const INDEX_MAX = 150;

// Der Blobs-Store wird bei JEDEM Zugriff neu angelegt: Netlify gibt der Funktion pro Aufruf ein kurzlebiges
// Zugriffstoken; ein einmal gemerkter Store nutzt in einer warm gehaltenen Instanz das alte Token weiter
// und scheitert dann mit „Failed to decode token: Token expired“ (so geschehen am 20.10.2026).
let localStore;
export function wallStore() {
  const dir = process.env.MEET_WALL_LOCAL_DIR;
  if (dir) return (localStore = localStore || fileStore(dir));
  return getStore({ name: 'meet-wall', consistency: 'strong' });
}

// Texte werden für den Abgleich normalisiert (Leerraum, Gross/klein spielen keine Rolle)
export const normText = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
export const textHash = (t) => createHash('sha256').update(normText(t)).digest('hex');

export const newId = () => Date.now().toString(36).padStart(9, '0') + '-' + Math.random().toString(36).slice(2, 8);

// Öffentliche Sicht auf einen Moment: nur Text, Bibelstelle und Zeit – nie Name oder Technik.
export const publicView = (m) => ({ id: m.id, text: m.text, passage: m.passage || '', date: m.date || '', ts: m.ts || '' });

export async function readJson(key, fallback) {
  const v = await wallStore().get(key, { type: 'json' });
  return v == null ? fallback : v;
}
export const writeJson = (key, obj) => wallStore().setJSON(key, obj);
export const remove = (key) => wallStore().delete(key);

export async function listKeys(prefix) {
  const { blobs } = await wallStore().list({ prefix });
  return blobs.map((b) => b.key).sort();
}

export async function readIndex() {
  const idx = await readJson('index.json', { items: [] });
  return Array.isArray(idx.items) ? idx.items : [];
}
export async function writeIndex(items) {
  items.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  await writeJson('index.json', { items: items.slice(0, INDEX_MAX), updated: new Date().toISOString() });
}

// ---- Datei-Speicher für die lokale Vorschau (gleiche vier Methoden wie der Blobs-Store) ----
function fileStore(dir) {
  const file = (k) => path.join(dir, k.replace(/[^a-zA-Z0-9._\/-]/g, '_'));
  return {
    async get(k, o) {
      try { const t = await fs.readFile(file(k), 'utf8'); return o && o.type === 'json' ? JSON.parse(t) : t; } catch (e) { return null; }
    },
    async setJSON(k, v) { await fs.mkdir(path.dirname(file(k)), { recursive: true }); await fs.writeFile(file(k), JSON.stringify(v)); },
    async delete(k) { try { await fs.unlink(file(k)); } catch (e) { } },
    async list({ prefix }) {
      let names = []; try { names = await fs.readdir(file(prefix)); } catch (e) { }
      return { blobs: names.map((n) => ({ key: prefix + n })) };
    }
  };
}
