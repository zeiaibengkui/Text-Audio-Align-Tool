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
        └──► frontend/         Vite + React 19 scaffold — reader UI not rebuilt yet
```

`align_core.py` run directly (`python align_core.py`) writes `subtitles.srt` and nothing else.

### Scripts

| File | Role |
| --- | --- |
| `align_core.py` | Alignment + cue-building core. Import this. |
| `export_align.py` | Runs the pipeline, writes `align.json` for the frontend. |
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

Fresh Vite + React 19 + TypeScript scaffold in `frontend/` (`@vitejs/plugin-react` with the
React Compiler Babel preset, oxlint, no CSS framework). It's still the template —
`src/App.tsx` is the starter counter — and it does **not** read `align.json`; the old Vue
reader and its symlinks (`public/align.json` → `../../align.json`, `public/data` →
`../../data`) are gone. The whole directory is currently untracked in git.

```sh
cd src/text-audio-align/frontend
npm install
npm run dev         # vite, http://localhost:5173
npm run build       # tsc -b && vite build
npm run lint        # oxlint
```

No tests.
