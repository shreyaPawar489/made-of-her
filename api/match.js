// /api/match (P1) — Vercel serverless function. Picks, for each achievement, the real woman from the library whose
// story is the closest match, with a one-line reason that only uses facts from her desc/memo.
// POST { items:[{key, achievement, track}], candidates:{ track:[{id,name,desc,memo}] } }
//  →   { matches:[{key, id, reason}] }   (ids are always one of that item's candidates; each id used at most once)
// Needs ANTHROPIC_API_KEY in Vercel env. Without it (or on any failure) returns 501/502 — the client falls back to a
// local pick. CORS * so http://localhost can call the deployed function.

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
}
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(501).json({ error: 'not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const items = (body && Array.isArray(body.items) ? body.items : []).slice(0, 12)
    .filter(it => it && it.key != null && it.achievement)
    .map(it => ({ key: String(it.key), achievement: clip(it.achievement, 300), track: clip(it.track, 30) }));
  const cands = {};
  const rawC = (body && body.candidates) || {};
  for (const t of Object.keys(rawC).slice(0, 26)) {
    if (!Array.isArray(rawC[t])) continue;
    cands[t] = rawC[t].slice(0, 30).filter(c => c && c.id != null)
      .map(c => ({ id: c.id, name: clip(c.name, 80), desc: clip(c.desc, 200), memo: clip(c.memo, 400) }));
  }
  if (!items.length) return res.status(400).json({ error: 'no items' });

  // every candidate across all tracks (an item whose track has no list may use any of them)
  const all = [].concat(...Object.values(cands));
  const byId = new Map(all.map(c => [String(c.id), c]));
  if (!all.length) return res.status(400).json({ error: 'no candidates' });
  // per-item list ('k:<key>', ranked client-side by overlap) wins, then the track list, then everyone
  const listFor = it => [cands['k:' + it.key], cands[it.track], all].find(l => l && l.length);

  const prompt =
    'You connect a woman\'s achievements to real women from history and today who did something similar.\n' +
    'For EACH item, choose exactly one candidate id from that item\'s own candidate list. Use a different woman for each item when possible.\n' +
    'Pick the candidate whose desc/memo shows she did the SAME KIND of thing (e.g. led a student group, founded something, argued a case, ran a lab, won a competition). ' +
    'Candidates are listed roughly best-first.\n' +
    'Write "reason": one sentence, at most 28 words, addressing the user as "you". Be honest about how close the match is:\n' +
    '- If she clearly did a similar thing, say what she did, e.g. "She also led her university\'s student union before entering politics."\n' +
    '- If no candidate did a similar thing, do NOT claim one. Name only the genuine shared trait (same field, also a first, also a leader), e.g. "Like you, she took on leadership early; she went on to become a senator."\n' +
    'Never equate different roles (a student-club presidency is not a cabinet post; a class is not a career). ' +
    'Use ONLY facts stated in the candidate\'s desc/memo. Never invent dates, schools, awards or quotes.\n\n' +
    items.map(it =>
      `ITEM key=${JSON.stringify(it.key)} track=${it.track || 'any'}\nAchievement: ${it.achievement}\nCandidates:\n` +
      listFor(it).map(c => `- id=${c.id} | ${c.name} | ${c.desc} | ${c.memo}`).join('\n')
    ).join('\n\n');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-5-5',
        max_tokens: 1500,
        tools: [{
          name: 'submit_matches',
          description: 'Submit one match per item.',
          input_schema: {
            type: 'object',
            properties: {
              matches: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { key: { type: 'string' }, id: { type: ['integer', 'string'] }, reason: { type: 'string' } },
                  required: ['key', 'id', 'reason']
                }
              }
            },
            required: ['matches']
          }
        }],
        tool_choice: { type: 'tool', name: 'submit_matches' },
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!r.ok) return res.status(502).json({ error: 'upstream ' + r.status });
    const j = await r.json();
    const use = (j.content || []).find(b => b.type === 'tool_use');
    const got = (use && use.input && Array.isArray(use.input.matches)) ? use.input.matches : [];

    // validate: id must be in that item's candidates; ids unique; fill gaps with an unused candidate
    const used = new Set();
    const gotByKey = new Map(got.map(m => [String(m.key), m]));
    const matches = items.map(it => {
      const list = listFor(it);
      const allowed = new Set(list.map(c => String(c.id)));
      const m = gotByKey.get(it.key);
      let id = m && allowed.has(String(m.id)) && !used.has(String(m.id)) ? String(m.id) : null;
      let reason = m && id ? clip(m.reason, 220) : '';
      if (!id) {
        const free = list.find(c => !used.has(String(c.id))) || list[0];
        id = String(free.id);
        reason = `${free.name}: ${free.desc}`.slice(0, 160);
      }
      used.add(id);
      const c = byId.get(id);
      return { key: it.key, id: typeof c.id === 'number' ? c.id : (isNaN(+id) ? id : +id), reason };
    });
    res.status(200).json({ matches });
  } catch (e) {
    res.status(502).json({ error: 'failed' });
  }
};
