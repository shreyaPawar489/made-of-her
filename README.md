# made of her

A women-empowerment camera filter, built for the Anthropic Hackathon.

## Team
- Shreya Pawar
- _teammate 2_
- _teammate 3_

## Getting started
Plain HTML/JS (Canvas 2D) + a Python data pipeline. **Read `CLAUDE.md` first** — it has the contracts, file ownership and schedule.

```bash
# run the app (camera needs localhost or HTTPS)
python3 -m http.server 8000   # then open http://localhost:8000

# build the photo library (P2)
pip install pillow requests
python3 tools/build_library.py
```

Roles: P1 engine (`engine.js`), P2 data (`tools/`, `library/`), P3 UI + pitch (`index.html`, `ui.js`, `style.css`).
