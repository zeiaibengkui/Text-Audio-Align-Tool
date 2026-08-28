# learnAI

Experiments in speech/ML tooling. The substantial piece is **text-audio-align**: a
forced-alignment pipeline that syncs a Chinese text against its narration and renders it
as a vertical scrolling-scroll reader in the browser.

Everything shares a single virtualenv at the repo root — deliberately, to keep the
multi-gigabyte torch/oneAPI stack from being duplicated per sub-project.

## Layout

```
pyproject.toml            # deps for the whole repo (single shared .venv)
src/environment-test.ipynb  # PyTorch XPU smoke test + MNIST CNN
src/text-audio-align/     # the alignment pipeline (see below)
```

## Environment

PyTorch here is the **Intel XPU** build (`2.13.0+xpu`) — `torch.xpu.is_available()` is
True and `torch.cuda.is_available()` is **False**. Select the device as the notebook does:

```python
device = torch.device("xpu" if torch.xpu.is_available() else "cpu")
```

`align_core.py` loads a `.env` from the repo root at import (simple `KEY=VALUE` parse,
no python-dotenv; existing env vars win). It's gitignored — the local `.env` sets
`ALIGN_DEVICE=xpu` (verified on the Arc GPU). Force-add it if the default should travel
with the repo.

`ffprobe` (from ffmpeg) must be on `PATH` — the pipeline shells out to it for audio duration.

### Do not run `uv sync` or `uv run`

Both are broken against the current checkout, and one of them is destructive:

- **`uv run` fails outright.** `pyproject.toml` declares the `uv_build` backend, so uv tries
  to build `learnai` as a package and errors with
  `Expected a Python module at: src/learnai/__init__.py`. No such module exists.
- **`uv sync` would wreck the environment.** It resolves against `uv.lock` and wants to
  uninstall 46 packages — replacing `torch==2.13.0+xpu` with the generic build and removing
  the entire Intel oneAPI/XPU runtime. The working venv was assembled by hand and is not
  reproducible from the lockfile.

Invoke the interpreter directly instead:

```sh
.venv/bin/python <script>          # from the repo root
../../.venv/bin/python <script>    # from src/text-audio-align/
```

Fixing this properly means either adding `src/learnai/__init__.py` or setting
`[tool.uv] package = false` in `pyproject.toml`, and pinning the XPU torch index.

## text-audio-align

Aligns `data/text.txt` against `data/audio.mp3` and exports timestamps the browser can play
back. The interesting problem is that the aligner returns text **stripped of punctuation and
whitespace**, so the pipeline has to map every word back onto the original characters to
restore it.

### Pipeline

```
data/text.txt + data/audio.mp3
        │
        ▼  align_core.load_data()
   Aligner.from_pretrained()          qwen_aligner_toolkit
        │
        ├─ align_chunked()    audio sliced to ~130s segments; the model can't take the
        │                     full 10min in one pass. Text is split by non-whitespace
        │                     char count so the segments stay proportional.
        ├─ smooth_words()     the model emits pinned/overlapping stamps; zero-duration
        │                     words get linearly interpolated between trusted neighbours.
        └─ build_cues()       clean_positions() walks each aligned char back to its index
                              in the source text, which is what lets punctuation and
                              paragraph breaks come back. Cues break on paragraph newlines,
                              then sentence-enders, then clause punctuation, then length.
        │
        ▼  export_align.py
   align.json  { audio, duration, text, words[], cues[] }
        │
        └──► frontend/         React workbench on the job server API (see below)
```

`align_core.py` run directly (`python align_core.py`) writes `subtitles.srt` and nothing else.

### Scripts

| File | Role |
| --- | --- |
| `align_core.py` | Alignment + cue-building core. Import this. |
| `export_align.py` | Runs the pipeline, writes `align.json` (feeds the server's seeded sample job; the current UI reads per-job results instead). |
| `main.py` | Older standalone: aligns in one pass, groups at 15 chars, writes SRT. Superseded by `align_core.py` — no chunking, no punctuation restoration. |
| `server.py` | Flask job server: upload → async queue → poll → result. `ALIGN_FAKE=1` swaps in `fake_aligner.py`. |
| `fake_aligner.py` | Model-less Aligner stand-in for dev (`ALIGN_FAKE=1`). Emits fake but shape-identical word timestamps in seconds. |
| `asr.py` | Scratch FunASR snippet. Points at a `clip_0001.opus` that isn't in the repo, and hardcodes `device="cuda"`, which fails here (see Environment). |

All of these use **relative paths** (`./data/text.txt`, `data/audio.mp3`), so run them with
`src/text-audio-align/` as the working directory:

```sh
cd src/text-audio-align
../../.venv/bin/python export_align.py
```

Alignment runs on the Intel Arc GPU with `ALIGN_DEVICE=xpu` (~35s end-to-end including
model load, verified) or on CPU by default, which takes minutes. Either way it's slow
enough that `ALIGN_FAKE=1` on the server is the fast edit-test loop.

### Frontend

React 19 + Vite + TypeScript workbench in `frontend/` (`@vitejs/plugin-react` with the
React Compiler Babel preset, oxlint, no CSS framework). It drives the job server over
`/api`: pick an audio file, paste the text, submit — the job list polls and shows
progress — then a completed job opens a cue sheet with an audio player, a time playhead
sweeping down the lines during playback, and click-to-seek on any cue. A 字幕表 / 竹简卷轴
toggle switches to the scroll rendering: vertical text columns reading right→left, each
character fading in (alpha, scale, ink gradient) at its aligned timestamp, punctuation
drawn in its vertical presentation form (`。`→`︒`, `，`→`︐`, …), the scroll panning in
sync with the audio, and an optional user-uploaded cover image (added via the 封面 field
in the form) mounted full-height at the paper's right end — the story-start side. In
dev, Vite proxies `/api` to `127.0.0.1:5000`
(`server.proxy` in `vite.config.ts` — change the target if the server runs elsewhere).
It does not read the static `align.json`; each job's own `result.json` is what the UI
renders.

```sh
cd src/text-audio-align/frontend
pnpm install
pnpm dev            # http://localhost:5173
pnpm build          # tsc -b && vite build
pnpm lint           # oxlint
```

(npm is broken for this package — EBADDEVENGINES, the repo pins pnpm; keep using pnpm.)

The scroll view also has a 导出视频 button: it asks the job server to render the
MP4 server-side (`POST /api/jobs/<id>/export`, poll `GET /api/jobs/<id>/export`,
download `/api/jobs/<id>/export.mp4` — the file lands at `jobs/<id>/scroll.mp4`,
so that same node/ffmpeg pipeline is what a browser click triggers).

The scroll view shares its entire renderer with the headless video exporter, which
renders a finished MP4 from `align.json` (or a per-job `result.json`), muxing the
original audio back in:

```sh
pnpm export:scroll -- --json ../align.json --audio ../data/audio.mp3 --out scroll.mp4
#   [--fps 25] [--size 1280x720] [--rows 12] [--dur 12] [--no-audio] [--cover cover.jpg]
```

`--dur` clips both the timeline and the timestamps, for short preview renders. The
exporter resolves system `Noto Serif CJK SC` via `fc-match` — do not use the rotated
FangSong variant for canvas text.

No tests.
