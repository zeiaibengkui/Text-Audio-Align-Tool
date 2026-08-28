# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout

Repo of ML experiments with a single shared virtualenv (`.venv` at root — the multi-GB torch/oneAPI stack is deliberately not duplicated per sub-project). The substantial piece is `src/text-audio-align/`: a Chinese text↔audio forced-alignment pipeline (align_core), a Flask job server (server.py), and a fresh React scaffold (frontend/).

## Commands

Everything Python runs via `.venv/bin/python` — **never `uv run` or `uv sync`**:
`uv run` fails (uv_build backend, no `src/learnai/__init__.py`); `uv sync` would wreck the environment (replaces `torch==2.13.0+xpu` with the generic build, drops the Intel oneAPI/XPU runtime). The venv is hand-assembled and not reproducible from the lockfile.

```sh
cd src/text-audio-align
../../.venv/bin/python export_align.py      # align + write align.json  (real model, minutes)
../../.venv/bin/python align_core.py        # align + write subtitles.srt only
../../.venv/bin/python server.py            # Flask job server, real model
ALIGN_FAKE=1 ../../.venv/bin/python server.py   # same server, no model (seconds) — the dev loop
```

All scripts use relative paths (`./data/text.txt`, `data/audio.mp3`) — run from `src/text-audio-align/`. Alignment loads the model and takes minutes; it is not an edit-test loop. `ALIGN_FAKE=1` is the quick path.

Frontend (`src/text-audio-align/frontend/`): use **pnpm** (`npm` is broken with EBADDEVENGINES — devEngines pins pnpm). `pnpm dev` / `pnpm build` / `pnpm lint` (oxlint), `pnpm exec tsc -b` for type-checking only. No test suite exists. Export the scroll to video with `pnpm export:scroll -- --json ../align.json --audio ../data/audio.mp3 --out scroll.mp4` (or `node scripts/export-scroll.mjs ...`).

## Environment

- PyTorch is the **Intel XPU** build: `torch.cuda.is_available()` is False, `torch.xpu.is_available()` is True. Select device as `torch.device("xpu" if torch.xpu.is_available() else "cpu")`.
- `ALIGN_DEVICE=xpu` is **verified** on this machine (Intel Arc, ~3.7 GB resident). A root `.env` is loaded automatically at `align_core` import (deps-free KEY=VALUE parser; explicitly set env vars win) — the local `.env` holds `ALIGN_DEVICE=xpu` as the default. Without it the toolkit resolves to CPU. `ALIGN_FAKE=1` is the fastest path, then XPU (~35s end-to-end incl. load), then CPU (minutes).
- `ffprobe` (ffmpeg) must be on PATH — `align_core.audio_duration()` shells out to it.
- `jobs/` (server artifacts) and `*.srt` are gitignored.

## Alignment pipeline (`align_core.py`)

`load_data()` returns `(text, words, cues, duration)`:

- **align_chunked()** — the model can't take the full ~10min audio in one pass; audio is split into ~130s segments (`k = ceil(dur/130)`) and text is split proportionally by non-whitespace char count (`split_text_by_weight`). `progress_cb(done, total)` fires per segment; raising from it aborts.
- The model outputs words **stripped of punctuation and whitespace** — the core problem. `clean_positions()` walks each aligned char back through the original text to find its index, which is how punctuation and paragraph breaks get restored.
- **build_cues()** splits cues on paragraph newlines, then sentence enders, then clause punctuation, then max length; `_merge_unbalanced()` keeps `【《（「` brackets with their closers. `smooth_words()` linearly interpolates zero-duration/overlapping words between trusted neighbours.
- `fake_aligner.py` (ALIGN_FAKE=1) must emit the same alnum-only vocabulary as the real model and honor the same chunk/segment shapes, or `build_cues` sees different gaps and dev paths diverge.

`export_align.py` writes `align.json` = `{audio, duration, text, words[], cues[]}`, with `audio` as the literal `data/audio.mp3` re-exported from `align_core.AUDIO_FILE` — that literal is a contract for consumers (the server rewrites it to `/api/jobs/<id>/audio`), keep it unchanged.

## Job server (`server.py`)

Alignment outlives HTTP timeouts, so it's job-based: `POST /api/jobs` returns a job id immediately; poll `GET /api/jobs/<id>` for status; `GET /api/jobs/<id>/result` when done; audio at `GET /api/jobs/<id>/audio` (Range requests → 206, gives the player seek). One daemon worker thread pulls from a queue. Jobs persist under `jobs/<id>/` (`meta.json` written tmp-file + `os.replace`; in-memory dict is authoritative). On restart, queued/running jobs are marked failed — their worker is gone. Cancellation: `progress_cb` raises `JobCancelled` at a chunk boundary. `seed_sample_job()` pre-populates a `sample` (done) job from repo `data/` + `align.json` on first start. Run with `use_reloader=False` — the reloader forks and loads the model twice.

## Conventions

- Python docstrings/comments, error messages, and UI strings are in Chinese — match that.
- `align_core.py` is the import target; `main.py` is legacy (no chunking, no punctuation restoration) and `asr.py` is a scratch FunASR snippet that hardcodes `device="cuda"` (fails here) and a missing `clip_0001.opus` — neither is safe to rely on.
- `frontend/` (React 19 + Vite + TS, React Compiler via Babel preset, oxlint) is the workbench UI: upload audio + text → POST /api/jobs → poll list → render `result.json` cues with a time playhead, or the 竹简卷轴 scroll view. Dev traffic goes through Vite's proxy (`/api` → `127.0.0.1:5000` in `vite.config.ts`), so the Flask app needs no CORS. It does not consume the static `align.json`. No test suite.
- 竹简卷轴 (`src/scroll.ts` + `ScrollPlayer.tsx`) renders the aligner timestamps as a bamboo scroll: vertical text (12 rows/col), the inking character pinned at a pen position at the right edge, already-written text sliding left one column per column, cycling when the audio loops. `src/scroll.ts` is pure canvas and shared verbatim between the browser player and `scripts/export-scroll.mjs` (headless MP4 via @napi-rs/canvas → ffmpeg rawpipe; font in exports is `fc-match` on system Noto Serif CJK SC — the rotated FangSong variant must be avoided).
