// Web Push für meet-bty.com – ein Versandweg für drei Richtungen:
//   · an das Gerät, das eine Frage gestellt hat (Antwort ist da)        → wall.mjs pushAnswer()
//   · an die Moderatoren (neuer MEETmoment wartet, neue Frage zum Text)  → notifyModerators(), ausgelöst von submission-created.mjs
//   · an die Jugendlichen, sobald ein Morgen-Video online ist            → notifyDaily(), ausgelöst von video.mjs (publish)
// Braucht auf Netlify VAPID_PRIVATE_KEY (und VAPID_SUBJECT = mailto:…); der öffentliche Schlüssel steht in config.js (pushKey)
// oder in VAPID_PUBLIC_KEY. Ohne Schlüssel wird nichts verschickt, alles andere funktioniert weiter.
import { createHash } from 'node:crypto';
import { readJson, remove, listKeys } from './wall-store.mjs';
import * as videoStore from './video-store.mjs';

const msg = (e) => (e && e.message ? e.message : String(e));
export const endpointHash = (endpoint) => createHash('sha256').update(String(endpoint || '')).digest('hex');

// Prüft, ob ein vom Browser geschicktes Abo vollständig ist, und kürzt es auf das Nötige
export function cleanSubscription(sub) {
  if (!sub || typeof sub !== 'object' || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return null;
  return { endpoint: sub.endpoint.slice(0, 1000), keys: { p256dh: String(sub.keys.p256dh).slice(0, 200), auth: String(sub.keys.auth).slice(0, 100) } };
}

// Sind die Schlüssel da? (Das Portal zeigt sonst „Push-Schlüssel auf Netlify fehlt“ statt eines stummen Schalters.)
export async function pushReady() {
  const priv = process.env.VAPID_PRIVATE_KEY || '';
  const pub = process.env.VAPID_PUBLIC_KEY || await publicKeyFromConfig();
  return !!(priv && pub);
}

// Schickt eine Push an EIN Abo. Rückgabe: { ok, gone } – gone = das Abo existiert nicht mehr (App gelöscht, Erlaubnis entzogen), weglöschen.
export async function sendPush(sub, payload, opts = {}) {
  const priv = process.env.VAPID_PRIVATE_KEY || '';
  const pub = process.env.VAPID_PUBLIC_KEY || await publicKeyFromConfig();
  if (!priv || !pub) { console.warn('[push] VAPID-Schlüssel fehlen (VAPID_PRIVATE_KEY auf Netlify setzen)'); return { ok: false, gone: false, why: 'keine Schlüssel' }; }
  try {
    const webpush = (await import('web-push')).default;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hallo@bibletunes.com', pub, priv);
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: opts.ttl || 7 * 86400, urgency: opts.urgency || 'normal' });
    return { ok: true, gone: false };
  } catch (e) {
    const code = e && e.statusCode;
    console.warn('[push] Versand gescheitert:', code || '', msg(e));
    return { ok: false, gone: code === 404 || code === 410, why: (code ? code + ' ' : '') + msg(e) };
  }
}

const short = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 3).trimEnd() + '…' : s; };

// ---- Moderatoren (Niklas, Vincent): Abos unter mod/<sha256 des Endpoints> = { sub, name, at } ----
export async function listModerators() {
  const keys = await listKeys('mod/');
  const items = (await Promise.all(keys.map((k) => readJson(k, null))));
  return items.map((m, i) => (m && m.sub ? { key: keys[i], ...m } : null)).filter(Boolean);
}

// Schickt allen angemeldeten Moderator-Geräten dieselbe Nachricht; verwaiste Abos werden dabei entfernt.
// Rückgabe: { sent, total } – scheitert nie laut, der Moment ist unabhängig davon gespeichert.
export async function notifyModerators(payload) {
  let mods = [];
  try { mods = await listModerators(); } catch (e) { console.warn('[push] Moderatoren-Abos nicht lesbar:', msg(e)); return { sent: 0, total: 0 }; }
  if (!mods.length) return { sent: 0, total: 0 };
  if (!(await pushReady())) { console.warn('[push] ' + mods.length + ' Moderator-Abo(s), aber keine VAPID-Schlüssel'); return { sent: 0, total: mods.length }; }
  const results = await Promise.all(mods.map(async (m) => {
    const r = await sendPush(m.sub, payload, { ttl: 86400, urgency: 'high' });
    if (r.gone) await remove(m.key).catch(() => { });
    return r.ok;
  }));
  return { sent: results.filter(Boolean).length, total: mods.length };
}

// Nachrichtentexte für die Moderatoren
export const moderatorPayload = {
  moment: (m) => ({
    title: 'Neuer MEETmoment wartet',
    body: short(m.text, 140) || 'Ein MEETmoment wartet auf Freigabe.',
    url: '/portal/',
    tag: 'meet-mod-moment-' + m.id
  }),
  question: (q) => ({
    title: q.name ? 'Neue Frage zum Text von ' + q.name : 'Neue Frage zum Text',
    body: short(q.text, 140) || 'Eine Frage zum Text wartet auf eine Antwort.',
    url: '/studio/wall/?tab=questions',
    tag: 'meet-mod-frage-' + q.id
  }),
  test: (name) => ({
    title: 'MEET_ Portal · Test',
    body: (name ? name + ', d' : 'D') + 'ieses Gerät bekommt jetzt Bescheid, sobald ein MEETmoment auf Freigabe wartet.',
    url: '/portal/',
    tag: 'meet-mod-test'
  })
};

// ---- Jugendliche: Abos unter ps/<sha256 des Endpoints> im Store meet-video (functions/daily.mjs ?op=subscribe) ----
// Schickt allen angemeldeten Geräten dieselbe Nachricht, sobald ein Morgen-Video online ist; verwaiste Abos fliegen raus.
export async function notifyDaily(payload) {
  let keys = [];
  try { keys = await videoStore.listKeys('ps/'); } catch (e) { console.warn('[push] Abos der Jugendlichen nicht lesbar:', msg(e)); return { sent: 0, total: 0 }; }
  if (!keys.length) return { sent: 0, total: 0 };
  if (!(await pushReady())) { console.warn('[push] ' + keys.length + ' Abo(s), aber keine VAPID-Schlüssel'); return { sent: 0, total: keys.length }; }
  const subs = await Promise.all(keys.map((k) => videoStore.readJson(k, null)));
  const results = await Promise.all(subs.map(async (s, i) => {
    if (!s || !s.sub) return false;
    const r = await sendPush(s.sub, payload, { ttl: 6 * 3600, urgency: 'high' });
    if (r.gone) await videoStore.remove(keys[i]).catch(() => { });
    return r.ok;
  }));
  return { sent: results.filter(Boolean).length, total: keys.length };
}

// Nachrichtentexte für die Jugendlichen: Video 1 „Wir werden gemeinsam still“ mit der Bibelstelle, Video 2 „MEETmoment mit <Name>“.
// Tippen öffnet die Startseite und spielt das Video gleich ab (?play=n).
export function dailyPayload(day, n, passage, name) {
  const ref = short(passage, 80);
  if (n === 1) return { title: 'Wir werden gemeinsam still', body: ref ? ref + ' · Das Video ist da.' : 'Das erste Video von heute ist da.', url: '/?play=1', tag: 'meet-daily-' + day + '-1' };
  return { title: 'MEETmoment' + (name ? ' mit ' + short(name, 30) : ''), body: ref ? ref + ' · Das Video ist da.' : 'Der MEETmoment von heute ist da.', url: '/?play=2', tag: 'meet-daily-' + day + '-2' };
}

// Der öffentliche Schlüssel steht in config.js; die Funktion liest ihn von dort, damit er nur an einer Stelle gepflegt wird
let pubKeyCache = '';
export async function publicKeyFromConfig() {
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
