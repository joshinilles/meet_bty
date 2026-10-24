// Cloudflare R2 (S3-kompatibel) ohne SDK: vorsignierte Adressen (AWS Signature V4), damit das Studio die
// Morgen-Videos direkt vom Handy in den Speicher legt – an Netlify vorbei (Functions nehmen höchstens 6 MB an).
// Umgebungsvariablen auf Netlify:
//   R2_ACCOUNT_ID         Cloudflare-Konto-ID (Dashboard → R2 → rechts „Account ID“)
//   R2_ACCESS_KEY_ID      R2-API-Token: Zugriffsschlüssel-ID
//   R2_SECRET_ACCESS_KEY  R2-API-Token: geheimer Schlüssel
//   R2_BUCKET             Name des Buckets (Standard: meet-daily)
//   R2_PUBLIC_URL         öffentliche Adresse des Buckets, z. B. https://pub-….r2.dev oder https://video.meet-bty.com
import { createHash, createHmac } from 'node:crypto';

export function r2Config() {
  const account = process.env.R2_ACCOUNT_ID || '', key = process.env.R2_ACCESS_KEY_ID || '', secret = process.env.R2_SECRET_ACCESS_KEY || '';
  const bucket = process.env.R2_BUCKET || 'meet-daily';
  const publicUrl = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
  if (!account || !key || !secret || !publicUrl) return null;
  return { account, key, secret, bucket, publicUrl, host: account + '.r2.cloudflarestorage.com' };
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const hmac = (k, s) => createHmac('sha256', k).update(s).digest();
// S3 verlangt RFC-3986-Kodierung je Pfadsegment (auch „~“ bleibt, „/“ trennt)
const encSeg = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const encKey = (k) => k.split('/').map(encSeg).join('/');

// Vorsignierte Adresse für PUT (hochladen), DELETE (löschen) oder HEAD/GET. Gültigkeit in Sekunden.
export function presign(cfg, method, key, expires = 900, now = new Date()) {
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
