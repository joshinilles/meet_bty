// MEETmoment-Highlight für das Studio: Abschrift eines Ton-Stücks (op=transcribe) und Auswahl
// zitierfähiger Sätze (op=pick). Aufruf nur mit der Studio-PIN (Header x-studio-pin = STUDIO_PIN).
// Umgebungsvariablen auf Netlify: STUDIO_PIN (Pflicht), OPENAI_API_KEY (Pflicht, Abschrift),
// ANTHROPIC_API_KEY (optional, bessere Satzauswahl), STT_MODEL, HIGHLIGHT_MODEL (optional).
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, x-studio-pin' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const str = (fd, k, max) => { const v = fd.get(k); return typeof v === 'string' ? v.slice(0, max || 2000) : ''; };

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);
  const pin = process.env.STUDIO_PIN || '';
  if (!pin) return json({ error: 'STUDIO_PIN ist auf Netlify nicht gesetzt' }, 503);
  let sent = ''; try { sent = decodeURIComponent(req.headers.get('x-studio-pin') || ''); } catch (e) { }
  if (sent !== pin) return json({ error: 'Studio-PIN fehlt oder falsch' }, 401);
  const op = new URL(req.url).searchParams.get('op') || '';
  let fd; try { fd = await req.formData(); } catch (e) { return json({ error: 'Anfrage unlesbar: ' + (e && e.message ? e.message : e) }, 400); }
  try {
    if (op === 'transcribe') return await transcribe(fd);
    if (op === 'pick') return await pick(fd);
    return json({ error: 'Unbekannte Aktion' }, 400);
  } catch (e) {
    return json({ error: (e && e.message) ? e.message : String(e) }, 502);
  }
};

async function transcribe(fd) {
  const key = process.env.OPENAI_API_KEY || '';
  if (!key) return json({ error: 'OPENAI_API_KEY ist auf Netlify nicht gesetzt' }, 503);
  const audio = fd.get('audio');
  if (!audio || typeof audio === 'string' || !audio.size) return json({ error: 'Kein Ton-Stück erhalten' }, 400);
  if (audio.size > 5.5e6) return json({ error: 'Ton-Stück zu gross (' + (audio.size / 1e6).toFixed(1) + ' MB)' }, 413);
  const ref = str(fd, 'ref', 120), prev = str(fd, 'prompt', 400);
  const out = new FormData();
  out.append('file', audio, 'meetmoment.m4a');
  out.append('model', process.env.STT_MODEL || 'gpt-4o-mini-transcribe');
  out.append('language', 'de');
  out.append('response_format', 'json');
  const ctx = 'MEET DAILY, MEETmoment, bibletunes Youth, Bibel' + (ref ? ', ' + ref : '') + '.';
  out.append('prompt', prev ? ctx + ' ' + prev : ctx);
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: out });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: 'OpenAI ' + r.status + ': ' + ((j.error && j.error.message) || 'Abschrift fehlgeschlagen') }, 502);
  return json({ text: typeof j.text === 'string' ? j.text : '' });
}

const SYSTEM = 'Du hilfst dem Team von bibletunes Youth (deutschsprachige christliche Jugendarbeit), aus der automatischen Abschrift eines kurzen Morgen-Videos („MEETmoment“) Sätze auszuwählen, die als Zitat auf einer Social-Media-Grafik stehen. Du antwortest ausschliesslich mit JSON.';
function userPrompt(fd) {
  const transcript = str(fd, 'transcript', 24000), ref = str(fd, 'ref', 120), name = str(fd, 'name', 40), thema = str(fd, 'thema', 160);
  return `Sprecher: ${name || 'unbekannt'}. Bibelstelle: ${ref || 'unbekannt'}.${thema ? ' Thema laut Plan: ' + thema + '.' : ''}

Abschrift (automatisch erstellt, kann Hörfehler enthalten):
"""
${transcript}
"""

Wähle die 5 Sätze, die sich am besten als Zitat auf einer Grafik eignen: ermutigend oder zum Nachdenken, auch ohne Zusammenhang verständlich, 6 bis 22 Wörter, so wörtlich wie möglich. Erlaubt: Füllwörter streichen, Grammatik und offensichtliche Hörfehler minimal glätten, zwei kurze Sätze verbinden. Nicht erlaubt: neue Inhalte oder eine Umformulierung in andere Worte. Eigene Sätze des Sprechers sind besser als reine Bibelzitate. Sortiere den stärksten Satz nach oben. "why" ist ein knapper Grund mit höchstens 6 Wörtern.
Antworte nur mit diesem JSON: {"sentences":[{"text":"…","why":"…"}]}`;
}
function parseSentences(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('Antwort ohne JSON');
  const j = JSON.parse(text.slice(a, b + 1));
  const list = Array.isArray(j.sentences) ? j.sentences : Array.isArray(j) ? j : [];
  return list.filter(s => s && typeof s.text === 'string' && s.text.trim()).slice(0, 6).map(s => ({ text: s.text.trim(), why: typeof s.why === 'string' ? s.why.trim() : '' }));
}
async function pick(fd) {
  if (!str(fd, 'transcript', 24000).trim()) return json({ error: 'Keine Abschrift erhalten' }, 400);
  const akey = process.env.ANTHROPIC_API_KEY || '', okey = process.env.OPENAI_API_KEY || '';
  if (!akey && !okey) return json({ error: 'Weder ANTHROPIC_API_KEY noch OPENAI_API_KEY ist auf Netlify gesetzt' }, 503);
  const prompt = userPrompt(fd);
  let lastErr = null;
  if (akey) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'x-api-key': akey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: process.env.HIGHLIGHT_MODEL || 'claude-haiku-5-5', max_tokens: 900, system: SYSTEM, messages: [{ role: 'user', content: prompt }] })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + ((j.error && j.error.message) || 'Auswahl fehlgeschlagen'));
      const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
      return json({ sentences: parseSentences(text), by: 'anthropic' });
    } catch (e) { lastErr = e; if (!okey) throw e; }
  }
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + okey, 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini', temperature: 0.3, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }] })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((lastErr ? lastErr.message + ' · ' : '') + 'OpenAI ' + r.status + ': ' + ((j.error && j.error.message) || 'Auswahl fehlgeschlagen'));
  const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  return json({ sentences: parseSentences(text), by: 'openai' });
}

export const config = { path: '/.netlify/functions/highlight' };
