// matcher.js — strong matches: ranks the real women in the library by how well their BIOGRAPHY fits what the member did.
// Owner: P2 (Emma). Plain keyword search (BM25) over each woman's description + Wikipedia summary, with a small concept
// map ("machine learning" also looks for "artificial intelligence", "computer scientist", …). The member's track is a
// soft boost, not a filter. No network, no API: runs in the browser on library/tiles.json.
//   await JourneyMatch.ready
//   JourneyMatch.rank(text, track, { k: 30, exclude: Set<id> }) -> [tile…] best first (each has .matchScore)
//   JourneyMatch.explain(text, tile) -> ["artificial intelligence", …] words that connect them (for honest "why")
(function () {
  'use strict';
  const STOP = new Set(('a an and are as at be been but by did do does for from had has have her his i in into is it its my of on or our she so than that the their them then there these they this to up was we were what when which who with you your about after all also any can each get got how just more most not out over some such through very will would made make making work worked working helped help new first my')
    .split(' '));

  // light stemmer: enough to match researcher/research/researched, lawyers/lawyer, teaching/teacher/teach
  function stem(w) {
    w = w.replace(/'s$/, '');
    if (w.length <= 3) return w;
    for (const [suf, min] of [['ational', 5], ['ations', 4], ['ation', 4], ['ments', 4], ['ment', 4], ['ings', 4], ['ing', 4], ['ers', 4], ['er', 4], ['ors', 4], ['ists', 4], ['ist', 4], ['ies', 3], ['ied', 3], ['ed', 4], ['es', 4], ['s', 4], ['ly', 5]]) {
      if (w.length - suf.length >= min && w.endsWith(suf)) { w = w.slice(0, -suf.length); if (suf === 'ies' || suf === 'ied') w += 'y'; break; }
    }
    return w;
  }
  // filler that says little about WHAT someone did; never used alone in an explanation or as part of a phrase
  const GENERIC = new Set(['college', 'high', 'school', 'career', 'first', 'team', 'year', 'student', 'day', 'named', 'before', 'state', 'trained', 'chair', 'public', 'new', 'one', 'lead', 'join', 'got', 'spoke', 'speak', 'american', 'british', 'university', 'member', 'former', 'born', 'known', 'including', 'became', 'later', 'early'].map(stem));
  // two-word phrases from words that are directly next to each other ("civil rights", "legal aid", "machine learning")
  function phraseKeys(text) {
    const ws = String(text || '').toLowerCase().match(/[a-z][a-z'-]*[a-z]|[a-z]/g) || [], out = [];
    for (let i = 0; i + 1 < ws.length; i++) {
      const a = ws[i], b = ws[i + 1];
      if (STOP.has(a) || STOP.has(b) || a.length < 3 || b.length < 3) continue;
      const sa = stem(a), sb = stem(b);
      if (GENERIC.has(sa) || GENERIC.has(sb)) continue;
      out.push(sa + '_' + sb);
    }
    return out;
  }
  const tokens = s => (String(s || '').toLowerCase().match(/[a-z][a-z'-]*[a-z]|[a-z]/g) || []).filter(w => !STOP.has(w)).map(stem).filter(w => w.length > 1);

  // concept map: if the member's text contains any trigger, also search for these words (weighted lower than her own words)
  const CONCEPTS = [
    [/machine learning|deep learning|neural|artificial intelligence|\bai\b|\bml\b|data scien|algorithm|\bnlp\b/, 'artificial intelligence computer science algorithm software programmer data researcher'],
    [/code|coding|program|software|developer|hackathon|\bapp\b|website|github|cyber/, 'computer programmer software developer engineer computing'],
    [/research|lab\b|experiment|thesis|publish|paper|journal|study|studies/, 'research professor study published'],
    [/mock trial|moot court|debate|bar exam|paralegal|law school|legal|court|case\b|litigation|contract/, 'lawyer attorney judge court law legal justice'],
    [/startup|found(ed|er|ing)|entrepreneur|\bceo\b|company|business|launch|sales|invest/, 'founder entrepreneur businesswoman company chief executive founded business'],
    [/mentor|mentee|coach|tutor|teach|taught|lecture|class\b|classroom|student/, 'teacher educator professor teaching school university mentor'],
    [/speak|spoke|talk|panel|keynote|present|testif/, 'speaker speech lecture spoke advocate'],
    [/volunteer|nonprofit|charity|community|fundrais|activis|advocat/, 'activist philanthropist humanitarian charity advocate community'],
    [/elect|president of|student government|campaign|senate|council|mayor|policy|vote/, 'politician elected minister president senator government public service'],
    [/surgery|hospital|patient|clinic|medical|nurs|health|doctor|pre-?med/, 'physician doctor surgeon medicine hospital health'],
    [/design|architect|building|blueprint/, 'architect designer design'],
    [/marathon|tournament|athlet|sport|compete|champion|swim|soccer|basketball|olympi|varsity|runner/, 'athlete olympic champion sport player competed'],
    [/write|wrote|article|newspaper|journalis|report|podcast|blog|editor|book/, 'journalist writer author editor reporter newspaper'],
    [/art\b|paint|sculpt|gallery|exhibit|photograph|music|sing|perform|theat|dance|film/, 'artist painter photographer musician singer actress performer filmmaker'],
    [/space|astronom|nasa|telescope|rocket|physics|planet/, 'astronomer astronaut physicist space nasa'],
    [/engineer|robot|mechanical|circuit|build|prototype/, 'engineer engineering inventor'],
    [/win|won|award|prize|scholarship|fellowship|honor/, 'award prize winner honoured laureate'],
    [/civil rights|discriminat|housing|immigra|equal|racis|segregat|human rights/, 'civil rights activist human rights lawyer justice equality discrimination'],
    [/biolog|chem|genetic|climate|environment|ecolog|neuro/, 'biologist chemist scientist research environmental']
  ];

  let idx = null;
  const forms = new Map(); // stem -> { word: count } so connecting words display as real words, not stems
  function note(text) { for (const w of String(text || '').toLowerCase().match(/[a-z][a-z'-]*[a-z]/g) || []) { if (STOP.has(w)) continue; const st = stem(w), m = forms.get(st) || {}; m[w] = (m[w] || 0) + 1; forms.set(st, m); } }
  function surface(st) { const m = forms.get(st); if (!m) return st; return Object.keys(m).sort((a, b) => m[b] - m[a] || a.length - b.length)[0]; }
  function build() {
    const L = window.JourneyLib; if (!L || !L.tiles) return;
    const docs = [], df = new Map(); let total = 0;
    for (const t of L.tiles) {
      if (t.kind !== 'person') continue;
      note([t.desc, t.memo].join(' '));
      const toks = tokens([t.desc, t.desc, t.field, t.field, t.memo].join(' '));
      const tf = new Map(); for (const w of toks.concat(phraseKeys(t.desc), phraseKeys(t.memo))) tf.set(w, (tf.get(w) || 0) + 1);
      for (const w of tf.keys()) df.set(w, (df.get(w) || 0) + 1);
      docs.push({ t, tf, len: toks.length }); total += toks.length;
    }
    idx = { docs, df, N: docs.length, avg: total / Math.max(1, docs.length) };
  }

  function queryTerms(text) {
    const lower = String(text || '').toLowerCase(), q = new Map();
    const own = tokens(text);
    for (const w of own) q.set(w, Math.max(q.get(w) || 0, GENERIC.has(w) ? 0.2 : 1));   // filler like "team" or "join" barely counts
    for (const w of phraseKeys(text)) q.set(w, 1.4);
    for (const [rx, words] of CONCEPTS) if (rx.test(lower)) for (const w of tokens(words)) if (!q.has(w)) q.set(w, 0.4);
    return q;
  }

  function rank(text, track, opts = {}) {
    if (!idx) build();
    const L = window.JourneyLib; if (!idx || !L) return [];
    const k = opts.k || 30, exclude = opts.exclude || new Set(), fields = new Set(L.fieldsFor ? L.fieldsFor(track) : []);
    const q = queryTerms(text), k1 = 1.2, b = 0.75, out = [];
    for (const d of idx.docs) {
      if (exclude.has(d.t.id)) continue;
      let s = 0;
      for (const [w, wt] of q) {
        const f = d.tf.get(w); if (!f) continue;
        const idf = Math.log(1 + (idx.N - (idx.df.get(w) || 0) + 0.5) / ((idx.df.get(w) || 0) + 0.5));
        s += wt * idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / idx.avg));
      }
      if (fields.size && fields.has(d.t.field)) s = s * 1.25 + 0.4;   // her track is a soft boost, not a filter
      out.push({ t: d.t, s });
    }
    out.sort((x, y) => y.s - x.s || x.t.id - y.t.id);
    return out.slice(0, k).map(o => Object.assign({}, o.t, { matchScore: +o.s.toFixed(3) }));
  }

  // the words that actually connect her text and a woman's biography (for an honest explanation)
  function explain(text, tile) {
    if (!idx) build(); if (!idx || !tile) return [];
    const q = queryTerms(text), d = idx.docs.find(x => x.t.id === tile.id); if (!d) return [];
    const raw = new Map(); for (const w of String(text || '').toLowerCase().match(/[a-z][a-z'-]*[a-z]/g) || []) raw.set(stem(w), w.replace(/'s$/, ''));
    const show = st => raw.get(st) || surface(st);
    const generic = GENERIC;
    const hit = [...q.keys()].filter(w => d.tf.has(w));
    const phrases = hit.filter(w => w.includes('_'));
    const covered = new Set(phrases.flatMap(p => p.split('_')));
    const singles = hit.filter(w => !w.includes('_') && !covered.has(w) && !generic.has(w));
    const rarity = w => (idx.df.get(w) || 1);
    const order = (a, b) => (q.get(b) - q.get(a)) || (rarity(a) - rarity(b));
    return phrases.sort(order).slice(0, 2).map(p => p.split('_').map(show).join(' '))
      .concat(singles.sort(order).map(show)).slice(0, 3);
  }

  window.JourneyMatch = { rank, explain, tokens, ready: (window.JourneyLib && window.JourneyLib.ready ? window.JourneyLib.ready.then(build) : Promise.resolve()) };
})();
