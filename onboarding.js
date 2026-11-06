// onboarding.js (P3): first-visit flow = the demo. Hook (living wall of real women) → You → Your story + goal → Photo → search + reveal → 3-stop app tour.
// Finish: JStore.setProfile → readExperience (P2) → seedPastAchievements (P1) → reveal portrait → showApp() + openCoach().
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STAGES = [['middle_school', 'Middle school'], ['high_school', 'High school'], ['college', 'College / university'], ['early', 'Early career'], ['mid', 'Mid career'], ['senior', 'Senior / leader'], ['returning', 'Returning to work'], ['switching', 'Switching careers']];
  // Plain-language definitions shown behind the (i) buttons.
  const STAGE_INFO = {
    middle_school: 'Grades 6–8. Exploring what you like. Clubs, projects and curiosity all count.',
    high_school: 'Grades 9–12. Classes, teams, jobs, volunteering and first internships.',
    college: 'Any college, university, community college, trade school or grad program.',
    early: 'Roughly your first 0–5 years of work, including internships and first jobs.',
    mid: 'About 5–15 years in. You know your field and may lead projects or people.',
    senior: 'Leading teams, organizations or a field. Often 15+ years in.',
    returning: 'Coming back after time away: caregiving, health, travel, anything. Your past experience still counts.',
    switching: 'Moving into a new field. Bring everything you learned in the old one.'
  };
  const GRADES = { middle_school: ['6th grade', '7th grade', '8th grade'], high_school: ['9th grade (freshman)', '10th grade (sophomore)', '11th grade (junior)', '12th grade (senior)'], college: ['1st year', '2nd year', '3rd year', '4th year or more', 'Graduate school'] };
  const info = (id, text) => `<button type="button" class="info" data-info="${id}" aria-label="What does this mean?" aria-expanded="false">i</button><div class="info-box" id="info_${id}" hidden>${text}</div>`;
  const TRACKS_FALLBACK = { law: 'Law', medicine: 'Medicine & health', cs: 'Computer science & tech', engineering: 'Engineering & design', science: 'Science & research', space: 'Space & astronomy', business: 'Business & entrepreneurship', policy: 'Policy & public service', media: 'Media & writing', arts: 'Arts & creative work', education: 'Education & teaching', sports: 'Sports & athletics' };
  const withTimeout = (p, ms, fallback) => Promise.race([Promise.resolve(p).catch(() => fallback), new Promise(r => setTimeout(() => r(fallback), ms))]);

  let step = 0, stream = null;
  const d = { name: '', age: '', city: '', stage: '', years: '', grade: '', role: '', experienceText: '', linkedin: '', goal: '', interests: [], photo: '', shareInNetwork: true, openToMentor: false };

  function trackList() {
    const t = window.App && App.tracks && Object.keys(App.tracks).length ? App.tracks : null;
    return t ? Object.keys(t).map(k => [k, t[k].label || k]) : Object.entries(TRACKS_FALLBACK);
  }
  const isStudent = () => d.stage === 'middle_school' || d.stage === 'high_school' || d.stage === 'college';

  function expField() {
    if (GRADES[d.stage]) {
      const label = d.stage === 'college' ? 'Year in school' : 'Grade';
      return `<label class="field"><span>${label}</span><select class="input" id="f_grade"><option value="">Choose…</option>${GRADES[d.stage].map(g => `<option${d.grade === g ? ' selected' : ''}>${g}</option>`).join('')}</select></label>`;
    }
    const what = d.stage === 'returning' ? 'Years of experience before your break' : d.stage === 'switching' ? 'Years of experience (any field)' : 'Years of experience';
    return `<label class="field"><span>${what} ${info('years', 'Count every year you spent building skills: jobs, internships, research, volunteering, running a business, caregiving. A rough number is fine. It helps us find mentors a few steps ahead of you and peers right beside you.')}</span><input class="input" id="f_years" type="number" min="0" max="60" value="${esc(d.years)}" placeholder="0"></label>`;
  }

  // Onboarding is the demo: a hook screen, three short screens (~60 s), the portrait reveal, then a 3-stop tour of the app.
  const STEPS = [
    { // 0 You + where you are
      html: () => `<h1>Hi. Who's joining?</h1>
        <div class="row"><label class="field"><span>First name</span><input class="input" id="f_name" value="${esc(d.name)}" autocomplete="given-name" placeholder="e.g. Ana"></label>
        <label class="field"><span>City <small class="muted">(optional)</small></span><input class="input" id="f_city" value="${esc(d.city)}" autocomplete="address-level2" placeholder="San Jose, CA"></label></div>
        <div class="field"><span>Where are you right now? ${info('stages', '<dl>' + STAGES.map(([k, l]) => `<dt>${l}</dt><dd>${STAGE_INFO[k]}</dd>`).join('') + '</dl>')}</span><div class="chips" id="f_stage">${STAGES.map(([k, l]) => `<button type="button" class="chip${d.stage === k ? ' on' : ''}" data-v="${k}" title="${esc(STAGE_INFO[k])}">${l}</button>`).join('')}</div></div>
        ${d.stage ? `<div class="row ob-reveal-row">${expField()}
        <label class="field"><span>${isStudent() ? 'School' : 'Current role'}</span><input class="input" id="f_role" value="${esc(d.role)}" placeholder="${isStudent() ? (d.stage === 'college' ? 'Pre-law at UC Berkeley' : 'Lincoln High School') : 'Paralegal at …'}"></label></div>` : ''}
        <p class="ob-why"><b>Why it matters:</b> middle schooler or CEO, your coach and your matches adapt to your stage.</p>`,
      mount: () => single('f_stage', v => { STEPS[0].read(); d.stage = v; render(true); }),
      read: () => {
        d.name = $('f_name').value.trim(); d.city = $('f_city').value.trim();
        const g = $('f_grade'), y = $('f_years'), r = $('f_role');
        if (g) { d.grade = g.value; d.years = '0'; }
        if (y) { d.years = y.value; d.grade = ''; }
        if (r) d.role = r.value.trim();
      },
      ok: () => d.name.length > 0 && !!d.stage
    },
    { // 1 Done + goal
      html: () => `<h1>Your story so far, and where it's going.</h1>
        <label class="field"><span>What have you already done?</span>
        <textarea class="input" id="f_exp" placeholder="${isStudent() ? 'Captain of debate team, volunteered at a legal aid clinic, AP Gov 5…' : 'Practiced civil rights law for 28 years, argued before the state supreme court, mentored 12 junior associates…'}">${esc(d.experienceText)}</textarea></label>
        <div class="li-box${d.linkedin ? ' on' : ''}" id="liBox">
          <button type="button" class="li-btn" id="liToggle"><span class="li-logo">in</span>${d.linkedin ? 'LinkedIn connected' : 'Import from LinkedIn'}<small>${d.linkedin ? esc(d.linkedin.replace(/^https?:\/\/(www\.)?/, '')) : 'Optional'}</small></button>
          <div class="li-panel" id="liPanel" hidden>
            <label class="field"><span>Your LinkedIn profile URL</span><input class="input" id="f_li" value="${esc(d.linkedin)}" placeholder="linkedin.com/in/your-name" inputmode="url" autocomplete="url"></label>
            <label class="field"><span>Paste your Experience section (optional)</span>
              <textarea class="input" id="f_liPaste" style="min-height:90px" placeholder="On LinkedIn: open your profile → Experience → select it all and copy. Paste it here."></textarea></label>
            <p class="hint" style="margin:-6px 0 10px">LinkedIn doesn't share work history with other apps, so you paste it. We only read what you paste.</p>
            <button type="button" class="btn small" id="liImport">Add to my experience</button> <span class="hint" id="liMsg"></span>
          </div>
        </div>
        <label class="field"><span>Where do you want to go?</span><input class="input" id="f_goal" value="${esc(d.goal)}" maxlength="300" placeholder="e.g. Become a civil rights lawyer, or launch my own startup"></label>
        <details class="ob-more"${d.interests.length ? ' open' : ''}><summary>Pick your fields yourself (optional)</summary>
          <div class="chips" id="f_int">${trackList().map(([k, l]) => `<button type="button" class="chip small${d.interests.includes(k) ? ' on' : ''}" data-v="${k}">${esc(l)}</button>`).join('')}</div></details>
        <p class="ob-why"><b>Your experience counts from day one.</b> Claude reads only what you write, never invents anything, and each real thing you've done adds a woman who did it first (up to 40% of your portrait).</p>`,
      mount: () => {
        mountLinkedIn();
        $('f_int').addEventListener('click', e => {
          const b = e.target.closest('.chip'); if (!b) return;
          const v = b.dataset.v, i = d.interests.indexOf(v);
          if (i >= 0) d.interests.splice(i, 1); else if (d.interests.length < 3) d.interests.push(v);
          b.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', d.interests.includes(c.dataset.v)));
          validate();
        });
      },
      read: () => { d.experienceText = $('f_exp').value.trim(); d.goal = $('f_goal').value.trim(); const li = $('f_li'); if (li) d.linkedin = cleanLinkedIn(li.value); },
      ok: () => d.goal.length >= 3 || d.interests.length > 0
    },
    { // 2 Photo + community
      html: () => `<h1>Last thing: your portrait.</h1>
        <p class="lead">One photo. It becomes a mosaic of real women that fills in as you grow. The photo stays on this device; only the mosaic is shared.</p>
        <div class="cam" id="cam">${d.photo ? `<img alt="" src="${d.photo}">` : '<div class="ph">Your photo will appear here</div>'}</div>
        <div class="cam-actions">
          <button type="button" class="btn" id="camBtn">${d.photo ? 'Retake' : 'Use camera'}</button>
          <button type="button" class="btn ghost" id="upBtn">Upload a photo</button>
          <input type="file" id="upFile" accept="image/*" hidden>
        </div>
        <div class="ob-toggles">
          <label class="toggle"><input type="checkbox" id="f_share" ${d.shareInNetwork ? 'checked' : ''}><span><b>Meet women on my path</b><small>Mentors ahead of you and peers beside you see your first name, path and mosaic (never your photo).</small></span></label>
          <label class="toggle"><input type="checkbox" id="f_mentor" ${d.openToMentor ? 'checked' : ''}><span><b>★ I'm open to mentoring</b><small>Women earlier on your path can ask you for a conversation.</small></span></label>
        </div>`,
      mount: mountCamera,
      read: () => { const s = $('f_share'), m = $('f_mentor'); if (s) d.shareInNetwork = s.checked; if (m) d.openToMentor = m.checked; },
      leave: stopCamera,
      ok: () => !!d.photo,
      next: 'Build my portrait →'
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
  function card(inner, dots, cls, still) {
    $('onboarding').className = cls || '';
    $('onboarding').innerHTML = `<aside class="ob-wall" aria-hidden="true"><p>2,056 women who went first.<br><span>And the ones you'll meet here.</span></p></aside><div class="ob"><div class="ob-brand">Made of <em>Her</em></div>
      ${dots ? `<div class="ob-dots" aria-label="Step ${step + 1} of ${STEPS.length}">${STEPS.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}<span>${step + 1} of ${STEPS.length}</span></div>` : ''}
      <div class="ob-card${still ? '' : ' ob-step'}">${inner}</div></div>`;
  }
  // quiet = re-render the same screen (stage chip picked): no slide-in animation, keep focus where it was
  function render(quiet) {
    const S = STEPS[step];
    card(S.html() + `<div class="ob-nav"><button type="button" class="btn link" id="obBack">← Back</button>
      <button type="button" class="btn" id="obNext">${S.next || 'Continue'}</button></div>`, true, '', quiet);
    S.mount && S.mount();
    $('obBack').onclick = () => { S.read && S.read(); S.leave && S.leave(); if (step === 0) intro(); else { step--; render(); } };
    $('obNext').onclick = () => { S.read && S.read(); if (!S.ok()) return; S.leave && S.leave(); if (step < STEPS.length - 1) { step++; render(); } else finish(); };
    $('onboarding').querySelectorAll('input, textarea, select').forEach(el => el.addEventListener('input', validate));
    $('onboarding').querySelectorAll('input:not([type=checkbox])').forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') $('obNext').click(); }));
    const first = quiet ? ($('f_grade') || $('f_years')) : $('onboarding').querySelector('input:not([type=checkbox]), textarea');
    if (first && step < 2) first.focus({ preventScroll: true });
    validate();
  }
  function validate() {
    const S = STEPS[step], b = $('obNext'); if (!b) return;
    try { S.read && S.read(); } catch (e) { /* fields not mounted */ }
    b.disabled = !S.ok();
  }

  // ---------- hook screen: a living wall of real women. Hover/tap any face to see who she is. ----------
  function intro() {
    stopCamera();
    card(`<div class="hook">
        <div class="hook-wall"><canvas id="hookCv" aria-label="A mosaic of real women from the library"></canvas><div class="hook-name" id="hookName"></div></div>
        <h1>Every pixel is a real woman who went first.</h1>
        <p class="lead">Made of Her turns your photo into a mosaic of 2,056 real women from Wikipedia: scientists, lawyers, astronauts, founders. No AI-generated faces. Each step you take adds one more.</p>
        <ul class="hook-points">
          <li><b>Your experience counts</b><span>Day one, not someday.</span></li>
          <li><b>A Claude coach</b><span>Concrete next steps.</span></li>
          <li><b>Women on your path</b><span>Mentors a few steps ahead.</span></li>
        </ul>
        <button type="button" class="btn coral big" id="hookGo">Build my portrait · 60 sec</button>
        <a class="hook-alt" href="?demo=mentor">Just looking? Open a 28-year attorney's profile →</a>
      </div>`, false, 'is-hook');
    $('hookGo').onclick = () => { step = 0; render(); };
    mountHook();
  }
  function mountHook() {
    const cv = $('hookCv'), L = window.JourneyLib; if (!cv || !L) return;
    const COLS = 12, ROWS = 5, g = cv.getContext('2d');
    let people = [], grid = [], fade = [], hover = -1, spot = -1, lastSwap = 0, lastSpot = 0;
    const touch = window.matchMedia('(hover: none)').matches;
    const label = (i, auto) => {
      const t = grid[i], el = $('hookName'); if (!el || !t) return;
      el.innerHTML = `<b>${esc(t.name)}</b>${t.field ? ' · ' + esc(t.field) : ''}${t.year ? ' · ' + esc(t.year) : ''}${auto ? `<small>${touch ? 'Tap' : 'Hover'} any face</small>` : ''}`;
    };
    L.ready.then(() => {
      people = L.tiles.filter(t => L.isReal(t));
      if (!people.length) return;
      grid = Array.from({ length: COLS * ROWS }, () => people[Math.random() * people.length | 0]);
      fade = new Float32Array(COLS * ROWS).fill(1);
      requestAnimationFrame(loop);
    }).catch(() => {});
    function cellAt(e) {
      const r = cv.getBoundingClientRect();
      const c = Math.floor((e.clientX - r.left) / r.width * COLS), w = Math.floor((e.clientY - r.top) / r.height * ROWS);
      return c >= 0 && w >= 0 && c < COLS && w < ROWS ? w * COLS + c : -1;
    }
    cv.addEventListener('pointermove', e => { hover = cellAt(e); if (hover >= 0) label(hover); });
    cv.addEventListener('pointerdown', e => { hover = cellAt(e); if (hover >= 0) label(hover); });
    cv.addEventListener('pointerleave', () => { hover = -1; });
    function loop(t) {
      if (!document.body.contains(cv)) return;
      requestAnimationFrame(loop);
      const dpr = Math.min(window.devicePixelRatio || 1, 2), W = Math.round(cv.clientWidth * dpr), H = Math.round(W * ROWS / COLS);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      if (t - lastSwap > 140) { // a new woman fades in somewhere, like the mosaic filling in
        lastSwap = t; const i = Math.random() * grid.length | 0;
        if (i !== hover && i !== spot) { grid[i] = people[Math.random() * people.length | 0]; fade[i] = 0; }
      }
      if (hover < 0 && t - lastSpot > 1800) { lastSpot = t; spot = Math.random() * grid.length | 0; label(spot, true); }
      const cw = W / COLS, ch = H / ROWS;
      g.fillStyle = '#2b2229'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < grid.length; i++) {
        fade[i] = Math.min(1, fade[i] + 0.06);
        g.globalAlpha = fade[i];
        L.drawTile(g, grid[i], (i % COLS) * cw, ((i / COLS) | 0) * ch, cw + 0.5, ch + 0.5);
      }
      g.globalAlpha = 1;
      const on = hover >= 0 ? hover : spot;
      if (on >= 0) { g.strokeStyle = '#fff'; g.lineWidth = 2.5 * dpr; g.strokeRect((on % COLS) * cw + dpr, ((on / COLS) | 0) * ch + dpr, cw - 2 * dpr, ch - 2 * dpr); }
    }
  }

  // ---------- track from free text ----------
  // The member writes her goal in her own words; interests are optional. If she picked none, infer the track
  // (law, medicine, cs, …) from her goal (weighted x3), role and experience. Defaults to "business".
  const TRACK_WORDS = {
    law: /\blaw\b|lawyer|attorney|legal|judge|court|paralegal|litigat|prosecut|public defender|bar exam|justice system/,
    medicine: /doctor|physician|nurse|nursing|surgeon|medic|health|hospital|clinic|pharmac|patient|dentist|therap|psychiatr|midwife|veterinar/,
    cs: /software|coding|\bcode\b|programm|developer|computer|\btech\b|data scien|machine learning|\bai\b|cyber|web dev|\bapps?\b/,
    engineering: /engineer|robot|mechanical|electrical|aerospace|architect|\bdesign(er|ing)?\b|manufactur|construction/,
    science: /scien|research|biolog|chemi|physic|\blab\b|climate|environment|geolog|mathemat|neuro|genetic|ecolog/,
    space: /\bspace\b|astronaut|astronom|nasa|rocket|satellite|planet|cosmos/,
    business: /startup|entrepreneur|business|founder|found(ing)? a|company|\bceo\b|manager|marketing|financ|invest|sales|product|consult|\bbank|launch|own my own|small business/,
    policy: /policy|politic|government|public service|senat|mayor|campaign|diplomat|nonprofit|advoca|activis|elected|congress/,
    media: /journalis|report(er|ing)|writer|writing|author|editor|\bmedia\b|podcast|\bfilm|broadcast|\bnews\b|content creat|blog/,
    arts: /\bart(ist)?s?\b|music|singer|paint|danc|theat|\bactor|actress|fashion|photograph|creative|poet|sculpt|illustrat/,
    education: /teach|educat|professor|school|tutor|principal|curricul|lecturer/,
    sports: /athlet|\bsports?\b|soccer|basketball|olympic|swim|football|runner|fitness|referee|\bcoach(ing)?\b/
  };
  function inferTrack() {
    const valid = new Set(trackList().map(([k]) => k));
    const parts = [[d.goal, 3], [d.role, 1], [d.experienceText, 1]];
    let best = null, bestScore = 0;
    for (const k of Object.keys(TRACK_WORDS)) {
      if (!valid.has(k)) continue;
      let score = 0;
      for (const [text, w] of parts) { const m = String(text || '').toLowerCase().match(new RegExp(TRACK_WORDS[k].source, 'g')); if (m) score += m.length * w; }
      if (score > bestScore) { best = k; bestScore = score; }
    }
    return best || (valid.has('business') ? 'business' : [...valid][0]);
  }

  // ---------- finish: search the library (visibly), then reveal the portrait ----------
  function searching(track) {
    card(`<div class="reveal"><h1>Reading your story…</h1><p class="lead">Searching 2,056 real women for the ones who did what you did.</p>
      <div class="scan"><canvas id="scanCv" width="112" height="112"></canvas><div class="scan-name" id="scanName">&nbsp;</div><div class="scan-count" id="scanCount"></div></div></div>`, false);
    const L = window.JourneyLib; let stop = false, n = 0;
    if (L) L.ready.then(() => {
      const pool = (L.candidates ? L.candidates(track) : L.tiles).slice();
      const g = $('scanCv') && $('scanCv').getContext('2d');
      (function next() {
        if (stop || !$('scanCv') || !pool.length) return;
        const t = pool[Math.random() * pool.length | 0]; n += 37;
        L.drawTile(g, t, 0, 0, 112, 112);
        $('scanName').innerHTML = `<b>${esc(t.name)}</b>${t.field ? ' · ' + esc(t.field) : ''}`;
        $('scanCount').textContent = Math.min(2056, n).toLocaleString() + ' women checked';
        setTimeout(next, 150);
      })();
    }).catch(() => {});
    return () => { stop = true; };
  }

  function localExperience(text, track) {
    return String(text).split(/\n|;|,|\.\s|\band\b/i).map(x => x.trim().replace(/\.$/, ''))
      .filter(x => x.length > 5).slice(0, 8).map(x => ({ text: x.charAt(0).toUpperCase() + x.slice(1), track, year: null }));
  }

  async function finish() {
    const track = d.interests[0] || inferTrack();
    const profile = {
      name: d.name, age: null, city: d.city, coords: null,
      stage: d.stage, years: +d.years || 0, grade: d.grade || '', role: d.role,
      experienceText: d.experienceText, linkedin: d.linkedin || '', goal: d.goal, interests: d.interests.length ? d.interests.slice() : [track], track,
      openToMentor: d.openToMentor, shareInNetwork: d.shareInNetwork, photo: d.photo
    };
    const stopScan = searching(track);
    JStore.setProfile(profile);

    let list = [];
    const minWait = new Promise(r => setTimeout(r, 1800)); // long enough to see the search, short enough not to bore
    if (profile.experienceText && window.readExperience) list = await withTimeout(readExperience(JStore.get().profile), 12000, []);
    // API down or slow: use her own words, split into items (nothing invented), so the reveal never falls flat on stage.
    if ((!list || !list.length) && profile.experienceText) list = localExperience(profile.experienceText, track);
    if (list && list.length && window.seedPastAchievements) await withTimeout(seedPastAchievements(list), 12000, null);
    await minWait; stopScan();

    const n = JStore.get().achievements.length;
    card(`<div class="reveal"><h1>Meet your portrait, ${esc(profile.name)}.</h1>
      <div class="reveal-cv"><canvas id="revealCv" width="360" height="360"></canvas><div class="reveal-pill" id="revealPill" hidden></div></div>
      <div class="pct" id="revealPct">0%</div><div class="muted">made of her${n ? ' · tap any tile to see who she is' : ''}</div>
      <ul class="women" id="revealWomen"></ul>
      <p class="lead" style="margin-top:16px">${n ? 'Your experience already counts. Every new step you log adds another woman who went first.' : 'It starts gray. Log your first real step and a woman who did it first fills in.'}</p>
      <button type="button" class="btn coral big" id="enterBtn">Show me around →</button>
      <button type="button" class="btn link" id="skipTourBtn">Skip the tour</button></div>`, false);
    $('enterBtn').onclick = () => enter(true);
    $('skipTourBtn').onclick = () => enter(false);

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
    // Tap a tile → which woman, and which of your achievements put her there.
    $('revealCv').addEventListener('click', e => {
      const r = e.currentTarget.getBoundingClientRect(), hit = p.cellAt(e.clientX - r.left, e.clientY - r.top), pill = $('revealPill');
      pill.hidden = false;
      pill.style.left = Math.max(70, Math.min(r.width - 70, e.clientX - r.left)) + 'px';
      pill.style.top = (e.clientY - r.top) + 'px';
      pill.innerHTML = hit && hit.tile ? `<b>${esc(hit.tile.name)}</b>${hit.achievement ? `<small>for “${esc(hit.achievement.text)}”</small>` : ''}` : '<small>Still gray. Your next step fills it.</small>';
    });
    const L = window.JourneyLib, ach = JStore.get().achievements.filter(a => a.womanId != null).slice(0, 3);
    if (L && ach.length) $('revealWomen').innerHTML = ach.map(a => {
      const t = L.tile(a.womanId); if (!t) return '';
      return `<li><img alt="" src="${L.thumb(t, 64)}"><div><b>${esc(t.name)}</b> <span class="muted">for “${esc(a.text)}”</span>${a.reason && !String(a.reason).startsWith(t.name) ? `<small>${esc(a.reason)}</small>` : ''}</div></li>`;
    }).join('');
  }

  function enter(withTour) {
    window.showApp && showApp();
    window.Network && Network.upsertMe && Network.upsertMe();
    if (withTour) setTimeout(() => tour(0), 700);
    else setTimeout(() => { window.openCoach && openCoach(); }, 400);
  }

  // ---------- 3-stop tour of the real app (spotlight + tip). Skippable; ends by opening the coach. ----------
  const TOUR = [
    { sel: '#profileCard', title: 'This is you, made of her', text: 'Your portrait lives here. Tap it to see every woman inside it and why she\'s there. Real people, real sources, nothing generated.' },
    { sel: '#steps', title: 'Your Claude coach', text: 'It turns your goal into concrete steps for this week. Do one, check it off, and a new woman joins your portrait.' },
    { sel: '#onYourPath', title: 'Women on your path', text: 'Mentors a few steps ahead and peers right beside you. Send one a message: that\'s how the next step gets easier.' }
  ];
  let tourCleanup = null;
  function tour(i) {
    if (tourCleanup) tourCleanup();
    const T = TOUR[i];
    if (!T) { window.openCoach && openCoach(); return; }
    const el = document.querySelector(T.sel);
    if (!el || !el.offsetParent) return tour(i + 1);
    const box = document.createElement('div'); box.className = 'tour';
    box.innerHTML = `<div class="tour-block"></div><div class="tour-hole"></div>
      <div class="tour-tip" role="dialog" aria-label="${esc(T.title)}"><div class="tour-n">${i + 1} of ${TOUR.length}</div><h3>${esc(T.title)}</h3><p>${esc(T.text)}</p>
      <div class="tour-nav"><button type="button" class="btn link" data-skip>Skip</button><button type="button" class="btn" data-next>${i === TOUR.length - 1 ? 'Start exploring' : 'Next →'}</button></div></div>`;
    document.body.appendChild(box);
    const hole = box.querySelector('.tour-hole'), tip = box.querySelector('.tour-tip');
    function place() {
      const r = el.getBoundingClientRect(), pad = 8, vw = window.innerWidth, vh = window.innerHeight;
      Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: Math.min(r.height, vh - 40) + pad * 2 + 'px' });
      const tw = Math.min(340, vw - 32), th = tip.offsetHeight;
      let left = r.right + 16 + tw <= vw - 16 ? r.right + 16 : r.left - 16 - tw >= 16 ? r.left - 16 - tw : Math.max(16, Math.min(vw - tw - 16, r.left));
      let top = left === r.right + 16 || left === r.left - 16 - tw ? Math.max(16, Math.min(vh - th - 16, r.top)) : (r.bottom + 16 + th <= vh ? r.bottom + 16 : Math.max(16, r.top - 16 - th));
      Object.assign(tip.style, { width: tw + 'px', left: left + 'px', top: top + 'px' });
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    place(); setTimeout(place, 400);
    window.addEventListener('scroll', place, true); window.addEventListener('resize', place);
    box.querySelector('[data-next]').onclick = () => tour(i + 1);
    box.querySelector('[data-skip]').onclick = () => tour(TOUR.length);
    const key = e => { if (e.key === 'Escape') tour(TOUR.length); else if (e.key === 'Enter' || e.key === 'ArrowRight') tour(i + 1); };
    document.addEventListener('keydown', key);
    box.querySelector('[data-next]').focus({ preventScroll: true });
    tourCleanup = () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); document.removeEventListener('keydown', key); box.remove(); tourCleanup = null; };
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('.info'); if (!b) return;
    e.preventDefault();
    const box = document.getElementById('info_' + b.dataset.info); if (!box) return;
    box.hidden = !box.hidden; b.setAttribute('aria-expanded', String(!box.hidden));
  });

  window.Onboarding = {
    start() {
      step = 0;
      $('nav').hidden = true; $('app').hidden = true; $('onboarding').hidden = false; document.body.classList.add('onboarding');
      (window.App && App.tracksReady ? App.tracksReady : Promise.resolve()).then(intro);
    },
    tour: () => tour(0)
  };
})();
