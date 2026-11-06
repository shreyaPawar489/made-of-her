// network.js (P3): "Women on your path" (mentors + peers), Network tab, Connect with a note, accept requests.
// Supabase REST via JDB (config.js). Tables: members, connections (see db/schema.sql). Never sends the raw photo.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STAGE_LABEL = { middle_school: 'Middle school', high_school: 'High school', college: 'College', early: 'Early career', mid: 'Mid career', senior: 'Senior', returning: 'Returning', switching: 'Switching careers' };
  const GROUP = { middle_school: 'student', high_school: 'student', college: 'student', early: 'early', switching: 'early', returning: 'early', mid: 'experienced', senior: 'experienced' };
  const db = () => window.JDB && JDB.ready && JDB.ready();

  const COLS = 'select=id,name,city,track,interests,goal,stage,years,role,open_to_mentor,pct,women,avatar,is_sample';
  let meSaved = false, members = [], conns = [], msgs = [], msgsOn = null, pollT = null, upT = null, started = false, threadT = null;
  const SEEN_KEY = 'moh.seen.v2'; // per member id
  const seen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY)) || {}; } catch (e) { return {}; } };
  const markSeen = mid => { try { const s = seen(); s[mid] = new Date().toISOString(); localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch (e) { /* private mode */ } };
  // First-conversation prompts: the hard part of reaching out is knowing what to say.
  const PROMPTS = {
    mentor: ['What do you wish you knew at my stage?', 'What was the hardest step on your path, and what got you through it?', 'Could we do a 20-minute video chat sometime in the next two weeks?'],
    peer: ['What are you working on this month?', 'Want to swap one goal each and check in next Friday?', 'Any program, class or club you\'d recommend?']
  };

  const me = () => JStore.get();
  const myId = () => me().memberId;

  // ---------- upsert me ----------
  async function upsertMe() {
    const s = me(), p = s.profile;
    if (!p || !p.shareInNetwork || !db()) return null;
    // wait for the portrait to draw, or the snapshot is a black square
    if (window.avatarPortrait && avatarPortrait.ready) await Promise.race([avatarPortrait.ready, new Promise(r => setTimeout(r, 10000))]).catch(() => {});
    const pr = (window.App && App.progress) ? App.progress() : { pct: 0, women: 0 };
    let avatar = null;
    try {
      if (window.avatarPortrait && avatarPortrait.snapshot) {
        for (const px of [320, 256, 192, 128, 96]) { avatar = avatarPortrait.snapshot(px); if (!avatar || avatar.length < 39000) break; }
      }
    } catch (e) { /* not ready */ }
    const row = {
      id: s.memberId, name: (p.name || 'Member').slice(0, 60), city: (p.city || '').slice(0, 80) || null,
      track: p.track || (p.interests && p.interests[0]) || 'law', interests: p.interests || [],
      goal: (p.goal || '').slice(0, 300) || null, stage: p.stage || null, years: +p.years || 0,
      role: (p.role || '').slice(0, 120) || null, open_to_mentor: !!p.openToMentor,
      pct: pr.pct || 0, women: pr.women || 0, is_sample: false, updated_at: new Date().toISOString(),
      women_ids: [...new Set((s.achievements || []).map(a => +a.womanId).filter(n => n >= 0))].slice(0, 40)   // for 'Who you're made of' (P1 graph)
    };
    if (avatar && avatar.length < 40000) row.avatar = avatar;
    const r = await JDB.upsert('members', row); if (r) meSaved = true; return r;
  }
  function upsertSoon() { clearTimeout(upT); upT = setTimeout(upsertMe, 1500); }

  // ---------- load ----------
  async function load() {
    if (!db()) return;
    const id = myId();
    const [m, c] = await Promise.all([
      JDB.select('members', COLS + '&order=years.desc&limit=200'),
      JDB.select('connections', 'select=*&or=(from_id.eq.' + id + ',to_id.eq.' + id + ')&order=created_at.desc')
    ]);
    if (m) { const extra = members.filter(x => !m.some(y => y.id === x.id)); members = m.concat(extra).filter(x => x.id !== id); } // keep people found by search
    if (c) conns = c;
    await loadMessages();
    renderCard(); renderBadge();
    if ($('network') && !$('network').hidden) renderPage();
  }

  // Direct messages: any member can write to any member (connected or not). Table: messages(from_id, to_id, body), see db/messages.sql.
  async function loadMessages() {
    if (msgsOn === false) return;
    const id = myId();
    const r = await JDB.select('messages', 'select=*&or=(from_id.eq.' + id + ',to_id.eq.' + id + ')&order=created_at.asc&limit=1000');
    if (r) { msgs = r; msgsOn = true; } else if (msgsOn === null) msgsOn = false; // table not created yet
    if (msgsOn) { // make sure everyone I'm talking to is loaded (they may be outside my path or the first 200)
      const missing = [...new Set(msgs.map(x => x.from_id === id ? x.to_id : x.from_id))].filter(x => !memberById(x));
      if (missing.length) { const m = await JDB.select('members', COLS + '&id=in.(' + missing.join(',') + ')'); if (m) members = members.concat(m); }
    }
  }
  const thread = mid => msgs.filter(x => (x.from_id === mid && x.to_id === myId()) || (x.to_id === mid && x.from_id === myId()));
  function unread(mid) {
    const last = thread(mid).filter(x => x.from_id === mid).pop();
    return !!last && (!seen()[mid] || last.created_at > seen()[mid]);
  }
  function conversations() { // [{m, last}] newest first
    const by = new Map();
    msgs.forEach(x => { const o = x.from_id === myId() ? x.to_id : x.from_id; by.set(o, x); });
    return [...by.entries()].map(([id, last]) => ({ m: memberById(id), last })).filter(x => x.m).sort((a, b) => (a.last.created_at < b.last.created_at ? 1 : -1));
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
    if (!m.avatar && window.JourneyLib && JourneyLib.memberAvatar) { const u = JourneyLib.memberAvatar(m); if (u) return `<img alt="" src="${u}" title="${esc(cleanName(m.name))}'s mosaic">`; }
    return m.avatar ? `<img alt="" src="${esc(m.avatar)}">` : `<div class="ph" style="display:grid;place-items:center;font-weight:600;color:var(--plum)">${esc(cleanName(m.name).slice(0, 1))}</div>`;
  }
  function msgBtn(m, primary) {
    return `<button class="btn small ${primary ? '' : 'ghost'}" data-msg="${m.id}" aria-label="Message ${esc(cleanName(m.name))}">Message${unread(m.id) ? ' <span class="dot"></span>' : ''}</button>`;
  }
  function action(m) {
    const c = connWith(m.id);
    let main;
    if (!c) main = `<button class="btn small" data-connect="${m.id}">Connect</button>`;
    else if (c.status === 'accepted') return `<div class="acts">${msgBtn(m, true)}</div>`;
    else if (c.to_id === myId()) main = `<button class="btn small coral" data-accept="${c.id}">Accept</button>`;
    else return `<div class="acts">${msgBtn(m)}</div>`; // request sent: shown as a line under her name
    return `<div class="acts">${main}${msgBtn(m)}</div>`;
  }
  function person(m, extra) {
    const c = connWith(m.id), sent = c && c.status !== 'accepted' && c.to_id !== myId();
    return `<div class="person" data-member="${m.id}"><a href="#" class="who-pic" data-profile="${m.id}" aria-label="View ${esc(cleanName(m.name))}">${avatar(m)}</a><div class="who"><b><a href="#" class="who-link" data-profile="${m.id}">${esc(cleanName(m.name))}</a>${m.open_to_mentor ? ' <span class="star">★</span>' : ''}</b>
      <small class="sub">${esc(sub(m))}</small>${m.pct ? `<small>${m.pct}% made of her</small>` : ''}${sent ? '<small class="sent">Request sent</small>' : ''}${extra || ''}</div>${action(m)}</div>`;
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
    const n = conns.filter(c => c.to_id === myId() && c.status === 'pending').length + conversations().filter(x => unread(x.m.id)).length;
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
    if (!$('netSearch')) {
      el.innerHTML = `<div class="card net-search"><input id="netSearch" class="input" type="search" placeholder="Search women by name, role, city or path…" autocomplete="off" aria-label="Search the network"><div id="netResults"></div></div><div id="netBody"></div>`;
      const inp = $('netSearch'); inp.value = q;
      inp.addEventListener('input', () => { q = inp.value; clearTimeout(searchT); searchT = setTimeout(() => runSearch(q), 250); });
    }
    const section = (title, arr, empty, cls) => `<div class="card ${cls || ''}"><h3>${title}</h3>${arr.length ? arr.join('') : `<p class="empty">${empty}</p>`}</div>`;
    $('netBody').innerHTML = '<div class="net-grid">' +
      section('Requests' + (reqs.length ? ` <span class="badge">${reqs.length}</span>` : ''),
        reqs.map(c => { const m = memberById(c.from_id); return m ? person(m, c.note ? `<div class="note">“${esc(c.note)}”</div>` : '') : ''; }),
        'No requests right now.', 'full') +
      (msgsOn ? section('Messages', conversations().map(({ m, last }) => person(m, `<div class="note">${last.from_id === myId() ? 'You: ' : ''}${esc(last.body.replace(/https:\/\/meet\.jit\.si\/\S+/g, '📹 video chat link').slice(0, 80))}</div>`)),
        'No messages yet. You can message any woman here, connected or not.', 'full') : '') +
      (mentees.length ? section('Women you could mentor', mentees.slice(0, 8).map(m => person(m)), '') : '') +
      section('Mentors on your path', mentors.slice(0, 8).map(m => person(m)), 'No mentors on your path yet.') +
      section('Peers at your stage', peers.slice(0, 8).map(m => person(m)), 'No peers yet. Invite a friend!') +
      section('Your connections', mine.map(m => person(m)).concat(sent.map(m => person(m))), 'Connect with a mentor or peer to start.', 'full') +
      `<div class="card full how"><h3>How connecting works</h3><ol>
        <li><b>Ask.</b> Send a short note to a mentor further along or a peer at your stage.</li>
        <li><b>Talk.</b> Message any woman here, even before you connect, and set up a 20-minute video call. No phone numbers or emails needed.</li>
        <li><b>Grow together.</b> Log what you did after the chat. It adds a woman to both of your portraits.</li></ol>
        <p class="muted" style="margin:8px 0 0"><b>Coming next:</b> Circles of six women at the same stage who meet once a month, mentor office hours, and verified mentors.</p></div>` +
      '</div>';
    renderResults();
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
  // ---------- profile: full once connected, a short card before ----------
  async function openProfile(id) {
    let m = memberById(id);
    if (!m && db()) { const r = await JDB.select('members', COLS + '&id=eq.' + encodeURIComponent(id)); if (r && r[0]) { m = r[0]; members.push(m); } }
    if (!m) { App.toast('Could not load her profile. Try again.'); return; }
    const c = connWith(id), name = cleanName(m.name), first = name.split(' ')[0];
    const head = `<div class="prof-head">${avatar(m)}<div><h3>${esc(name)}${m.open_to_mentor ? ' <span class="star">★</span>' : ''}</h3>
      <div class="muted">${esc(sub(m))}</div>${m.open_to_mentor ? '<span class="mentor-tag">★ Open to mentoring</span>' : ''}</div></div>`;
    if (!c || c.status !== 'accepted') {
      App.modal(`<div class="prof">${head}
        <div class="prof-locked">🔒 ${esc(first)}'s goal, interests and portrait open once you're connected.</div>
        <div class="actions"><button class="btn link" data-close>Close</button>${action(m)}</div></div>`);
      return;
    }
    const label = t => (window.App && App.trackLabel(t)) || t;
    const tracks = [m.track].concat(m.interests || []).filter((t, i, a) => t && a.indexOf(t) === i);
    const since = c.created_at ? new Date(c.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const box = App.modal(`<div class="prof full">${head}
      <div class="progress"><div class="bar"><i style="width:${+m.pct || 0}%"></i></div>
        <div class="lbl"><b>${+m.pct || 0}%</b> made of her · ${+m.women || 0} women</div></div>
      ${m.goal ? `<div class="prof-sec"><span class="muted">Where she's going</span><p>${esc(m.goal)}</p></div>` : ''}
      ${tracks.length ? `<div class="prof-sec"><span class="muted">Paths she's on</span><div class="chips">${tracks.map(t => `<span class="pill">${esc(label(t))}</span>`).join(' ')}</div></div>` : ''}
      ${c.note ? `<div class="prof-sec"><span class="muted">${c.from_id === myId() ? 'Your note to her' : 'Her note to you'}</span><p class="note">“${esc(c.note)}”</p></div>` : ''}
      <p class="muted prof-since">✓ Connected${since ? ' · ' + since : ''}</p>
      <div class="actions"><button class="btn link" data-close>Close</button><button class="btn" data-msg="${m.id}">Message ${esc(first)}</button></div></div>`);
    box.classList.add('modal-prof');
    // older members saved a tiny 96px picture: don't blow it up past ~2x, or it turns to pixels
    const pic = box.querySelector('.prof-head img');
    if (pic) { const fit = () => { if (pic.naturalWidth && pic.naturalWidth < 200) pic.style.maxWidth = Math.max(160, pic.naturalWidth * 2) + 'px'; }; pic.complete ? fit() : pic.onload = fit; }
  }

  // ---------- search (anyone in the network; results are short cards) ----------
  let q = '', results = null, searchT = null, searchSeq = 0;
  const textMatch = (m, t) => [cleanName(m.name), m.role, m.city, m.track, (window.App && App.trackLabel(m.track)) || '', (m.interests || []).join(' ')]
    .join(' ').toLowerCase().includes(t);
  async function runSearch(term) {
    const seq = ++searchSeq, t = term.trim().toLowerCase();
    if (t.length < 2) { results = null; renderResults(); return; }
    results = members.filter(m => textMatch(m, t)); renderResults(); // instant local pass
    const safe = t.replace(/[^a-z0-9 '\-]/g, ' ').trim();
    if (!safe || !db()) return;
    const like = '*' + safe.replace(/ +/g, '*') + '*';
    const ors = ['name', 'role', 'city', 'track'].map(f => f + '.ilike.' + like).join(',');
    const r = await JDB.select('members', COLS + '&or=(' + encodeURIComponent(ors) + ')&limit=40');
    if (seq !== searchSeq || !r) return;
    r.forEach(x => { if (x.id !== myId() && !memberById(x.id)) members.push(x); });
    const ids = new Set(results.map(x => x.id));
    results = results.concat(r.filter(x => x.id !== myId() && !ids.has(x.id)).map(x => memberById(x.id) || x));
    renderResults();
  }
  function renderResults() {
    const el = $('netResults'); if (!el) return;
    if (!results) { el.innerHTML = ''; return; }
    el.innerHTML = results.length
      ? results.slice(0, 12).map(m => person(m)).join('') + `<p class="muted search-hint">Tap a name for her card. Full profiles open once you're connected.</p>`
      : `<p class="empty">No one matches “${esc(q)}” yet.</p>`;
  }

  // ---------- messages + video chat ----------
  async function openThread(mid) {
    let m = memberById(mid);
    if (!m && db()) { const r = await JDB.select('members', COLS + '&id=eq.' + encodeURIComponent(mid)); if (r && r[0]) { m = r[0]; members.push(m); } }
    if (!m) { App.toast('Could not load her profile. Try again.'); return; }
    if (msgsOn === null) await loadMessages();
    const c = connWith(mid), cid = mid;
    const first = cleanName(m.name).split(' ')[0];
    const isMentor = (+m.years || 0) >= (+(me().profile || {}).years || 0) + 5;
    const box = App.modal(`<div class="thread-head"><a href="#" data-profile="${m.id}">${avatar(m)}</a><div><h3 style="margin:0"><a href="#" class="who-link" data-profile="${m.id}">${esc(cleanName(m.name))}</a></h3><small class="muted">${esc(sub(m))}</small></div></div>
      <div class="thread" id="thList"></div>
      ${msgsOn === false ? '<p class="empty">Messaging isn\'t switched on yet (the messages table is missing). Connect requests still work.</p>' : `
      <div class="chips th-prompts">${PROMPTS[isMentor ? 'mentor' : 'peer'].map(q => `<button type="button" class="chip small" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <div class="th-form"><textarea class="input" id="thInput" maxlength="1000" placeholder="Write to ${esc(first)}…"></textarea></div>
      <div class="actions"><button class="btn ghost small" id="thCall" title="Creates a free video room link (Jitsi) and sends it">📹 Plan a video chat</button><span style="flex:1"></span><button class="btn link" data-close>Close</button><button class="btn" id="thSend">Send</button></div>`}`);
    box.classList.add('modal-thread');
    const draw = () => {
      const list = box.querySelector('#thList'); if (!list) return;
      const t = thread(cid);
      const head = c && c.note ? `<div class="msg ${c.from_id === myId() ? 'me' : 'them'}"><small>Request note</small>${esc(c.note)}</div>` : '';
      list.innerHTML = head + (t.length ? t.map(x => `<div class="msg ${x.from_id === myId() ? 'me' : 'them'}">${linkify(x.body)}<small>${fmtTime(x.created_at)}</small></div>`).join('')
        : `<p class="empty">${c && c.status === 'accepted' ? "You're connected." : "You don't need to be connected to write."} Say hi to ${esc(first)}, or pick a question below.</p>`);
      list.scrollTop = list.scrollHeight;
      markSeen(cid); renderBadge();
    };
    const send = async body => {
      body = String(body || '').trim().slice(0, 1000); if (!body) return;
      if (!(me().profile || {}).shareInNetwork) { App.toast('Turn on "Show me in the network" to send messages.'); return; }
      const b = box.querySelector('#thSend'); if (b) b.disabled = true;
      if (!meSaved) meSaved = !!(await upsertMe()); // she must exist in members to reply to me
      const r = await JDB.insert('messages', { from_id: myId(), to_id: mid, body });
      if (b) b.disabled = false;
      if (r && r[0]) { msgs.push(r[0]); const i = box.querySelector('#thInput'); if (i) i.value = ''; draw(); }
      else App.toast('Could not send. Try again.');
    };
    draw();
    if (msgsOn !== false) {
      box.querySelector('#thSend').onclick = () => send(box.querySelector('#thInput').value);
      box.querySelector('#thInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e.target.value); } });
      box.querySelectorAll('[data-q]').forEach(q => q.onclick = () => { const i = box.querySelector('#thInput'); i.value = q.dataset.q; i.focus(); });
      box.querySelector('#thCall').onclick = () => {
        const room = 'MadeOfHer-' + Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
        send(`Want to do a 20-minute video chat? Here's a room we can both open any time, no account needed: https://meet.jit.si/${room}\nWhat day works for you?`);
      };
      box.querySelector('#thInput').focus();
    }
    clearInterval(threadT);
    threadT = setInterval(async () => { if (!document.body.contains(box)) { clearInterval(threadT); renderCard(); if (!$('network').hidden) renderPage(); return; } await loadMessages(); draw(); }, 5000);
  }
  function linkify(t) { return esc(t).replace(/https:\/\/meet\.jit\.si\/[A-Za-z0-9-]+/g, u => `<a href="${u}" target="_blank" rel="noopener" class="call-link">📹 Join video chat</a>`).replace(/\n/g, '<br>'); }
  function fmtTime(ts) { try { return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }

  async function accept(cid) {
    const r = await JDB.update('connections', 'id=eq.' + cid, { status: 'accepted' });
    if (r) { const c = conns.find(x => String(x.id) === String(cid)); if (c) c.status = 'accepted'; const other = c && (c.from_id === myId() ? c.to_id : c.from_id); App.toast('Connected! Her full profile is open to you now.'); setTimeout(() => other && openProfile(other), 400); }
    renderCard(); renderBadge(); if (!$('network').hidden) renderPage();
  }
  document.addEventListener('click', e => {
    const c = e.target.closest('[data-connect]'); if (c) { e.preventDefault(); openConnect(c.dataset.connect); return; }
    const pf = e.target.closest('[data-profile]'); if (pf) { e.preventDefault(); openProfile(pf.dataset.profile); return; }
    const row = e.target.closest('.person[data-member]');
    if (row && !e.target.closest('button, a')) { openProfile(row.dataset.member); return; }
    const t = e.target.closest('[data-msg]'); if (t) { e.preventDefault(); openThread(t.dataset.msg); return; }
    const a = e.target.closest('[data-accept]'); if (a) { e.preventDefault(); a.disabled = true; accept(a.dataset.accept); }
  });

  // ---------- lifecycle ----------
  function init() {
    if (started) { load(); return; }
    started = true;
    upsertMe().then(load);
    if (window.JourneyLib && JourneyLib.ready) JourneyLib.ready.then(() => { renderCard(); if ($('network') && !$('network').hidden) renderPage(); });
    pollT = setInterval(load, 20000);
    setInterval(async () => { if (msgsOn && !document.hidden) { const n = msgs.length; await loadMessages(); if (msgs.length !== n) { renderBadge(); renderCard(); if (!$('network').hidden) renderPage(); } } }, 8000);
  }
  // sample members' mosaics finish drawing in the background
  let avT = null;
  window.addEventListener('moh-avatars', () => { clearTimeout(avT); avT = setTimeout(() => { renderCard(); if ($('network') && !$('network').hidden) renderPage(); }, 150); });
  window.addEventListener('jstore', e => {
    if (!started) return;
    if (e.detail.what === 'profile') { upsertSoon(); setTimeout(renderCard, 100); }
    if (e.detail.what === 'achievements') upsertSoon();
  });

  window.Network = { init, upsertMe, onYourPath, load, renderPage, renderCard, openThread, openProfile, search: runSearch };
  // app.js may have called showApp() before this file loaded
  if (window.App && App.shown) init();
})();
