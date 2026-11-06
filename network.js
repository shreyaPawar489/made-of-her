// network.js (P3): "Women on your path" (mentors + peers), Network tab, Connect with a note, accept requests.
// Supabase REST via JDB (config.js). Tables: members, connections (see db/schema.sql). Never sends the raw photo.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STAGE_LABEL = { middle_school: 'Middle school', high_school: 'High school', college: 'College', early: 'Early career', mid: 'Mid career', senior: 'Senior', returning: 'Returning', switching: 'Switching careers' };
  const GROUP = { middle_school: 'student', high_school: 'student', college: 'student', early: 'early', switching: 'early', returning: 'early', mid: 'experienced', senior: 'experienced' };
  const db = () => window.JDB && JDB.ready && JDB.ready();

  let members = [], conns = [], pollT = null, upT = null, started = false;

  const me = () => JStore.get();
  const myId = () => me().memberId;

  // ---------- upsert me ----------
  function upsertMe() {
    const s = me(), p = s.profile;
    if (!p || !p.shareInNetwork || !db()) return Promise.resolve(null);
    const pr = (window.App && App.progress) ? App.progress() : { pct: 0, women: 0 };
    let avatar = null;
    try { if (window.avatarPortrait && avatarPortrait.snapshot) avatar = avatarPortrait.snapshot(96); } catch (e) { /* not ready */ }
    const row = {
      id: s.memberId, name: (p.name || 'Member').slice(0, 60), city: (p.city || '').slice(0, 80) || null,
      track: p.track || (p.interests && p.interests[0]) || 'law', interests: p.interests || [],
      goal: (p.goal || '').slice(0, 300) || null, stage: p.stage || null, years: +p.years || 0,
      role: (p.role || '').slice(0, 120) || null, open_to_mentor: !!p.openToMentor,
      pct: pr.pct || 0, women: pr.women || 0, is_sample: false, updated_at: new Date().toISOString()
    };
    if (avatar && avatar.length < 40000) row.avatar = avatar;
    return JDB.upsert('members', row);
  }
  function upsertSoon() { clearTimeout(upT); upT = setTimeout(upsertMe, 1500); }

  // ---------- load ----------
  async function load() {
    if (!db()) return;
    const id = myId();
    const [m, c] = await Promise.all([
      JDB.select('members', 'select=id,name,city,track,interests,goal,stage,years,role,open_to_mentor,pct,women,avatar,is_sample&order=years.desc&limit=200'),
      JDB.select('connections', 'select=*&or=(from_id.eq.' + id + ',to_id.eq.' + id + ')&order=created_at.desc')
    ]);
    if (m) members = m.filter(x => x.id !== id);
    if (c) conns = c;
    renderCard(); renderBadge();
    if ($('network') && !$('network').hidden) renderPage();
  }

  // ---------- matching ----------
  function onYourPath() {
    const p = me().profile || {};
    const myTracks = new Set([p.track].concat(p.interests || []).filter(Boolean));
    const years = +p.years || 0, group = GROUP[p.stage] || 'student';
    const onTrack = x => myTracks.has(x.track) || (x.interests || []).some(i => myTracks.has(i));
    const score = x => (x.track === p.track ? 2 : 0) + (onTrack(x) ? 1 : 0) + (x.is_sample ? 0 : 0.5);
    const sorted = arr => arr.sort((a, b) => score(b) - score(a));
    let mentors = sorted(members.filter(x => x.open_to_mentor && (+x.years || 0) >= years + 5 && onTrack(x)));
    if (!mentors.length) mentors = sorted(members.filter(x => x.open_to_mentor && (+x.years || 0) >= years + 5));
    const peers = sorted(members.filter(x => (GROUP[x.stage] || 'student') === group && onTrack(x) && !mentors.includes(x)));
    const mentees = p.openToMentor && group === 'experienced'
      ? sorted(members.filter(x => (+x.years || 0) + 5 <= years && onTrack(x))) : [];
    return { mentors, peers, mentees };
  }

  function connWith(id) { return conns.find(c => c.from_id === id || c.to_id === id) || null; }
  function memberById(id) { return members.find(m => m.id === id) || null; }

  // ---------- rendering ----------
  function cleanName(n) { return String(n || '').replace(/\s*\(sample\)\s*$/i, ''); }
  function sub(m) {
    return [m.role, STAGE_LABEL[m.stage] || m.stage, (+m.years ? m.years + ' yrs exp' : ''), m.city].filter(Boolean).join(' · ');
  }
  function avatar(m) {
    return m.avatar ? `<img alt="" src="${esc(m.avatar)}">` : `<div class="ph" style="display:grid;place-items:center;font-weight:600;color:var(--plum)">${esc(cleanName(m.name).slice(0, 1))}</div>`;
  }
  function action(m) {
    const c = connWith(m.id);
    if (!c) return `<button class="btn small" data-connect="${m.id}">Connect</button>`;
    if (c.status === 'accepted') return '<span class="pill">Connected</span>';
    if (c.to_id === myId()) return `<button class="btn small coral" data-accept="${c.id}">Accept</button>`;
    return '<span class="pill">Pending</span>';
  }
  function person(m, extra) {
    return `<div class="person">${avatar(m)}<div class="who"><b>${esc(cleanName(m.name))}${m.open_to_mentor ? ' <span class="star">★</span>' : ''}</b>
      <small>${esc(sub(m))}</small>${m.pct ? `<small>${m.pct}% made of her</small>` : ''}${extra || ''}</div>${action(m)}</div>`;
  }

  function renderCard() {
    const el = $('onYourPath'); if (!el || !me().profile) return;
    if (!db()) { el.innerHTML = '<h3>Women on your path</h3><p class="empty">The network is offline right now.</p>'; return; }
    const { mentors, peers, mentees } = onYourPath();
    const list = (mentees.length ? mentees.slice(0, 2) : mentors.slice(0, 2)).concat(peers.slice(0, 2));
    el.innerHTML = `<h3>${mentees.length ? 'Women you could mentor' : 'Women on your path'}</h3>` +
      (list.length ? list.map(m => person(m)).join('') : '<p class="empty">No one on your path yet. You\'re the first!</p>') +
      '<a href="#network" style="font-size:13px;font-weight:600;text-decoration:none">See your network →</a>';
  }

  function renderBadge() {
    const n = conns.filter(c => c.to_id === myId() && c.status === 'pending').length;
    const b = $('netBadge'); if (!b) return;
    b.hidden = !n; b.textContent = n;
  }

  function renderPage() {
    const el = $('network'); if (!el || !me().profile) return;
    if (!db()) { el.innerHTML = '<div class="card"><p class="empty">The network is offline right now.</p></div>'; return; }
    const { mentors, peers, mentees } = onYourPath();
    const reqs = conns.filter(c => c.to_id === myId() && c.status === 'pending');
    const mine = conns.filter(c => c.status === 'accepted').map(c => memberById(c.from_id === myId() ? c.to_id : c.from_id)).filter(Boolean);
    const sent = conns.filter(c => c.from_id === myId() && c.status === 'pending').map(c => memberById(c.to_id)).filter(Boolean);
    const section = (title, arr, empty, cls) => `<div class="card ${cls || ''}"><h3>${title}</h3>${arr.length ? arr.join('') : `<p class="empty">${empty}</p>`}</div>`;
    el.innerHTML = '<div class="net-grid">' +
      section('Requests' + (reqs.length ? ` <span class="badge">${reqs.length}</span>` : ''),
        reqs.map(c => { const m = memberById(c.from_id); return m ? person(m, c.note ? `<div class="note">“${esc(c.note)}”</div>` : '') : ''; }),
        'No requests right now.', 'full') +
      (mentees.length ? section('Women you could mentor', mentees.slice(0, 8).map(m => person(m)), '') : '') +
      section('Mentors on your path', mentors.slice(0, 8).map(m => person(m)), 'No mentors on your path yet.') +
      section('Peers at your stage', peers.slice(0, 8).map(m => person(m)), 'No peers yet. Invite a friend!') +
      section('Your connections', mine.map(m => person(m)).concat(sent.map(m => person(m))), 'Connect with a mentor or peer to start.', 'full') +
      '</div>';
  }

  // ---------- connect / accept ----------
  function openConnect(id) {
    const m = memberById(id); if (!m) return;
    const p = me().profile || {};
    const first = cleanName(m.name).split(' ')[0];
    const dflt = (+m.years || 0) > (+p.years || 0) + 4
      ? `Hi ${first}, I'm ${p.name}${p.goal ? ' and I want to ' + p.goal.replace(/^i want to /i, '').replace(/\.$/, '').toLowerCase() : ''}. Would you be open to a 15-minute chat about your path?`
      : `Hi ${first}, I'm ${p.name}, also on the ${(window.App && App.trackLabel(p.track)) || p.track} path. Want to connect and cheer each other on?`;
    const box = App.modal(`<h3>Connect with ${esc(cleanName(m.name))}</h3><p class="muted" style="margin-top:0">${esc(sub(m))}</p>
      <label class="field"><span>Add a note</span><textarea class="input" id="cNote" maxlength="280" style="min-height:110px">${esc(dflt.slice(0, 280))}</textarea></label>
      <div class="actions"><button class="btn link" data-close>Cancel</button><button class="btn" id="cSend">Send request</button></div>`);
    box.querySelector('#cSend').onclick = async () => {
      const b = box.querySelector('#cSend'); b.disabled = true; b.textContent = 'Sending…';
      await upsertMe(); // make sure I exist (foreign key)
      const r = await JDB.insert('connections', { from_id: myId(), to_id: id, note: box.querySelector('#cNote').value.trim().slice(0, 280) || null });
      App.closeModal();
      if (r) { App.toast('Request sent to ' + first); conns.unshift(r[0] || { from_id: myId(), to_id: id, status: 'pending' }); }
      else App.toast(me().profile.shareInNetwork ? 'Could not send. Try again.' : 'Turn on "Show me in the network" to connect.');
      renderCard(); if (!$('network').hidden) renderPage();
    };
  }
  async function accept(cid) {
    const r = await JDB.update('connections', 'id=eq.' + cid, { status: 'accepted' });
    if (r) { const c = conns.find(x => String(x.id) === String(cid)); if (c) c.status = 'accepted'; App.toast('Connected!'); }
    renderCard(); renderBadge(); if (!$('network').hidden) renderPage();
  }
  document.addEventListener('click', e => {
    const c = e.target.closest('[data-connect]'); if (c) { e.preventDefault(); openConnect(c.dataset.connect); return; }
    const a = e.target.closest('[data-accept]'); if (a) { e.preventDefault(); a.disabled = true; accept(a.dataset.accept); }
  });

  // ---------- lifecycle ----------
  function init() {
    if (started) { load(); return; }
    started = true;
    upsertMe().then(load);
    pollT = setInterval(load, 20000);
  }
  window.addEventListener('jstore', e => {
    if (!started) return;
    if (e.detail.what === 'profile') { upsertSoon(); setTimeout(renderCard, 100); }
    if (e.detail.what === 'achievements') upsertSoon();
  });

  window.Network = { init, upsertMe, onYourPath, load, renderPage, renderCard };
  // app.js may have called showApp() before this file loaded
  if (window.App && App.shown) init();
})();
