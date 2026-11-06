// coach.js — the personal agent's chat (#coachDock) + "Action plan" card (#steps) + experience reader.
// The plan only fills after she has actually talked with her agent about what she wants (no assumed steps).
// Owner: P2 (Emma). Contract: JOURNEY.md §3. Globals provided: openCoach(prefill), readExperience(profile).
// Needs: store.js (JStore), config.js (JCONFIG.apiBase). Optional: openAchievementComposer (P1). All calls to others are guarded.
// Model text is only ever rendered with textContent (never innerHTML).
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const SCRIPT_BASE = document.currentScript && document.currentScript.src ? new URL('.', document.currentScript.src).href : '';
  const API = () => (window.JCONFIG && window.JCONFIG.apiBase) || '';
  const store = () => window.JStore;

  // coach.css is loaded here so index.html doesn't have to remember it
  if (!document.querySelector('link[href$="coach.css"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = SCRIPT_BASE + 'coach.css'; document.head.appendChild(l);
  }

  // ---------- helpers ----------
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  async function post(path, body, ms) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(API() + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
      if (!r.ok) throw Object.assign(new Error('http ' + r.status), { status: r.status });
      return await r.json();
    } finally { clearTimeout(t); }
  }
  let tracksP = null;
  const loadTracks = () => tracksP || (tracksP = fetch(SCRIPT_BASE + 'data/tracks.json').then(r => r.json()).catch(() => null));

  // profile fields the model may see: never the photo, never coordinates
  function slimProfile(p) {
    if (!p) return {};
    const { name, age, city, stage, years, role, experienceText, goal, interests, track, openToMentor } = p;
    return { name, age, city, stage, years, role, experienceText, goal, interests, track, openToMentor };
  }

  // ---------- experience reader ----------
  // readExperience(profile, {pdf}) -> Promise<[{text, track, year}]>  (never rejects; [] on any problem or after 12 s, 30 s with a PDF)
  // pdf: optional base64 of her own LinkedIn "Save to PDF" export. The returned array carries .role = her current title from the PDF ("" if none).
  window.readExperience = async function (profile, opts) {
    try {
      const p = profile || (store() && store().get().profile) || {};
      const pdf = (opts && opts.pdf) || '';
      if (!pdf && (!p.experienceText || p.experienceText.trim().length < 15)) return [];
      const r = await post('/api/experience', { stage: p.stage, years: p.years, role: p.role, experienceText: p.experienceText || '', track: p.track, pdf: pdf || undefined }, pdf ? 30000 : 12000);
      const list = (r.achievements || []).filter(a => a && a.text).slice(0, 8).map(a => ({ text: a.text, track: a.track, year: a.year == null ? null : a.year }));
      list.role = typeof r.role === 'string' ? r.role : '';
      return list;
    } catch (e) { return []; }
  };

  // ---------- fallback steps (when /api/coach is unavailable) ----------
  async function fallbackSteps(profile, existing) {
    const T = await loadTracks();
    if (!T || !profile) return [];
    const group = (profile.years >= (T.experiencedFromYears || 8)) ? 'experienced' : (T.stageGroups[profile.stage] || 'early');
    const track = T.fallbackSteps[profile.track] ? profile.track : Object.keys(T.fallbackSteps)[0];
    const have = new Set((existing || []).map(s => s.text.toLowerCase()));
    return T.fallbackSteps[track][group].filter(s => !have.has(s.text.toLowerCase())).slice(0, 3).map(s => Object.assign({ track }, s));
  }
  async function addFallbackIfEmpty() {
    const st = store().get();
    if (st.steps.filter(s => s.status !== 'done').length >= 3) return;
    const f = await fallbackSteps(st.profile, st.steps);
    if (f.length) store().addSteps(f);
  }

  // ---------- Today's steps card (#steps) ----------
  function stepRow(s) {
    const row = el('label', 'cs-step' + (s.status === 'done' ? ' done' : ''));
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = s.status === 'done'; cb.disabled = s.status === 'done';
    cb.setAttribute('aria-label', 'Log "' + s.text + '" as an achievement');
    cb.onchange = () => {
      cb.checked = false; // stays unchecked until the achievement is actually logged (the store marks it done)
      if (typeof window.openAchievementComposer === 'function') window.openAchievementComposer({ text: s.text, stepId: s.id });
      else store().setStepStatus(s.id, 'done');
    };
    const body = el('span', 'cs-body');
    body.appendChild(el('span', 'cs-text', s.text));
    if (s.why) body.appendChild(el('span', 'cs-why', s.why));
    row.append(cb, body);
    if (s.effort && s.status !== 'done') row.appendChild(el('span', 'cs-effort', s.effort));
    return row;
  }
  let stepsBusy = false;
  function renderSteps() {
    const mount = $('steps'); if (!mount || !store()) return;
    const st = store().get(), talked = st.chat.some(m => m.role === 'user');
    // steps only count once she has talked them through with her agent
    const todo = talked ? st.steps.filter(s => s.status !== 'done') : [], done = st.steps.filter(s => s.status === 'done');
    const sig = JSON.stringify([todo.map(s => s.id + s.text), done.length, stepsBusy, !!st.profile, talked]);
    if (mount.dataset.sig === sig) return; mount.dataset.sig = sig;
    mount.textContent = '';
    const card = el('section', 'cs'); card.setAttribute('aria-label', 'Action plan');
    const head = el('div', 'cs-head'); head.appendChild(el('h3', 'cs-title', 'Action plan'));
    if (done.length) head.appendChild(el('span', 'cs-done-count', done.length + ' done'));
    card.appendChild(head);
    if (!st.profile) card.appendChild(el('p', 'cs-empty', 'Finish your profile first.'));
    else if (!todo.length) {
      card.appendChild(el('p', 'cs-empty', done.length && talked ? 'All caught up. Talk with your agent about what comes next.' : 'No plan yet. Tell your personal agent what you want to work on, and you\'ll build your next steps together.'));
      const b = el('button', 'cs-btn', stepsBusy ? 'Thinking…' : (talked ? 'Plan what\'s next' : 'Build my plan')); b.disabled = stepsBusy;
      b.onclick = () => window.openCoach('');
      card.appendChild(b);
    } else {
      const list = el('div', 'cs-list'); todo.slice(0, 5).forEach(s => list.appendChild(stepRow(s))); card.appendChild(list);
      const more = el('button', 'cs-link', 'Talk to your agent →'); more.onclick = () => window.openCoach(''); card.appendChild(more);
    }
    mount.appendChild(card);
  }

  // ---------- chat dock (#coachDock) ----------
  let open = false, sending = false, seen = 0, kickoffRunning = false, built = false;
  let dockEl, panelEl, listEl, inputEl, barEl, dotEl, chipsEl, sendEl;
  function buildDock() {
    dockEl = $('coachDock'); if (!dockEl || built) return;
    built = true; dockEl.textContent = ''; dockEl.classList.add('cd');
    barEl = el('button', 'cd-bar'); barEl.type = 'button'; barEl.setAttribute('aria-expanded', 'false');
    barEl.appendChild(el('span', 'cd-bar-icon', '✨')); barEl.appendChild(el('span', 'cd-bar-label', 'Your personal agent'));
    dotEl = el('span', 'cd-dot'); dotEl.hidden = true; barEl.appendChild(dotEl);
    barEl.onclick = () => setOpen(true);
    panelEl = el('div', 'cd-panel'); panelEl.hidden = true; panelEl.setAttribute('role', 'dialog'); panelEl.setAttribute('aria-label', 'Your personal agent');
    const head = el('div', 'cd-head'); head.appendChild(el('strong', 'cd-title', 'Your personal agent'));
    const x = el('button', 'cd-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.onclick = () => setOpen(false); head.appendChild(x);
    listEl = el('div', 'cd-list'); listEl.setAttribute('aria-live', 'polite');
    chipsEl = el('div', 'cd-chips');
    ['What should I do this week?', 'How do I find a mentor?', 'I just finished a step'].forEach(q => { const c = el('button', 'cd-chip', q); c.type = 'button'; c.onclick = () => send(q); chipsEl.appendChild(c); });
    const form = el('form', 'cd-form');
    inputEl = el('textarea', 'cd-input'); inputEl.rows = 1; inputEl.placeholder = 'Ask about your next step…'; inputEl.maxLength = 1000;
    inputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    inputEl.addEventListener('input', () => { inputEl.style.height = 'auto'; inputEl.style.height = Math.min(inputEl.scrollHeight, 96) + 'px'; });
    sendEl = el('button', 'cd-send', 'Send'); sendEl.type = 'submit';
    form.onsubmit = e => { e.preventDefault(); const t = inputEl.value.trim(); if (t) { inputEl.value = ''; inputEl.style.height = 'auto'; send(t); } };
    form.append(inputEl, sendEl);
    panelEl.append(head, listEl, chipsEl, form);
    dockEl.append(barEl, panelEl);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) setOpen(false); });
  }
  function setOpen(v) {
    buildDock(); if (!dockEl) return;
    open = v; panelEl.hidden = !v; barEl.hidden = v; barEl.setAttribute('aria-expanded', String(v));
    document.body.classList.toggle('coach-open', v);
    if (v) {
      seen = store().get().chat.length; dotEl.hidden = true;
      renderChat();
      const st = store().get();
      if (st.profile && !st.chat.length) kickoff();
      setTimeout(() => inputEl && inputEl.focus(), 50);
    }
  }
  function bubble(m, i) {
    const b = el('div', 'cd-msg ' + (m.role === 'user' ? 'me' : 'coach')); b.appendChild(el('div', 'cd-text', m.content));
    if (m.role === 'assistant' && m.suggest) {
      const l = el('button', 'cd-log', '＋ Log as achievement'); l.type = 'button'; l.title = m.suggest;
      l.onclick = () => {
        if (typeof window.openAchievementComposer === 'function') window.openAchievementComposer({ text: m.suggest });
        else if (store()) store().addAchievement({ text: m.suggest, track: (store().get().profile || {}).track });
      };
      b.appendChild(l);
    }
    return b;
  }
  function renderChat() {
    if (!built || !store()) return;
    const st = store().get(); listEl.textContent = '';
    if (!st.chat.length && !sending) listEl.appendChild(el('p', 'cd-hello', st.profile ? 'Hi! I\'m your personal agent. What do you want to work toward right now?' : 'Finish your profile and I can help.'));
    st.chat.forEach((m, i) => listEl.appendChild(bubble(m, i)));
    if (sending) { const t = el('div', 'cd-msg coach thinking'); t.appendChild(el('div', 'cd-text', 'Thinking…')); listEl.appendChild(t); }
    chipsEl.hidden = st.chat.length > 2 || sending || !st.profile;
    sendEl.disabled = sending;
    listEl.scrollTop = listEl.scrollHeight;
  }

  // ---------- talking to /api/coach ----------
  async function askCoach(isKickoff) {
    const st = store().get();
    return post('/api/coach', {
      profile: slimProfile(st.profile),
      achievements: st.achievements.slice(-20).map(a => ({ text: a.text, date: a.date, past: !!a.past })),
      steps: st.steps.slice(-15).map(s => ({ text: s.text, status: s.status })),
      messages: isKickoff ? [] : st.chat.slice(-12).map(m => ({ role: m.role, content: m.content })),
      kickoff: !!isKickoff
    }, 25000);
  }
  async function turn(isKickoff) {
    sending = true; stepsBusy = true; renderChat(); renderSteps();
    try {
      const r = await askCoach(isKickoff);
      store().pushChat({ role: 'assistant', content: r.reply, suggest: r.suggestAchievement || undefined });
      if (r.steps && r.steps.length) store().addSteps(r.steps.map(s => Object.assign({ status: 'todo' }, s)));
      // no assumed steps: the plan is built in conversation
    } catch (e) {
      const notSetUp = e && e.status === 501;
      store().pushChat({ role: 'assistant', content: isKickoff
        ? 'Hi! What do you want to work toward right now? Tell me in your own words and we\'ll plan the next steps together.'
        : (notSetUp ? "I can't reach my planning brain yet. Tell me more and I'll pick it up as soon as I'm back." : "I couldn't reach my planning brain just now. Please try again in a moment.") });
      // fallback steps only once she has said what she wants to work on
      if (!isKickoff && store().get().chat.some(m => m.role === 'user')) await addFallbackIfEmpty();
    } finally { sending = false; stepsBusy = false; renderChat(); renderSteps(); }
  }
  async function kickoff() { if (kickoffRunning) return; kickoffRunning = true; try { await turn(true); } finally { kickoffRunning = false; } }
  async function send(text) {
    if (sending || !store() || !store().get().profile) return;
    store().pushChat({ role: 'user', content: String(text).slice(0, 1000) });
    renderChat();
    await turn(false);
  }

  // ---------- public API ----------
  window.openCoach = function (prefill) {
    setOpen(true);
    if (prefill && inputEl) { inputEl.value = prefill; inputEl.focus(); inputEl.setSelectionRange(prefill.length, prefill.length); }
  };
  window.Coach = { renderSteps, renderChat };

  // ---------- wiring ----------
  let autoKick = false;
  function tick() {
    if (!store()) return;
    buildDock(); renderSteps();
    const st = store().get();
    if (built && !open) { // unread dot
      if (st.chat.length > seen && st.chat[st.chat.length - 1].role === 'assistant') dotEl.hidden = false;
    }
    // A member who arrives with a profile but no steps (demo persona, returning visit): prepare steps quietly.
    // (no silent kickoff: steps are never prepared before she has talked with her agent)
  }
  window.addEventListener('jstore', e => {
    if (!store()) return;
    if (e.detail && e.detail.what === 'reset') { seen = 0; autoKick = false; if ($('steps')) delete $('steps').dataset.sig; }
    renderSteps(); renderChat(); tick();
  });
  document.addEventListener('DOMContentLoaded', tick);
  setInterval(tick, 1500); // mounts (#steps, #coachDock) may appear later, after onboarding
  tick();
})();
