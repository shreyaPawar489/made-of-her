// nudges.js (P3): the personal agent. Watches the store + network and surfaces ONE next action at a time,
// each with a button that does it: answer a connection request, reach out to a mentor (note drafted for you),
// daily check-in (log what you did → portrait grows). Rules decide WHEN (fast, works offline); buttons call
// teammates' features: Network.accept/openConnect (P3), openAchievementComposer (P1), openCoach (P2).
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => new Date().toISOString().slice(0, 10);
  const KEY = 'moh.agent';
  let mem; try { mem = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { mem = {}; }
  mem.dismissed = mem.dismissed || {}; mem.seenReq = mem.seenReq || [];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* full */ } };
  const isDismissed = id => mem.dismissed[id] === today();
  const dismiss = id => { mem.dismissed[id] = today(); save(); render(); };
  const first = n => String(n || '').split(' ')[0];

  // what she has said to the coach that hints at a topic (career, unsure, next steps, a field)
  function chatTopic(s) {
    const said = (s.chat || []).filter(m => m.role === 'user').map(m => m.content).join(' ').toLowerCase();
    const t = window.App && App.trackLabel ? App.trackLabel(s.profile.track) : s.profile.track;
    if (/unsure|not sure|confus|don.?t know|which (major|path)|should i/.test(said)) return { why: 'You told me you\'re weighing your options', ask: 'how she decided on her path' };
    if (/intern|job|apply|application|resume/.test(said)) return { why: 'You mentioned applications', ask: 'what helped her land her first role' };
    if (/school|college|major|grad|law school|med school/.test(said)) return { why: 'You asked about school', ask: 'how she chose her school and what she\'d do differently' };
    return { why: 'You\'re working toward ' + (s.profile.goal ? '"' + s.profile.goal + '"' : t), ask: 'her first steps in ' + t.toLowerCase() };
  }

  function draftNote(m, s, topic) {
    const p = s.profile, name = first(Network.state().cleanName(m.name));
    const goal = p.goal ? p.goal.replace(/^i (want|hope|plan) to /i, '').replace(/\.$/, '') : '';
    const win = (s.achievements || []).filter(a => !a.past).slice(-1)[0];
    let note = `Hi ${name}, I'm ${p.name}` + (p.role ? `, ${p.role}` : '') + '. ';
    if (goal) note += `I want to ${goal.charAt(0).toLowerCase() + goal.slice(1)}. `;
    if (win) note += `I recently ${win.text.charAt(0).toLowerCase() + win.text.slice(1).replace(/\.$/, '')}. `;
    note += `Would you have 15 minutes to tell me about ${topic.ask}?`;
    return note.slice(0, 280);
  }

  // ---------- the rules (priority order) ----------
  function nudges() {
    const s = JStore.get(); if (!s.profile) return [];
    const out = [];
    const N = window.Network && Network.state ? Network.state() : null;

    // 1. someone wants to connect
    if (N) for (const { c, m } of N.requests) {
      const id = 'req:' + c.id; if (isDismissed(id)) continue;
      out.push({ id, kind: 'request', icon: '🤝',
        title: `${N.cleanName(m.name)} wants to connect`,
        body: (c.note ? `“${c.note}”` : N.sub(m)),
        actions: [['Accept', () => { Network.accept(c.id); dismiss(id); }, 'primary'], ['View profile', () => Network.openProfile(m.id)]] });
      break;
    }

    // 2. mentors recommended but none contacted
    if (N && N.loaded) {
      const { mentors } = Network.onYourPath();
      const fresh = mentors.filter(m => !N.reachedOut.has(m.id));
      const contacted = mentors.some(m => N.reachedOut.has(m.id));
      if (fresh.length && !contacted && !isDismissed('mentor')) {
        const m = fresh[0], topic = chatTopic(s);
        out.push({ id: 'mentor', kind: 'mentor', icon: '✉️',
          title: `Reach out to ${N.cleanName(m.name)}`,
          body: `${topic.why}. ${first(N.cleanName(m.name))} (${N.sub(m)}) mentors women on your path. I drafted a note you can edit.`,
          actions: [['Draft a note', () => Network.openConnect(m.id, draftNote(m, s, topic)), 'primary'], ['Not now', () => dismiss('mentor')]] });
      }
    }

    // 3. daily check-in: nothing logged today
    const loggedToday = (s.achievements || []).some(a => !a.past && a.date === today());
    if (!isDismissed('checkin')) {
      const back = mem.lastVisit && mem.lastVisit !== today();
      const todo = (s.chat || []).some(m => m.role === 'user') && (s.steps || []).find(x => x.status !== 'done');
      out.push({ id: 'checkin', kind: 'checkin', icon: '☀️',
        title: loggedToday ? `Nice work today, ${first(s.profile.name)}. Anything else to log?` : back ? `Welcome back, ${first(s.profile.name)}. What did you do since yesterday?` : `${first(s.profile.name)}, what did you get done today?`,
        body: 'Anything counts: a class, a conversation, an application. Each one adds a woman who went first to your portrait.' + (todo ? ` Your open step: “${todo.text}”.` : ''),
        input: true,
        actions: [['Log it', text => { if (window.openAchievementComposer) openAchievementComposer({ text: text || '', stepId: null }); }, 'primary'],
          ['Talk it through', () => window.openCoach && openCoach('')]] });
    }
    return out;
  }

  // ---------- render: one card on Home (top of the center column) ----------
  let idx = 0;
  function render() {
    const host = $('agent'); if (!host || !window.JStore) return;
    const list = nudges();
    if (!list.length) { host.hidden = true; return; }
    host.hidden = false;
    idx = Math.min(idx, list.length - 1);
    const n = list[idx];
    host.innerHTML = `<div class="agent-head"><span class="agent-k">Your personal agent</span>${list.length > 1 ? `<span class="agent-count">${idx + 1} of ${list.length} <button class="agent-next" type="button" aria-label="Next">›</button></span>` : ''}</div>
      <div class="agent-body agent-${n.kind}"><div class="agent-ic">${n.icon}</div><div class="agent-txt"><b>${esc(n.title)}</b><p>${esc(n.body)}</p>
      ${n.input ? '<input class="input agent-in" maxlength="200" placeholder="e.g. Signed up for the mock trial team">' : ''}
      <div class="agent-acts">${n.actions.map((a, i) => `<button type="button" class="btn small ${a[2] === 'primary' ? '' : 'ghost'}" data-a="${i}">${esc(a[0])}</button>`).join('')}</div></div></div>`;
    host.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { const inp = host.querySelector('.agent-in'); n.actions[+b.dataset.a][1](inp ? inp.value.trim() : ''); });
    const inp = host.querySelector('.agent-in');
    if (inp) inp.onkeydown = e => { if (e.key === 'Enter') host.querySelector('[data-a="0"]').click(); };
    const nx = host.querySelector('.agent-next'); if (nx) nx.onclick = () => { idx = (idx + 1) % list.length; render(); };
  }

  // ---------- pop-up when something NEW happens (new request) ----------
  function popNew() {
    if (!window.Network || !Network.state) return;
    const N = Network.state();
    for (const { c, m } of N.requests) {
      if (mem.seenReq.includes(c.id)) continue;
      mem.seenReq.push(c.id); save();
      const el = document.createElement('div'); el.className = 'agent-pop';
      el.innerHTML = `<span>🤝</span><div><b>${esc(N.cleanName(m.name))} wants to connect</b><small>Respond to her request</small></div><button class="btn small" type="button">Respond</button><button class="agent-x" type="button" aria-label="Close">×</button>`;
      el.querySelector('.btn').onclick = () => { el.remove(); location.hash = '#home'; idx = 0; render(); $('agent').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
      el.querySelector('.agent-x').onclick = () => el.remove();
      document.body.appendChild(el); setTimeout(() => el.remove(), 12000);
      break;
    }
  }

  function mount() {
    if ($('agent')) return true;
    const center = document.querySelector('#home .col-center'); if (!center) return false;
    const d = document.createElement('div'); d.id = 'agent'; d.className = 'card agent'; d.hidden = true;
    center.insertBefore(d, center.firstChild);
    return true;
  }
  function boot() {
    if (!mount()) return;
    render();
    window.addEventListener('jstore', () => setTimeout(render, 60));
    window.addEventListener('moh-network', () => { render(); popNew(); });
    // remember the visit AFTER deciding whether this is a "welcome back"
    setTimeout(() => { mem.lastVisit = today(); save(); }, 5000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.Agent = { render, nudges };
})();
