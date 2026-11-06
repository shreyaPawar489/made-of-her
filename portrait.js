// portrait.js — the snapshot mosaic portrait (owner: P1). See JOURNEY.md §3/§4.
// Your photo starts gray; every achievement unlocks 80 of 1,600 cells (face first), filled with real women
// from that achievement's track. 20 achievements = 100%. Past achievements (from experience) count, capped at 8 (40%).
//   await JourneyLib.ready
//   const p = Portrait.create(canvas, { photo: dataURL })   // canvas CSS size decides resolution
//   p.setAchievements(JStore.get().achievements); p.animateLatest(n); p.progress(); p.snapshot(96); p.cellAt(x, y)
(function () {
  'use strict';
  const G = 40, CELLS = G * G, PER = 80, MAX_ACH = 20, MAX_PAST = 8;
  const FALLBACK_TRACKS = {
    law: ['Lawyer', 'Politician', 'Activist'], medicine: ['Physician', 'Biologist', 'Chemist'],
    cs: ['Computer scientist', 'Mathematician', 'Engineer', 'Inventor'], engineering: ['Engineer', 'Inventor', 'Architect', 'Physicist'],
    science: ['Scientist', 'Physicist', 'Chemist', 'Biologist', 'Astronomer'], space: ['Astronaut', 'Astronomer', 'Physicist'],
    business: ['Businessperson', 'Economist'], policy: ['Politician', 'Activist', 'Economist', 'Lawyer'],
    media: ['Journalist', 'Writer', 'Photographer'], arts: ['Painter', 'Photographer', 'Architect', 'Singer', 'Writer'],
    education: ['Educator', 'Writer', 'Activist'], sports: ['Athlete']
  };

  // ---------- color ----------
  function rgb2lab(r, g, b) {
    const f = c => { c /= 255; return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92; };
    const R = f(r), Gg = f(g), B = f(b);
    let x = (R * 0.4124 + Gg * 0.3576 + B * 0.1805) / 0.95047, y = R * 0.2126 + Gg * 0.7152 + B * 0.0722, z = (R * 0.0193 + Gg * 0.1192 + B * 0.9505) / 1.08883;
    const h = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    x = h(x); y = h(y); z = h(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  const de2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); return (n ^ (n >>> 15)) >>> 0; }
  function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

  // ---------- library ----------
  const Lib = { tiles: [], atlas: null, perRow: 48, TS: 64, tracks: FALLBACK_TRACKS, byId: new Map(),
    labels: { law: 'Law', medicine: 'Medicine & health', cs: 'Computer science', engineering: 'Engineering', science: 'Science research', space: 'Space',
      business: 'Business', policy: 'Politics & policy', media: 'Journalism & writing', arts: 'Arts & design', education: 'Education', sports: 'Sports' } };
  function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
  Lib.ready = (async () => {
    const [meta, atlas] = await Promise.all([fetch('library/tiles.json').then(r => r.json()), loadImage('library/atlas.jpg')]);
    Lib.atlas = atlas; Lib.perRow = meta.perRow || 48; Lib.TS = meta.tileSize || 64;
    Lib.tiles = meta.tiles.map((t, i) => Object.assign(t, { id: +t.id === +t.id ? +t.id : i, lab: t.lab || rgb2lab(...t.rgb) }));
    Lib.tiles.forEach(t => Lib.byId.set(t.id, t));
    try {
      const tr = await fetch('data/tracks.json').then(r => r.json());
      if (tr && tr.tracks) {
        const m = {}, list = Array.isArray(tr.tracks) ? tr.tracks : Object.keys(tr.tracks).map(id => Object.assign({ id }, tr.tracks[id]));
        list.forEach(t => { if (t.fields && t.fields.length) m[t.id] = t.fields; Lib.labels[t.id] = t.label || t.id; });
        Lib.tracks = Object.assign({}, FALLBACK_TRACKS, m);
      }
    } catch (e) { /* tracks.json not there yet: fallback mapping */ }
    return Lib;
  })();
  Lib.tile = id => Lib.byId.get(+id) || null;
  Lib.fieldsFor = track => Lib.tracks[track] || [];
  // Real women only: drop fictional characters that slipped into the Wikidata pull (Hermione, Wonder Woman, …).
  const FICTION = /fictional|character|superhero|comics|cartoon|animated/i;
  Lib.isReal = t => t.kind === 'person' && !FICTION.test(t.desc || '') && !FICTION.test(t.title || '');
  Lib.candidates = track => {
    const f = new Set(Lib.fieldsFor(track));
    const c = Lib.tiles.filter(t => Lib.isReal(t) && f.has(t.field));
    return c.length ? c : Lib.tiles.filter(Lib.isReal);
  };
  Lib.drawTile = (ctx, tile, x, y, w, h) => {
    const i = tile.id; ctx.drawImage(Lib.atlas, (i % Lib.perRow) * Lib.TS, ((i / Lib.perRow) | 0) * Lib.TS, Lib.TS, Lib.TS, x, y, w, h);
  };
  Lib.thumb = (tile, size = 96) => {
    const c = document.createElement('canvas'); c.width = c.height = size;
    if (tile && Lib.atlas) Lib.drawTile(c.getContext('2d'), tile, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.85);
  };
  window.JourneyLib = Lib;

  // ---------- portrait ----------
  function create(canvas, opts = {}) {
    const ctx = canvas.getContext('2d');
    const seed = opts.seed != null ? opts.seed : strHash(((window.JStore && JStore.get().profile) || {}).createdAt || 'moh');
    let colors = null;            // Float32 rgb per cell
    let labs = null;              // lab per cell
    let order = null;             // rank -> cell
    let cellTile = new Int32Array(CELLS).fill(-1);
    let cellAch = new Int32Array(CELLS).fill(-1);
    let eff = [];                 // effective achievements (past capped)
    let appear = new Float64Array(CELLS);   // timestamp when the cell becomes visible (animation)
    let raf = 0, destroyed = false, photoReady;

    // unlock order: face first (distance from 0.5, 0.42) + seeded jitter
    const score = new Float32Array(CELLS);
    for (let i = 0; i < CELLS; i++) {
      const cx = (i % G + 0.5) / G, cy = ((i / G | 0) + 0.5) / G;
      score[i] = Math.hypot(cx - 0.5, (cy - 0.42) * 0.9) + (hash(i + seed) / 4294967296) * 0.25;
    }
    order = Array.from({ length: CELLS }, (_, i) => i).sort((a, b) => score[a] - score[b]);

    function setPhoto(src) {
      photoReady = (src ? loadImage(src) : Promise.reject()).then(img => {
        const s = Math.min(img.naturalWidth, img.naturalHeight);
        const c = document.createElement('canvas'); c.width = c.height = G;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, G, G);
        const d = x.getImageData(0, 0, G, G).data;
        colors = new Float32Array(CELLS * 3); labs = new Array(CELLS);
        for (let i = 0; i < CELLS; i++) { colors[i * 3] = d[i * 4]; colors[i * 3 + 1] = d[i * 4 + 1]; colors[i * 3 + 2] = d[i * 4 + 2]; labs[i] = rgb2lab(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); }
      }).catch(() => {   // no photo: soft silhouette so the portrait still reads
        colors = new Float32Array(CELLS * 3); labs = new Array(CELLS);
        for (let i = 0; i < CELLS; i++) {
          const cx = (i % G + 0.5) / G - 0.5, cy = ((i / G | 0) + 0.5) / G;
          const head = Math.hypot(cx, (cy - 0.38) * 0.8) < 0.2, body = cy > 0.7 && Math.abs(cx) < 0.38 - (1 - cy) * 0.3;
          const v = head ? 205 : body ? 70 : 150;   // enough contrast that the women picked for it still read as a portrait
          colors[i * 3] = v; colors[i * 3 + 1] = v * 0.9; colors[i * 3 + 2] = v * 0.85; labs[i] = rgb2lab(v, v * 0.9, v * 0.85);
        }
      }).then(() => { assignGhost(); assign(); draw(); });
      return photoReady;
    }

    function effective(list) {
      let past = 0; const out = [];
      for (const a of list || []) { if (a.past) { if (past >= MAX_PAST) continue; past++; } out.push(a); if (out.length >= MAX_ACH) break; }
      return out;
    }

    // The women who fill an achievement's tiles: the best matches for what she DID (biography search), not everyone
    // with the same occupation label. Falls back to the whole track if the matcher isn't loaded (P2: matcher.js).
    const pools = new Map();
    function poolFor(a) {
      const key = (a.text || '') + '|' + (a.track || '');
      if (pools.has(key)) return pools.get(key);
      let pool = [];
      if (window.JourneyMatch && a.text) pool = JourneyMatch.rank(a.text, a.track, { k: 160 });
      if (pool.length) { // keep only women who really fit: at least 35% of the best score, never fewer than 45
        const top = pool[0].matchScore || 0, keep = pool.filter(t => t.matchScore >= top * 0.35);
        pool = keep.length >= 45 ? keep : pool.slice(0, 45);
      }
      if (pool.length < 40) { const have = new Set(pool.map(t => t.id)); pool = pool.concat(Lib.candidates(a.track).filter(t => !have.has(t.id))).slice(0, 160); }
      pools.set(key, pool); return pool;
    }

    // Locked cells aren't flat gray: each shows a faded real woman matched to the photo's color there, so the whole
    // portrait reads as a mosaic from day one and your progress is the cells that turn full-color (P2).
    let ghost = null;
    function assignGhost() {
      if (!labs || !Lib.tiles.length) return;
      const pool = Lib.tiles.filter(t => t.kind === 'person' && t.lab);
      if (!pool.length) return;
      ghost = new Int32Array(CELLS).fill(-1);
      const used = new Map();
      for (let i = 0; i < CELLS; i++) {
        const L = labs[i], best = [];
        for (const t of pool) {
          const d = de2(L, t.lab) + (used.get(t.id) || 0) * 60;
          if (best.length < 4 || d < best[3][0]) { best.push([d, t.id]); best.sort((x, y) => x[0] - y[0]); if (best.length > 4) best.pop(); }
        }
        const pick = best[hash(i * 17 + seed) % best.length][1];
        ghost[i] = pick; used.set(pick, (used.get(pick) || 0) + 1);
      }
    }
    function drawGhost(i, x, y, cs) {
      if (!ghost || ghost[i] < 0 || !Lib.atlas) return;
      const gt = Lib.tile(ghost[i]); if (!gt) return;
      ctx.globalAlpha = 0.4; Lib.drawTile(ctx, gt, x, y, cs + 0.5, cs + 0.5); ctx.globalAlpha = 1;
    }

    function assign() {
      if (!labs || !Lib.tiles.length) return;
      cellTile.fill(-1); cellAch.fill(-1);
      const used = new Map();   // tile id -> count, to spread repeats
      eff.forEach((a, k) => {
        const cand = poolFor(a);
        const batch = order.slice(k * PER, k * PER + PER);
        batch.forEach((cell, j) => {
          cellAch[cell] = k;
          if (j === 0 && a.womanId != null && Lib.tile(a.womanId)) { cellTile[cell] = +a.womanId; return; }
          const L = labs[cell], best = [];
          for (const t of cand) {
            const d = de2(L, t.lab) + (used.get(t.id) || 0) * 40;
            if (best.length < 4 || d < best[3][0]) { best.push([d, t.id]); best.sort((x, y) => x[0] - y[0]); if (best.length > 4) best.pop(); }
          }
          const pick = best[hash(cell * 31 + seed) % best.length][1];
          cellTile[cell] = pick; used.set(pick, (used.get(pick) || 0) + 1);
        });
      });
    }

    // Canvas resolution follows its on-screen size. While its tab is hidden (clientWidth 0) it must NOT draw or resize:
    // it used to read its own width back as the CSS size and double on every redraw (192 -> ... -> 15360 px), which could
    // blow past the browser's canvas limit and leave the Me portrait blank until a reload. When the tab is shown, the
    // ResizeObserver below fires and draws at the real size.
    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const css = canvas.clientWidth;
      if (!css) return 0;
      const px = Math.min(Math.round(css * dpr), 1600);
      if (canvas.width !== px || canvas.height !== px) { canvas.width = canvas.height = px; }
      return px;
    }

    function draw() {
      if (destroyed || !colors) return;
      const W = size(); if (!W) return;                       // hidden tab: nothing to draw yet
      const cs = W / G, now = performance.now();
      ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = '#EDE7E1'; ctx.fillRect(0, 0, W, W);
      let animating = false;
      for (let i = 0; i < CELLS; i++) {
        const x = (i % G) * cs, y = (i / G | 0) * cs;
        const r = colors[i * 3], g = colors[i * 3 + 1], b = colors[i * 3 + 2];
        const t = cellTile[i] >= 0 ? Lib.tile(cellTile[i]) : null;
        const age = now - appear[i];
        if (!t || age < 0 || !Lib.atlas) {
          const l = Math.round((0.299 * r + 0.587 * g + 0.114 * b) * 0.9);
          ctx.fillStyle = `rgb(${l},${l},${l})`; ctx.fillRect(x, y, cs + 0.5, cs + 0.5);
          drawGhost(i, x, y, cs);
          if (t && age < 0) animating = true;
          continue;
        }
        const k = Math.min(1, age / 260), sc = 0.35 + 0.65 * k, o = (cs - cs * sc) / 2;
        if (k < 1) { animating = true; const l = Math.round((0.299 * r + 0.587 * g + 0.114 * b) * 0.9); ctx.fillStyle = `rgb(${l},${l},${l})`; ctx.fillRect(x, y, cs + 0.5, cs + 0.5); }
        Lib.drawTile(ctx, t, x + o, y + o, cs * sc + 0.5, cs * sc + 0.5);
        if (opts.tint !== false) { ctx.globalAlpha = 0.3; ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`; ctx.fillRect(x + o, y + o, cs * sc + 0.5, cs * sc + 0.5); }
        if (age < 900) { animating = true; ctx.globalAlpha = 1 - age / 900; ctx.strokeStyle = '#C9973A'; ctx.lineWidth = Math.max(1, cs * 0.12); ctx.strokeRect(x + 1, y + 1, cs - 2, cs - 2); }
        ctx.globalAlpha = 1;
      }
      if (!inst.drawn) { inst.drawn = true; setTimeout(() => window.refreshMyAvatars && refreshMyAvatars(), 50); }
      if (animating) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }
    }

    const inst = {
      ready: null, drawn: false,
      setPhoto(src) { return (inst.ready = Lib.ready.then(() => setPhoto(src))); },
      setAchievements(list) { eff = effective(list); assign(); draw(); return inst; },
      // pop in the cells of the last n effective achievements (n = 1 after logging; n = all past at onboarding)
      animateLatest(n = 1) {
        const now = performance.now(), from = Math.max(0, eff.length - n);
        for (let i = 0; i < CELLS; i++) if (cellAch[i] >= from) {
          const batch = cellAch[i] - from;
          appear[i] = now + batch * (n > 1 ? 450 : 0) + (hash(i + 7) % 1000) * (n > 1 ? 0.6 : 1.2);
        }
        draw(); return inst;
      },
      progress() {
        let unlocked = 0; for (let i = 0; i < CELLS; i++) if (cellTile[i] >= 0) unlocked++;
        const women = new Set(eff.map(a => a.womanId).filter(x => x != null)).size;
        const tiles = new Set(Array.from(cellTile).filter(x => x >= 0)).size;
        return { pct: Math.round(unlocked / CELLS * 100), women, tiles, achievements: eff.length };
      },
      snapshot(px = 96) {
        if (!inst.drawn) return null;   // not painted yet: a snapshot would be a black square
        const c = document.createElement('canvas'); c.width = c.height = px;
        const g2 = c.getContext('2d'); g2.fillStyle = '#EDE7E1'; g2.fillRect(0, 0, px, px); // never a black square if the portrait hasn't drawn yet
        g2.drawImage(canvas, 0, 0, px, px);
        return c.toDataURL('image/jpeg', 0.7);
      },
      // x, y in CSS px relative to the canvas -> { tile, achievement } or null
      cellAt(x, y) {
        const css = canvas.clientWidth || canvas.width, c = Math.floor(x / css * G), r = Math.floor(y / css * G);
        if (c < 0 || r < 0 || c >= G || r >= G) return null;
        const i = r * G + c; if (cellTile[i] < 0) return null;
        return { tile: Lib.tile(cellTile[i]), achievement: eff[cellAch[i]] || null };
      },
      redraw() { draw(); },
      destroy() { destroyed = true; cancelAnimationFrame(raf); if (ro) ro.disconnect(); }
    };
    const ro = window.ResizeObserver ? new ResizeObserver(() => draw()) : null;
    if (ro) ro.observe(canvas);
    inst.setPhoto(opts.photo);
    if (opts.achievements) inst.ready.then(() => inst.setAchievements(opts.achievements));
    return inst;
  }

  window.Portrait = { create, rgb2lab, G, PER, MAX_ACH, MAX_PAST };

  // Auto-mount the avatar + big portrait from the store (P3 just provides canvas#avatar / canvas#bigPortrait).
  function mountFromStore() {
    if (!window.JStore) return;
    const s = JStore.get();
    if (!s.profile) return;
    const mount = (id, key) => {
      const cv = document.getElementById(id);
      if (!cv) return;
      if (!window[key] || window[key]._canvas !== cv || window[key]._photo !== s.profile.photo) {
        // canvas#bigPortrait is also exposed by the browser as window.bigPortrait: never treat a DOM element as an instance
        const cur = window[key];
        if (cur && typeof cur.destroy === 'function') cur.destroy();
        window[key] = create(cv, { photo: s.profile.photo });
        window[key]._canvas = cv; window[key]._photo = s.profile.photo;
      }
      window[key].ready.then(() => window[key].setAchievements(JStore.get().achievements));
    };
    mount('avatar', 'avatarPortrait');
    mount('bigPortrait', 'bigPortrait');
  }
  window.mountPortraits = mountFromStore;

  // ---------- profile pictures = your mosaic ----------
  // Any element with [data-my-avatar] shows the current snapshot of your portrait (falls back to its text, e.g. initials).
  function refreshMyAvatars() {
    const src = [window.avatarPortrait, window.bigPortrait].find(x => x && typeof x.snapshot === 'function' && x.drawn);
    if (!src) return;
    apply(src);
  }
  function apply(src) {
    let url; try { url = src.snapshot(192); } catch (e) { return; }
    if (!url) return;
    document.querySelectorAll('[data-my-avatar]').forEach(el => {
      if (el.tagName === 'IMG') el.src = url;
      else { el.style.backgroundImage = 'url(' + url + ')'; el.classList.add('has-mosaic'); }
    });
  }
  window.refreshMyAvatars = refreshMyAvatars;
  const refreshSoon = () => [120, 900, 2600].forEach(ms => setTimeout(refreshMyAvatars, ms)); // after pop-in animation settles
  window.addEventListener('jstore', e => { if (['profile', 'achievements', 'reset'].includes(e.detail.what)) refreshSoon(); });
  setTimeout(refreshSoon, 300);

  // Members without a portrait (e.g. sample members): a small mosaic of real women from their path, filled to their %.
  const memberCache = new Map();
  // Members with no saved picture (samples): build a real portrait-style mosaic (silhouette filled to her %) in the
  // background, then fire 'moh-avatars' so lists redraw. Until it's ready, the quick 5x5 grid below stands in.
  const building = new Set();
  function buildMemberPortrait(m, key) {
    if (building.has(key)) return; building.add(key);
    const cv = document.createElement('canvas'); cv.width = cv.height = 240;
    const n = Math.max(1, Math.round((m.pct || 30) / 5)), tracks = [m.track].concat(m.interests || []).filter(Boolean);
    const ach = Array.from({ length: n }, (_, i) => ({ text: '', track: tracks[i % (tracks.length || 1)] || 'law', past: false }));
    const p = create(cv, { seed: strHash(String(m.id || m.name || '')), tint: false });
    p.ready.then(() => {
      p.setAchievements(ach);
      const url = p.snapshot(240); p.destroy();
      if (url) { memberCache.set(key, url); window.dispatchEvent(new Event('moh-avatars')); }
    });
  }
  Lib.memberAvatar = (m, size = 88) => {
    const key = (m.id || m.name) + '|' + (m.track || '') + '|' + (m.pct || 0);
    if (memberCache.has(key)) return memberCache.get(key);
    buildMemberPortrait(m, key);
    const qk = key + '|quick'; if (memberCache.has(qk)) return memberCache.get(qk);
    if (!Lib.atlas) return null;
    const cands = Lib.candidates(m.track || 'law'); if (!cands.length) return null;
    let h = 2166136261; for (const ch of String(m.id || m.name || '')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const rand = () => ((h = Math.imul(h ^ (h >>> 13), 1274126177)) >>> 0) / 4294967296;
    const N = 5, cs = size / N, c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'), filled = Math.max(6, Math.round((m.pct || 30) / 100 * N * N));
    const order = Array.from({ length: N * N }, (_, i) => i).sort(() => rand() - 0.5);
    order.forEach((cell, k) => {
      const x = (cell % N) * cs, y = ((cell / N) | 0) * cs;
      Lib.drawTile(g, cands[(rand() * cands.length) | 0], x, y, cs, cs);
      if (k >= filled) { g.fillStyle = 'rgba(232,222,212,.82)'; g.fillRect(x, y, cs, cs); }
    });
    const url = c.toDataURL('image/jpeg', 0.8); memberCache.set(qk, url); return url;
  };
  window.addEventListener('jstore', e => { if (['profile', 'achievements', 'reset'].includes(e.detail.what)) mountFromStore(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountFromStore); else setTimeout(mountFromStore);
})();
