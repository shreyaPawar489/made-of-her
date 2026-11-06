// achievements.js — log an achievement → match a real woman → fill the portrait (owner: P1). See JOURNEY.md.
// Renders #composer and #feed. Provides openAchievementComposer({text, stepId}) and seedPastAchievements(list).
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const apiBase = () => (window.JCONFIG && JCONFIG.apiBase != null) ? JCONFIG.apiBase
    : (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'https://made-of-her-83ve.vercel.app' : '');
  const label = t => (JourneyLib.labels && JourneyLib.labels[t]) || t;
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const fmtDate = d => { try { return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return d; } };

  function modalRoot() {
    let r = $('#modalRoot');
    if (!r) { r = document.createElement('div'); r.id = 'modalRoot'; document.body.appendChild(r); }
    return r;
  }
  function openModal(html, cls = '') {
    const wrap = document.createElement('div');
    wrap.className = 'ach-modal-wrap';
    wrap.innerHTML = `<div class="ach-modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
    modalRoot().appendChild(wrap);
    return wrap;
  }

  // ---------- matching ----------
  // Prefer women from the track's main field (law -> Lawyer) and the best-documented ones (longer Wikipedia intro),
  // so matches read as "of course" rather than random.
  function candidatesFor(track, exclude) {
    const all = JourneyLib.candidates(track).filter(t => !exclude.has(t.id) && t.memo);
    const main = (JourneyLib.fieldsFor(track) || [])[0];
    const byFame = arr => arr.sort((a, b) => b.memo.length - a.memo.length);
    const primary = shuffle(byFame(all.filter(t => t.field === main)).slice(0, 30)).slice(0, 20);
    const other = shuffle(byFame(all.filter(t => t.field !== main)).slice(0, 20)).slice(0, 10);
    const out = primary.concat(other);
    return out.length ? out : shuffle(JourneyLib.candidates(track).filter(t => !exclude.has(t.id))).slice(0, 30);
  }
  // Fallback when /api/match is unavailable: her own first sentence from Wikipedia, cleaned up.
  function localReason(t) {
    let s = String(t.memo || '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    s = (s.match(/^.*?[a-z]{2}\.(\s|$)/) || [s])[0].trim();
    if (s.length > 180) s = s.slice(0, 177).replace(/\s+\S*$/, '') + '…';
    return s || `${t.name}: ${t.desc || t.field}.`;
  }

  // items: [{key, achievement, track}] -> Map key -> {womanId, reason}
  async function matchAll(items) {
    await JourneyLib.ready;
    const used = new Set(JStore.get().achievements.map(a => +a.womanId));
    const cands = {};
    for (const it of items) if (!cands[it.track]) cands[it.track] = candidatesFor(it.track, used);
    const out = new Map();
    try {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), items.length > 1 ? 14000 : 9000);
      const body = { items, candidates: {} };
      for (const t in cands) body.candidates[t] = cands[t].map(c => ({ id: c.id, name: c.name, desc: c.desc || c.field, memo: (c.memo || '').slice(0, 300) }));
      const r = await fetch(apiBase() + '/api/match', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
      clearTimeout(timer);
      if (r.ok) {
        const j = await r.json();
        for (const m of j.matches || []) if (JourneyLib.tile(m.id)) { out.set(String(m.key), { womanId: +m.id, reason: m.reason }); used.add(+m.id); }
      }
    } catch (e) { console.warn('match API unavailable, picking locally', e); }
    for (const it of items) {          // local fallback for anything the API didn't answer
      if (out.has(String(it.key))) continue;
      const c = (cands[it.track] || []).find(t => !used.has(t.id)) || JourneyLib.candidates(it.track)[0];
      used.add(c.id); out.set(String(it.key), { womanId: c.id, reason: localReason(c) });
    }
    return out;
  }

  async function animateAvatar(n) {
    if (window.mountPortraits) mountPortraits();
    for (const key of ['avatarPortrait', 'bigPortrait']) {
      const p = window[key]; if (!p) continue;
      await p.ready; p.setAchievements(JStore.get().achievements).animateLatest(n);
    }
  }

  // ---------- past achievements from experience (onboarding) ----------
  window.seedPastAchievements = async function (list) {
    list = (list || []).filter(a => a && a.text).slice(0, Portrait.MAX_PAST);
    if (!list.length) return [];
    const track0 = (JStore.get().profile || {}).track || 'law';
    const items = list.map((a, i) => ({ key: 'p' + i, achievement: a.text, track: JourneyLib.tracks[a.track] ? a.track : track0 }));
    const m = await matchAll(items);
    const added = JStore.addAchievements(items.map((it, i) => Object.assign({ text: list[i].text, track: it.track, past: true, year: list[i].year || null }, m.get(it.key))));
    await animateAvatar(added.length);
    return added;
  };

  // ---------- composer ----------
  window.openAchievementComposer = function ({ text = '', stepId = null } = {}) {
    const s = JStore.get();
    if (!s.profile) return;
    const todo = s.steps.filter(x => x.status !== 'done');
    const step = stepId && s.steps.find(x => x.id === stepId);
    const track = (step && step.track) || s.profile.track;
    const tracks = Object.keys(JourneyLib.tracks);
    const w = openModal(`
      <h2>Log an achievement</h2>
      <p class="ach-sub">Something real you did. It adds 80 tiles and a woman who went first.</p>
      <textarea id="achText" maxlength="200" rows="3" placeholder="e.g. Emailed a law professor about research">${esc(text)}</textarea>
      <div class="ach-row">
        <label>Step <select id="achStep"><option value="">None</option>${todo.map(x => `<option value="${x.id}" ${x.id === stepId ? 'selected' : ''}>${esc(x.text.slice(0, 60))}</option>`).join('')}</select></label>
        <label>Track <select id="achTrack">${tracks.map(t => `<option value="${t}" ${t === track ? 'selected' : ''}>${esc(label(t))}</option>`).join('')}</select></label>
      </div>
      <div class="ach-actions"><button class="ach-btn ghost" id="achCancel">Cancel</button><button class="ach-btn" id="achGo">Add to my portrait</button></div>`);
    const ta = $('#achText', w); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    $('#achStep', w).onchange = e => { const st = s.steps.find(x => x.id === e.target.value); if (st) { $('#achTrack', w).value = st.track || track; if (!ta.value.trim()) ta.value = st.text; } };
    $('#achCancel', w).onclick = () => w.remove();
    $('#achGo', w).onclick = async () => {
      const t = ta.value.trim(); if (!t) { ta.focus(); return; }
      const sid = $('#achStep', w).value || null, tr = $('#achTrack', w).value;
      const btn = $('#achGo', w); btn.disabled = true; btn.textContent = 'Finding the woman who went first…';
      const before = window.avatarPortrait ? avatarPortrait.progress().pct : 0;
      const m = (await matchAll([{ key: 'n', achievement: t, track: tr }])).get('n');
      const a = JStore.addAchievement(Object.assign({ text: t, track: tr, stepId: sid }, m));
      if (sid) JStore.setStepStatus(sid, 'done');
      w.remove();
      await animateAvatar(1);
      showMoment(a, before);
    };
  };

  // ---------- "Made of her" moment ----------
  function showMoment(a, before) {
    const t = JourneyLib.tile(a.womanId); if (!t) return;
    const s = JStore.get();
    const w = openModal(`
      <div class="moment-grid">
        <canvas class="moment-portrait"></canvas>
        <div class="moment-her">
          <p class="moment-eyebrow">You're now made of her too</p>
          <img class="moment-photo" alt="" src="${esc(t.image || JourneyLib.thumb(t, 160))}">
          <h2>${esc(t.name)}</h2>
          <p class="ach-sub">${esc([t.field, t.year].filter(Boolean).join(' · '))}</p>
          <p class="moment-reason">${esc(a.reason)}</p>
          ${t.link ? `<a href="${esc(t.link)}" target="_blank" rel="noopener">Read her story ↗</a>` : ''}
        </div>
      </div>
      <p class="moment-stats" id="momentStats"></p>
      <div class="ach-actions"><button class="ach-btn" id="momentGo">Keep going</button></div>`, 'moment');
    const img = $('.moment-photo', w); img.onerror = () => { img.onerror = null; img.src = JourneyLib.thumb(t, 160); };
    const p = Portrait.create($('.moment-portrait', w), { photo: s.profile.photo });
    p.ready.then(() => {
      p.setAchievements(s.achievements).animateLatest(1);
      const pr = p.progress();
      $('#momentStats', w).textContent = `+${Portrait.PER} tiles · you're now ${pr.pct}% made of her · ${pr.women} women`;
    });
    $('#momentGo', w).onclick = () => { p.destroy(); w.remove(); };
  }
  window.showAchievementMoment = showMoment;

  // ---------- composer box + feed ----------
  function initials(n) { return String(n || '?').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase(); }

  function renderComposer() {
    const el = $('#composer'), s = JStore.get(); if (!el || !s.profile) return;
    el.innerHTML = `<div class="ach-card ach-composer">
      <div class="ach-av">${esc(initials(s.profile.name))}</div>
      <button class="ach-fake-input" type="button">Log an achievement…</button>
    </div>`;
    $('.ach-fake-input', el).onclick = () => openAchievementComposer({});
  }

  function renderFeed() {
    const el = $('#feed'), s = JStore.get(); if (!el || !s.profile) return;
    const list = s.achievements.slice().reverse();
    if (!list.length) {
      el.innerHTML = `<div class="ach-card ach-empty"><h3>Your portrait is waiting</h3><p>Your first achievement adds your first ${Portrait.PER} tiles and a real woman who did it before you.</p><button class="ach-btn" type="button">Log your first achievement</button></div>`;
      $('button', el).onclick = () => openAchievementComposer({});
      return;
    }
    // A personal timeline, not a social feed: when, what you did, and the woman who did it first.
    const item = a => {
      const t = JourneyLib.tile(a.womanId);
      const when = a.past ? (a.year || 'Before') : fmtDate(a.date).replace(/, \d{4}$/, '');
      return `<li class="tl-item${a.past ? ' tl-past' : ''}">
        <div class="tl-when">${esc(when)}</div>
        <div class="tl-body">
          <p class="tl-text">${esc(a.text)}</p>
          ${t ? `<div class="tl-her">
            <img alt="" src="${JourneyLib.thumb(t, 112)}">
            <div><b>${esc(t.name)}</b>
              <p>${esc(a.reason || '')}</p>
              ${t.link ? `<a href="${esc(t.link)}" target="_blank" rel="noopener">Her story ↗</a>` : ''}</div>
          </div>` : ''}
        </div>
      </li>`;
    };
    const now = list.filter(a => !a.past), past = list.filter(a => a.past);
    el.innerHTML = `<section class="ach-card tl">
      <h3 class="tl-h">Your path <span>${list.length} steps · ${new Set(list.map(a => a.womanId)).size} women</span></h3>
      ${now.length ? `<ol class="tl-list">${now.map(item).join('')}</ol>` : ''}
      ${past.length ? `<h4 class="tl-sub">Before you joined</h4><ol class="tl-list">${past.map(item).join('')}</ol>` : ''}
    </section>`;
  }

  async function render() { await JourneyLib.ready; renderComposer(); renderFeed(); }
  window.renderAchievements = render;
  window.addEventListener('jstore', e => { if (['profile', 'achievements', 'reset'].includes(e.detail.what)) render(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else setTimeout(render);
})();
