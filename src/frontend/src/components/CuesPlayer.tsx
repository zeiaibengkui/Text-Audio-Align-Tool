import { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
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

  const pct = result.duration > 0 ? Math.min(100, (pos / result.duration) * 100) : 0

  return (
    <Stack spacing={1}>
      <Box component="audio" ref={audioRef} controls preload="metadata" src={audioUrl} />
      <Typography variant="body2" color="text.secondary">
        {fmtTime(pos, 1)}
      </Typography>
      {/* 播放头要压在列表上，只能用绝对定位 */}
      <Box sx={{ position: 'relative', overflowY: 'auto', maxHeight: '60vh' }}>
        <Box aria-hidden sx={{ position: 'absolute', left: 0, right: 0, top: `${pct}%` }}>
          <Divider />
        </Box>
        <List dense>
          {result.cues.map((c, i) => (
            <ListItemButton
              key={i}
              id={`cue-${i}`}
              selected={i === activeIdx}
              onClick={() => seekTo(c.start)}
            >
              <ListItemText primary={c.text} secondary={fmtTime(c.start)} />
            </ListItemButton>
          ))}
        </List>
      </Box>
    </Stack>
  )
}
