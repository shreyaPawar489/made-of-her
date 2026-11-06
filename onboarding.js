// onboarding.js (P3): first-visit flow. About you → Where you are → What you've done → Goal + interests → Photo → Community → reveal.
// Finish: JStore.setProfile → readExperience (P2) → seedPastAchievements (P1) → reveal portrait → showApp() + openCoach().
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STAGES = [['high_school', 'High school'], ['college', 'College'], ['early', 'Early career'], ['mid', 'Mid career'], ['senior', 'Senior / leader'], ['returning', 'Returning to work'], ['switching', 'Switching careers']];
  const TRACKS_FALLBACK = { law: 'Law', medicine: 'Medicine & health', cs: 'Computer science & tech', engineering: 'Engineering & design', science: 'Science & research', space: 'Space & astronomy', business: 'Business & entrepreneurship', policy: 'Policy & public service', media: 'Media & writing', arts: 'Arts & creative work', education: 'Education & teaching', sports: 'Sports & athletics' };
  const withTimeout = (p, ms, fallback) => Promise.race([Promise.resolve(p).catch(() => fallback), new Promise(r => setTimeout(() => r(fallback), ms))]);

  let step = 0, stream = null;
  const d = { name: '', age: '', city: '', stage: '', years: '', role: '', experienceText: '', linkedin: '', goal: '', interests: [], photo: '', shareInNetwork: true, openToMentor: false };

  function trackList() {
    const t = window.App && App.tracks && Object.keys(App.tracks).length ? App.tracks : null;
    return t ? Object.keys(t).map(k => [k, t[k].label || k]) : Object.entries(TRACKS_FALLBACK);
  }
  const isStudent = () => d.stage === 'high_school' || d.stage === 'college';

  const STEPS = [
    { // 0 About you
      html: () => `<h1>Every woman who went first is part of your story.</h1>
        <p class="lead">Join a network where your experience counts, your progress becomes your portrait, and other women help you get where you're going.</p>
        <label class="field"><span>Your first name</span><input class="input" id="f_name" value="${esc(d.name)}" autocomplete="given-name" placeholder="e.g. Ana"></label>
        <div class="row"><label class="field"><span>Age</span><input class="input" id="f_age" type="number" min="12" max="99" value="${esc(d.age)}" placeholder="17"></label>
        <label class="field"><span>City</span><input class="input" id="f_city" value="${esc(d.city)}" autocomplete="address-level2" placeholder="San Jose, CA"></label></div>`,
      read: () => { d.name = $('f_name').value.trim(); d.age = $('f_age').value; d.city = $('f_city').value.trim(); },
      ok: () => d.name.length > 0
    },
    { // 1 Where you are now
      html: () => `<h1>Where are you right now?</h1><p class="lead">No wrong answers. Your coach adapts to your stage.</p>
        <div class="field"><span>Stage</span><div class="chips" id="f_stage">${STAGES.map(([k, l]) => `<button type="button" class="chip${d.stage === k ? ' on' : ''}" data-v="${k}">${l}</button>`).join('')}</div></div>
        <div class="row"><label class="field"><span>Years of experience</span><input class="input" id="f_years" type="number" min="0" max="60" value="${esc(d.years)}" placeholder="0"></label>
        <label class="field"><span>Current role or school</span><input class="input" id="f_role" value="${esc(d.role)}" placeholder="${isStudent() ? 'Junior at Lincoln High' : 'Paralegal at …'}"></label></div>`,
      mount: () => single('f_stage', v => { d.stage = v; }),
      read: () => { d.years = $('f_years').value; d.role = $('f_role').value.trim(); },
      ok: () => !!d.stage
    },
    { // 2 What you've done
      html: () => `<h1>What have you already done?</h1>
        <p class="lead">Classes, clubs, jobs, projects, awards, caring for family. It all counts. Your past achievements fill your portrait from day one (up to 40%).</p>
        <div class="li-box${d.linkedin ? ' on' : ''}" id="liBox">
          <button type="button" class="li-btn" id="liToggle"><span class="li-logo">in</span>${d.linkedin ? 'LinkedIn connected' : 'Connect LinkedIn'}<small>${d.linkedin ? esc(d.linkedin.replace(/^https?:\/\/(www\.)?/, '')) : 'Optional · import your experience'}</small></button>
          <div class="li-panel" id="liPanel" hidden>
            <label class="field"><span>Your LinkedIn profile URL</span><input class="input" id="f_li" value="${esc(d.linkedin)}" placeholder="linkedin.com/in/your-name" inputmode="url" autocomplete="url"></label>
            <label class="field"><span>Paste your Experience section (optional)</span>
              <textarea class="input" id="f_liPaste" style="min-height:90px" placeholder="On LinkedIn: open your profile → Experience → select it all and copy. Paste it here."></textarea></label>
            <p class="hint" style="margin:-6px 0 10px">LinkedIn doesn't share work history with other apps, so you paste it. We only read what you paste, and members see your profile link once you connect.</p>
            <button type="button" class="btn small" id="liImport">Add to my experience</button> <span class="hint" id="liMsg"></span>
          </div>
        </div>
        <textarea class="input" id="f_exp" placeholder="${isStudent() ? 'Captain of debate team, volunteered at a legal aid clinic, AP Gov 5…' : 'Practiced civil rights law for 28 years, argued before the state supreme court, mentored 12 junior associates…'}">${esc(d.experienceText)}</textarea>
        <p class="hint">Only what you write here is used. We never invent achievements.</p>`,
      mount: mountLinkedIn,
      read: () => { d.experienceText = $('f_exp').value.trim(); const li = $('f_li'); if (li) d.linkedin = cleanLinkedIn(li.value); },
      ok: () => true
    },
    { // 3 Goal + interests
      html: () => `<h1>Where do you want to go?</h1>
        <label class="field"><span>Your goal, in a sentence</span><input class="input" id="f_goal" value="${esc(d.goal)}" placeholder="Become a civil rights lawyer"></label>
        <div class="field"><span>Interests (pick 1–3; the first is your main path)</span><div class="chips" id="f_int">${trackList().map(([k, l]) => `<button type="button" class="chip${d.interests.includes(k) ? ' on' : ''}" data-v="${k}">${esc(l)}</button>`).join('')}</div></div>`,
      mount: () => $('f_int').addEventListener('click', e => {
        const b = e.target.closest('.chip'); if (!b) return;
        const v = b.dataset.v, i = d.interests.indexOf(v);
        if (i >= 0) d.interests.splice(i, 1); else if (d.interests.length < 3) d.interests.push(v);
        b.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', d.interests.includes(c.dataset.v)));
        validate();
      }),
      read: () => { d.goal = $('f_goal').value.trim(); },
      ok: () => d.interests.length > 0
    },
    { // 4 Photo
      html: () => `<h1>Take your portrait</h1>
        <p class="lead">One photo. It becomes a mosaic that starts gray and fills with real women as you grow. It stays on this device; only the mosaic is shared.</p>
        <div class="cam" id="cam">${d.photo ? `<img alt="" src="${d.photo}">` : '<div class="ph">Your photo will appear here</div>'}</div>
        <div class="cam-actions">
          <button type="button" class="btn" id="camBtn">${d.photo ? 'Retake' : 'Use camera'}</button>
          <button type="button" class="btn ghost" id="upBtn">Upload a photo</button>
          <input type="file" id="upFile" accept="image/*" hidden>
        </div>`,
      mount: mountCamera,
      read: stopCamera,
      ok: () => !!d.photo
    },
    { // 5 Community
      html: () => `<h1>Find women on your path</h1><p class="lead">Mentors further ahead, peers at your stage.</p>
        <label class="toggle"><input type="checkbox" id="f_share" ${d.shareInNetwork ? 'checked' : ''}><span><b>Show me in the network</b><small>Others see your first name, city, path, stage and your mosaic (never your photo).</small></span></label>
        <label class="toggle"><input type="checkbox" id="f_mentor" ${d.openToMentor ? 'checked' : ''}><span><b>★ I'm open to mentoring</b><small>Women earlier on your path can ask you for a conversation.</small></span></label>`,
      read: () => { d.shareInNetwork = $('f_share').checked; d.openToMentor = $('f_mentor').checked; },
      ok: () => true,
      next: 'Build my portrait'
    }
  ];

  function single(id, set) {
    $(id).addEventListener('click', e => {
      const b = e.target.closest('.chip'); if (!b) return;
      set(b.dataset.v);
      b.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b));
      validate();
    });
  }

  // ---------- LinkedIn ----------
  // A profile link + a pasted Experience section. (LinkedIn's API only shares name/email/photo with apps, not work history.)
  function cleanLinkedIn(v) {
    v = String(v || '').trim(); if (!v) return '';
    const m = v.match(/linkedin\.com\/(in|pub)\/([A-Za-z0-9\-_%]+)/i);
    return m ? 'https://www.linkedin.com/in/' + m[2] : '';
  }
  // Turn a copied LinkedIn Experience section into short lines; drop UI noise and durations.
  function tidyLinkedInPaste(t) {
    const noise = /^(experience|show all.*|see more|…see more|logo|full-time|part-time|internship|self-employed|freelance|contract|on-site|remote|hybrid|skills:.*|\d+ (yrs?|mos?)( \d+ mos?)?|\S+ logo)$/i;
    const seen = new Set();
    return String(t || '').split(/\n+/).map(x => x.replace(/\s*·\s*(full-time|part-time|internship|self-employed|freelance|contract|\d+ (yrs?|mos?).*)$/i, '').trim())
      .filter(x => x && x.length > 2 && !noise.test(x) && !/^[A-Z][a-z]{2} \d{4}\s*[-–]/.test(x) && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()))
      .join('; ').slice(0, 1500);
  }
  function mountLinkedIn() {
    $('liToggle').onclick = () => { const p = $('liPanel'); p.hidden = !p.hidden; if (!p.hidden) $('f_li').focus(); };
    $('liImport').onclick = () => {
      const url = cleanLinkedIn($('f_li').value), raw = $('f_liPaste').value;
      if ($('f_li').value.trim() && !url) { $('liMsg').textContent = 'That doesn\'t look like a linkedin.com/in/… link.'; return; }
      d.linkedin = url;
      const lines = tidyLinkedInPaste(raw);
      if (lines) { const ex = $('f_exp'); ex.value = (ex.value.trim() ? ex.value.trim() + '\n' : '') + lines; d.experienceText = ex.value.trim(); }
      $('liPanel').hidden = true;
      $('liBox').classList.toggle('on', !!url);
      $('liToggle').innerHTML = '<span class="li-logo">in</span>' + (url ? 'LinkedIn connected' : 'Connect LinkedIn') + '<small>' + (lines ? 'Experience added below. Edit anything.' : esc(url.replace(/^https?:\/\/(www\.)?/, '') || 'Optional · import your experience')) + '</small>';
    };
  }

  // ---------- camera ----------
  function setPhotoFrom(src, w, h, mirror) {
    const S = 384, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), side = Math.min(w, h);
    const sx = (w - side) / 2, sy = Math.max(0, (h - side) * (h > w ? 0.2 : 0.5));
    if (mirror) { g.translate(S, 0); g.scale(-1, 1); }
    g.drawImage(src, sx, sy, side, side, 0, 0, S, S);
    d.photo = c.toDataURL('image/jpeg', 0.85);
    stopCamera();
    $('cam').innerHTML = `<img alt="" src="${d.photo}">`;
    $('camBtn').textContent = 'Retake';
    validate();
  }
  function stopCamera() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } }
  function mountCamera() {
    $('camBtn').onclick = async () => {
      if (stream) { // shutter
        const v = $('cam').querySelector('video');
        if (v && v.videoWidth) setPhotoFrom(v, v.videoWidth, v.videoHeight, true);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 960 } }, audio: false });
        $('cam').innerHTML = '<video class="mirror" playsinline muted autoplay></video>';
        const v = $('cam').querySelector('video'); v.srcObject = stream; await v.play().catch(() => {});
        $('camBtn').textContent = '📸 Take photo';
      } catch (e) {
        $('cam').innerHTML = '<div class="ph">Camera not available (' + esc(e.name || 'blocked') + '). Upload a photo instead.</div>';
      }
    };
    $('upBtn').onclick = () => $('upFile').click();
    $('upFile').onchange = () => {
      const f = $('upFile').files[0]; if (!f) return;
      const img = new Image();
      img.onload = () => { setPhotoFrom(img, img.naturalWidth, img.naturalHeight, false); URL.revokeObjectURL(img.src); };
      img.src = URL.createObjectURL(f);
    };
  }

  // ---------- render ----------
  function card(inner, dots) {
    $('onboarding').innerHTML = `<div class="ob"><div class="ob-brand">Made of <em>Her</em></div>
      ${dots ? `<div class="ob-dots">${STEPS.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>` : ''}
      <div class="ob-card ob-step">${inner}</div></div>`;
  }
  function render() {
    const S = STEPS[step];
    card(S.html() + `<div class="ob-nav">${step ? '<button type="button" class="btn link" id="obBack">← Back</button>' : '<span></span>'}
      <button type="button" class="btn" id="obNext">${S.next || 'Continue'}</button></div>`, true);
    S.mount && S.mount();
    $('obBack') && ($('obBack').onclick = () => { S.read && S.read(); step--; render(); });
    $('obNext').onclick = () => { S.read && S.read(); if (!S.ok()) return; if (step < STEPS.length - 1) { step++; render(); } else finish(); };
    $('onboarding').querySelectorAll('input, textarea').forEach(el => el.addEventListener('input', validate));
    $('onboarding').querySelectorAll('input:not([type=checkbox])').forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') $('obNext').click(); }));
    const first = $('onboarding').querySelector('input:not([type=checkbox]), textarea'); if (first && step < 4) first.focus();
    validate();
  }
  function validate() {
    const S = STEPS[step], b = $('obNext'); if (!b) return;
    try { S.read && step !== 4 && S.read(); } catch (e) { /* fields not mounted */ }
    b.disabled = !S.ok();
  }

  // ---------- finish ----------
  async function finish() {
    const profile = {
      name: d.name, age: d.age ? +d.age : null, city: d.city, coords: null,
      stage: d.stage, years: +d.years || 0, role: d.role,
      experienceText: d.experienceText, linkedin: d.linkedin || '', goal: d.goal, interests: d.interests.slice(), track: d.interests[0],
      openToMentor: d.openToMentor, shareInNetwork: d.shareInNetwork, photo: d.photo
    };
    card('<div class="reveal"><h1>Reading your experience…</h1><p class="lead">Finding the women who did what you did.</p><div class="spinner"></div></div>');
    JStore.setProfile(profile);

    let list = [];
    if (profile.experienceText && window.readExperience) list = await withTimeout(readExperience(JStore.get().profile), 12000, []);
    if (list && list.length && window.seedPastAchievements) await withTimeout(seedPastAchievements(list), 12000, null);

    const n = JStore.get().achievements.length;
    card(`<div class="reveal"><h1>Meet your portrait, ${esc(profile.name)}.</h1><canvas id="revealCv" width="360" height="360"></canvas>
      <div class="pct" id="revealPct">0%</div><div class="muted">made of her</div>
      <ul class="women" id="revealWomen"></ul>
      <p class="lead" style="margin-top:16px">${n ? 'Your experience already counts.' : 'It starts gray. Every real step you log adds a woman who went first.'}</p>
      <button type="button" class="btn coral" id="enterBtn">Enter Made of Her →</button></div>`);
    $('enterBtn').onclick = enter;

    if (!window.Portrait) return;
    const p = Portrait.create($('revealCv'), { photo: profile.photo });
    await p.ready;
    p.setAchievements(JStore.get().achievements);
    p.animateLatest(Math.max(1, n));
    const target = p.progress().pct, t0 = performance.now(), dur = 600 + n * 450;
    (function tick() {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const el = $('revealPct'); if (!el) return;
      el.textContent = Math.round(target * k) + '%';
      if (k < 1) requestAnimationFrame(tick);
    })();
    const L = window.JourneyLib, ach = JStore.get().achievements.filter(a => a.womanId != null).slice(0, 4);
    if (L && ach.length) $('revealWomen').innerHTML = ach.map(a => { const t = L.tile(a.womanId); return t ? `<li><b>${esc(t.name)}</b> <span class="muted">for “${esc(a.text)}”</span></li>` : ''; }).join('');
  }

  function enter() {
    window.showApp && showApp();
    window.Network && Network.upsertMe && Network.upsertMe();
    setTimeout(() => { window.openCoach && openCoach(); }, 400);
  }

  window.Onboarding = {
    start() {
      step = 0;
      $('nav').hidden = true; $('app').hidden = true; $('onboarding').hidden = false; document.body.classList.add('onboarding');
      (window.App && App.tracksReady ? App.tracksReady : Promise.resolve()).then(render);
    }
  };
})();
