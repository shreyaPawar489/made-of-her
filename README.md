# Made of Her

A professional network for women, built for the Anthropic Hackathon. Tell it where you are and where you want to go; a Claude coach gives you concrete next steps. Every real step you log adds a real woman to your **mosaic portrait**, a snapshot of your photo that fills in with 2,056 women who did something similar. Connect with mentors further ahead and peers at your stage.

**Live:** https://made-of-her-83ve.vercel.app

## Team
- Shreya Pawar: data store, mosaic portrait, achievements, Supabase
- Emma: Claude coach, experience reader, career tracks
- Niranjana: app shell, onboarding, network

## Run locally
```bash
python3 -m http.server 8000   # then open http://localhost:8000
```
Demo personas: `?demo=student`, `?demo=mentor`. Clear local data: `?reset=1`.

## Layout
- `index.html`, `app.js`, `app.css`, `onboarding.js`, `network.js`: app shell, onboarding, network
- `config.js`, `store.js`, `portrait.js`, `achievements.js`, `achievements.css`: settings, local state, portrait, achievements
- `coach.js`, `coach.css`: coach chat and today's steps
- `api/`: Vercel functions (`coach`, `experience`, `match`), need `ANTHROPIC_API_KEY`
- `data/`: `tracks.json`, `demo.json` · `db/schema.sql`: Supabase tables · `library/`: tile atlas + metadata

See `JOURNEY.md` for the full plan and contracts.
