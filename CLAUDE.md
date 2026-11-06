# Made of Her — Dev Doc (read this first)

## 0. STATUS (updated ~10:26) — v1 is BUILT and working
Team: **P1 Engine = Shreya · P2 Data = Emma · P3 UI + pitch = Niranjan.**
Files that exist and work: `index.html`, `style.css`, `ui.js`, `engine.js`, `builder.js`, `mock/fake-library.js`, `data/headlines.json`.
- Run: `python3 -m http.server 8000` → http://localhost:8000 (dev with fake tiles: `?fake=1`).
- **The photo library builds itself in the browser** on first load (`builder.js`: Wikidata → Wikimedia thumbnails → atlas), shows progress, and caches in IndexedDB. `?rebuild=1` forces a rebuild.
- Stats panel (press **D**) → **Download library pack** saves `atlas.jpg` + `tiles.json`. Put them in `library/` and commit → app loads instantly/offline (demo safety). Priority order at load: `library/` → IndexedDB cache → live build.
- So the Python pipeline in §7 is **optional/not needed**; §7 now describes what `builder.js` does.

### Remaining tasks (do these, in order)
**Shreya (P1, engine.js):** ✅ (~10:50) engine faster (cached tile layer, dpr≤1.5), default tileSize 22, magnifier circle replaced by smooth zoom (scroll/pinch/double-click, drag to pan) + square hover label; control bar hidden by default (press **S**). New Mosaic API (additive): `zoomAt(x,y,f)`, `panBy(dx,dy)`, `resetView()`, `zoom()`. ✅ (~10:26) less repetition (K=16 + no identical neighbors), freeze survives resize/rotate, zoom-out snap. Known: double-click on desktop also opens the card (ui.js, Niranjan). Next: test on real camera, deploy to GitHub Pages, phone test.
**Emma (P2, builder.js + data/):** ✅ DONE (~10:30): library built (2,056 tiles) and committed to `library/`, portraits checked, headlines fact-checked (Tennessee governor updated: Blackburn won). Remaining: optional extra photos for saturated blue/red gap colors (not skin tones, low priority).
**Niranjan (P3, ui.js/style.css + pitch):** ✅ phone polish done (~11:00): start screen, controls bar (2-row grid on phones), story card = bottom sheet; new ☰ button opens controls on touch devices (S key still works on desktop); checked at 320px and 375px, no overlaps. Next: deck + demo-video script after 11:45; record demo by 12:00.

### Staying in sync (every Claude session MUST do this)
- **Before starting any task:** `git pull --rebase`, re-read this section 0, and run `git log --oneline -15` to see what teammates just did. Mention anything that affects your human's work.
- **Commit messages are the team feed.** Format: `P1|P2|P3: <what changed and why it matters to others>`. Example: `P2: library/ committed, 1,950 tiles — app now loads offline`.
- **Plan changes go in this section, not just in chat.** If your human changes scope, cuts a feature, changes a default, or finishes a task, edit the "Remaining tasks" line for their role (only their own line) and the `updated ~HH:MM` time, commit as `<role>: STATUS …`, push, and tell your human to post one line in the group chat.
- **Contract A/B (sections 4–5) or file ownership never change silently.** Stop and have your human get a 👍 in the group chat first, then update the contract here in the same commit as the code.
- If `git pull` brings in a change that breaks your part, tell your human immediately instead of working around it.


Hackathon build. **Deadline 12:45 PM PT. Feature freeze 11:45.** Optimize for a working, beautiful demo over completeness. Keep code simple and readable; no refactors, no frameworks, no build step.

## 1. Product in one paragraph
A web app that turns a **live camera feed into a photomosaic made of real women** — historical pioneers and recent achievers — plus milestone "headline" cards. From normal distance you clearly see yourself (like knicksmosaic.com); up close every pixel is a real woman. A **magnifier lens** enlarges tiles under the cursor/finger; **tapping a tile freezes the frame and opens her story card** (photo, name, year, one line, link). The frame shows "This frame is made of N women." Message: *AI that points you back to real people — no generated images, every pixel is a true story.*

## 2. Fixed technical decisions (do not change)
- Plain HTML + vanilla JS (ES modules not required; globals OK) + CSS. **Canvas 2D only. No WebGL.** No npm, no bundler.
- Data pipeline: **Python 3 + Pillow + requests**, run once offline on a laptop. The app never calls Wikidata/Wikimedia at runtime (except optional large card photos, with fallback).
- Run locally: `python3 -m http.server 8000` → http://localhost:8000 (camera needs localhost or HTTPS).
- Deploy: Vercel / Netlify drop / GitHub Pages (HTTPS) at the end.

## 3. Repo layout & ownership — stay in your own files
```
index.html          P3  page shell, loads style.css, engine.js, ui.js
style.css           P3
ui.js               P3  camera, controls, lens pointer, story card, start screen
engine.js           P1  mosaic engine (exposes window.Mosaic)
mock/fake-library.js P1 (write FIRST, ~10 min) fake tiles so P1/P3 aren't blocked
tools/build_library.py  P2  Wikidata + headlines -> library/
tools/gap_report.py     P2  color coverage report
data/headlines.json     given: 56 sourced milestone cards (history + recent)
library/atlas.jpg       P2 output
library/tiles.json      P2 output
```
Never edit another person's file without telling them. If a contract below must change, tell the whole team first.

## 4. CONTRACT A — library files (P2 writes, P1 reads)
`library/atlas.jpg`: grid of **64×64 px** tiles, **48 per row** (max 2304 tiles), row-major. Tile `i` is at `x = (i % 48) * 64`, `y = floor(i / 48) * 64`. JPEG quality ~85.

`library/tiles.json`:
```json
{
  "tileSize": 64, "perRow": 48, "count": 1900,
  "tiles": [
    {
      "id": 0,
      "kind": "person",            // "person" | "headline"
      "era": "history",            // "history" | "recent"
      "name": "Marie Curie",
      "year": 1867,                // birth year for people, event year for headlines; null if unknown
      "title": "",                 // headlines: short tile text, e.g. "FIRST WOMAN IN SPACE"
      "desc": "Polish-French physicist and chemist",
      "field": "Scientist",
      "link": "https://en.wikipedia.org/wiki/Marie_Curie",
      "image": "https://commons.wikimedia.org/wiki/Special:FilePath/X.jpg?width=330", // big photo for card; "" for headlines
      "source": "Wikidata",
      "rgb": [142, 120, 101],      // average color of the 64px tile, 0-255
      "lab": [52.1, 6.3, 12.8]     // same color in CIE Lab (D65)
    }
  ]
}
```
`id` must equal the tile's index in the atlas.

## 5. CONTRACT B — engine API (P1 implements, P3 calls)
`engine.js` defines `window.Mosaic`:
```js
Mosaic.init({ canvas, video })                 // canvas fills the screen; video is a playing <video>
await Mosaic.loadLibrary('library/')           // loads atlas.jpg + tiles.json; resolves {count}
Mosaic.useFakeLibrary(400)                     // dev only (from mock/fake-library.js)
Mosaic.start(); Mosaic.stop();
Mosaic.setOptions({
  tileSize: 14,          // CSS px per cell, 6–40
  strength: 0.4,         // overlay opacity 0–0.8
  mode: 'tint',          // 'tint' | 'ghost' | 'color'
  rotate: true,          // slow tile rotation
  mirror: true           // true for front camera
})
Mosaic.freeze(bool)                            // stop sampling video; keep current tiles
Mosaic.setLens({x, y} | null)                  // CSS px (clientX/clientY); engine draws lens each frame
Mosaic.tileAt(x, y) -> tile | null             // tile object from tiles.json under that CSS point
Mosaic.frameSummary() -> { uniqueTiles, sample: [up to 6 random tile objects in frame] }
Mosaic.stats() -> { fps, cols, rows, libraryCount, uniqueTiles, matchError, goodMatchPct, gapColors: ['#hex', ...] }
```
P3: until P1 is ready, use a stub `window.Mosaic` with the same functions returning fake data.

## 6. P1 — Engine spec (`engine.js`)
**Per frame (requestAnimationFrame):**
1. Canvas size = window × `min(devicePixelRatio, 2)`. Cell size `cs = tileSize * dpr`; `cols = ceil(W/cs)`, `rows = ceil(H/cs)`.
2. Draw video into an offscreen canvas of `cols × rows` using **cover crop** (keep aspect, center) and mirror if `mirror`. `getImageData` (context created with `willReadFrequently: true`).
3. **Temporal smoothing:** keep a Float32 per-cell RGB; `s = s*0.5 + new*0.5`. Prevents flicker.
4. **Lookup table (build on library load):** quantize RGB to **Q=20 levels per channel** (8000 buckets). For each bucket center convert to Lab and find the **top K=6 nearest tiles** (squared Lab distance); keep only candidates within (bestΔE + 12). Store `lut[bucket*6+k]`, `lutN[bucket]`, `lutBest[bucket]` (ΔE of best). Build ~100 ms; fine.
5. Pick tile for cell `i`: `lut[b*6 + (seed[i] % lutN[b])]` where `seed` is a per-cell random Uint8. Store in `cellTile[i]`.
6. Draw: `ctx.drawImage(atlas, sx, sy, 64, 64, c*cs, r*cs, cs, cs)` for every cell (imageSmoothing on).
7. **Overlay (makes the big image obvious):**
   - `tint`: `globalAlpha = strength`, `imageSmoothingEnabled = false`, draw the small cols×rows canvas scaled to full size.
   - `ghost`: draw the full-res video (same crop/mirror) at `globalAlpha = strength`.
   - `color`: `globalCompositeOperation = 'color'`, pixelated small canvas at alpha `min(1, strength*2)`.
   Reset alpha/composite after.
8. **Rotation:** if `rotate` and not frozen and no lens, each frame increment `seed[i]` for ~0.3% of random cells (each cell changes every ~6–8 s). Only swaps between same-color candidates, so the big image stays put.
9. **Lens:** if set, clip a circle radius 120 CSS px at the point; draw cells around it at 60 CSS px each, positioned so the cell under the pointer stays under the pointer: `x = px + (c - px/cs) * L`. Draw a white ring; draw a label pill below with `name · year`.
10. **Stats:** fps (smoothed); `uniqueTiles` (Set of cellTile, compute every 500 ms); `matchError` = mean lutBest over cells; `goodMatchPct` = % cells with lutBest < 12; `gapColors` = top 6 bucket colors (hex) most often seen with lutBest > 18 (decaying counts).

**Acceptance:** ≥24 fps at tileSize 14 on a laptop; you are clearly recognizable at strength 0.4; no visible flicker holding still; lens readable; works with fake library and real library.

`mock/fake-library.js` (write first): `Mosaic.useFakeLibrary(n)` generates n 64px tiles on a canvas atlas — random colors spread over the full RGB cube, each with a darker circle "face" and the index number — with matching tile objects (`name: "Test Woman 12"`, computed rgb/lab).

## 7. P2 — Data spec (`tools/build_library.py`, `tools/gap_report.py`)
Target **~1,800 people + headline cards ≤ 2304 total**. Faces should dominate; headline cards ≈ 10–15%.

**Step 1 – people from Wikidata** (SPARQL endpoint `https://query.wikidata.org/sparql?format=json&query=...`). Set header `User-Agent: MadeOfHer-hackathon/0.1 (contact: team email)` (Wikimedia requires it). One query per occupation, LIMIT ~120, 4 at a time, dedupe by QID:
```sparql
SELECT ?p ?pLabel ?pDescription ?img ?born ?article WHERE {
  ?p wdt:P106 wd:{OCC}; wdt:P21 wd:Q6581072; wdt:P18 ?img; wikibase:sitelinks ?sl.
  FILTER(?sl > 15)
  OPTIONAL { ?p wdt:P569 ?born }
  OPTIONAL { ?article schema:about ?p; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 120
```
Occupations (QID → field label): Q901 Scientist, Q82594 Computer scientist, Q81096 Engineer, Q39631 Physician, Q169470 Physicist, Q593644 Chemist, Q11063 Astronomer, Q170790 Mathematician, Q11631 Astronaut, Q864503 Biologist, Q205375 Inventor, Q188094 Economist, Q82955 Politician, Q40348 Lawyer, Q15253558 Activist, Q1930187 Journalist, Q36180 Writer, Q1028181 Painter, Q33231 Photographer, Q42973 Architect, Q974144 Educator, Q43845 Businessperson, Q2066131 Athlete, Q177220 Singer. (Sanity-check 2–3 in query.wikidata.org first; drop any that time out.)

**Step 1b – recent achievers** (era = "recent"): women awarded major prizes since 2015:
```sparql
SELECT DISTINCT ?p ?pLabel ?pDescription ?img ?when ?awardLabel ?article WHERE {
  VALUES ?award { wd:Q38104 wd:Q44585 wd:Q80061 wd:Q37922 wd:Q35637 wd:Q47170 wd:Q28835 wd:Q185667 }
  ?p p:P166 ?st. ?st ps:P166 ?award; pq:P585 ?when. FILTER(YEAR(?when) >= 2015)
  ?p wdt:P21 wd:Q6581072; wdt:P18 ?img.
  OPTIONAL { ?article schema:about ?p; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
```
(Nobel Physics/Chemistry/Medicine/Literature/Peace/Economics, Fields Medal, Turing Award.) Use `desc = "<awardLabel>, <year>"`, `year = award year`.

**Step 2 – download thumbnails:** `P18` value is a `Special:FilePath/...` URL; request it with `?width=120` (follows redirect). 8 threads, the User-Agent above, timeout 15 s, skip failures and `.svg/.tif/.gif`. Cache to `tools/cache/` so reruns are instant. **Never use news-site photos** (copyright).

**Step 3 – make tiles (Pillow):** convert RGB (paste on white if alpha); center square crop, **for portrait images bias the crop toward the top** (`top = (h - side) * 0.15`) so faces are in frame; resize to 64×64 (LANCZOS). Average color → `rgb`; convert to Lab (sRGB→linear→XYZ D65→Lab) → `lab`.

**Step 4 – headline cards** from `data/headlines.json`: for each entry render **3 color variants** (different hue and light/mid/dark backgrounds — this also fills color gaps). Year large (~20px bold), `short` small below (≤2 lines). Font: `/System/Library/Fonts/Supplemental/Arial Bold.ttf`, fallback `ImageFont.load_default(size=...)`. `kind="headline"`, `title=short`, `desc=text`, `link=source`, `image=""`.

**Step 5 – write** `library/atlas.jpg` + `library/tiles.json` per Contract A. Shuffle people before assigning ids. Print counts.

**`gap_report.py`:** load tiles.json; sample a 16×16×16 RGB grid weighted toward skin tones/mid-tones; print % of samples with best ΔE < 12 and save `library/gaps.png` showing the 24 worst-covered colors → tells the team what colors of photos to add.

**Acceptance:** first 300 tiles by 10:45; full library by 11:15; atlas looks like faces; gap report run once.

## 8. P3 — UI spec (`index.html`, `style.css`, `ui.js`)
- **Start screen:** title "Made of Her", one-line tagline, big "Turn on camera" button (camera must start from a user gesture for iOS). Library loads in background; show "Loading 1,900 women…".
- **Camera:** `getUserMedia({ video: { facingMode, width: {ideal:1280}, height: {ideal:720} }, audio: false })`, `<video playsinline muted autoplay>`. Flip button toggles `user`/`environment` (mirror only for `user`). Clear error message if denied.
- **Controls (bottom bar, translucent, wraps on mobile):** Tile size slider (6–40, default 14), Image strength slider (0–0.8, default 0.4), Mode select (Tint/Ghost/Color), Rotate toggle, Freeze/Live button, Flip, Stats toggle. Keyboard: Space = freeze, D = stats, L = lens.
- **Lens:** mouse → `Mosaic.setLens` on pointermove, `null` on leave. Touch → lens while finger is down.
- **Tap/click (no drag) on mosaic:** `Mosaic.freeze(true)`, open **story card** for `Mosaic.tileAt(x,y)`: large image (`tile.image`, `onerror` → hide), name, year, field/desc, "Read more" link (`tile.link`, new tab), and banner **"This frame is made of {uniqueTiles} women & stories"** with 6 small names from `frameSummary().sample` (clicking one swaps the card). Buttons: "Keep exploring" (close card, stay frozen) and "Back to live" (unfreeze). Headline tiles: show `title`, year, `desc`, source link.
- **Stats panel (toggle, top-right):** fps, grid, library count, unique tiles, match error, good-match %, gap color swatches labeled "Need more photos in these colors".
- **Look:** full-bleed dark background, warm accent color, rounded cards, system font. Mobile: card is a bottom sheet.

**Acceptance:** works on laptop Chrome + iPhone Safari over HTTPS; nothing overlaps on a phone; tap → card in < 200 ms.

## 9. Pitfalls (read!)
- Camera only works on `localhost` or HTTPS — don't open index.html as a file.
- Canvas `getImageData` throws on cross-origin images — that's why tiles are prebuilt into a same-origin atlas.
- Don't redraw only "changed" cells — just redraw everything each frame; it's fast enough.
- Wikimedia rate-limits: cache downloads, ≤ 8 threads, always send User-Agent.
- iPhone canvas memory limit: keep atlas ≤ 3072×3072 (48 × 64 = 3072 ✓).
- Keep text tiles ≤ 15% or the image goes flat-colored.

## 10. Schedule
| Time | Checkpoint |
|---|---|
| 10:05 | Repo up, everyone starts. P1 ships `mock/fake-library.js` by 10:15 |
| 10:45 | **Integration 1:** engine live with fake tiles; P2 has 300 real tiles |
| 11:15 | **Integration 2:** real library + UI wired. Go/no-go: if broken, cut lens/rotation |
| 11:45 | **Feature freeze** — bug fixes only |
| 12:00 | Record demo video (backup for live demo) |
| 12:15 | Deployed on HTTPS, tested on a phone |
| 12:45 | Submit |

**Next-steps slide (do NOT build today):** Claude vision picks themed collections from the scene; Snapchat Lens / native camera filter; "submit her story" community uploads; virtual webcam for Zoom.
