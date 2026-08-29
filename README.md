# Text Audio Align Tool

This is a tool for aligning text and audio, with an ancient Chinese style rendering function, and a beautiful style.  

Most of the code are written by Claude but has been fully tested by human.

## Project Structure

```
src/
├── align_core.py             # Alignment pipeline: text+audio → word timestamps → cues (SRT)
├── export_align.py           # CLI: run align_core and export align.json for the frontend
├── server.py                 # Flask job server (job-based, since alignment outlives HTTP timeouts)
├── fake_aligner.py           # Mock aligner for ALIGN_FAKE=1 (dev loop, no model load)
├── main.py                   # Legacy aligner — no chunking, no punctuation restoration
├── asr.py                    # Scratch FunASR snippet (hardcoded cuda) — do not rely on
├── data/                     # Sample text.txt + audio.mp3 for the demo
├── jobs/                     # Per-job server artifacts (gitignored); sample/ seeded on first start
└── frontend/                 # React 19 + Vite + TS workbench UI
    ├── src/                  # App.tsx (upload/polls), ScrollPlayer.tsx, scroll.ts (canvas engine), api.ts
    └── scripts/export-scroll.mjs   # Headless MP4 export (@napi-rs/canvas + ffmpeg rawpipe)
```

## Develop

```bash
# backend python flask — use the shared .venv; do NOT `uv sync` (it would replace
# the Intel XPU torch build). Port 5000.
.venv/bin/python src/server.py                 # real model, minutes
ALIGN_FAKE=1 .venv/bin/python src/server.py    # fake aligner, seconds — the dev loop

# frontend react — use pnpm (npm is broken with EBADDEVENGINES). Port 5173.
cd src/frontend && pnpm i && pnpm run dev
```
