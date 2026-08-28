import { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollRenderer, type ScrollData } from './scroll'
import {
  getExport,
  startExport,
  exportVideoUrl,
  type ExportState,
} from './api'
import type { JobResult } from './types'

/**
 * 竹简卷轴播放器：Canvas 滚动演出 + 内嵌音频，进度随音频时间走，
 * 每个字符按对齐时间戳独立入墨。与 scripts/export-scroll.mjs 共用 scroll.ts。
 * 「导出视频」调 POST /api/jobs/<id>/export，由后端跑同一个渲染器出 MP4。
 */
export function ScrollPlayer({
  result,
  audioUrl,
  jobId,
}: {
  result: JobResult
  audioUrl: string
  jobId: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const rendererRef = useRef<ScrollRenderer | null>(null)

  const [exportState, setExportState] = useState<ExportState | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const data = useMemo<ScrollData>(
    () => ({
      text: result.text,
      words: result.words,
      cues: result.cues,
      duration: result.duration,
    }),
    [result],
  )

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const W = c.clientWidth || 960
    const H = c.clientHeight || 540
    c.width = Math.round(W * dpr)
    c.height = Math.round(H * dpr)
    const renderer = new ScrollRenderer(W, H, dpr, data)
    const ctx = c.getContext('2d')
    if (ctx) {
      renderer.draw(ctx, 0.05) // 首帧：趁进入等待，先落几笔淡墨
    }
    rendererRef.current = renderer
  }, [data])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const a = audioRef.current
      const c = canvasRef.current
      const r = rendererRef.current
      if (c && r && a) {
        const ctx = c.getContext('2d')
        if (ctx) r.draw(ctx, a.currentTime)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ---- 导出：进入视图先查一次状态；渲染中每 1.5s 轮询 ----
  useEffect(() => {
    let live = true
    getExport(jobId)
      .then((s) => live && setExportState(s))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [jobId])

  const exporting =
    exportState !== null &&
    (exportState.status === 'queued' || exportState.status === 'rendering')

  useEffect(() => {
    if (!exporting) return
    const id = setInterval(() => {
      getExport(jobId)
        .then((s) => setExportState(s))
        .catch(() => {})
    }, 1500)
    return () => clearInterval(id)
  }, [exporting, jobId])

  const onExport = async () => {
    setExportError(null)
    try {
      setExportState(await startExport(jobId))
    } catch (err) {
      setExportError(err instanceof Error ? err.message : '导出请求失败')
    }
  }

  return (
    <div className="scroll-player">
      <canvas ref={canvasRef} className="scroll-canvas" />
      <audio ref={audioRef} controls preload="metadata" src={audioUrl} />
      <p className="scroll-hint">
        文字随朗读声逐字入墨，卷轴缓缓铺展。可拖动进度条回看。
      </p>
      <div className="scroll-export">
        {exportState === null && (
          <button
            className="btn export-btn"
            onClick={() => void onExport()}
            disabled={exportError !== null}
          >
            导出视频
          </button>
        )}
        {exportState?.status === 'none' && (
          <button className="btn export-btn" onClick={() => void onExport()}>
            导出视频
          </button>
        )}
        {(exportState?.status === 'queued' ||
          exportState?.status === 'rendering') && (
          <button className="btn export-btn" disabled>
            {exportState.status === 'queued'
              ? '排队中'
              : `导出中 ${Math.round((exportState.progress ?? 0) * 100)}%`}
          </button>
        )}
        {exportState?.status === 'done' && (
          <a className="btn export-btn" href={exportVideoUrl(jobId)} download>
            下载视频
          </a>
        )}
        {exportState?.status === 'failed' && (
          <span className="export-fail">
            导出失败：{exportState.error}
            <button className="export-retry" onClick={() => void onExport()}>
              重试
            </button>
          </span>
        )}
        {exportError && <span className="export-fail">{exportError}</span>}
      </div>
    </div>
  )
}
