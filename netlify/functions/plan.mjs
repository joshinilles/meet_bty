// Holt den MEET DAILY Jahresplan (Google Sheet, als CSV) für das Studio ab.
// Nur Google-Sheets-Adressen sind erlaubt; die Antwort ist 5 Minuten zwischengespeichert.
export default async (req) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const u = new URL(req.url).searchParams.get('u') || '';
  if (!/^https:\/\/docs\.google\.com\/spreadsheets\/d\//.test(u)) return new Response('Nur Google-Sheets-Adressen', { status: 400, headers: cors });
  try {
    const r = await fetch(u, { redirect: 'follow' });
    const text = await r.text();
    if (!r.ok || /<html/i.test(text.slice(0, 300))) return new Response('Tabelle nicht öffentlich lesbar (HTTP ' + r.status + ')', { status: 502, headers: cors });
    return new Response(text, { status: 200, headers: { ...cors, 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
  } catch (e) {
    return new Response('Abruf fehlgeschlagen: ' + (e && e.message ? e.message : e), { status: 502, headers: cors });
  }
};
export const config = { path: '/.netlify/functions/plan' };
