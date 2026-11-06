# Made of Her

**A professional network for women where your progress becomes your portrait, and every pixel of it is a real woman who went first.**

Built in one day for the Anthropic Hackathon (Nov 6, 2026).

**▶ Live demo: https://made-of-her.vercel.app**
Skip sign-up with a ready-made profile: [28-year civil rights attorney](https://made-of-her.vercel.app/?demo=mentor) · [pre-law student](https://made-of-her.vercel.app/?demo=student)

---

## The idea

Women are told to "find a mentor" and "build a network", but most of us never see the women who already walked our path. Made of Her makes them visible.

1. **Tell it where you are and where you're going.** Any stage, from middle school to CEO, plus people returning to work or switching careers.
2. **Your photo becomes a mosaic** of **2,056 real women** from Wikidata and Wikipedia: scientists, lawyers, astronauts, founders, athletes, artists. No generated faces.
3. **Your experience counts from day one.** Claude reads what you've already done and turns it into achievements. Each one matches a real woman who did something similar and fills part of your portrait.
4. **A Claude coach** turns your goal into concrete steps for this week. Log a step and a new woman fills in, with a one-line reason built only from facts about her.
5. **Meet the women on your path:** mentors a few steps ahead, peers at your stage, colleagues at your company. Connect, message, and start a video chat.

> AI that points you back to real people. Every tile is a true story you can tap and read.

## Demo script (2 minutes)

| | What to show | What it proves |
|---|---|---|
| 1 | Onboard as a student: stage, what you've done, a free-text goal, a photo | Works for any stage; LinkedIn optional (PDF or paste) |
| 2 | **Reveal:** the portrait fills in and the % counts up | Your experience already counts |
| 3 | **Me** tab → tap a tile → her photo, bio, "Read her story", why she matches | Every pixel is a real, sourced woman |
| 4 | Today's steps from the coach → tick one → log it → "You're now made of her too" | Progress = portrait |
| 5 | "Women on your path" → Connect with a mentor (note drafted by the agent card) | The network |
| 6 | Second device on `?demo=mentor`: Maria accepts, then they message and plan a video chat | Real two-way connections |

## Features

- **Onboarding:** 6 short screens (about you → stage → what you've done → goal → photo → network opt-in). LinkedIn "Save to PDF" upload or paste. Animated portrait reveal.
- **Mosaic portrait** (`portrait.js`): 40×40 cells over your photo. 20 achievements = 100%, 80 cells each, face first; past experience capped at 40%. Locked cells show faded women; unlocked are full color. Your portrait is your profile picture everywhere. Tap any tile on **Me** to see who she is and which step put her there.
- **Matching** (`matcher.js` + `/api/match`): in-browser BM25 + concept map over 1,888 biographies; Claude picks the best of the top 8 and explains why using only her bio. Fictional characters filtered; women at your employer boosted; offline fallback.
- **Claude coach** (`coach.js` + `/api/coach`): chat dock + Today's steps, adapted to your stage. Never invents real people or emails. Falls back to hand-written steps per track.
- **Network** (`network.js`, Supabase): mentors, peers, women at your company, "women you could mentor"; requests, profiles, search; direct messages with unread badges and a "Plan a video chat" Jitsi link. Only your mosaic is shared, never your photo.
- **Personal agent** (`nudges.js`): one card that shows your next best action: answer a request, reach out to a mentor (note drafted), or a daily check-in that logs into your portrait.

## How Claude is used

| Endpoint | Model | Job |
|---|---|---|
| `api/experience.js` | `claude-sonnet-5-5` | Turns what you wrote (or your LinkedIn PDF) into achievements. Nothing invented |
| `api/coach.js` | `claude-sonnet-5-5` | Short coach replies, up to 3 concrete steps, "log this" suggestions |
| `api/match.js` | `claude-haiku-5-5` | Picks the woman whose real record fits your step and says why, from her bio only |

All return structured JSON via tool calls and have client-side fallbacks, so the app still works without an API key.

## Data and privacy

- **Library:** `library/atlas.jpg` + `library/tiles.json`: 1,888 women from Wikidata (24 occupations + recent Nobel, Fields and Turing winners) and 168 milestone cards.
- **Sources:** photos from Wikimedia Commons (licenses vary per file); summaries from Wikipedia (CC BY-SA). No news photos, no generated images.
- **Your photo stays on your device** (`localStorage`). Only the mosaic is uploaded, and only if you opt in.

## Tech and layout

Plain HTML + vanilla JS + CSS (Canvas 2D), no build step. Vercel functions for Claude, Supabase for members, connections and messages.

```
index.html, app.js, app.css, human.css   app shell, router, profile card, Me page, UI
onboarding.js                            first-visit flow + reveal
portrait.js, matcher.js                  mosaic engine + library loader, biography matcher
achievements.js/.css                     composer, "made of her" moment, Your path feed
coach.js/.css                            Claude coach dock + Today's steps
network.js, nudges.js                    network, messaging, personal agent
store.js, config.js                      local state (?demo=, ?reset=), Supabase + API config
api/                                     coach.js, experience.js, match.js
data/, db/, library/                     tracks + demo personas, SQL schema, tile atlas
```

## Run it

```bash
python3 -m http.server 8000
```
Open http://localhost:8000 (camera needs localhost or HTTPS). Flags: `?demo=student`, `?demo=mentor`, `?reset=1`.

**Deploy your own:** import into Vercel, set `ANTHROPIC_API_KEY`, create a Supabase project, run `db/schema.sql` then `db/messages.sql`, and put the URL + publishable key in `config.js`.

## Team

- **Shreya Pawar:** store, mosaic portrait, achievements + matching API, Supabase, demo personas
- **Emma Liu:** Claude coach, experience reader, career tracks, biography matcher
- **Niranjana Jayendran:** app shell, onboarding, network + messaging, personal agent, UI and pitch

Built with Claude Code. Plan and contracts: [`JOURNEY.md`](JOURNEY.md).
