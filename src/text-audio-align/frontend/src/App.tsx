import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createJob,
  deleteJob,
  getHealth,
  getResult,
  jobAudioUrl,
  listJobs,
} from './api'
import { ScrollPlayer } from './ScrollPlayer'
import type { Health, JobMeta, JobResult } from './types'
import './App.css'

const STAGE_LABEL: Record<string, string> = {
  queued: '排队中',
  loading_model: '加载模型',
  validating: '校验',
  aligning: '对齐中',
  smoothing: '平滑时间戳',
  done: '完成',
  failed: '失败',
  cancelled: '已取消',
}

function fmtTime(sec: number | null | undefined, decimals = 0): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '--:--'
  const m = Math.floor(sec / 60)
  const s = (sec - m * 60).toFixed(decimals)
  return `${m}:${s.padStart(decimals ? 5 : 2, '0')}`
}

interface SoundState {
  status: Health | 'down' | 'loading'
}

function App() {
  const [server, setServer] = useState<SoundState['status']>('loading')
  const [jobs, setJobs] = useState<JobMeta[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [resultById, setResultById] = useState<{
    id: string
    data: JobResult | null
  } | null>(null)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [pos, setPos] = useState(0)
  const [view, setView] = useState<'cues' | 'scroll'>('cues')
  const audioRef = useRef<HTMLAudioElement>(null)

  const selectJob = (id: string | null) => {
    setView('cues')
    setSelectedId(id)
  }

  // ---- server health (one-shot) ----
  useEffect(() => {
    let live = true
    getHealth()
      .then((h) => live && setServer(h))
      .catch(() => live && setServer('down'))
    return () => {
      live = false
    }
  }, [])

  // ---- job list (poll fast while anything is active) ----
  const hasActive = jobs.some((j) => j.status === 'queued' || j.status === 'running')
  useEffect(() => {
    let live = true
    const load = () =>
      listJobs()
        .then((js) => {
          if (!live) return
          setJobs(js)
          setSelectedId((sel) => sel ?? (js[0]?.status === 'done' ? js[0].id : null))
        })
        .catch(() => {})
    // schedule the first fetch off the effect's synchronous path
    const id = setInterval(load, hasActive ? 2000 : 15000)
    const first = setTimeout(load, 0)
    return () => {
      live = false
      clearInterval(id)
      clearTimeout(first)
    }
  }, [hasActive])

  const selected = jobs.find((j) => j.id === selectedId) ?? null

  // ---- fetch result for the selected done job ----
  useEffect(() => {
    if (!selected || selected.status !== 'done') return
    let live = true
    getResult(selected.id)
      .then((data) => {
        if (live) setResultById({ id: selected.id, data })
      })
      .catch(() => {
        if (live) setResultById({ id: selected.id, data: null })
      })
    return () => {
      live = false
    }
  }, [selected])

  const result =
    resultById && resultById.id === selected?.id ? resultById.data : null
  const resultError =
    resultById !== null && resultById.id === selected?.id && resultById.data === null

  // ---- playhead: tick while playing, jump on seek ----
  useEffect(() => {
    const tick = () => {
      const a = audioRef.current
      if (a && !a.paused) setPos(a.currentTime)
      raf = requestAnimationFrame(tick)
    }
    let raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [selected?.id])

  const seekTo = (t: number) => {
    const a = audioRef.current
    if (!a) return
    a.currentTime = t
    void a.play().catch(() => {})
  }

  const activeIdx = useMemo(() => {
    if (!result || result.cues.length === 0) return -1
    const i = result.cues.findIndex((c) => pos >= c.start && pos < c.end)
    if (i >= 0) return i
    const last = result.cues[result.cues.length - 1]
    return pos >= last.end ? result.cues.length - 1 : -1
  }, [pos, result])

  useEffect(() => {
    if (activeIdx < 0) return
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document
      .getElementById(`cue-${activeIdx}`)
      ?.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' })
  }, [activeIdx])

  // ---- actions ----
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!audioFile || !text.trim()) {
      setFormError('请选择音频文件并输入文本')
      return
    }
    setSubmitting(true)
    setFormError('')
    try {
      const job = await createJob(audioFile, text.trim())
      selectJob(job.id)
      setAudioFile(null)
      setText('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const onDelete = async (id: string) => {
    await deleteJob(id)
    if (selectedId === id) selectJob(null)
  }

  const pct =
    result && result.duration > 0 ? Math.min(100, (pos / result.duration) * 100) : 0

  return (
    <div className="app">
      <header className="topbar">
        <h1>文本·音频对齐</h1>
        <div className="topbar-right">
          {server === 'down' && (
            <span className="chip chip-danger" role="alert">
              后端未连接
            </span>
          )}
          {server && server !== 'down' && server !== 'loading' && (
            <span className="chip">{server.fake ? '假对齐模式' : '真实模型'}</span>
          )}
        </div>
      </header>

      {server === 'down' && (
        <div className="banner" role="alert">
          无法连接后端服务。先在仓库里启动它，再刷新本页：
          <code>
            cd src/text-audio-align &amp;&amp; ALIGN_FAKE=1 ../../.venv/bin/python
            server.py
          </code>
        </div>
      )}

      <div className="shell">
        <aside className="sidebar">
          <form className="panel form" onSubmit={onSubmit}>
            <h2 className="panel-title">新建任务</h2>
            <label className="field">
              <span className="field-label">音频文件</span>
              <input
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.opus,.aac"
                onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
              />
              {audioFile && <span className="file-hint">{audioFile.name}</span>}
            </label>
            <label className="field">
              <span className="field-label">文本</span>
              <textarea
                rows={8}
                placeholder="粘贴或输入要对齐的中文文本"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <button className="btn" type="submit" disabled={submitting}>
              {submitting ? '正在提交…' : '开始对齐'}
            </button>
            {formError && <p className="form-error">{formError}</p>}
          </form>

          <section className="panel jobs">
            <h2 className="panel-title">
              任务
              <span className="count">{jobs.length}</span>
            </h2>
            {jobs.length === 0 && (
              <p className="empty">还没有任务。提交音频与文本，开始第一次对齐。</p>
            )}
            <ul className="job-list">
              {jobs.map((job) => (
                <li key={job.id}>
                  <div
                    className={
                      'job-row' + (job.id === selectedId ? ' selected' : '')
                    }
                    role="button"
                    tabIndex={0}
                    onClick={() => selectJob(job.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') selectJob(job.id)
                    }}
                  >
                    <span className={`badge badge-${job.status}`}>{job.status}</span>
                    <div className="job-main">
                      <span className="job-name" title={job.name}>
                        {job.name}
                      </span>
                      <span className="job-meta">
                        {job.status === 'running' || job.status === 'queued'
                          ? `${STAGE_LABEL[job.stage ?? 'queued'] ?? job.stage} · ${Math.round(job.progress * 100)}%`
                          : job.status === 'done'
                            ? `${fmtTime(job.duration)} · ${job.word_count} 词 · ${job.cue_count} 条`
                            : (job.error ?? STAGE_LABEL[job.status])}
                      </span>
                      {(job.status === 'running' || job.status === 'queued') && (
                        <span className="progress">
                          <span
                            className="progress-fill"
                            style={{ width: `${Math.max(2, job.progress * 100)}%` }}
                          />
                        </span>
                      )}
                    </div>
                    <button
                      className="job-delete"
                      title="删除任务"
                      aria-label="删除任务"
                      onClick={(e) => {
                        e.stopPropagation()
                        void onDelete(job.id)
                      }}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <main className="panel result" aria-live="polite">
          {!selected && (
            <div className="result-empty">
              <p>{resultError ? '结果加载失败。' : '选择左侧任务查看对齐结果。'}</p>
            </div>
          )}
          {selected && selected.status !== 'done' && selected.status !== 'failed' && (
            <div className="result-empty">
              <p>{STAGE_LABEL[selected.stage ?? 'queued']}</p>
              <p className="result-sub">对齐需要几秒到几分钟，页面会自动更新。</p>
            </div>
          )}
          {selected && selected.status === 'failed' && (
            <div className="result-empty">
              <p className="form-error">{selected.error}</p>
            </div>
          )}
          {selected &&
            selected.status === 'done' &&
            result && (
              <>
                <header className="result-head">
                  <div className="result-head-row">
                    <h2 className="result-title">{result.text.slice(0, 24)}…</h2>
                    <div className="view-switch" role="tablist" aria-label="视图">
                      <button
                        className={'seg' + (view === 'cues' ? ' seg-on' : '')}
                        onClick={() => setView('cues')}
                        role="tab"
                        aria-selected={view === 'cues'}
                      >
                        字幕表
                      </button>
                      <button
                        className={'seg' + (view === 'scroll' ? ' seg-on' : '')}
                        onClick={() => setView('scroll')}
                        role="tab"
                        aria-selected={view === 'scroll'}
                      >
                        竹简卷轴
                      </button>
                    </div>
                  </div>
                  <p className="result-stats">
                    时长 {fmtTime(result.duration)} · {result.words.length} 词 ·{' '}
                    {result.cues.length} 条字幕
                  </p>
                </header>
                {view === 'scroll' ? (
                  <ScrollPlayer
                    key={selected.id}
                    result={result}
                    audioUrl={jobAudioUrl(selected.id)}
                    jobId={selected.id}
                  />
                ) : (
                  <>
                    <audio
                      key={selected.id}
                      ref={audioRef}
                      controls
                      preload="metadata"
                      src={jobAudioUrl(selected.id)}
                      onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
                      className="player"
                    />
                    <p className="playhead-now">
                      <span className="now-time">{fmtTime(pos, 1)}</span>
                    </p>
                    <div className="cues">
                      <div className="playhead" style={{ top: `${pct}%` }} aria-hidden="true">
                        <span className="playhead-dot" />
                      </div>
                      {result.cues.map((c, i) => (
                        <button
                          key={i}
                          id={`cue-${i}`}
                          className={'cue' + (i === activeIdx ? ' cue-active' : '')}
                          onClick={() => seekTo(c.start)}
                        >
                          <span className="cue-time">{fmtTime(c.start)}</span>
                          {c.text}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          {selected && selected.status === 'done' && resultError && (
            <div className="result-empty">
              <p>结果加载失败，请刷新重试。</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
