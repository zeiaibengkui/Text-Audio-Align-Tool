import { useEffect, useMemo, useRef } from 'react'
import { ScrollRenderer, type ScrollData } from './scroll'
import type { JobResult } from './types'

/**
 * 竹简卷轴播放器：Canvas 滚动演出 + 内嵌音频，进度随音频时间走，
 * 每个字符按对齐时间戳独立入墨。与 scripts/export-scroll.mjs 共用 scroll.ts。
 */
export function ScrollPlayer({
  result,
  audioUrl,
}: {
  result: JobResult
  audioUrl: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const rendererRef = useRef<ScrollRenderer | null>(null)

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
      renderer.detectFilter(ctx)
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

  return (
    <div className="scroll-player">
      <canvas ref={canvasRef} className="scroll-canvas" />
      <audio ref={audioRef} controls preload="metadata" src={audioUrl} />
      <p className="scroll-hint">
        文字随朗读声逐字入墨，卷轴缓缓铺展。可拖动进度条回看。
      </p>
    </div>
  )
}
