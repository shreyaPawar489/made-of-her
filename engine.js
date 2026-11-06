// engine.js — Made of Her mosaic engine (Canvas 2D). Exposes window.Mosaic. See CLAUDE.md §5–6.
(function () {
  'use strict';
  const Q = 20, K = 16, Q3 = Q * Q * Q; // K=16 candidates per color → much less visible repetition

  let canvas, ctx, video;
  let atlas = null, tiles = [], perRow = 48, TS = 64;
  const opts = { tileSize: 22, strength: 0.4, mode: 'tint', rotate: true, mirror: true };
  let running = false, frozen = false, lens = null;
  // zoom/pan view: screen = world * s + (x, y), device px. tv = target (eased toward each frame)
  const view = { s: 1, x: 0, y: 0 }, tv = { s: 1, x: 0, y: 0 };
  let W = 0, H = 0, dpr = 1, cs = 0, cols = 0, rows = 0;

  const small = document.createElement('canvas');
  const sctx = small.getContext('2d', { willReadFrequently: true });
  const layer = document.createElement('canvas'); // cached tile layer: only changed cells are redrawn
  const lctx = layer.getContext('2d');
  const snap = document.createElement('canvas');
  const snapCtx = snap.getContext('2d');

  let smooth = null, seed = null, cellTile = null, haveFrame = false;
  const lut = new Int16Array(Q3 * K), lutN = new Uint8Array(Q3), lutBest = new Float32Array(Q3).fill(999);
  let lutDirty = false, lastLut = -1e9, lutReady = false, boost = null;
  const crop = { sx: 0, sy: 0, sw: 1, sh: 1 };
  const gap = new Float32Array(Q3);
  const st = { fps: 0, uniqueTiles: 0, matchError: 0, goodMatchPct: 0, gapColors: [] };
  let lastT = 0, lastStat = 0, errSum = 0, goodCount = 0;

  // ---------- color ----------
  function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function rgb2lab(r, g, b) {
    r = lin(r); g = lin(g); b = lin(b);
    let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    let y = (r * 0.2126 + g * 0.7152 + b * 0.0722);
    let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    x = f(x); y = f(y); z = f(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  const bucket = (r, g, b) => ((r * Q / 256) | 0) * Q * Q + ((g * Q / 256) | 0) * Q + ((b * Q / 256) | 0);
  function bucketHex(b) {
    const c = q => Math.round((q + 0.5) * 256 / Q).toString(16).padStart(2, '0');
    return '#' + c((b / (Q * Q)) | 0) + c(((b / Q) | 0) % Q) + c(b % Q);
  }

  // ---------- lookup table: color bucket -> top-K matching tiles ----------
  function buildLUT() {
    const N = tiles.length;
    if (!N) return;
    const L = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const l = tiles[i].lab; L[i * 3] = l[0]; L[i * 3 + 1] = l[1]; L[i * 3 + 2] = l[2]; }
    const top = new Int32Array(K), topD = new Float32Array(K);
    // Optional relevance boost (see setBoost): bonus[t] is in ΔE units; a boosted tile "counts" as that much closer in color.
    const bonus = boost && boost.length >= N ? boost : null;
    for (let b = 0; b < Q3; b++) {
      const lab = rgb2lab(((((b / (Q * Q)) | 0) + 0.5) * 256) / Q, (((((b / Q) | 0) % Q) + 0.5) * 256) / Q, (((b % Q) + 0.5) * 256) / Q);
      topD.fill(1e12);
      for (let t = 0; t < N; t++) {
        const dl = L[t * 3] - lab[0], da = L[t * 3 + 1] - lab[1], db = L[t * 3 + 2] - lab[2];
        let d = dl * dl + da * da + db * db;
        if (bonus && bonus[t] > 0) { const e = Math.max(0, Math.sqrt(d) - bonus[t]); d = e * e; }
        if (d < topD[K - 1]) {
          let j = K - 1;
          while (j > 0 && topD[j - 1] > d) { topD[j] = topD[j - 1]; top[j] = top[j - 1]; j--; }
          topD[j] = d; top[j] = t;
        }
      }
      const best = Math.sqrt(topD[0]), lim = (best + 12) * (best + 12);
      let n = 0;
      for (let k = 0; k < K; k++) if (topD[k] <= lim && topD[k] < 1e12) lut[b * K + n++] = top[k];
      lutN[b] = n;
      // report the TRUE color error of the best candidate (not the boosted one) so stats stay honest
      const t0 = top[0], l0 = lab, tl = tiles[t0].lab;
      lutBest[b] = Math.hypot(tl[0] - l0[0], tl[1] - l0[1], tl[2] - l0[2]);
    }
    lutReady = true;
    if (cellTile) cellTile.fill(-1);
  }

  // ---------- geometry ----------
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    W = Math.round(w * dpr); H = Math.round(h * dpr);
    canvas.width = W; canvas.height = H;
    regrid();
    resetView();
  }
  function regrid() {
    cs = Math.max(3, Math.round(opts.tileSize * dpr));
    cols = Math.ceil(W / cs); rows = Math.ceil(H / cs);
    small.width = cols; small.height = rows;
    const n = cols * rows;
    smooth = new Float32Array(n * 3);
    seed = new Uint8Array(n);
    for (let i = 0; i < n; i++) seed[i] = (Math.random() * 256) | 0;
    cellTile = new Int16Array(n).fill(-1);
    layer.width = cols * cs; layer.height = rows * cs;
    haveFrame = false;
  }
  function computeCrop(src) {
    const vw = src.videoWidth || src.width, vh = src.videoHeight || src.height, a = cols / rows;
    if (vw / vh > a) { crop.sh = vh; crop.sw = vh * a; crop.sx = (vw - crop.sw) / 2; crop.sy = 0; }
    else { crop.sw = vw; crop.sh = vw / a; crop.sx = 0; crop.sy = (vh - crop.sh) / 2; }
  }

  // ---------- per-frame ----------
  function sample(src, mirror = opts.mirror) {
    sctx.save();
    if (mirror) { sctx.translate(cols, 0); sctx.scale(-1, 1); }
    sctx.drawImage(src, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, cols, rows);
    sctx.restore();
    const d = sctx.getImageData(0, 0, cols, rows).data;
    const n = cols * rows;
    for (let i = 0; i < n; i++) {
      const p = i * 3, q = i * 4;
      if (!haveFrame) { smooth[p] = d[q]; smooth[p + 1] = d[q + 1]; smooth[p + 2] = d[q + 2]; }
      else {
        smooth[p] = smooth[p] * 0.5 + d[q] * 0.5;
        smooth[p + 1] = smooth[p + 1] * 0.5 + d[q + 1] * 0.5;
        smooth[p + 2] = smooth[p + 2] * 0.5 + d[q + 2] * 0.5;
      }
    }
    haveFrame = true;
  }

  // Assign a tile to every cell; redraw only cells whose tile changed into the cached layer.
  function assignTiles() {
    lctx.imageSmoothingEnabled = true; lctx.imageSmoothingQuality = 'low';
    errSum = 0; goodCount = 0;
    for (let r = 0; r < rows; r++) {
      const y = r * cs;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c, p = i * 3;
        const b = bucket(smooth[p], smooth[p + 1], smooth[p + 2]);
        const nn = lutN[b];
        if (!nn) continue;
        // pick a candidate; skip ones identical to the left/upper neighbor so faces don't clump
        const left = c > 0 ? cellTile[i - 1] : -1, up = r > 0 ? cellTile[i - cols] : -1;
        let k0 = seed[i] % nn, t = lut[b * K + k0];
        for (let tries = 1; tries < nn && (t === left || t === up); tries++) t = lut[b * K + ((k0 + tries) % nn)];
        const be = lutBest[b];
        errSum += be; if (be < 12) goodCount++; else if (be > 18) gap[b] += 1;
        if (t !== cellTile[i]) {
          cellTile[i] = t;
          lctx.drawImage(atlas, (t % perRow) * TS, ((t / perRow) | 0) * TS, TS, TS, c * cs, y, cs, cs);
        }
      }
    }
  }

  function drawTiles() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (view.s === 1 && view.x === 0 && view.y === 0) { ctx.drawImage(layer, 0, 0); return; }
    // zoomed: draw only the visible cells straight from the atlas at full detail
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const z = cs * view.s, g = z > 70 ? Math.round(dpr) : 0; // thin gutter once photos are big
    const c0 = Math.max(0, Math.floor(-view.x / z)), c1 = Math.min(cols - 1, Math.floor((W - view.x) / z));
    const r0 = Math.max(0, Math.floor(-view.y / z)), r1 = Math.min(rows - 1, Math.floor((H - view.y) / z));
    for (let r = r0; r <= r1; r++) {
      const y0 = Math.round(view.y + r * z), y1 = Math.round(view.y + (r + 1) * z);
      for (let c = c0; c <= c1; c++) {
        const t = cellTile[r * cols + c];
        if (t < 0) continue;
        const x0 = Math.round(view.x + c * z), x1 = Math.round(view.x + (c + 1) * z);
        ctx.drawImage(atlas, (t % perRow) * TS, ((t / perRow) | 0) * TS, TS, TS, x0, y0, x1 - x0 - g, y1 - y0 - g);
      }
    }
  }

  function drawOverlay() {
    // the camera overlay fades out as you zoom in, so up close you see only the women
    const a = opts.strength * Math.max(0, 1 - (view.s - 1) / 2);
    if (a <= 0.01) return;
    ctx.save();
    ctx.setTransform(view.s, 0, 0, view.s, view.x, view.y);
    const w = cols * cs, h = rows * cs;
    if (opts.mode === 'ghost') {
      ctx.globalAlpha = a;
      if (frozen) ctx.drawImage(snap, 0, 0, w, h);
      else {
        if (opts.mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
        ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
      }
    } else {
      ctx.imageSmoothingEnabled = false;
      if (opts.mode === 'color') { ctx.globalCompositeOperation = 'color'; ctx.globalAlpha = Math.min(1, a * 2); }
      else ctx.globalAlpha = a;
      ctx.drawImage(small, 0, 0, cols, rows, 0, 0, w, h);
    }
    ctx.restore();
  }

  // Hover: a clean square outline on the cell under the pointer + a small name label.
  function drawLens() {
    if (!lens) return;
    const cell = cellAt(lens.x, lens.y);
    if (!cell) return;
    const tile = tileAtCell(cell.c, cell.r);
    if (!tile) return;
    const z = cs * view.s;
    const x = Math.round(view.x + cell.c * z), y = Math.round(view.y + cell.r * z), sz = Math.round(z);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineWidth = Math.max(1.5, 2 * dpr) ; ctx.strokeStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 6 * dpr;
    ctx.strokeRect(x + 0.5, y + 0.5, sz - 1, sz - 1);
    ctx.shadowBlur = 0;
    const label = (tile.kind === 'headline' ? tile.title : tile.name) + (tile.year ? '  ' + tile.year : '');
    ctx.font = `500 ${12 * dpr}px system-ui, -apple-system, sans-serif`;
    const tw = ctx.measureText(label).width, ph = 22 * dpr, pw = tw + 16 * dpr;
    let lx = Math.min(Math.max(x + sz / 2 - pw / 2, 6 * dpr), W - pw - 6 * dpr);
    let ly = y + sz + 6 * dpr; if (ly + ph > H - 6 * dpr) ly = y - 6 * dpr - ph;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    roundRect(lx, ly, pw, ph, 6 * dpr); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    ctx.fillText(label, lx + 8 * dpr, ly + ph / 2 + 0.5);
    ctx.restore();
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function cellAt(x, y) { // CSS px -> grid cell, through the zoom/pan view
    if (!cs) return null;
    const z = cs * view.s;
    return { c: Math.floor((x * dpr - view.x) / z), r: Math.floor((y * dpr - view.y) / z) };
  }
  function tileAtCell(c, r) {
    if (!cellTile || c < 0 || r < 0 || c >= cols || r >= rows) return null;
    const t = cellTile[r * cols + c];
    return t >= 0 ? tiles[t] : null;
  }

  // ---------- zoom / pan ----------
  const maxScale = () => Math.max(1, (150 * dpr) / cs); // biggest photo ≈ 150 CSS px
  function clampView(v) {
    v.s = Math.min(Math.max(v.s, 1), maxScale());
    if (v.s < 1.001) { v.s = 1; v.x = 0; v.y = 0; return; } // fully zoomed out → exact identity so the fast cached path runs
    const ww = cols * cs * v.s, wh = rows * cs * v.s;
    v.x = Math.min(0, Math.max(W - ww, v.x));
    v.y = Math.min(0, Math.max(H - wh, v.y));
  }
  function resetView() { tv.s = view.s = 1; tv.x = view.x = 0; tv.y = view.y = 0; }
  function easeView() {
    const k = 0.3;
    view.s += (tv.s - view.s) * k; view.x += (tv.x - view.x) * k; view.y += (tv.y - view.y) * k;
    if (Math.abs(tv.s - view.s) < 0.002 && Math.abs(tv.x - view.x) < 0.5 && Math.abs(tv.y - view.y) < 0.5) {
      view.s = tv.s; view.x = tv.x; view.y = tv.y;
    }
  }

  function updateStats(t) {
    const n = cols * rows || 1;
    const u = new Set(); for (let i = 0; i < cellTile.length; i++) if (cellTile[i] >= 0) u.add(cellTile[i]);
    st.uniqueTiles = u.size;
    st.matchError = +(errSum / n).toFixed(1);
    st.goodMatchPct = Math.round((goodCount / n) * 100);
    const idx = [];
    for (let b = 0; b < Q3; b++) if (gap[b] > 1) idx.push(b);
    idx.sort((a, b) => gap[b] - gap[a]);
    st.gapColors = idx.slice(0, 6).map(bucketHex);
    for (let b = 0; b < Q3; b++) gap[b] *= 0.6;
    lastStat = t;
  }

  function loop(t) {
    if (!running) return;
    requestAnimationFrame(loop);
    if (lutDirty && t - lastLut > 1200) { buildLUT(); lutDirty = false; lastLut = t; }
    if (!cols || !rows) { resize(); return; } // canvas had no size yet (hidden tab / early init)
    if (!lutReady || !atlas) { ctx.fillStyle = '#0b0710'; ctx.fillRect(0, 0, W, H); return; }
    const ready = video && video.readyState >= 2 && video.videoWidth;
    if (ready && !frozen) { computeCrop(video); sample(video); }
    else if (frozen && !haveFrame) {
      // regrid while frozen (phone rotate / tile-size change): rebuild from the frozen snapshot, not live video
      if (snap.width) { computeCrop(snap); sample(snap, false); } else if (ready) { computeCrop(video); sample(video); }
    }
    if (!haveFrame) return;
    easeView();
    if (opts.rotate && !frozen && !lens && view.s === 1) {
      const n = cols * rows, k = Math.max(1, (n * 0.003) | 0);
      for (let j = 0; j < k; j++) seed[(Math.random() * n) | 0]++;
    }
    assignTiles();
    drawTiles();
    drawOverlay();
    drawLens();
    if (lastT) st.fps = Math.round(st.fps * 0.9 + (1000 / Math.max(1, t - lastT)) * 0.1);
    lastT = t;
    if (t - lastStat > 500) updateStats(t);
  }

  function loadImage(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }

  window.Mosaic = {
    rgb2lab,
    init({ canvas: cv, video: v }) {
      canvas = cv; video = v; ctx = canvas.getContext('2d');
      window.addEventListener('resize', resize);
      resize();
    },
    setLibrary(img, list, meta = {}) {
      atlas = img; tiles = list; perRow = meta.perRow || 48; TS = meta.tileSize || 64;
      for (const t of tiles) if (!t.lab && t.rgb) t.lab = rgb2lab(t.rgb[0], t.rgb[1], t.rgb[2]);
      lutDirty = true; lastLut = -1e9;
    },
    // Relevance boost (additive to Contract B). arr[i] = ΔE bonus for tile i (0 = none); null clears.
    // Used by relevance.js to favor tiles matching the viewer's scene / location.
    setBoost(arr) { boost = arr || null; lutDirty = true; lastLut = -1e9; },
    libraryUpdated() {
      for (const t of tiles) if (!t.lab && t.rgb) t.lab = rgb2lab(t.rgb[0], t.rgb[1], t.rgb[2]);
      lutDirty = true;
    },
    async loadLibrary(base = 'library/') {
      const r = await fetch(base + 'tiles.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('no library at ' + base);
      const j = await r.json();
      const img = await loadImage(base + 'atlas.jpg');
      this.setLibrary(img, j.tiles, j);
      return { count: j.tiles.length };
    },
    start() { if (!running) { running = true; requestAnimationFrame(loop); } },
    stop() { running = false; },
    setOptions(o) {
      const ts = opts.tileSize;
      Object.assign(opts, o);
      if (canvas && opts.tileSize !== ts) { regrid(); resetView(); }
    },
    getOptions() { return { ...opts }; },
    freeze(f) {
      frozen = !!f;
      if (frozen && video && video.videoWidth) {
        snap.width = Math.round(crop.sw); snap.height = Math.round(crop.sh);
        snapCtx.save();
        if (opts.mirror) { snapCtx.translate(snap.width, 0); snapCtx.scale(-1, 1); }
        snapCtx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, snap.width, snap.height);
        snapCtx.restore();
      }
    },
    isFrozen() { return frozen; },
    setLens(p) { lens = p; },   // now a clean square hover highlight + name label
    tileAt(x, y) { const c = cellAt(x, y); return c ? tileAtCell(c.c, c.r) : null; },
    // zoom/pan (CSS px). Additive to Contract B.
    zoomAt(x, y, f) {
      const px = x * dpr, py = y * dpr, s0 = tv.s;
      tv.s = Math.min(Math.max(s0 * f, 1), maxScale());
      const k = tv.s / s0;
      tv.x = px - (px - tv.x) * k; tv.y = py - (py - tv.y) * k;
      clampView(tv);
    },
    panBy(dx, dy) { tv.x += dx * dpr; tv.y += dy * dpr; clampView(tv); view.x = tv.x; view.y = tv.y; },
    resetView() { tv.s = 1; tv.x = 0; tv.y = 0; },
    zoom() { return tv.s; },
    frameSummary() {
      const u = [...new Set(Array.from(cellTile || []).filter(t => t >= 0))];
      for (let i = u.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [u[i], u[j]] = [u[j], u[i]]; }
      const people = u.filter(t => tiles[t].kind === 'person');
      const pick = (people.length >= 4 ? people : u).slice(0, 6);
      return { uniqueTiles: u.length, sample: pick.map(t => tiles[t]) };
    },
    stats() { return { ...st, cols, rows, libraryCount: tiles.length }; },
    getTiles() { return tiles; },
    getAtlas() { return atlas; },
    tileThumb(tile, size = 160) {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const i = tiles.indexOf(tile);
      if (i >= 0 && atlas) c.getContext('2d').drawImage(atlas, (i % perRow) * TS, ((i / perRow) | 0) * TS, TS, TS, 0, 0, size, size);
      return c.toDataURL('image/jpeg', 0.9);
    }
  };
})();
