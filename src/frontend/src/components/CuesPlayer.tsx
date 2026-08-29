import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtTime } from '../format'
import type { JobResult } from '../types'

export function CuesPlayer({
  result,
  audioUrl,
}: {
  result: JobResult
  audioUrl: string
}) {
  const [pos, setPos] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  // ---- playhead: tick while playing, jump on seek ----
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const a = audioRef.current
      if (a && !a.paused) setPos(a.currentTime)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const seekTo = (t: number) => {
    const a = audioRef.current
    if (!a) return
    a.currentTime = t
    void a.play().catch(() => {})
  }

  const activeIdx = useMemo(() => {
    if (result.cues.length === 0) return -1
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

  const pct =
    result.duration > 0 ? Math.min(100, (pos / result.duration) * 100) : 0

  return (
    <>
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        src={audioUrl}
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
  )
}
