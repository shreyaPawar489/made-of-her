// graph.js — Obsidian-style graph view of the network (owner: P1).
// Nodes: you, members (Supabase), paths (tracks), and the real women who went first (from the library).
// Edges: member → her paths, you → the women in your portrait, woman → her path, connections between members.
// Canvas 2D force layout; wheel/pinch zoom, drag to pan, drag nodes, hover lights up neighbors, click opens.
// Opens full-screen via openGraph(); adds a "Graph" link to the nav and a button on the Network page.
(function () {
  'use strict';
  const C = {
    bg: '#141416', edge: 'rgba(220,220,235,0.10)', edgeHi: 'rgba(180,140,255,0.75)',
    node: '#8b8b93', member: '#c9c9d1', me: '#ff8a6b', woman: '#e3b341', track: '#b48cff', mentor: '#e3b341',
    text: 'rgba(235,235,240,0.86)', dim: 0.12
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = n => String(n || '').replace(/\s*\(sample\)\s*$/i, '');
  const imgCache = new Map();
  function img(src) {
    if (!src) return null;
    if (imgCache.has(src)) return imgCache.get(src);
    const i = new Image(); i.src = src; imgCache.set(src, i); return i;
  }

  let root, cv, ctx, raf = 0, nodes = [], edges = [], byId = new Map(), adj = new Map();
  let view = { x: 0, y: 0, k: 1 }, hover = null, dragNode = null, panning = null, alpha = 1, search = '', filters = { women: true, members: true, links: true };
  let selected = null, pointers = new Map(), pinch = null, dpr = 1;

  // ---------- data ----------
  async function build() {
    await JourneyLib.ready;
    const s = JStore.get(), me = s.profile || {}, myId = s.memberId;
    let members = [], conns = [];
    if (window.JDB && JDB.ready()) {
      const [m, c] = await Promise.all([
        JDB.select('members', 'select=id,name,track,interests,stage,years,role,open_to_mentor,pct,women,avatar,city,is_sample&limit=200'),
        JDB.select('connections', 'select=from_id,to_id,status&limit=500')
      ]);
      members = m || []; conns = c || [];
    }
    nodes = []; edges = []; byId = new Map(); adj = new Map();
    const add = n => { if (byId.has(n.id)) return byId.get(n.id); const a = Math.random() * 6.283, r = 80 + Math.random() * 260; Object.assign(n, { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0 }); nodes.push(n); byId.set(n.id, n); return n; };
    const link = (a, b, kind, len) => { if (!byId.has(a) || !byId.has(b) || a === b) return; edges.push({ a: byId.get(a), b: byId.get(b), kind, len }); (adj.get(a) || adj.set(a, new Set()).get(a)).add(b); (adj.get(b) || adj.set(b, new Set()).get(b)).add(a); };

    // paths (tracks)
    const tracks = Object.keys(JourneyLib.tracks);
    tracks.forEach((t, i) => { const n = add({ id: 't:' + t, type: 'track', label: JourneyLib.labels[t] || t, r: 7, track: t }); const a = i / tracks.length * 6.283; n.x = Math.cos(a) * 220; n.y = Math.sin(a) * 220; });
    // you
    if (me.name) {
      add({ id: 'm:' + myId, type: 'me', label: me.name + ' (you)', r: 11, memberId: myId, pct: window.avatarPortrait ? avatarPortrait.progress().pct : 0 });
      (me.interests || [me.track]).forEach(t => link('m:' + myId, 't:' + t, 'path', t === me.track ? 70 : 110));
    }
    // members
    members.forEach(m => {
      if (m.id === myId) return;
      add({ id: 'm:' + m.id, type: 'member', label: clean(m.name), r: 4.5 + Math.min(5, (m.pct || 0) / 12), memberId: m.id, mentor: !!m.open_to_mentor,
        sub: [m.role, m.years ? m.years + ' yrs' : '', m.city].filter(Boolean).join(' · '), avatar: m.avatar, pct: m.pct || 0 });
      const ts = new Set([m.track].concat(m.interests || []));
      ts.forEach(t => link('m:' + m.id, 't:' + t, 'path', t === m.track ? 70 : 120));
    });
    // connections between members
    conns.forEach(c => link('m:' + c.from_id, 'm:' + c.to_id, c.status === 'accepted' ? 'conn' : 'pending', 90));
    // women who went first: the ones in your portrait, plus the best-known few on every path
    const mine = new Map();
    (s.achievements || []).forEach(a => { if (a.womanId != null) mine.set(+a.womanId, a); });
    mine.forEach((a, wid) => {
      const t = JourneyLib.tile(wid); if (!t) return;
      add({ id: 'w:' + wid, type: 'woman', label: t.name, r: 4.5, tile: t, reason: a.reason, achievement: a.text, mine: true });
      if (me.name) link('m:' + myId, 'w:' + wid, 'made', 60);
      link('w:' + wid, 't:' + a.track, 'woman', 55);
    });
    tracks.forEach(tr => {
      const main = (JourneyLib.fieldsFor(tr) || [])[0];
      JourneyLib.candidates(tr).filter(t => t.memo && t.field === main).sort((a, b) => b.memo.length - a.memo.length).slice(0, 4).forEach(t => {
        add({ id: 'w:' + t.id, type: 'woman', label: t.name, r: 3.6, tile: t });
        link('w:' + t.id, 't:' + tr, 'woman', 50);
      });
    });
    alpha = 1;
    stats();
  }

  // ---------- physics ----------
  function step() {
    if (alpha < 0.004) return false;
    const n = nodes.length;
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]; let dx = b.x - a.x, dy = b.y - a.y, d2 = Math.max(dx * dx + dy * dy, 36);
        const hubs = a.type === 'track' && b.type === 'track';
        if (d2 > 160000 && !hubs) continue;
        const f = (hubs ? 9000 : a.type === 'track' || b.type === 'track' ? 1400 : 700) / d2, d = Math.sqrt(d2);
        dx /= d; dy /= d; a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
      }
    }
    for (const e of edges) {
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - e.len) * 0.012 * (e.kind === 'path' && e.len > 100 ? 0.4 : 1), fx = dx / d * f, fy = dy / d * f;
      e.a.vx += fx; e.a.vy += fy; e.b.vx -= fx; e.b.vy -= fy;
    }
    for (const p of nodes) {
      if (p === dragNode) { p.vx = p.vy = 0; continue; }
      p.vx -= p.x * 0.0025; p.vy -= p.y * 0.0025;
      p.vx *= 0.82; p.vy *= 0.82;
      const sp = Math.hypot(p.vx, p.vy); if (sp > 30) { p.vx *= 30 / sp; p.vy *= 30 / sp; }
      p.x += p.vx * alpha * 1.6; p.y += p.vy * alpha * 1.6;
    }
    alpha *= 0.992;
    return true;
  }

  // ---------- drawing ----------
  const visible = nd => nd.type === 'woman' ? filters.women : nd.type === 'member' ? filters.members : true;
  function color(nd) { return nd.type === 'me' ? C.me : nd.type === 'woman' ? C.woman : nd.type === 'track' ? C.track : C.member; }
  function matches(nd) { return search && nd.label.toLowerCase().includes(search); }

  function draw() {
    const W = cv.width, H = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(180,140,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(view.k * dpr, 0, 0, view.k * dpr, W / 2 + view.x * dpr, H / 2 + view.y * dpr);

    const focus = hover || selected;
    const near = focus ? (adj.get(focus.id) || new Set()) : null;
    const lit = nd => !focus || nd === focus || near.has(nd.id);
    const anySearch = !!search;

    // edges
    for (const e of edges) {
      if (!visible(e.a) || !visible(e.b)) continue;
      if (!filters.links && (e.kind === 'conn' || e.kind === 'pending')) continue;
      const on = focus && (e.a === focus || e.b === focus);
      ctx.globalAlpha = focus ? (on ? 1 : C.dim) : (anySearch ? 0.35 : 1);
      ctx.strokeStyle = on ? C.edgeHi : e.kind === 'conn' ? 'rgba(180,140,255,0.45)' : e.kind === 'made' ? 'rgba(255,138,107,0.35)' : C.edge;
      ctx.lineWidth = (on ? 1.6 : e.kind === 'conn' ? 1.4 : 0.8) / view.k;
      ctx.setLineDash(e.kind === 'pending' ? [4 / view.k, 4 / view.k] : []);
      ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y); ctx.stroke();
    }
    ctx.setLineDash([]);

    // nodes
    const t = performance.now() / 1000;
    for (const nd of nodes) {
      if (!visible(nd)) continue;
      const on = lit(nd), hit = matches(nd);
      ctx.globalAlpha = on ? (anySearch && !hit && !focus ? 0.25 : 1) : C.dim;
      let r = nd.r * (nd === hover ? 1.35 : 1);
      // glow for you, highlighted and search hits
      if (nd.type === 'me' || hit || nd === focus) {
        ctx.save(); ctx.globalAlpha *= 0.35 + 0.15 * Math.sin(t * 2);
        ctx.fillStyle = hit ? '#fff' : color(nd); ctx.beginPath(); ctx.arc(nd.x, nd.y, r * 2.2, 0, 6.283); ctx.fill(); ctx.restore();
      }
      // pictures appear when zoomed in
      const pic = view.k * r > 9 && (nd.type === 'woman' ? JourneyLib.thumb && nd.tile && (nd._thumb || (nd._thumb = JourneyLib.thumb(nd.tile, 96)))
        : nd.type === 'member' ? nd.avatar : nd.type === 'me' && window.avatarPortrait ? (nd._snap || (nd._snap = avatarPortrait.snapshot(160))) : null);
      const im = pic && img(pic);
      if (im && im.complete && im.naturalWidth) {
        ctx.save(); ctx.beginPath(); ctx.arc(nd.x, nd.y, r, 0, 6.283); ctx.clip(); ctx.drawImage(im, nd.x - r, nd.y - r, r * 2, r * 2); ctx.restore();
        ctx.strokeStyle = color(nd); ctx.lineWidth = 1.2 / view.k; ctx.beginPath(); ctx.arc(nd.x, nd.y, r, 0, 6.283); ctx.stroke();
      } else {
        ctx.fillStyle = color(nd); ctx.beginPath(); ctx.arc(nd.x, nd.y, r, 0, 6.283); ctx.fill();
      }
      if (nd.mentor) { ctx.strokeStyle = C.mentor; ctx.lineWidth = 1.5 / view.k; ctx.beginPath(); ctx.arc(nd.x, nd.y, r + 2.5 / view.k, 0, 6.283); ctx.stroke(); }
      if (nd.mine) { ctx.fillStyle = C.me; ctx.beginPath(); ctx.arc(nd.x + r * 0.8, nd.y - r * 0.8, 1.6, 0, 6.283); ctx.fill(); }
    }
    // labels (Obsidian: fade in with zoom; always for paths, you, focus, neighbors and search hits)
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const nd of nodes) {
      if (!visible(nd)) continue;
      const always = nd.type === 'track' || nd.type === 'me' || nd === focus || (focus && near.has(nd.id)) || matches(nd);
      const a = always ? 1 : Math.max(0, Math.min(1, (view.k - 1.1) / 0.6));
      if (a <= 0.02 || (focus && !lit(nd))) continue;
      ctx.globalAlpha = a;
      const fs = (nd.type === 'track' ? 11 : 10) / Math.max(0.7, Math.min(view.k, 2.2));
      ctx.font = `${nd.type === 'track' ? 600 : 500} ${fs}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = nd.type === 'track' ? C.track : C.text;
      const label = nd.type === 'track' ? nd.label.toUpperCase() : nd.label;
      ctx.fillText(label, nd.x, nd.y + nd.r + 4 / view.k);
    }
    ctx.globalAlpha = 1;
  }

  function loop() {
    step();
    draw();
    raf = requestAnimationFrame(loop);
  }

  // ---------- interaction ----------
  function toWorld(cx, cy) {
    const r = cv.getBoundingClientRect();
    return { x: (cx - r.left - r.width / 2 - view.x) / view.k, y: (cy - r.top - r.height / 2 - view.y) / view.k };
  }
  function nodeAt(cx, cy) {
    const p = toWorld(cx, cy); let best = null, bd = Infinity;
    for (const nd of nodes) {
      if (!visible(nd)) continue;
      const d = Math.hypot(nd.x - p.x, nd.y - p.y);
      if (d < Math.max(nd.r + 4 / view.k, 9 / view.k) && d < bd) { best = nd; bd = d; }
    }
    return best;
  }
  function zoomAt(cx, cy, f) {
    const r = cv.getBoundingClientRect(), k = Math.max(0.25, Math.min(6, view.k * f)); f = k / view.k;
    const px = cx - r.left - r.width / 2, py = cy - r.top - r.height / 2;
    view.x = px - (px - view.x) * f; view.y = py - (py - view.y) * f; view.k = k;
  }
  function bind() {
    cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k }; dragNode = null; panning = null; return; }
      const nd = nodeAt(e.clientX, e.clientY);
      if (nd) { dragNode = nd; dragNode._moved = false; alpha = Math.max(alpha, 0.3); }
      else panning = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    });
    cv.addEventListener('pointermove', e => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (pinch.k * d / pinch.d) / view.k); return;
      }
      if (dragNode) { const p = toWorld(e.clientX, e.clientY); dragNode.x = p.x; dragNode.y = p.y; dragNode._moved = true; alpha = Math.max(alpha, 0.25); return; }
      if (panning) { view.x = panning.vx + e.clientX - panning.x; view.y = panning.vy + e.clientY - panning.y; if (Math.abs(e.clientX - panning.x) + Math.abs(e.clientY - panning.y) > 4) panning.moved = true; return; }
      const nd = nodeAt(e.clientX, e.clientY); hover = nd; cv.style.cursor = nd ? 'pointer' : 'grab';
    });
    const up = e => {
      pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
      if (dragNode && !dragNode._moved) open(dragNode);
      else if (panning && !panning.moved) { selected = null; panel(null); }
      dragNode = null; panning = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { hover = null; });
  }

  function open(nd) {
    selected = nd;
    if ((nd.type === 'member') && window.Network && Network.openProfile) { panel(nd); return; }
    panel(nd);
  }

  function panel(nd) {
    const el = root.querySelector('.gv-panel');
    if (!nd) { el.hidden = true; return; }
    el.hidden = false;
    const near = [...(adj.get(nd.id) || [])].map(id => byId.get(id)).filter(Boolean);
    const women = near.filter(x => x.type === 'woman').length, members = near.filter(x => x.type === 'member' || x.type === 'me').length;
    let html = '';
    if (nd.type === 'woman') {
      const t = nd.tile;
      html = `<img class="gv-pic" src="${esc(t.image || JourneyLib.thumb(t, 160))}" onerror="this.src='${JourneyLib.thumb(t, 160)}'" alt="">
        <span class="gv-k">${nd.mine ? 'In your portrait' : 'Went first'}</span><h3>${esc(t.name)}</h3>
        <p class="gv-sub">${esc([t.field, t.year].filter(Boolean).join(' · '))}</p>
        ${nd.achievement ? `<p class="gv-q">You: “${esc(nd.achievement)}”</p>` : ''}
        <p>${esc(nd.reason || t.desc || '')}</p>
        ${t.link ? `<a href="${esc(t.link)}" target="_blank" rel="noopener">Her story ↗</a>` : ''}`;
    } else if (nd.type === 'member' || nd.type === 'me') {
      html = `${nd.avatar ? `<img class="gv-pic" src="${esc(nd.avatar)}" alt="">` : ''}
        <span class="gv-k">${nd.type === 'me' ? 'You' : nd.mentor ? '★ Open to mentoring' : 'Member'}</span><h3>${esc(nd.label)}</h3>
        <p class="gv-sub">${esc(nd.sub || '')}</p><p class="gv-sub">${nd.pct || 0}% made of her · ${members} connections in view</p>
        ${nd.type === 'member' ? `<button class="gv-btn" data-profile="${esc(nd.memberId)}">Open profile</button>` : ''}`;
    } else {
      html = `<span class="gv-k">Path</span><h3>${esc(nd.label)}</h3><p class="gv-sub">${members} members · ${women} women who went first</p>
        <button class="gv-btn ghost" data-solo="${esc(nd.id)}">Focus this path</button>`;
    }
    el.innerHTML = `<button class="gv-x" aria-label="Close">×</button>${html}`;
    el.querySelector('.gv-x').onclick = () => { selected = null; panel(null); };
    const pb = el.querySelector('[data-profile]');
    if (pb) pb.onclick = () => { const id = pb.dataset.profile; close(); setTimeout(() => Network.openProfile(id), 50); };
    const sb = el.querySelector('[data-solo]');
    if (sb) sb.onclick = () => { const n = byId.get(sb.dataset.solo); view.k = 1.8; view.x = -n.x * view.k; view.y = -n.y * view.k; };
  }

  function stats() {
    const w = nodes.filter(n => n.type === 'woman').length, m = nodes.filter(n => n.type === 'member' || n.type === 'me').length;
    const el = root && root.querySelector('.gv-stats');
    if (el) el.textContent = `${m} members · ${w} women who went first · ${edges.length} links`;
  }

  function resize() {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
  }

  // ---------- open / close ----------
  async function openGraph() {
    if (!root) {
      root = document.createElement('div'); root.className = 'gv'; root.hidden = true;
      root.innerHTML = `
        <canvas class="gv-canvas"></canvas>
        <div class="gv-top">
          <div class="gv-title"><span class="gv-dot"></span>Graph <span class="gv-stats"></span></div>
          <input class="gv-search" type="search" placeholder="Search women, members, paths…" aria-label="Search the graph">
          <div class="gv-toggles">
            <button class="gv-t on" data-f="women"><i style="background:${C.woman}"></i>Women who went first</button>
            <button class="gv-t on" data-f="members"><i style="background:${C.member}"></i>Members</button>
            <button class="gv-t on" data-f="links"><i style="background:${C.track}"></i>Connections</button>
          </div>
          <button class="gv-close" aria-label="Close graph">Close ✕</button>
        </div>
        <aside class="gv-panel" hidden></aside>
        <div class="gv-hint">Scroll or pinch to zoom · drag to move · tap a dot</div>`;
      document.body.appendChild(root);
      cv = root.querySelector('canvas'); ctx = cv.getContext('2d');
      bind();
      root.querySelector('.gv-close').onclick = close;
      root.querySelector('.gv-search').oninput = e => { search = e.target.value.trim().toLowerCase(); const hit = nodes.find(n => n.label.toLowerCase().includes(search)); if (search && hit) { hover = null; } };
      root.querySelectorAll('.gv-t').forEach(b => b.onclick = () => { filters[b.dataset.f] = !filters[b.dataset.f]; b.classList.toggle('on', filters[b.dataset.f]); });
      window.addEventListener('resize', resize);
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !root.hidden) close(); });
    }
    root.hidden = false; document.body.classList.add('gv-open');
    resize();
    view = { x: 0, y: 0, k: window.innerWidth < 640 ? 0.7 : 1 };
    await build();
    cancelAnimationFrame(raf); loop();
  }
  function close() { if (!root) return; root.hidden = true; document.body.classList.remove('gv-open'); cancelAnimationFrame(raf); }
  window.openGraph = openGraph;
  window.NetworkGraph = { open: openGraph, close };

  // Entry points: a "Graph" link in the nav and a button at the top of the Network page.
  function addEntry() {
    const nav = document.querySelector('#nav a[data-tab="network"]');
    if (nav && !document.querySelector('#nav .gv-navlink')) {
      const a = document.createElement('a'); a.href = '#graph'; a.className = 'gv-navlink'; a.textContent = 'Graph';
      a.onclick = e => { e.preventDefault(); openGraph(); };
      nav.insertAdjacentElement('afterend', a);
    }
    const page = document.getElementById('network');
    if (page && !page.querySelector('.gv-open-btn')) {
      const b = document.createElement('button'); b.className = 'gv-open-btn'; b.type = 'button';
      b.innerHTML = '<span class="gv-dot"></span> See your network as a graph';
      b.onclick = openGraph; page.prepend(b);
    }
  }
  if (location.hash === '#graph') setTimeout(openGraph, 300);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addEntry); else setTimeout(addEntry);
  let mo = 0;
  new MutationObserver(() => { if (!mo) mo = requestAnimationFrame(() => { mo = 0; addEntry(); }); }).observe(document.documentElement, { childList: true, subtree: true });
})();
