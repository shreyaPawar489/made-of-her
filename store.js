// store.js — shared local state for Made of Her (owner: P1). Global JStore. See JOURNEY.md §3.
// Every write saves to localStorage and fires window event 'jstore' with {detail:{what}}.
(function () {
  'use strict';
  const KEY = 'moh.v1';
  const uid = p => p + '_' + Math.random().toString(36).slice(2, 8);
  const today = () => new Date().toISOString().slice(0, 10);
  const blank = () => ({
    memberId: (crypto.randomUUID ? crypto.randomUUID() : uid('m') + Date.now()),
    profile: null, steps: [], achievements: [], chat: []
  });

  let state;
  try { state = JSON.parse(localStorage.getItem(KEY)) || blank(); } catch (e) { state = blank(); }
  if (!state.memberId) state.memberId = blank().memberId;

  function save(what) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('JStore save failed', e); }
    window.dispatchEvent(new CustomEvent('jstore', { detail: { what } }));
  }

  const JStore = {
    get() { return JSON.parse(JSON.stringify(state)); },
    setProfile(p) { state.profile = Object.assign({ createdAt: new Date().toISOString() }, state.profile || {}, p); save('profile'); },
    addSteps(arr) {
      const have = new Set(state.steps.map(s => s.text.toLowerCase()));
      for (const s of arr || []) {
        if (!s || !s.text || have.has(s.text.toLowerCase())) continue;
        have.add(s.text.toLowerCase());
        state.steps.push(Object.assign({ id: uid('s'), status: 'todo', createdAt: new Date().toISOString() }, s));
      }
      save('steps');
    },
    setStepStatus(id, status) { const s = state.steps.find(x => x.id === id); if (s) { s.status = status; save('steps'); } },
    addAchievement(a) { const x = Object.assign({ id: uid('a'), date: today(), past: false, stepId: null }, a); state.achievements.push(x); save('achievements'); return x; },
    addAchievements(arr) {
      const out = (arr || []).map(a => Object.assign({ id: uid('a'), date: today(), past: false, stepId: null }, a));
      state.achievements.push(...out); save('achievements'); return out;
    },
    pushChat(m) { state.chat.push(m); if (state.chat.length > 30) state.chat = state.chat.slice(-30); save('chat'); },
    reset() { state = blank(); save('reset'); }
  };
  window.JStore = JStore;

  // ?reset=1 clears; ?demo=student|mentor loads a persona from data/demo.json (photo is asked for in onboarding).
  const q = new URLSearchParams(location.search);
  if (q.has('reset')) { localStorage.removeItem(KEY); state = blank(); }
  JStore.ready = (async () => {
    const demo = q.get('demo');
    if (!demo) return;
    try {
      const d = await (await fetch('data/demo.json')).json();
      const p = d[demo]; if (!p) return;
      const keepPhoto = state.profile && state.profile.photo;
      state = Object.assign(blank(), JSON.parse(JSON.stringify(p)), { memberId: p.memberId || state.memberId });
      if (keepPhoto && !state.profile.photo) state.profile.photo = keepPhoto;
      save('profile');
    } catch (e) { console.warn('demo load failed', e); }
  })();
})();
