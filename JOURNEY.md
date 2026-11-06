# Made of Her: THE PLAN (pivot, 11:20). Read this, ignore the old CLAUDE.md product sections.

**What it is:** a professional network for women. You join, tell it where you are (stage, years of experience, what you've done) and where you want to go. A Claude **coach** gives you concrete next steps. Every real step you log adds a real woman to your **mosaic portrait** (a snapshot of your photo, gray at first, filling with women who did something similar). Your experience counts from day one: a 28-year veteran starts at 40%, a student at 0%. You **connect with other women on your path**: mentors further ahead, peers at your stage.

**Cut (don't build, don't fix):** the live camera mosaic, `engine.js`, `ui.js`, `relevance.js`, `builder.js`, `api/scene.js`, the Mirror/live mode, scene matching, zoom, stats. The **mosaic is now a static snapshot** made from one photo. We keep only `library/atlas.jpg` + `library/tiles.json` (2,056 real women).

**Timeline (it's 11:20):** build until **12:10** → integrate + fix on Vercel until **12:20** → record demo **12:20–12:30** → submit by **12:45**. Push small commits every ~15 min. Vercel auto-deploys `main`: https://made-of-her-83ve.vercel.app

---

## 1. The app (single page, `index.html`, hash tabs)

```
┌ nav: [Made of Her]   Home · Network (2) · Me                              [avatar] ┐
├──────────────┬───────────────────────────────────────┬───────────────────────────┤
│ PROFILE CARD │ "Log an achievement…" (composer)      │ TODAY'S STEPS (coach)      │
│ [mosaic 192] │ FEED: your achievements, each with    │ ☐ Email a professor…       │
│ Maria Lopez  │ the real woman it matched + 1 line    ├───────────────────────────┤
│ Attorney·28y │                                       │ WOMEN ON YOUR PATH         │
│ ★ Mentor     │                                       │ Ana R. · student [Connect] │
│ ▓▓▓▓░ 40%    │                                       │ Dr. Kim · 31y ★  [Connect] │
└──────────────┴───────────────────────────────────────┴───────────────────────────┘
                                                    [ Coach chat dock, bottom-right ]
```
- **Onboarding** (first visit): About you → Where you are now (stage, years, role) → What you've done (free text) → Goal + interests → Photo (camera snapshot or upload) → Community opt-in (+ "open to mentoring") → **reveal: portrait animates to its starting %** with the women matched from her experience.
- **Home:** composer + feed (center), profile card (left), steps + women on your path (right), coach dock.
- **Network:** requests (accept), mentors on your path, peers on your path, your connections.
- **Me:** big portrait (480px). Tap a tile → which woman + which of your achievements put her there.
- **Look:** our own brand (not LinkedIn's). `--bg:#F6F1EC --card:#FFF --line:#E8DED4 --ink:#221A20 --muted:#6E6470 --plum:#6B2D5C --coral:#E8735A --gold:#C9973A`, radius 12px. Fonts: **Fraunces** (headings) + **Inter** (body) from Google Fonts. Grid max 1128px: `225px 1fr 300px` ≥1000px, one column <640px (coach becomes a full-screen sheet).

---

## 2. Split: own files only, no one else's

| | Builds | Files |
|---|---|---|
| **P3 Niranjana** | App shell, onboarding, profile card, Me page, Network UI | `index.html` (replace; move the old one to `old-live.html`), `app.css`, `app.js`, `onboarding.js`, `network.js` |
| **P2 Emma** | Coach chat + steps + experience reader | `coach.js`, `coach.css`, `api/coach.js`, `api/experience.js`, `data/tracks.json` |
| **P1 Shreya** | Database, shared store, mosaic portrait, achievements + matching, demo data | `store.js`, `config.js`, `portrait.js`, `achievements.js`, `achievements.css`, `api/match.js`, `data/demo.json`, Supabase |

Script order in `index.html`: `config.js, store.js, portrait.js, app.js, onboarding.js, achievements.js, coach.js, network.js`. Until a teammate's file exists, guard calls: `window.openCoach && openCoach()`.

---

## 3. Contracts (code against these; don't wait for each other)

**Mount IDs (P3 creates them in `index.html`):** `#onboarding`, `#nav`, `#home` > (`#profileCard` > `canvas#avatar`), `#composer`, `#feed`, `#steps`, `#onYourPath`; `#network`; `#me` > `canvas#bigPortrait`; `#coachDock`; `#modalRoot`.

**`store.js` (P1): global `JStore`, localStorage `moh.v1`** (P1 pushes this first, by 11:30)
```js
state = {
  memberId: "uuid",
  profile: null | { name, age, city, coords:null|{lat,lon},
    stage:"high_school"|"college"|"early"|"mid"|"senior"|"returning"|"switching", years, role,
    experienceText, goal, interests:["law"], track:"law",
    openToMentor, shareInNetwork, photo:"data:image/jpeg…384px", createdAt },
  steps: [{id, text, why, track, effort, status:"todo"|"done"}],
  achievements: [{id, text, date, stepId, track, womanId, reason, past:bool}],
  chat: [{role, content}]
}
JStore.get() · setProfile(p) · addSteps(arr) · setStepStatus(id,s) · addAchievement(a) · addAchievements(arr) · pushChat(m) · reset()
// every write fires window 'jstore' event {detail:{what}}. ?reset=1 clears. ?demo=student / ?demo=mentor loads data/demo.json personas.
```
**Globals each person provides**
- P1: `Portrait.create(canvas,{photo}) → {setAchievements, animateLatest(n), progress()→{pct,women}, snapshot(96), cellAt(x,y)}`, `window.avatarPortrait`, `openAchievementComposer({text, stepId})`, `seedPastAchievements(list) → Promise`, `JourneyLib = {ready, tiles, thumb(tile,size)}`
- P2: `openCoach(prefill)`, `readExperience(profile) → Promise<[{text, track, year}]>` (fallback `[]`)
- P3: `Network.upsertMe()`, `Network.onYourPath() → {peers, mentors}`; `showApp()`

**Tracks (`data/tracks.json`, P2):** ids `law medicine cs engineering science space business policy media arts education sports`, each with library `fields` (e.g. law → Lawyer, Politician, Activist; cs → Computer scientist, Mathematician, Engineer, Inventor) + `fallbackSteps[track][student|early|experienced]` (≥3 each).

**APIs** (Vercel functions, copy the `api/scene.js` pattern; forced tool call for JSON; CORS `*` so localhost can call `https://made-of-her-83ve.vercel.app/api/...`; key = `ANTHROPIC_API_KEY`):
- `/api/coach` (P2, `claude-sonnet-5-5`): `{profile (no photo/coords), achievements, steps, messages(last 12), kickoff}` → `{reply ≤120 words, steps:[{text, why, track, effort}] 0–3, suggestAchievement:null|string}`. Adapts to stage (a 28-year veteran never gets beginner advice; seniors get "mentor someone here"). **Never invents real people, professors or emails**: it says how to find them.
- `/api/experience` (P2, `claude-sonnet-5-5`): `{stage, years, role, experienceText, track}` → `{achievements:[{text past-tense, track, year}] ≤8}`. Only what she wrote; nothing invented.
- `/api/match` (P1, `claude-haiku-5-5`): `{items:[{key, achievement, track}], candidates:{track:[{id,name,desc,memo}]}}` → `{matches:[{key, id, reason ≤28 words, only facts from desc/memo}]}`.

**Database (P1 sets up Supabase; P3 uses it from `network.js` via plain `fetch` REST; URL + key in `config.js` as `window.JCONFIG`)**
- `members(id uuid pk, name, city, track, interests text[], goal, stage, years int, role, open_to_mentor bool, pct int, women int, avatar text /*96px MOSAIC snapshot, never the photo*/, is_sample bool)`
- `connections(id, from_id, to_id, note ≤280, status 'pending'|'accepted', created_at)`
- Only `shareInNetwork` members are upserted. 12 labeled sample members are seeded so the network isn't empty.
- Matching: **mentors** = `open_to_mentor` and `years ≥ mine + 5`, same track/interests; **peers** = same stage group; seniors who are open to mentoring see **"Women you could mentor"**.

---

## 4. Each person's checklist

**P3 Niranjana**
1. `git mv index.html old-live.html`; new `index.html` with Google Fonts, the mount IDs, nav, 3-column grid, `app.css` tokens. Show onboarding if `!JStore.get().profile`, else `showApp()`. (by 11:40)
2. `onboarding.js`: 6 screens as in section 1 (camera snapshot: square crop → 384 JPEG; file-upload fallback). Finish: `setProfile` → "Reading your experience…" → `readExperience(p)` → `seedPastAchievements(list)` → reveal the big portrait with `avatarPortrait.animateLatest(n)` + "X% made of her" → `showApp()`, `openCoach()`. Don't block more than 12 s. (by 11:55)
3. Profile card (avatar canvas, name, role, stage · years, city, ★ mentor, progress bar "N% made of her · M women") + Me page (big portrait, tap tile → small card). (by 12:00)
4. `network.js`: `upsertMe` (on profile save + every `jstore` achievements event), the "Women on your path" card, the Network tab, a Connect modal (note ≤280), requests + accept (poll every 20 s). (by 12:10)

**P2 Emma**
1. `data/tracks.json` (fields + fallback steps). (by 11:30)
2. `api/experience.js` + `readExperience()` in `coach.js`. (by 11:40)
3. `api/coach.js` (prompt rules in section 3). (by 11:50)
4. `coach.js`/`coach.css`: `#steps` card (checkbox → `openAchievementComposer({text, stepId})`) + `#coachDock` chat (collapsed bar → panel; "＋ Log as achievement" under messages with `suggestAchievement`; kickoff on first open; fallback steps on error). (by 12:10)

**P1 Shreya**
1. Supabase tables + sample members + `config.js` + `store.js`, pushed. (by 11:30)
2. `portrait.js`: 40×40 cells over the photo; 20 achievements = 100% (80 cells each, face first); past achievements capped at 8 (40%); each batch uses tiles from that track's fields, with the matched woman at its center; locked = gray; pop-in + gold flash. (by 11:50)
3. `api/match.js` + `achievements.js`: composer modal, `seedPastAchievements`, the "Made of her" moment card, the feed ("★ from your experience" on past ones). (by 12:10)
4. `data/demo.json`: student + 28-year mentor personas. (by 12:15)

## 5. Demo (2 min)
Phone A: a student onboards → 0% gray portrait → the coach gives 3 steps → "Women on your path" shows a mentor → Connect. Phone B (`?demo=mentor`): a 28-year attorney already **40% made of her** from her experience → accepts. Phone A logs "Joined mock trial" → **the portrait fills with a real woman lawyer + a one-line connection.** Close: "A professional network where your experience counts, your progress is your portrait, and every pixel is a real woman who went first."
