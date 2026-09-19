import { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import ListItemButton from '@mui/material/ListItemButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { fmtTime } from '../format'
import { MONO } from '../theme'
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
    <Stack spacing={1}>
      <Box
        component="audio"
        ref={audioRef}
        controls
        preload="metadata"
        src={audioUrl}
        onTimeUpdate={(e: React.SyntheticEvent<HTMLAudioElement>) =>
          setPos(e.currentTarget.currentTime)
        }
        sx={{ width: '100%' }}
      />
      <Typography
        sx={{ fontFamily: MONO, fontSize: 12, color: 'primary.dark', letterSpacing: '0.05em' }}
      >
        {fmtTime(pos, 1)}
      </Typography>
      <Box
        sx={{
          position: 'relative',
          overflowY: 'auto',
          maxHeight: { xs: '52vh', md: '56vh' },
          py: 0.5,
        }}
      >
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${pct}%`,
            borderTop: '1px solid',
            borderColor: 'primary.main',
            opacity: 0.45,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: -4,
              left: 8,
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: 'primary.main',
            }}
          />
        </Box>
        {result.cues.map((c, i) => (
          <ListItemButton
            key={i}
            id={`cue-${i}`}
            onClick={() => seekTo(c.start)}
            selected={i === activeIdx}
            sx={{
              gap: 1.5,
              alignItems: 'baseline',
              borderLeft: '3px solid',
              borderColor: i === activeIdx ? 'primary.main' : 'transparent',
              borderRadius: 1,
            }}
          >
            <Typography
              component="span"
              sx={{
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: '0.04em',
                minWidth: 48,
                flexShrink: 0,
                color: i === activeIdx ? 'primary.dark' : 'text.disabled',
              }}
            >
              {fmtTime(c.start)}
            </Typography>
            <Typography component="span" sx={{ fontSize: 14 }}>
              {c.text}
            </Typography>
          </ListItemButton>
        ))}
      </Box>
    </Stack>
  )
}
