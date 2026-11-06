// app.js (P3): app shell. Hash router (Home / Network / Me), profile card, Me page, showApp().
// Depends on JStore (store.js) and Portrait/JourneyLib (portrait.js). Calls to teammates' globals are guarded.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STAGES = { high_school: 'High school', college: 'College', early: 'Early career', mid: 'Mid career', senior: 'Senior', returning: 'Returning to work', switching: 'Switching careers' };
  const App = { esc, STAGES, tracks: null };
  // canvas#bigPortrait is auto-exposed as window.bigPortrait by the browser; portrait.js stores its instance there, so clear the element alias.
  if (window.bigPortrait instanceof Element) window.bigPortrait = null;
  if (window.avatarPortrait instanceof Element) window.avatarPortrait = null;
  window.App = App;

  // tracks.json labels (for "Law", "Medicine & health", …)
  App.tracksReady = fetch('data/tracks.json').then(r => r.json()).then(d => (App.tracks = d.tracks || {})).catch(() => (App.tracks = {}));
  App.trackLabel = id => (App.tracks && App.tracks[id] && App.tracks[id].label) || id || '';

  App.toast = function (msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
  };
  App.modal = function (html) {
    const root = $('modalRoot');
    root.innerHTML = '<div class="modal-bg"><div class="modal">' + html + '</div></div>';
    const bg = root.firstChild;
    bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) App.closeModal(); });
    return bg.querySelector('.modal');
  };
  App.closeModal = () => { $('modalRoot').innerHTML = ''; };

  function subline(p) {
    const bits = [];
    if (p.stage) bits.push(STAGES[p.stage] || p.stage);
    if (+p.years > 0) bits.push(p.years + (+p.years === 1 ? ' yr' : ' yrs'));
    return bits.join(' · ');
  }
  App.subline = subline;

  function progress() {
    const src = [window.avatarPortrait, window.bigPortrait].find(x => x && x.progress && x.progress().achievements);
    const p = src ? src.progress() : null;
    return p || { pct: 0, women: 0 };
  }
  App.progress = progress;

  // ---------- router ----------
  const PAGES = ['home', 'network', 'me'];
  function route() {
    if (!JStore.get().profile) return;
    const tab = PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
    PAGES.forEach(p => { $(p).hidden = p !== tab; });
    document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
    if (tab === 'me') { renderMe(); (window.JourneyLib ? JourneyLib.ready : Promise.resolve()).then(() => setTimeout(renderMe, 400)); }
    if (tab === 'network' && window.Network && Network.renderPage) Network.renderPage();
    window.scrollTo(0, 0);
    // canvases inside hidden pages have 0 size; redraw once visible
    setTimeout(() => { window.mountPortraits && mountPortraits(); window.bigPortrait && bigPortrait.redraw && bigPortrait.redraw(); });
  }
  window.addEventListener('hashchange', route);

  // ---------- profile card ----------
  function renderProfile() {
    const s = JStore.get(), p = s.profile; if (!p) return;
    const pr = progress();
    $('profileInfo').innerHTML =
      '<h2>' + esc(p.name) + '</h2>' +
      '<div class="sub">' + esc(p.role || App.trackLabel(p.track)) + '</div>' +
      '<div class="sub">' + esc(subline(p)) + (p.city ? ' · ' + esc(p.city) : '') + '</div>' +
      (p.openToMentor ? '<span class="mentor-tag">★ Open to mentoring</span>' : '') +
      '<div class="progress"><div class="bar"><i style="width:' + pr.pct + '%"></i></div>' +
      '<div class="lbl"><b>' + pr.pct + '%</b> made of her · ' + pr.women + ' women</div></div>' +
      (p.goal ? '<div class="goal"><span class="muted">Where I\'m going</span><br>' + esc(p.goal) + '</div>' : '');
    // nav avatar = portrait snapshot (kept fresh by portrait.js refreshMyAvatars)
    if (!$('navAvatar').firstChild) $('navAvatar').innerHTML = '<img alt="" data-my-avatar>';
    window.refreshMyAvatars && refreshMyAvatars();
  }
  App.renderProfile = renderProfile;

  // composer + feed fallbacks (achievements.js owns these when it exists)
  function renderComposerFallback() {
    if (window.renderAchievements) { renderAchievements(); return; }
    $('composer').innerHTML = '<div class="composer-fake"><button type="button" id="composerBtn">Log an achievement… what did you do today?</button></div>';
    $('composerBtn').onclick = () => window.openAchievementComposer ? openAchievementComposer({}) : App.toast('Achievements are loading…');
  }

  // ---------- Me page ----------
  function renderMe() {
    const s = JStore.get(), p = s.profile; if (!p) return;
    const pr = progress();
    $('meInfo').innerHTML = '<h2>' + esc(p.name) + '</h2><div class="muted">' + esc(p.role || '') + (p.role ? ' · ' : '') + esc(subline(p)) + '</div>' +
      '<div class="progress"><div class="bar"><i style="width:' + pr.pct + '%"></i></div><div class="lbl"><b>' + pr.pct + '%</b> made of her · ' + pr.women + ' women · ' + s.achievements.length + ' achievements</div></div>' +
      '<p class="hint">Every real step you log adds a real woman who did something similar. 20 achievements = 100%.</p>';
    const L = window.JourneyLib;
    const list = s.achievements.slice().reverse();
    $('meList').innerHTML = '<h3>What you\'re made of</h3>' + (list.length ? '<ul class="ach-list">' + list.map(a => {
      const t = L && L.tile && a.womanId != null ? L.tile(a.womanId) : null;
      return '<li>' + (t ? '<img alt="" src="' + L.thumb(t, 72) + '">' : '') + '<div><b>' + esc(a.text) + '</b>' +
        (t ? '<br><small class="muted">→ ' + esc(t.name) + (a.past ? ' · ★ from your experience' : '') + '</small>' : '') + '</div></li>';
    }).join('') + '</ul>' : '<p class="empty">Nothing yet. Log your first step and watch a woman appear in your portrait.</p>');
  }
  App.renderMe = renderMe;

  function showTile(e) {
    if (!window.bigPortrait || !bigPortrait.cellAt) return;
    const r = e.currentTarget.getBoundingClientRect();
    const hit = bigPortrait.cellAt(e.clientX - r.left, e.clientY - r.top);
    const box = $('meTile');
    if (!hit || !hit.tile) {
      box.hidden = false;
      box.innerHTML = '<p class="empty">This part of you is still gray. Log a step to fill it with a woman who went first.</p>';
      return;
    }
    const t = hit.tile, a = hit.achievement, L = window.JourneyLib;
    box.hidden = false;
    box.innerHTML = '<div class="tilecard"><img alt="" src="' + L.thumb(t, 176) + '"><div><h3>' + esc(t.name) + '</h3>' +
      '<div class="muted">' + esc(t.field || '') + (t.year ? ' · b. ' + esc(t.year) : '') + '</div>' +
      '<div>' + esc(t.desc || '') + '</div>' +
      (t.link ? '<a href="' + esc(t.link) + '" target="_blank" rel="noopener">Read her story ↗</a>' : '') + '</div></div>' +
      (a ? '<div class="why"><b>Here because you:</b> ' + esc(a.text) + (a.reason && a.womanId === t.id ? '<br>' + esc(a.reason) : '') + '</div>' : '');
    if (window.matchMedia('(max-width: 799px)').matches) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---------- show the app ----------
  App.shown = false;
  window.showApp = function () {
    $('onboarding').hidden = true; document.body.classList.remove('onboarding');
    $('nav').hidden = false; $('app').hidden = false;
    App.shown = true;
    renderComposerFallback();
    window.mountPortraits && mountPortraits();
    route();
    renderProfile();
    setTimeout(renderProfile, 600); // after portrait photo loads
    window.Network && Network.init && Network.init();
  };

  window.addEventListener('jstore', e => {
    if (!App.shown) return;
    if (e.detail.what === 'reset') { location.reload(); return; }
    setTimeout(() => { renderProfile(); if (!$('me').hidden) renderMe(); }, 50);
  });

  document.addEventListener('DOMContentLoaded', async () => {
    $('bigPortrait').addEventListener('click', showTile);
    $('avatar').addEventListener('click', () => { location.hash = '#me'; });
    try { await JStore.ready; } catch (e) { /* demo load failed */ }
    if (JStore.get().profile) showApp();
    else if (window.Onboarding) Onboarding.start();
  });
})();
