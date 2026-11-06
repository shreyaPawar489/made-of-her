// app.js (P3): app shell. Hash router (Home / Network / Me), profile card, Me page, showApp().
// Depends on JStore (store.js) and Portrait/JourneyLib (portrait.js). Calls to teammates' globals are guarded.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STAGES = { middle_school: 'Middle school', high_school: 'High school', college: 'College', early: 'Early career', mid: 'Mid career', senior: 'Senior', returning: 'Returning to work', switching: 'Switching careers' };
  const App = { esc, STAGES, tracks: null };
  // canvas#bigPortrait is auto-exposed as window.bigPortrait by the browser; portrait.js stores its instance there, so clear the element alias.
  if (window.bigPortrait instanceof Element) window.bigPortrait = null;
  if (window.avatarPortrait instanceof Element) window.avatarPortrait = null;
  window.App = App;

  // tracks.json labels (for "Law", "Medicine & health", …)
  App.tracksReady = fetch('data/tracks.json').then(r => r.json()).then(d => (App.tracks = d.tracks || {})).catch(() => (App.tracks = {}));
  App.trackLabel = id => (App.tracks && App.tracks[id] && App.tracks[id].label) || id || '';

  // Real women's faces from the library, used as texture instead of gradients (profile banner, onboarding wall).
  App.facesReady = (window.JourneyLib ? JourneyLib.ready : Promise.reject()).then(() => {
    const L = JourneyLib, people = L.tiles.filter(t => t.kind === 'person');
    if (!people.length || !L.atlas) return;
    let seed = 7; const pick = () => people[(seed = (seed * 9301 + 49297) % 233280) % people.length];
    const sheet = (cols, rows, px) => {
      const c = document.createElement('canvas'); c.width = cols * px; c.height = rows * px;
      const g = c.getContext('2d');
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) L.drawTile(g, pick(), k * px, r * px, px, px);
      return c.toDataURL('image/jpeg', 0.8);
    };
    document.documentElement.style.setProperty('--faces-strip', 'url(' + sheet(16, 2, 32) + ')');
    document.documentElement.style.setProperty('--faces-wall', 'url(' + sheet(8, 10, 64) + ')');
    document.documentElement.classList.add('has-faces');
  }).catch(() => {});

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
    if (p.grade) bits.push(p.grade);
    else if (p.stage) bits.push(STAGES[p.stage] || p.stage);
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
      (/^https:\/\/www\.linkedin\.com\/in\//.test(p.linkedin || '') ? '<div><a class="li-link" href="' + esc(p.linkedin) + '" target="_blank" rel="noopener"><span class="li-logo">in</span> LinkedIn</a></div>' : '') +
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

  // Personal "why is she here" text for a tile (P2). Every tile belongs to one of your steps; the single best-matched
  // woman per step also has a model-written reason (a.reason). Everyone else gets an honest, personal explanation.
  function whyHtml(t, a) {
    const p = (window.JStore && JStore.get().profile) || {};
    const me = (p.name || '').split(/\s+/)[0] || 'You', her = (t.name || 'She').split(/\s+/)[0];
    const T = window.App && App.tracks && a.track && App.tracks[a.track];
    const trackLabel = (T && T.label) || a.track || 'your field';
    const field = (t.field || '').toLowerCase(), art = /^[aeiou]/.test(field) ? 'an' : 'a';
    const step = '<b>Your step:</b> “' + esc(a.text) + '”' + (a.past ? ' <span class="muted">(from your experience)</span>' : '');
    const center = a.womanId === t.id;                                   // the single best-matched woman for this step
    const real = center && a.reason && !String(a.reason).startsWith(t.name); // a bio like "Name (b. 1947): …" is not a reason
    const words = window.JourneyMatch ? JourneyMatch.explain(a.text, t) : [];
    const list = words.length > 1 ? words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1] : (words[0] || '');
    const asField = (field ? art + ' ' + esc(field) : 'a woman') + ' among the women in ' + esc(trackLabel) + ' who went before you';
    let why;
    if (real) why = esc(a.reason);
    else if (list) why = (center ? esc(her) + ' is the closest match we found for this step. ' : '') + 'Your step fits her story: her biography mentions <b>' + esc(list) + '</b>. She’s listed as ' + asField + '.';
    else why = (center ? esc(her) + ' is the closest match we found for this step. ' : esc(me) + ', ' + esc(her) + ' is part of your portrait for this step. ') + 'She’s listed as ' + asField + '.';
    const body = '<b>Why ' + esc(her) + ':</b> ' + why;
    return '<div class="why">' + step + '<br>' + body + '</div>';
  }

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
      (a ? whyHtml(t, a) : '');
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
