// graph.js — "Who you're made of": the mosaic zoomed out (owner: P1).
// Every member is a portrait; every gold dot is a real woman who went first. A line means "she is in this member's
// portrait". Women shared by several members become bridges, so you see who you're connected to *through her*.
// Canvas 2D force layout; wheel/pinch zoom, drag to pan, drag nodes, hover lights up neighbors, tap opens a card.
(function () {
  'use strict';
  const C = {
    bg: '#F6F1EC', edge: 'rgba(107,45,92,0.13)', edgeHi: 'rgba(107,45,92,0.75)', conn: 'rgba(232,115,90,0.55)',
    member: '#6B2D5C', me: '#E8735A', woman: '#C9973A', womanShared: '#B07E1F', text: '#221A20', muted: '#6E6470', dim: 0.1
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = n => String(n || '').replace(/\s*\(sample\)\s*$/i, '');
  const initials = n => clean(n).split(/\s+/).filter(w => !/^dr\.?$/i.test(w)).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const imgCache = new Map();
  const img = src => { if (!src) return null; if (!imgCache.has(src)) { const i = new Image(); i.src = src; imgCache.set(src, i); } return imgCache.get(src); };

  let root, cv, ctx, raf = 0, nodes = [], edges = [], byId = new Map(), adj = new Map();
  let view = { x: 0, y: 0, k: 1 }, hover = null, dragNode = null, panning = null, alpha = 1, search = '';
  let filters = { sharedOnly: false }, selected = null, pointers = new Map(), pinch = null, dpr = 1, myNodeId = null;

  // ---------- data ----------
  async function build() {
    await JourneyLib.ready;
    const s = JStore.get(), me = s.profile || {}, myId = s.memberId;
    let members = [], conns = [];
    if (window.JDB && JDB.ready()) {
      const [m, c] = await Promise.all([
        JDB.select('members', 'select=id,name,track,stage,years,role,open_to_mentor,pct,avatar,city,women_ids&limit=200'),
        JDB.select('connections', 'select=from_id,to_id,status&status=eq.accepted&limit=500')
      ]);
      members = m || []; conns = c || [];
    }
    nodes = []; edges = []; byId = new Map(); adj = new Map();
    const add = n => { if (byId.has(n.id)) return byId.get(n.id); const a = Math.random() * 6.283, r = 60 + Math.random() * 280; Object.assign(n, { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0 }); nodes.push(n); byId.set(n.id, n); return n; };
    const link = (a, b, kind, len) => { if (!byId.has(a) || !byId.has(b) || a === b) return; edges.push({ a: byId.get(a), b: byId.get(b), kind, len }); (adj.get(a) || adj.set(a, new Set()).get(a)).add(b); (adj.get(b) || adj.set(b, new Set()).get(b)).add(a); };
    const addWoman = (wid, extra) => {
      const t = JourneyLib.tile(wid); if (!t || (JourneyLib.isReal && !JourneyLib.isReal(t))) return null;
      return Object.assign(add({ id: 'w:' + wid, type: 'woman', label: t.name, tile: t, r: 4 }), extra || {});
    };

    // you, with the women in your portrait (and why)
    myNodeId = 'm:' + myId;
    if (me.name) {
      const n = add({ id: myNodeId, type: 'me', label: 'You', r: 16, memberId: myId });
      n.x = n.y = 0;
      (s.achievements || []).forEach(a => { if (addWoman(a.womanId, { mine: true, reason: a.reason, achievement: a.text })) link(myNodeId, 'w:' + a.womanId, 'made', 70); });
    }
    // members and the women in their portraits
    members.forEach(m => {
      if (m.id === myId || !(m.women_ids || []).length) return;
      add({ id: 'm:' + m.id, type: 'member', label: clean(m.name), r: 11, memberId: m.id, mentor: !!m.open_to_mentor, avatar: m.avatar,
        sub: [m.role, m.years ? m.years + ' yrs' : '', m.city].filter(Boolean).join(' · '), pct: m.pct || 0 });
      m.women_ids.forEach(w => { if (addWoman(w)) link('m:' + m.id, 'w:' + w, 'made', 70); });
    });
    conns.forEach(c => link('m:' + c.from_id, 'm:' + c.to_id, 'conn', 120));
    // size women by how many portraits they're in
    nodes.forEach(n => { if (n.type === 'woman') { n.shared = [...(adj.get(n.id) || [])].filter(id => id.startsWith('m:')).length; n.r = 3.5 + Math.min(6, (n.shared - 1) * 2.2); } });
    alpha = 1;
    stats();
  }

  // ---------- physics ----------
  function step() {
    if (alpha < 0.004) return;
    const n = nodes.length;
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]; let dx = b.x - a.x, dy = b.y - a.y, d2 = Math.max(dx * dx + dy * dy, 36);
        const people = a.type !== 'woman' && b.type !== 'woman';
        if (d2 > 250000 && !people) continue;
        const f = (people ? 16000 : 900) / d2, d = Math.sqrt(d2);
        dx /= d; dy /= d; a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
      }
    }
    for (const e of edges) {
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - e.len) * (e.kind === 'conn' ? 0.004 : 0.014), fx = dx / d * f, fy = dy / d * f;
      e.a.vx += fx; e.a.vy += fy; e.b.vx -= fx; e.b.vy -= fy;
    }
    for (const p of nodes) {
      if (p === dragNode) { p.vx = p.vy = 0; continue; }
      if (p.id === myNodeId) { p.vx -= p.x * 0.02; p.vy -= p.y * 0.02; }   // you stay near the center
      p.vx -= p.x * 0.002; p.vy -= p.y * 0.002;
      p.vx *= 0.82; p.vy *= 0.82;
      const sp = Math.hypot(p.vx, p.vy); if (sp > 30) { p.vx *= 30 / sp; p.vy *= 30 / sp; }
      p.x += p.vx * alpha * 1.6; p.y += p.vy * alpha * 1.6;
    }
    alpha *= 0.992;
  }

  // ---------- drawing ----------
  const visible = nd => !(filters.sharedOnly && nd.type === 'woman' && nd.shared < 2 && !nd.mine);
  const color = nd => nd.type === 'me' ? C.me : nd.type === 'member' ? C.member : nd.shared > 1 ? C.womanShared : C.woman;
  const matches = nd => search && nd.label.toLowerCase().includes(search);

  function circleImage(nd, src, r, ring) {
    const im = img(src);
    if (im && im.complete && im.naturalWidth) {
      ctx.save(); ctx.beginPath(); ctx.arc(nd.x, nd.y, r, 0, 6.283); ctx.clip(); ctx.drawImage(im, nd.x - r, nd.y - r, r * 2, r * 2); ctx.restore();
      ctx.strokeStyle = ring; ctx.lineWidth = Math.max(1.5, r * 0.14) / Math.sqrt(view.k); ctx.beginPath(); ctx.arc(nd.x, nd.y, r, 0, 6.283); ctx.stroke();
      return true;
    }
    return false;
  }

  function draw() {
    const W = cv.width, H = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(view.k * dpr, 0, 0, view.k * dpr, W / 2 + view.x * dpr, H / 2 + view.y * dpr);
    const focus = hover || selected, near = focus ? (adj.get(focus.id) || new Set()) : null;
    const lit = nd => !focus || nd === focus || near.has(nd.id);

    for (const e of edges) {
      if (!visible(e.a) || !visible(e.b)) continue;
      const on = focus && (e.a === focus || e.b === focus);
      ctx.globalAlpha = focus ? (on ? 1 : C.dim) : search ? 0.4 : 1;
      ctx.strokeStyle = on ? C.edgeHi : e.kind === 'conn' ? C.conn : e.a.id === myNodeId || e.b.id === myNodeId ? 'rgba(232,115,90,0.35)' : C.edge;
      ctx.lineWidth = (on ? 1.8 : 1) / view.k;
      ctx.setLineDash(e.kind === 'conn' ? [5 / view.k, 4 / view.k] : []);
      ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y); ctx.stroke();
    }
    ctx.setLineDash([]);

    const t = performance.now() / 1000;
    for (const nd of nodes) {
      if (!visible(nd)) continue;
      const hit = matches(nd);
      ctx.globalAlpha = lit(nd) ? (search && !hit && !focus ? 0.3 : 1) : C.dim;
      const r = nd.r * (nd === hover ? 1.25 : 1);
      if (nd.type === 'me' || hit) {
        ctx.save(); ctx.globalAlpha *= 0.22 + 0.1 * Math.sin(t * 2); ctx.fillStyle = color(nd);
        ctx.beginPath(); ctx.arc(nd.x, nd.y, r * 1.7, 0, 6.283); ctx.fill(); ctx.restore();
      }
      if (nd.type === 'me') {
        const snap = window.avatarPortrait && (nd._snap || (nd._snap = avatarPortrait.snapshot(192)));
        if (!circleImage(nd, snap, r, C.me)) { ctx.fillStyle = C.me; ctx.beginPath(); ctx.arc(nd.x, nd.y, r, 0, 6.283); ctx.fill(); }
      } else if (nd.type === 'member') {
        if (!circleImage(nd, nd.avatar, r, nd.mentor ? C.woman : C.member)) {
          ctx.fillStyle = C.member; ctx.beginPath(); ctx.arc(nd.x, nd.y, r, 0, 6.283); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = `600 ${r * 0.8}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(initials(nd.label), nd.x, nd.y + 0.5);
        }
        if (nd.mentor) { ctx.strokeStyle = C.woman; ctx.lineWidth = 2 / view.k; ctx.beginPath(); ctx.arc(nd.x, nd.y, r + 3 / view.k, 0, 6.283); ctx.stroke(); }
      } else {
        const showPic = view.k * r > 8;
        if (!(showPic && circleImage(nd, nd._thumb || (nd._thumb = JourneyLib.thumb(nd.tile, 96)), r, color(nd)))) {
          ctx.fillStyle = color(nd); ctx.beginPath(); ctx.arc(nd.x, nd.y, r, 0, 6.283); ctx.fill();
        }
      }
    }
    // labels: you, members and shared women always; everyone else fades in as you zoom
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const nd of nodes) {
      if (!visible(nd) || (focus && !lit(nd))) continue;
      const always = nd.type !== 'woman' || nd.shared > 1 || nd === focus || (focus && near.has(nd.id)) || matches(nd);
      const a = always ? 1 : Math.max(0, Math.min(1, (view.k - 1.2) / 0.6));
      if (a <= 0.02) continue;
      ctx.globalAlpha = a;
      const fs = (nd.type === 'woman' ? 10 : 11.5) / Math.max(0.75, Math.min(view.k, 2.2));
      ctx.font = `${nd.type === 'woman' ? 500 : 600} ${fs}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = nd.type === 'woman' ? C.muted : C.text;
      ctx.fillText(nd.label, nd.x, nd.y + nd.r + 4 / view.k);
    }
    ctx.globalAlpha = 1;
  }
  function loop() { step(); draw(); raf = requestAnimationFrame(loop); }

  // ---------- interaction ----------
  function toWorld(cx, cy) { const r = cv.getBoundingClientRect(); return { x: (cx - r.left - r.width / 2 - view.x) / view.k, y: (cy - r.top - r.height / 2 - view.y) / view.k }; }
  function nodeAt(cx, cy) {
    const p = toWorld(cx, cy); let best = null, bd = Infinity;
    for (const nd of nodes) { if (!visible(nd)) continue; const d = Math.hypot(nd.x - p.x, nd.y - p.y); if (d < Math.max(nd.r + 4 / view.k, 9 / view.k) && d < bd) { best = nd; bd = d; } }
    return best;
  }
  function zoomAt(cx, cy, f) {
    const r = cv.getBoundingClientRect(), k = Math.max(0.3, Math.min(6, view.k * f)); f = k / view.k;
    const px = cx - r.left - r.width / 2, py = cy - r.top - r.height / 2;
    view.x = px - (px - view.x) * f; view.y = py - (py - view.y) * f; view.k = k;
  }
  function bind() {
    cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k }; dragNode = null; panning = null; return; }
      const nd = nodeAt(e.clientX, e.clientY);
      if (nd) { dragNode = nd; nd._moved = false; alpha = Math.max(alpha, 0.3); }
      else panning = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    });
    cv.addEventListener('pointermove', e => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y); zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (pinch.k * d / pinch.d) / view.k); return; }
      if (dragNode) { const p = toWorld(e.clientX, e.clientY); if (Math.hypot(p.x - dragNode.x, p.y - dragNode.y) > 2 / view.k) dragNode._moved = true; dragNode.x = p.x; dragNode.y = p.y; alpha = Math.max(alpha, 0.25); return; }
      if (panning) { view.x = panning.vx + e.clientX - panning.x; view.y = panning.vy + e.clientY - panning.y; if (Math.abs(e.clientX - panning.x) + Math.abs(e.clientY - panning.y) > 4) panning.moved = true; return; }
      hover = nodeAt(e.clientX, e.clientY); cv.style.cursor = hover ? 'pointer' : 'grab';
    });
    const up = e => {
      pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
      if (dragNode && !dragNode._moved) { selected = dragNode; panel(dragNode); }
      else if (panning && !panning.moved) { selected = null; panel(null); }
      dragNode = null; panning = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { hover = null; });
  }

  const nameList = ids => ids.map(id => byId.get(id)).filter(Boolean).map(n => n.type === 'me' ? 'you' : n.label);
  function panel(nd) {
    const el = root.querySelector('.gv-panel');
    if (!nd) { el.hidden = true; return; }
    el.hidden = false;
    const near = [...(adj.get(nd.id) || [])];
    let html = '';
    if (nd.type === 'woman') {
      const t = nd.tile, who = nameList(near.filter(id => id.startsWith('m:')));
      html = `<img class="gv-pic" src="${esc(t.image || JourneyLib.thumb(t, 160))}" alt="">
        <span class="gv-k">${who.length > 1 ? `In ${who.length} portraits` : 'Went first'}</span><h3>${esc(t.name)}</h3>
        <p class="gv-sub">${esc([t.field, t.year].filter(Boolean).join(' · '))}</p>
        ${nd.achievement ? `<p class="gv-q">Your step: “${esc(nd.achievement)}”</p><p>${esc(nd.reason || '')}</p>` : `<p>${esc(t.desc || '')}</p>`}
        ${who.length ? `<p class="gv-sub">Made of her: ${esc(who.join(', '))}</p>` : ''}
        ${t.link ? `<a href="${esc(t.link)}" target="_blank" rel="noopener">Her story ↗</a>` : ''}`;
    } else {
      const mine = new Set(adj.get(myNodeId) || []);
      const shared = near.filter(id => id.startsWith('w:') && mine.has(id)).map(id => byId.get(id).label);
      const women = near.filter(id => id.startsWith('w:')).length;
      html = `${nd.type === 'member' && nd.avatar ? `<img class="gv-pic member" src="${esc(nd.avatar)}" alt="">` : ''}
        <span class="gv-k">${nd.type === 'me' ? 'You' : nd.mentor ? '★ Open to mentoring' : 'Member'}</span><h3>${esc(nd.type === 'me' ? 'Your portrait' : nd.label)}</h3>
        ${nd.sub ? `<p class="gv-sub">${esc(nd.sub)}</p>` : ''}
        <p class="gv-sub">Made of ${women} women${nd.pct ? ` · ${nd.pct}% filled` : ''}</p>
        ${nd.type === 'member' ? (shared.length ? `<p>You're both made of <b>${esc(shared.join(', '))}</b>.</p>` : `<p>No women in common yet. Different paths.</p>`) : `<p>Tap a gold dot to see who else is made of her.</p>`}
        ${nd.type === 'member' && window.Network && Network.openProfile ? `<button class="gv-btn" data-profile="${esc(nd.memberId)}">Open her profile</button>` : ''}`;
    }
    el.innerHTML = `<button class="gv-x" aria-label="Close">×</button>${html}`;
    el.querySelector('.gv-x').onclick = () => { selected = null; panel(null); };
    const pb = el.querySelector('[data-profile]');
    if (pb) pb.onclick = () => { const id = pb.dataset.profile; close(); setTimeout(() => Network.openProfile(id), 50); };
  }

  function stats() {
    const el = root && root.querySelector('.gv-stats'); if (!el) return;
    const mine = new Set(adj.get(myNodeId) || []);
    const members = nodes.filter(n => n.type === 'member');
    const linked = members.filter(m => [...(adj.get(m.id) || [])].some(id => mine.has(id))).length;
    const sharedW = nodes.filter(n => n.type === 'woman' && n.mine && n.shared > 1).length;
    el.textContent = myNodeId && mine.size ? `You share ${sharedW} women with ${linked} members` : `${members.length} members · ${nodes.length - members.length} women`;
  }
  function resize() { if (!cv) return; dpr = Math.min(window.devicePixelRatio || 1, 2); cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr); }

  // ---------- open / close ----------
  async function openGraph() {
    if (!root) {
      root = document.createElement('div'); root.className = 'gv'; root.hidden = true;
      root.innerHTML = `
        <canvas class="gv-canvas"></canvas>
        <div class="gv-top">
          <div class="gv-title"><h2>Who you're made of</h2><span class="gv-stats"></span></div>
          <input class="gv-search" type="search" placeholder="Find a woman or member…" aria-label="Search">
          <button class="gv-t" data-f="sharedOnly">Only women we share</button>
          <button class="gv-close" aria-label="Close">Close ✕</button>
        </div>
        <aside class="gv-panel" hidden></aside>
        <div class="gv-legend"><span><i class="lg-me"></i>You</span><span><i class="lg-m"></i>Members</span><span><i class="lg-w"></i>Women who went first</span><span class="lg-note">Bigger gold = in more portraits</span></div>`;
      document.body.appendChild(root);
      cv = root.querySelector('canvas'); ctx = cv.getContext('2d');
      bind();
      root.querySelector('.gv-close').onclick = close;
      root.querySelector('.gv-search').oninput = e => { search = e.target.value.trim().toLowerCase(); };
      root.querySelector('.gv-t').onclick = e => { filters.sharedOnly = !filters.sharedOnly; e.target.classList.toggle('on', filters.sharedOnly); };
      window.addEventListener('resize', resize);
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !root.hidden) close(); });
    }
    root.hidden = false; document.body.classList.add('gv-open');
    resize(); view = { x: 0, y: 0, k: window.innerWidth < 640 ? 0.7 : 1 }; selected = null; panel(null);
    await build();
    cancelAnimationFrame(raf); loop();
  }
  function close() { if (!root) return; root.hidden = true; document.body.classList.remove('gv-open'); cancelAnimationFrame(raf); }
  window.openGraph = openGraph;
  window.NetworkGraph = { open: openGraph, close };

  // Entry points: the top of the Network page, and under the big portrait on the Me page.
  function addEntry() {
    const page = document.getElementById('network');
    if (page && !page.querySelector('.gv-open-btn')) {
      const b = document.createElement('button'); b.className = 'gv-open-btn'; b.type = 'button';
      b.innerHTML = `<span class="gv-mini"><i></i><i></i><i></i><i></i><i></i></span><span class="gv-open-txt"><b>Who you're made of</b><small>See which members share the women in your portrait</small></span><span class="gv-arrow">→</span>`;
      b.onclick = openGraph; page.prepend(b);
    }
    const me = document.getElementById('me'), big = document.getElementById('bigPortrait');
    if (me && big && !me.querySelector('.gv-open-link')) {
      const a = document.createElement('button'); a.className = 'gv-open-link'; a.type = 'button';
      a.textContent = 'Zoom out: who else is made of them →'; a.onclick = openGraph;
      big.insertAdjacentElement('afterend', a);
    }
  }
  if (location.hash === '#made-of' || location.hash === '#graph') setTimeout(openGraph, 400);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addEntry); else setTimeout(addEntry);
  let mo = 0;
  new MutationObserver(() => { if (!mo) mo = requestAnimationFrame(() => { mo = 0; addEntry(); }); }).observe(document.documentElement, { childList: true, subtree: true });
})();
