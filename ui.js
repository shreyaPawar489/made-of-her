// ui.js — camera, controls, lens, story card, stats. Owner: P3 (Niranjan). Talks to engine only via window.Mosaic.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('mosaic'), video = $('video');
  const params = new URLSearchParams(location.search);
  let facing = 'user', stream = null, started = false, libReady = false;

  Mosaic.init({ canvas, video });

  // ---------- library ----------
  const setStatus = t => { $('libStatus').textContent = t; $('count').textContent = t; };
  async function loadLibrary() {
    if (params.has('fake')) { Mosaic.useFakeLibrary(600); return done('Fake library (dev)'); }
    if (!params.has('rebuild')) {
      try { const r = await Mosaic.loadLibrary('library/'); return done(r.count); } catch (e) { /* not committed yet */ }
      const c = await LibraryBuilder.loadCached();
      if (c) { Mosaic.setLibrary(c.img, c.tiles, c.meta); return done(c.tiles.length); }
    }
    setStatus('Gathering women from Wikidata…');
    libReady = true; // headline cards arrive immediately; people stream in
    await LibraryBuilder.build({
      onProgress(p) {
        if (p.phase === 'query') setStatus(`Finding women… ${p.people || 0} found`);
        else if (p.phase === 'images') setStatus(`Loading portraits… ${p.tiles} tiles`);
        else if (p.phase === 'done') done(p.tiles);
      }
    });
  }
  function done(n) {
    libReady = true;
    setStatus(typeof n === 'number' ? `${n.toLocaleString()} women & stories` : n);
  }
  loadLibrary().catch(e => { console.error(e); setStatus('Library failed to load. Check connection.'); });

  // ---------- camera ----------
  async function startCamera() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false
    });
    video.srcObject = stream;
    await video.play();
    Mosaic.setOptions({ mirror: facing === 'user' });
  }
  $('startBtn').onclick = async () => {
    $('camError').hidden = true;
    try {
      await startCamera();
      started = true;
      $('start').hidden = true; $('topbar').hidden = false; $('relevance').hidden = false;
      $('hint').hidden = false; setTimeout(() => $('hint').classList.add('fade'), 5000);
      if (matchMedia('(pointer: coarse)').matches) { $('flipFab').hidden = false; $('menuFab').hidden = false; }
      Mosaic.start();
    } catch (e) {
      $('camError').hidden = false;
      $('camError').textContent = location.protocol === 'file:' ? 'Open this through a local server or HTTPS, not as a file.' :
        'Camera blocked. Allow camera access in your browser settings and try again.';
    }
  };
  $('flipFab').onclick = () => $('flipBtn').click();
  // Controls bar is hidden by default; S key (desktop) or ☰ button (touch) toggles it.
  function toggleControls(show = $('controls').hidden) {
    $('controls').hidden = !show;
    document.body.classList.toggle('controls-open', show);
    $('menuFab').textContent = show ? '×' : '☰';
    $('menuFab').setAttribute('aria-label', show ? 'Hide controls' : 'Show controls');
  }
  $('menuFab').onclick = () => toggleControls();
  $('flipBtn').onclick = async () => {
    facing = facing === 'user' ? 'environment' : 'user';
    try { await startCamera(); } catch (e) { facing = 'user'; try { await startCamera(); } catch (e2) { /* keep last frame */ } }
  };

  // ---------- controls ----------
  const sync = () => Mosaic.setOptions({
    tileSize: +$('tileSize').value, strength: $('strength').value / 100, mode: $('mode').value,
    rotate: $('rotateBtn').classList.contains('on')
  });
  ['tileSize', 'strength', 'mode'].forEach(id => $(id).addEventListener('input', sync));
  $('rotateBtn').onclick = () => { $('rotateBtn').classList.toggle('on'); sync(); };
  sync();

  function setFrozen(f) {
    Mosaic.freeze(f);
    $('freezeBtn').textContent = f ? 'Live' : 'Freeze';
  }
  $('freezeBtn').onclick = () => { const f = !Mosaic.isFrozen(); setFrozen(f); if (!f) closeCard(); };
  $('statsBtn').onclick = () => { $('statsBtn').classList.toggle('on'); $('stats').hidden = !$('stats').hidden; };
  $('exportBtn').onclick = () => LibraryBuilder.exportFiles();
  $('rebuildBtn').onclick = async () => { await LibraryBuilder.clearCache(); location.search = '?rebuild=1'; };

  // ---------- relevance: scene + location (relevance.js) ----------
  const relHint = $('relHint');
  function updateRelHint(msg) {
    if (msg) { relHint.textContent = msg; return; }
    const s = Relevance.scenes.find(x => x.id === Relevance.getScene());
    const parts = [];
    if (s) parts.push(`${s.label} scene`);
    if (Relevance.hasLocation()) parts.push('women from near you');
    relHint.textContent = parts.length ? `Showing more: ${parts.join(' + ')}` : 'Pick where you are, and the women in your mosaic will match it.';
  }
  function setScene(id) {
    Relevance.setScene(id);
    document.querySelectorAll('#sceneChips button').forEach(b => b.classList.toggle('on', b.dataset.id === id));
    updateRelHint();
  }
  Relevance.scenes.forEach(s => {
    const b = document.createElement('button'); b.textContent = s.label; b.dataset.id = s.id;
    b.onclick = () => setScene(Relevance.getScene() === s.id ? null : s.id);
    $('sceneChips').appendChild(b);
  });
  $('nearMeBtn').onclick = async () => {
    const btn = $('nearMeBtn');
    if (btn.classList.contains('on')) { Relevance.setLocation(null); btn.classList.remove('on'); return updateRelHint(); }
    updateRelHint('Finding your location…');
    try { await Relevance.locate(); btn.classList.add('on'); updateRelHint(); }
    catch (e) { updateRelHint(e && e.code === 1 ? 'Location is blocked. Allow it in your browser settings to see women near you.' : 'Could not get your location.'); }
  };
  $('autoSceneBtn').onclick = async () => {
    if (!video.videoWidth) return updateRelHint('Turn on the camera first.');
    updateRelHint('Looking at your surroundings…');
    try {
      const c = document.createElement('canvas'), w = 384; c.width = w; c.height = Math.round(w * video.videoHeight / video.videoWidth);
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      const r = await fetch('/api/scene', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: c.toDataURL('image/jpeg', 0.7).split(',')[1] }) });
      if (!r.ok) throw new Error('unavailable');
      const { scene } = await r.json();
      if (scene && Relevance.scenes.some(s => s.id === scene)) { setScene(scene); }
      else updateRelHint('Could not tell where you are. Pick a scene above.');
    } catch (e) { updateRelHint('Auto-detect is not set up yet. Pick a scene above.'); }
  };
  updateRelHint();

  let lensOn = true;
  document.addEventListener('keydown', e => {
    if (!started || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); $('freezeBtn').click(); }
    else if (e.key === 'd' || e.key === 'D') $('statsBtn').click();
    else if (e.key === 's' || e.key === 'S') toggleControls();
    else if (e.key === '0') Mosaic.resetView();
    else if (e.key === 'l' || e.key === 'L') { lensOn = !lensOn; if (!lensOn) Mosaic.setLens(null); }
    else if (e.key === 'Escape') { if ($('card').hidden) Mosaic.resetView(); closeCard(); }
  });

  // ---------- hover, zoom, pan, pinch, tap ----------
  const pts = new Map(); // active pointers
  let down = null, moved = false, pinchD = 0;
  // A tap opens the card after a short wait, so a double-click/double-tap (zoom) can cancel it.
  let tapTimer = null;
  const cancelTap = () => { clearTimeout(tapTimer); tapTimer = null; };
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const k = e.ctrlKey ? 0.012 : 0.0025; // ctrlKey = trackpad pinch
    Mosaic.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * k));
  }, { passive: false });
  canvas.addEventListener('dblclick', e => {
    cancelTap();
    if (Mosaic.zoom() > 1.05) Mosaic.resetView(); else Mosaic.zoomAt(e.clientX, e.clientY, 4);
  });
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    cancelTap(); // second press of a double-click
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { down = { x: e.clientX, y: e.clientY }; moved = false; }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); moved = true; }
    if (e.pointerType !== 'mouse' && lensOn) Mosaic.setLens({ x: e.clientX, y: e.clientY });
  });
  canvas.addEventListener('pointermove', e => {
    const prev = pts.get(e.pointerId);
    if (prev) {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD) Mosaic.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchD);
        pinchD = d;
      } else if (down) {
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) moved = true;
        if (moved && Mosaic.zoom() > 1) Mosaic.panBy(e.clientX - prev.x, e.clientY - prev.y);
      }
    }
    if (lensOn && (e.pointerType === 'mouse' || prev)) Mosaic.setLens({ x: e.clientX, y: e.clientY });
  });
  function endPointer(e) {
    const tap = pts.size === 1 && down && !moved;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinchD = 0;
    if (pts.size) return;
    down = null;
    if (e.pointerType !== 'mouse') Mosaic.setLens(null);
    if (tap && started && e.type === 'pointerup') {
      const tile = Mosaic.tileAt(e.clientX, e.clientY);
      cancelTap();
      if (tile) tapTimer = setTimeout(() => { tapTimer = null; setFrozen(true); openCard(tile, true); }, 260);
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') Mosaic.setLens(null); });

  // ---------- story card ----------
  function openCard(tile, refreshFrame) {
    if (refreshFrame) {
      const s = Mosaic.frameSummary();
      $('frameBanner').textContent = `This frame is made of ${s.uniqueTiles.toLocaleString()} women & stories`;
      const chips = $('chips'); chips.innerHTML = '';
      s.sample.filter(t => t !== tile).slice(0, 5).forEach(t => {
        const b = document.createElement('button'); b.textContent = t.name; b.onclick = () => openCard(t, false); chips.appendChild(b);
      });
    }
    const img = $('cardImg');
    const fallback = Mosaic.tileThumb(tile, 240);
    img.onerror = () => { img.onerror = null; img.src = fallback; };
    img.src = tile.image || fallback;
    $('cardBadge').textContent = tile.kind === 'headline' ? (tile.era === 'recent' ? 'Recent milestone' : 'Milestone') : (tile.era === 'recent' ? 'Recent achiever' : 'Her story');
    $('cardName').textContent = tile.kind === 'headline' ? tile.title : tile.name;
    const meta = [];
    if (tile.kind === 'headline') { meta.push(tile.year, tile.name); }
    else { if (tile.year) meta.push(tile.era === 'recent' ? tile.year : 'Born ' + tile.year); if (tile.field) meta.push(tile.field); }
    if (tile.kind !== 'headline' && (tile.place || tile.country)) {
      const where = [tile.place, tile.country && tile.country !== tile.place ? tile.country : ''].filter(Boolean).join(', ');
      const d = Relevance.distanceKm(tile);
      meta.push('From ' + where + (d != null ? ` (${d.toLocaleString()} km from you)` : ''));
    }
    $('cardMeta').textContent = meta.filter(Boolean).join(' · ');
    $('cardDesc').textContent = tile.desc ? tile.desc.charAt(0).toUpperCase() + tile.desc.slice(1) : '';
    // Longer memo (what she did + why it matters). Fields come from library/tiles.json; all optional.
    const memoWrap = $('cardMemoWrap');
    memoWrap.hidden = !(tile.memo || tile.impact);
    $('cardMemo').textContent = tile.memo || '';
    $('cardImpact').textContent = tile.impact ? 'Why it matters: ' + tile.impact : '';
    $('cardImpact').hidden = !tile.impact;
    $('cardCredit').textContent = tile.memoSource && /wikipedia\.org/.test(tile.memoSource) ? 'Summary from Wikipedia (CC BY-SA)' : '';
    memoWrap.scrollTop = 0; $('card').scrollTop = 0;
    const link = $('cardLink');
    if (tile.link && tile.link !== '#') { link.href = tile.link; link.hidden = false; } else link.hidden = true;
    $('card').hidden = false;
    document.body.classList.add('card-open');
  }
  function closeCard() { $('card').hidden = true; document.body.classList.remove('card-open'); }
  $('cardClose').onclick = closeCard;
  $('keepBtn').onclick = closeCard;
  $('liveBtn').onclick = () => { closeCard(); setFrozen(false); };

  // ---------- stats ----------
  setInterval(() => {
    if (!started) return;
    const s = Mosaic.stats();
    if (libReady && s.libraryCount) $('count').textContent = `${s.libraryCount.toLocaleString()} women & stories`;
    if ($('stats').hidden) return;
    $('statsText').textContent =
      `FPS            ${s.fps}\nGrid           ${s.cols}×${s.rows} = ${(s.cols * s.rows).toLocaleString()}\nLibrary        ${s.libraryCount}\nIn frame       ${s.uniqueTiles}\nMatch error ΔE ${s.matchError}\nGood matches   ${s.goodMatchPct}%`;
    const g = $('gaps'); g.innerHTML = '';
    s.gapColors.forEach(c => { const sp = document.createElement('span'); sp.style.background = c; sp.title = c; g.appendChild(sp); });
  }, 500);
})();
