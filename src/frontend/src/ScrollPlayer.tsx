import { useEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ScrollRenderer, type CoverSource, type ScrollData } from './scroll'
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
  coverUrl,
}: {
  result: JobResult
  audioUrl: string
  jobId: string
  coverUrl?: string | null
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
    if (coverUrl) {
      // 异步加载封面，加载完成后再贴入卷轴最右端（覆盖在首列之前）
      const img = new Image()
      img.onload = () => {
        if (rendererRef.current === renderer && img.naturalWidth > 0) {
          const cover: CoverSource = {
            width: img.naturalWidth,
            height: img.naturalHeight,
            draw: (ctx, x, y, w, h) => ctx.drawImage(img, x, y, w, h),
          }
          renderer.setCover(cover)
        }
      }
      img.onerror = () => {} // 封面加载失败不阻塞卷轴
      img.src = coverUrl
    }
    const ctx = c.getContext('2d')
    if (ctx) {
      renderer.draw(ctx, 0.05) // 首帧：趁进入等待，先落几笔淡墨
    }
    rendererRef.current = renderer
  }, [data, coverUrl])

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

  const fmtElapsed = (sec: number): string => {
    const m = Math.floor(sec / 60)
    const r = Math.round(sec % 60)
    return m > 0 ? `${m}分${String(r).padStart(2, '0')}秒` : `${r}秒`
  }

  // ---- 导出：进入视图先查一次状态；从未导出过则自动开始渲染（服务端
  // 重启后内存状态丢失、或任务刚完成时都会走到这里）----
  useEffect(() => {
    let live = true
    getExport(jobId)
      .then((s) => {
        if (!live) return
        setExportState(s)
        if (s.status === 'none') {
          startExport(jobId)
            .then((s2) => live && setExportState(s2))
            .catch(() => {})
        }
      })
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

  const onExport = async (force = false) => {
    setExportError(null)
    try {
      setExportState(await startExport(jobId, force))
    } catch (err) {
      setExportError(err instanceof Error ? err.message : '导出请求失败')
    }
  }

  const progress = Math.round((exportState?.progress ?? 0) * 100)

  return (
    <Stack spacing={1.5}>
      <Box
        component="canvas"
        ref={canvasRef}
        // canvas 要按容器撑满并保持 16:9，没有对应的 prop
        sx={{ width: '100%', aspectRatio: '16 / 9', display: 'block', bgcolor: '#3b342a' }}
      />
      <Box component="audio" ref={audioRef} controls preload="metadata" src={audioUrl} />
      <Typography variant="body2" color="text.secondary">
        文字随朗读声逐字入墨，卷轴缓缓铺展。可拖动进度条回看。
      </Typography>

      {(exportState === null || exportState.status === 'none') && (
        <Button variant="contained" onClick={() => void onExport()}>
          导出视频
        </Button>
      )}
      {exporting && (
        <>
          <Button variant="contained" disabled>
            {exportState?.status === 'queued' ? '排队中' : `导出中 ${progress}%`}
          </Button>
          {exportState?.status === 'rendering' && (
            <LinearProgress
              variant={progress > 0 ? 'determinate' : 'indeterminate'}
              value={progress}
            />
          )}
        </>
      )}
      {exportState?.status === 'done' && (
        <>
          <Button variant="contained" href={exportVideoUrl(jobId)} download>
            下载视频
          </Button>
          <Button variant="outlined" onClick={() => void onExport(true)}>
            重新导出
          </Button>
          {exportState.elapsed_sec != null && (
            <Typography variant="body2" color="text.secondary">
              耗时 {fmtElapsed(exportState.elapsed_sec)}
            </Typography>
          )}
        </>
      )}
      {exportState?.status === 'failed' && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void onExport()}>
              重试
            </Button>
          }
        >
          导出失败：{exportState.error}
        </Alert>
      )}
      {exportError && <Alert severity="error">{exportError}</Alert>}
    </Stack>
  )
}
