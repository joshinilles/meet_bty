// Cloudflare R2 (S3-kompatibel) ohne SDK: vorsignierte Adressen (AWS Signature V4), damit das Studio die
// Morgen-Videos direkt vom Handy in den Speicher legt – an Netlify vorbei (Functions nehmen höchstens 6 MB an).
// Umgebungsvariablen auf Netlify:
//   R2_ACCOUNT_ID         Cloudflare-Konto-ID (Dashboard → R2 → rechts „Account ID“)
//   R2_ACCESS_KEY_ID      R2-API-Token: Zugriffsschlüssel-ID
//   R2_SECRET_ACCESS_KEY  R2-API-Token: geheimer Schlüssel
//   R2_BUCKET             Name des Buckets (Standard: meet-daily)
//   R2_PUBLIC_URL         öffentliche Adresse des Buckets, z. B. https://pub-….r2.dev oder https://video.meet-bty.com
//   R2_JURISDICTION       nur wenn der Bucket mit Standort „EU“ angelegt wurde: eu (Endpunkt <konto>.eu.r2.cloudflarestorage.com)
import { createHash, createHmac } from 'node:crypto';

export function r2Config() {
  const env = (k) => (process.env[k] || '').trim(); // Leerzeichen/Zeilenumbrüche aus dem Einfügen abschneiden
  // Konto-ID auch dann finden, wenn die ganze S3-Adresse eingefügt wurde (https://<id>.r2.cloudflarestorage.com oder <id>.eu.r2.…)
  let account = env('R2_ACCOUNT_ID'), jurFromUrl = '';
  const m = account.match(/^(?:https?:\/\/)?([0-9a-f]{32})(?:\.([a-z]+))?\.r2\.cloudflarestorage\.com\/?/i);
  if (m) { account = m[1]; jurFromUrl = (m[2] || '').toLowerCase(); }
  const key = env('R2_ACCESS_KEY_ID'), secret = env('R2_SECRET_ACCESS_KEY');
  const bucket = env('R2_BUCKET') || 'meet-daily';
  const publicUrl = env('R2_PUBLIC_URL').replace(/\/+$/, '');
  const jur = env('R2_JURISDICTION').toLowerCase() || jurFromUrl;
  if (!account || !key || !secret || !publicUrl) return null;
  return { account, key, secret, bucket, publicUrl, host: account + (jur ? '.' + jur : '') + '.r2.cloudflarestorage.com' };
}

// Fehlerursache von fetch lesbar machen (undici meldet nur „fetch failed“, die Ursache steckt in .cause)
export const fetchWhy = (e) => { const c = e && e.cause; return [e && e.message, c && c.code, c && c.message].filter(Boolean).join(' · '); };

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const hmac = (k, s) => createHmac('sha256', k).update(s).digest();
// S3 verlangt RFC-3986-Kodierung je Pfadsegment (auch „~“ bleibt, „/“ trennt)
const encSeg = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const encKey = (k) => k.split('/').map(encSeg).join('/');

// Vorsignierte Adresse für PUT (hochladen), DELETE (löschen) oder HEAD/GET. Gültigkeit in Sekunden.
export function presign(cfg, method, key, expires = 900, now = new Date(), extraQuery = null) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20261024T054500Z
  const date = amzDate.slice(0, 8);
  const scope = date + '/auto/s3/aws4_request';
  const q = new URLSearchParams();
  q.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  q.set('X-Amz-Content-Sha256', 'UNSIGNED-PAYLOAD');
  q.set('X-Amz-Credential', cfg.key + '/' + scope);
  q.set('X-Amz-Date', amzDate);
  q.set('X-Amz-Expires', String(expires));
  q.set('X-Amz-SignedHeaders', 'host');
  if (extraQuery) for (const k of Object.keys(extraQuery)) q.set(k, extraQuery[k]);
  const canonicalQuery = [...q.entries()].map(([k, v]) => encSeg(k) + '=' + encSeg(v)).sort().join('&');
  const canonicalUri = '/' + encSeg(cfg.bucket) + '/' + encKey(key);
  const canonical = [method, canonicalUri, canonicalQuery, 'host:' + cfg.host + '\n', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac('AWS4' + cfg.secret, date), 'auto'), 's3'), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(toSign).digest('hex');
  return 'https://' + cfg.host + canonicalUri + '?' + canonicalQuery + '&X-Amz-Signature=' + signature;
}

export const publicUrl = (cfg, key) => cfg.publicUrl + '/' + encKey(key);

// Objekt löschen (bestes Bemühen – ein Fehler hier darf den Ablauf nicht stoppen)
export async function deleteObject(cfg, key) {
  try { const r = await fetch(presign(cfg, 'DELETE', key, 60), { method: 'DELETE' }); return r.ok || r.status === 404; } catch (e) { return false; }
}

// Prüft, ob das Objekt wirklich angekommen ist (Grösse laut Speicher)
export async function headObject(cfg, key) {
  try {
    const r = await fetch(presign(cfg, 'HEAD', key, 60), { method: 'HEAD' });
    if (!r.ok) return null;
    return { size: Number(r.headers.get('content-length') || 0), type: r.headers.get('content-type') || '' };
  } catch (e) { return null; }
}

// Selbstprüfung für das Studio: stimmen Konto-ID/Endpunkt, Schlüssel und CORS-Regel? Liefert einen lesbaren Befund.
export async function checkSetup(cfg, origin) {
  const out = { endpoint: 'https://' + cfg.host + '/' + cfg.bucket, publicUrl: cfg.publicUrl, steps: [], ok: false };
  // 1) HEAD auf einen Schlüssel, den es nicht gibt: 404 = Endpunkt und Schlüssel stimmen; 403 = Schlüssel/Token falsch
  let r;
  try { r = await fetch(presign(cfg, 'HEAD', '_pruefung/' + Date.now(), 60), { method: 'HEAD' }); }
  catch (e) {
    out.steps.push({ step: 'endpunkt', ok: false, text: 'Der Speicher-Endpunkt ' + cfg.host + ' ist nicht erreichbar – R2_ACCOUNT_ID prüfen (Account ID rechts auf der R2-Übersicht). ' + fetchWhy(e) });
    return out;
  }
  if (r.status === 404) out.steps.push({ step: 'zugang', ok: true, text: 'Konto, Bucket „' + cfg.bucket + '“ und API-Schlüssel stimmen.' });
  else if (r.status === 403 || r.status === 401) { out.steps.push({ step: 'zugang', ok: false, text: 'Der Speicher lehnt den Schlüssel ab (HTTP ' + r.status + ') – R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY prüfen; der Token braucht „Object Read & Write“ für diesen Bucket.' + (cfg.host.includes('.eu.') ? '' : ' Wurde der Bucket mit Standort „EU“ angelegt, zusätzlich R2_JURISDICTION=eu setzen.') }); return out; }
  else if (r.status === 400 || r.status === 301) { out.steps.push({ step: 'zugang', ok: false, text: 'Bucket oder Endpunkt passen nicht (HTTP ' + r.status + ') – R2_BUCKET prüfen; bei Standort „EU“ R2_JURISDICTION=eu setzen.' }); return out; }
  else { out.steps.push({ step: 'zugang', ok: false, text: 'Unerwartete Antwort vom Speicher (HTTP ' + r.status + ').' }); return out; }
  // 2) CORS-Regel des Buckets lesen (S3 GetBucketCors)
  try {
    const c = await fetch(presign(cfg, 'GET', '', 60, new Date(), { cors: '' }));
    const xml = await c.text();
    if (c.status === 404) { out.steps.push({ step: 'cors', ok: false, text: 'Im Bucket ist keine CORS-Regel gespeichert. Cloudflare → R2 → Bucket → Settings → CORS policy: die Regel aus der README eintragen und speichern.' }); return out; }
    if (!c.ok) { out.steps.push({ step: 'cors', ok: false, text: 'CORS-Regel liess sich nicht lesen (HTTP ' + c.status + ').' }); return out; }
    const origins = [...xml.matchAll(/<AllowedOrigin>([^<]*)<\/AllowedOrigin>/g)].map((m) => m[1]);
    const methods = [...xml.matchAll(/<AllowedMethod>([^<]*)<\/AllowedMethod>/g)].map((m) => m[1].toUpperCase());
    const headers = [...xml.matchAll(/<AllowedHeader>([^<]*)<\/AllowedHeader>/g)].map((m) => m[1].toLowerCase());
    const probs = [];
    if (origin && !origins.includes('*') && !origins.includes(origin)) probs.push('die Herkunft ' + origin + ' fehlt bei AllowedOrigins (eingetragen: ' + (origins.join(', ') || 'nichts') + ')');
    if (!methods.includes('PUT')) probs.push('PUT fehlt bei AllowedMethods');
    if (!headers.includes('*') && !headers.includes('content-type')) probs.push('content-type fehlt bei AllowedHeaders');
    if (probs.length) out.steps.push({ step: 'cors', ok: false, text: 'CORS-Regel unvollständig: ' + probs.join('; ') + '.' });
    else out.steps.push({ step: 'cors', ok: true, text: 'CORS-Regel erlaubt den Upload von ' + (origin || 'der Seite') + '.' });
  } catch (e) {
    out.steps.push({ step: 'cors', ok: false, text: 'CORS-Regel liess sich nicht lesen: ' + fetchWhy(e) });
  }
  // 3) Öffentliche Adresse: darüber spielt die Startseite die Videos ab (R2_PUBLIC_URL)
  const pubHint = ' Die Adresse steht in Cloudflare → R2 → Bucket → Settings → Public access („Public Development URL“ einschalten, sieht aus wie https://pub-<lange Zeichenfolge>.r2.dev) oder ist die verbundene eigene Domain. Nach dem Ändern auf Netlify neu deployen.';
  if (/…|\.\.\.|<|>/.test(cfg.publicUrl) || !/^https:\/\/[a-z0-9.-]+$/i.test(cfg.publicUrl)) {
    out.steps.push({ step: 'public', ok: false, text: 'R2_PUBLIC_URL ist ein Platzhalter oder keine gültige Adresse („' + cfg.publicUrl + '“).' + pubHint });
    return out;
  }
  try {
    const r = await fetch(cfg.publicUrl + '/_pruefung', { method: 'HEAD' });
    if (r.status === 404) out.steps.push({ step: 'public', ok: true, text: 'Öffentliche Adresse ' + cfg.publicUrl + ' antwortet.' });
    else if (r.status === 401 || r.status === 403) out.steps.push({ step: 'public', ok: false, text: 'Die öffentliche Adresse ' + cfg.publicUrl + ' ist nicht freigegeben (HTTP ' + r.status + ').' + pubHint });
    else out.steps.push({ step: 'public', ok: false, text: 'Die öffentliche Adresse ' + cfg.publicUrl + ' antwortet unerwartet (HTTP ' + r.status + ').' + pubHint });
  } catch (e) {
    out.steps.push({ step: 'public', ok: false, text: 'Die öffentliche Adresse ' + cfg.publicUrl + ' ist nicht erreichbar (' + fetchWhy(e) + ').' + pubHint });
  }
  out.ok = out.steps.every((s) => s.ok);
  return out;
}
