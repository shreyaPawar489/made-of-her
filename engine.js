// engine.js — Made of Her mosaic engine (Canvas 2D). Exposes window.Mosaic. See CLAUDE.md §5–6.
(function () {
  'use strict';
  const Q = 20, K = 6, Q3 = Q * Q * Q;

  let canvas, ctx, video;
  let atlas = null, tiles = [], perRow = 48, TS = 64;
  const opts = { tileSize: 14, strength: 0.4, mode: 'tint', rotate: true, mirror: true };
  let running = false, frozen = false, lens = null;
  let W = 0, H = 0, dpr = 1, cs = 0, cols = 0, rows = 0;

  const small = document.createElement('canvas');
  const sctx = small.getContext('2d', { willReadFrequently: true });
  const snap = document.createElement('canvas');
  const snapCtx = snap.getContext('2d');

  let smooth = null, seed = null, cellTile = null, haveFrame = false;
  const lut = new Int16Array(Q3 * K), lutN = new Uint8Array(Q3), lutBest = new Float32Array(Q3).fill(999);
  let lutDirty = false, lastLut = -1e9, lutReady = false;
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
    for (let b = 0; b < Q3; b++) {
      const lab = rgb2lab(((((b / (Q * Q)) | 0) + 0.5) * 256) / Q, (((((b / Q) | 0) % Q) + 0.5) * 256) / Q, (((b % Q) + 0.5) * 256) / Q);
      topD.fill(1e12);
      for (let t = 0; t < N; t++) {
        const dl = L[t * 3] - lab[0], da = L[t * 3 + 1] - lab[1], db = L[t * 3 + 2] - lab[2];
        const d = dl * dl + da * da + db * db;
        if (d < topD[K - 1]) {
          let j = K - 1;
          while (j > 0 && topD[j - 1] > d) { topD[j] = topD[j - 1]; top[j] = top[j - 1]; j--; }
          topD[j] = d; top[j] = t;
        }
      }
      const best = Math.sqrt(topD[0]), lim = (best + 12) * (best + 12);
      let n = 0;
      for (let k = 0; k < K; k++) if (topD[k] <= lim && topD[k] < 1e12) lut[b * K + n++] = top[k];
      lutN[b] = n; lutBest[b] = best;
    }
    lutReady = true;
  }

  // ---------- geometry ----------
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    W = Math.round(w * dpr); H = Math.round(h * dpr);
    canvas.width = W; canvas.height = H;
    regrid();
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
    haveFrame = false;
  }
  function computeCrop(src) {
    const vw = src.videoWidth || src.width, vh = src.videoHeight || src.height, a = cols / rows;
    if (vw / vh > a) { crop.sh = vh; crop.sw = vh * a; crop.sx = (vw - crop.sw) / 2; crop.sy = 0; }
    else { crop.sw = vw; crop.sh = vw / a; crop.sx = 0; crop.sy = (vh - crop.sh) / 2; }
  }

  // ---------- per-frame ----------
  function sample(src) {
    sctx.save();
    if (opts.mirror) { sctx.translate(cols, 0); sctx.scale(-1, 1); }
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

  function drawTiles() {
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
    errSum = 0; goodCount = 0;
    for (let r = 0; r < rows; r++) {
      const y = r * cs;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c, p = i * 3;
        const b = bucket(smooth[p], smooth[p + 1], smooth[p + 2]);
        const nn = lutN[b];
        if (!nn) continue;
        const t = lut[b * K + (seed[i] % nn)];
        cellTile[i] = t;
        const be = lutBest[b];
        errSum += be; if (be < 12) goodCount++; else if (be > 18) gap[b] += 1;
        ctx.drawImage(atlas, (t % perRow) * TS, ((t / perRow) | 0) * TS, TS, TS, c * cs, y, cs, cs);
      }
    }
  }

  function drawOverlay() {
    const a = opts.strength;
    if (a <= 0) return;
    ctx.save();
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

  function drawLens() {
    if (!lens) return;
    const px = lens.x * dpr, py = lens.y * dpr, R = 120 * dpr, L = 60 * dpr;
    const fx = px / cs, fy = py / cs, n = Math.ceil(R / L) + 1;
    const c0 = Math.floor(fx), r0 = Math.floor(fy);
    ctx.save();
    ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#000'; ctx.fillRect(px - R, py - R, 2 * R, 2 * R);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) {
      const c = c0 + dx, r = r0 + dy;
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      const t = cellTile[r * cols + c];
      if (t < 0) continue;
      ctx.drawImage(atlas, (t % perRow) * TS, ((t / perRow) | 0) * TS, TS, TS, px + (c - fx) * L, py + (r - fy) * L, L, L);
    }
    ctx.restore();
    ctx.save();
    ctx.lineWidth = 3 * dpr; ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.stroke();
    const tile = tileAtCell(c0, r0);
    if (tile) {
      const label = tile.name + (tile.year ? ' · ' + tile.year : '');
      ctx.font = `600 ${14 * dpr}px system-ui, -apple-system, sans-serif`;
      const tw = ctx.measureText(label).width, ph = 28 * dpr, pw = tw + 24 * dpr;
      let lx = Math.min(Math.max(px - pw / 2, 8 * dpr), W - pw - 8 * dpr);
      let ly = py + R + 10 * dpr; if (ly + ph > H) ly = py - R - 10 * dpr - ph;
      ctx.fillStyle = 'rgba(20,10,25,0.85)';
      roundRect(lx, ly, pw, ph, ph / 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
      ctx.fillText(label, lx + 12 * dpr, ly + ph / 2);
    }
    ctx.restore();
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function tileAtCell(c, r) {
    if (!cellTile || c < 0 || r < 0 || c >= cols || r >= rows) return null;
    const t = cellTile[r * cols + c];
    return t >= 0 ? tiles[t] : null;
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
    if (!lutReady || !atlas) { ctx.fillStyle = '#0b0710'; ctx.fillRect(0, 0, W, H); return; }
    const ready = video && video.readyState >= 2 && video.videoWidth;
    if (ready && (!frozen || !haveFrame)) { computeCrop(video); sample(video); }
    if (!haveFrame) return;
    if (opts.rotate && !frozen && !lens) {
      const n = cols * rows, k = Math.max(1, (n * 0.003) | 0);
      for (let j = 0; j < k; j++) seed[(Math.random() * n) | 0]++;
    }
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
      if (canvas && opts.tileSize !== ts) regrid();
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
    setLens(p) { lens = p; },
    tileAt(x, y) { return tileAtCell(Math.floor((x * dpr) / cs), Math.floor((y * dpr) / cs)); },
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
