// builder.js — builds the photo library IN THE BROWSER (Wikidata + Wikimedia thumbnails + headline cards),
// caches it in IndexedDB, and can export library/atlas.jpg + library/tiles.json to commit.
// Owner: P2 (Emma). Contract: CLAUDE.md §4.
(function () {
  'use strict';
  const TS = 64, PER_ROW = 48, MAX = PER_ROW * PER_ROW;
  const atlas = document.createElement('canvas');
  atlas.width = atlas.height = TS * PER_ROW;
  const actx = atlas.getContext('2d');
  let scratch, sctx;
  function newScratch() {
    scratch = document.createElement('canvas'); scratch.width = scratch.height = TS;
    sctx = scratch.getContext('2d', { willReadFrequently: true });
  }
  newScratch();
  const tiles = [];

  const OCC = [
    ['Q901', 'Scientist'], ['Q82594', 'Computer scientist'], ['Q81096', 'Engineer'], ['Q39631', 'Physician'],
    ['Q169470', 'Physicist'], ['Q593644', 'Chemist'], ['Q11063', 'Astronomer'], ['Q170790', 'Mathematician'],
    ['Q11631', 'Astronaut'], ['Q864503', 'Biologist'], ['Q205375', 'Inventor'], ['Q188094', 'Economist'],
    ['Q82955', 'Politician'], ['Q40348', 'Lawyer'], ['Q15253558', 'Activist'], ['Q1930187', 'Journalist'],
    ['Q36180', 'Writer'], ['Q1028181', 'Painter'], ['Q33231', 'Photographer'], ['Q42973', 'Architect'],
    ['Q974144', 'Educator'], ['Q43845', 'Businessperson'], ['Q2066131', 'Athlete'], ['Q177220', 'Singer']
  ];
  const AWARDS = 'wd:Q38104 wd:Q44585 wd:Q80061 wd:Q37922 wd:Q35637 wd:Q47170 wd:Q28835 wd:Q185667';

  // ---------- md5 (for Wikimedia thumbnail paths) ----------
  function md5(str) {
    const s = unescape(encodeURIComponent(str));
    const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    const Kc = []; for (let i = 0; i < 64; i++) Kc[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
    const n = s.length, nw = (((n + 8) >> 6) + 1) * 16, w = new Array(nw).fill(0);
    for (let i = 0; i < n; i++) w[i >> 2] |= s.charCodeAt(i) << ((i % 4) * 8);
    w[n >> 2] |= 0x80 << ((n % 4) * 8);
    w[nw - 2] = n * 8;
    let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
    for (let j = 0; j < nw; j += 16) {
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        const sh = S[(i >> 4) * 4 + (i % 4)];
        F = (F + A + Kc[i] + w[j + g]) | 0;
        A = D; D = C; C = B;
        B = (B + ((F << sh) | (F >>> (32 - sh)))) | 0;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    return [a0, b0, c0, d0].map(x => { let h = ''; for (let i = 0; i < 4; i++) h += ((x >>> (i * 8)) & 255).toString(16).padStart(2, '0'); return h; }).join('');
  }
  function fileFromP18(url) {
    const m = url.split('Special:FilePath/')[1];
    if (!m) return null;
    const name = decodeURIComponent(m).replace(/ /g, '_');
    return /\.(jpe?g|png)$/i.test(name) ? name : null;
  }
  function thumbUrl(name, width) {
    const h = md5(name);
    const enc = encodeURIComponent(name).replace(/%2C/g, ',').replace(/%3A/g, ':').replace(/%40/g, '@').replace(/%24/g, '$').replace(/%3B/g, ';');
    return `https://upload.wikimedia.org/wikipedia/commons/thumb/${h[0]}/${h.slice(0, 2)}/${enc}/${width}px-${enc}`;
  }

  // ---------- tiles ----------
  function addTile(src, meta, bias = 0.15) {
    if (tiles.length >= MAX) return false;
    const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
    if (!w || !h) return false;
    const side = Math.min(w, h), sx = (w - side) / 2, sy = h > w ? (h - side) * bias : 0;
    sctx.fillStyle = '#fff'; sctx.fillRect(0, 0, TS, TS);
    sctx.drawImage(src, sx, sy, side, side, 0, 0, TS, TS);
    let d;
    try { d = sctx.getImageData(0, 0, TS, TS).data; } catch (e) { newScratch(); return false; }
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    meta.rgb = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    meta.lab = window.Mosaic.rgb2lab(meta.rgb[0], meta.rgb[1], meta.rgb[2]).map(v => +v.toFixed(2));
    const i = tiles.length;
    meta.id = i;
    actx.drawImage(scratch, (i % PER_ROW) * TS, ((i / PER_ROW) | 0) * TS);
    tiles.push(meta);
    return true;
  }

  function headlineTiles(list) {
    const bgs = [[22, 60], [50, 65], [80, 45]]; // [lightness, saturation]
    list.forEach((h, hi) => {
      for (let v = 0; v < 3; v++) {
        const hue = Math.round((hi * 137.5 + v * 120) % 360), [light, sat] = bgs[(hi + v) % 3];
        const c = document.createElement('canvas'); c.width = c.height = TS;
        const x = c.getContext('2d');
        x.fillStyle = `hsl(${hue},${sat}%,${light}%)`; x.fillRect(0, 0, TS, TS);
        x.fillStyle = light > 60 ? '#1a1020' : '#fff';
        x.textAlign = 'center'; x.textBaseline = 'alphabetic';
        x.font = 'bold 19px system-ui, -apple-system, sans-serif';
        x.fillText(String(h.year), TS / 2, 26);
        x.font = 'bold 8px system-ui, -apple-system, sans-serif';
        const words = h.short.split(' '); const lines = [''];
        for (const wd of words) { const t = (lines[lines.length - 1] + ' ' + wd).trim(); if (x.measureText(t).width > TS - 6 && lines[lines.length - 1]) lines.push(wd); else lines[lines.length - 1] = t; }
        lines.slice(0, 3).forEach((ln, k) => x.fillText(ln, TS / 2, 40 + k * 9));
        addTile(c, {
          kind: 'headline', era: h.era, name: h.name, year: h.year, title: h.short, desc: h.text,
          field: h.era === 'recent' ? 'Recent milestone' : 'Milestone', link: h.source, image: '', source: 'headlines.json'
        });
      }
    });
  }

  // ---------- network helpers ----------
  async function sparql(q) {
    const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q);
    const r = await fetch(url);
    if (!r.ok) throw new Error('wikidata ' + r.status);
    return (await r.json()).results.bindings;
  }
  async function pool(items, n, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
  }
  function loadImg(url, timeout = 15000) {
    return new Promise((res, rej) => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      const to = setTimeout(() => { im.src = ''; rej(new Error('timeout')); }, timeout);
      im.onload = () => { clearTimeout(to); res(im); };
      im.onerror = () => { clearTimeout(to); rej(new Error('img')); };
      im.src = url;
    });
  }
  const yearOf = v => { const m = v && v.match(/^(-?\d+)/); return m ? parseInt(m[1], 10) : null; };
  const val = (b, k) => (b[k] ? b[k].value : '');

  async function fetchPeople(onProgress) {
    const seen = new Set(), people = [];
    const add = (b, extra) => {
      const id = val(b, 'p').split('/').pop();
      const name = val(b, 'pLabel');
      if (seen.has(id) || !name || /^Q\d+$/.test(name)) return;
      const file = fileFromP18(val(b, 'img'));
      if (!file) return;
      seen.add(id);
      people.push(Object.assign({
        kind: 'person', era: 'history', name, year: yearOf(val(b, 'born')), title: '',
        desc: val(b, 'pDescription'), field: '', link: val(b, 'article') || 'https://www.wikidata.org/wiki/' + id,
        image: thumbUrl(file, 330), source: 'Wikidata / Wikimedia Commons', _file: file
      }, extra));
    };
    // recent award winners first so they're always included
    try {
      const rows = await sparql(`SELECT DISTINCT ?p ?pLabel ?pDescription ?img ?when ?awardLabel ?article WHERE {
        VALUES ?award { ${AWARDS} }
        ?p p:P166 ?st. ?st ps:P166 ?award; pq:P585 ?when. FILTER(YEAR(?when) >= 2015)
        ?p wdt:P21 wd:Q6581072; wdt:P18 ?img.
        OPTIONAL { ?article schema:about ?p; schema:isPartOf <https://en.wikipedia.org/> }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`);
      rows.forEach(b => add(b, { era: 'recent', year: yearOf(val(b, 'when')), field: val(b, 'awardLabel'),
        desc: `${val(b, 'awardLabel')}, ${yearOf(val(b, 'when'))}. ${val(b, 'pDescription')}` }));
    } catch (e) { console.warn('awards query failed', e); }
    let done = 0;
    await pool(OCC, 4, async ([q, label]) => {
      try {
        const rows = await sparql(`SELECT ?p ?pLabel ?pDescription ?img ?born ?article WHERE {
          ?p wdt:P106 wd:${q}; wdt:P21 wd:Q6581072; wdt:P18 ?img; wikibase:sitelinks ?sl.
          FILTER(?sl > 15)
          OPTIONAL { ?p wdt:P569 ?born }
          OPTIONAL { ?article schema:about ?p; schema:isPartOf <https://en.wikipedia.org/> }
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 120`);
        rows.forEach(b => add(b, { field: label }));
      } catch (e) { console.warn('occupation query failed', q, e); }
      onProgress && onProgress({ phase: 'query', done: ++done, total: OCC.length, people: people.length });
    });
    // shuffle (keep recent winners mixed in)
    for (let i = people.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [people[i], people[j]] = [people[j], people[i]]; }
    return people;
  }

  // ---------- IndexedDB cache ----------
  const DB = 'madeofher', STORE = 'lib', KEY = 'v1';
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function idbGet() {
    const db = await idb();
    return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(KEY); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  }
  async function idbPut(v) {
    const db = await idb();
    return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(v, KEY); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  }
  const atlasBlob = () => new Promise(res => atlas.toBlob(res, 'image/jpeg', 0.85));
  const cleanTiles = () => tiles.map(t => { const { _file, ...rest } = t; return rest; });

  async function saveCache() {
    try { await idbPut({ atlas: await atlasBlob(), tiles: cleanTiles(), tileSize: TS, perRow: PER_ROW, savedAt: Date.now() }); }
    catch (e) { console.warn('cache save failed', e); }
  }

  window.LibraryBuilder = {
    md5, thumbUrl,
    async loadCached() {
      try {
        const v = await idbGet();
        if (!v || !v.tiles || v.tiles.length < 300) return null;
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(v.atlas); });
        return { img, tiles: v.tiles, meta: { tileSize: v.tileSize, perRow: v.perRow } };
      } catch (e) { return null; }
    },
    async clearCache() { try { const db = await idb(); db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY); } catch (e) {} },
    // Builds progressively: the mosaic starts working as soon as headline cards are in.
    async build({ headlinesUrl = 'data/headlines.json', onProgress } = {}) {
      tiles.length = 0; actx.clearRect(0, 0, atlas.width, atlas.height);
      try { const h = await (await fetch(headlinesUrl)).json(); headlineTiles(h.headlines); } catch (e) { console.warn('headlines failed', e); }
      window.Mosaic.setLibrary(atlas, tiles, { tileSize: TS, perRow: PER_ROW });
      onProgress && onProgress({ phase: 'query', done: 0, total: OCC.length, people: 0 });
      const people = await fetchPeople(onProgress);
      let done = 0, ok = 0, lastSave = 0;
      await pool(people, 10, async p => {
        if (tiles.length >= MAX) return;
        let im = null;
        try { im = await loadImg(thumbUrl(p._file, 120)); }
        catch (e) { try { im = await loadImg(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(p._file)}?width=120`); } catch (e2) {} }
        if (im && addTile(im, p, 0.12)) { ok++; if (ok % 40 === 0) window.Mosaic.libraryUpdated(); }
        done++;
        onProgress && onProgress({ phase: 'images', done, total: people.length, tiles: tiles.length });
        if (ok - lastSave >= 400) { lastSave = ok; saveCache(); }
      });
      window.Mosaic.libraryUpdated();
      await saveCache();
      onProgress && onProgress({ phase: 'done', tiles: tiles.length });
      return tiles.length;
    },
    // Downloads library/atlas.jpg + library/tiles.json so the team can commit them (offline-safe demo).
    async exportFiles() {
      const src = window.Mosaic.getAtlas(), list = window.Mosaic.getTiles();
      const c = document.createElement('canvas'); c.width = c.height = TS * PER_ROW;
      c.getContext('2d').drawImage(src, 0, 0);
      const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
      const json = JSON.stringify({ tileSize: TS, perRow: PER_ROW, count: list.length, tiles: list.map(t => { const { _file, ...r } = t; return r; }) });
      const dl = (b, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); };
      dl(blob, 'atlas.jpg');
      setTimeout(() => dl(new Blob([json], { type: 'application/json' }), 'tiles.json'), 400);
    }
  };
})();
