# Made of Her: Dev Doc

**The plan lives in `JOURNEY.md`.** Read it first: product, file ownership (§2), contracts (§3), checklists (§4), demo (§5).

Hackathon build. Deadline **12:45 PM PT**. Plain HTML + vanilla JS + CSS, no build step, no npm. Keep code simple.

- **Team:** P1 Shreya (store, portrait, achievements, Supabase) · P2 Emma (coach, experience, tracks) · P3 Niranjana (app shell, onboarding, network).
- **Live:** https://made-of-her-83ve.vercel.app (Vercel auto-deploys every push to `main`).
- **Run locally:** `python3 -m http.server 8000` → http://localhost:8000. On localhost, API calls go to the deployed Vercel functions (`JCONFIG.apiBase`).
- **APIs** (`api/*.js`, Vercel functions) need `ANTHROPIC_API_KEY` in Vercel env vars; without it they return 501 and the front end falls back.

## Staying in sync (every Claude session)
- Before any task: `git pull --rebase` and `git log --oneline -15`; mention teammate changes that affect your human.
- Only edit your role's files (JOURNEY.md §2). Commit as `P1|P2|P3: <what changed>`; `git add <your files>` only, never `git add .`/`-A`, never force-push.
- Contract changes (JOURNEY.md §3 or below): tell your human first; they get a 👍 from the team.

## Library files (`library/`, read-only)
`atlas.jpg`: 64×64 px tiles, 48 per row, row-major. Tile `i` is at `x = (i % 48) * 64`, `y = floor(i / 48) * 64`.

`tiles.json`: `{ tileSize: 64, perRow: 48, count, tiles: [...] }`, `tiles[i].id === i`. Each tile:
`kind` ("person" | "headline"), `era`, `name`, `year`, `title` (headlines), `desc`, `field`, `link`, `image` (big photo URL, "" for headlines), `source`, `rgb`, `lab`, plus optional `memo`, `memoSource` (Wikipedia, CC BY-SA), `impact`, `themes[]`, `place`, `country`, `lat`, `lon`.
The library (2,056 real women) is final; there is no rebuild pipeline in the repo anymore.
