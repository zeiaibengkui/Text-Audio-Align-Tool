import { useState } from 'react'
import { useNavigate } from 'react-router'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import RefreshIcon from '@mui/icons-material/Refresh'
import { STAGE_LABEL, fmtTime } from '../format'
import { useJobs } from '../jobs-context'
import { ACTIVE_STATUSES, type JobMeta, type JobStatus } from '../types'

const STATUS_COLOR: Record<JobStatus, 'default' | 'primary' | 'success' | 'warning'> = {
  queued: 'warning',
  running: 'primary',
  done: 'success',
  failed: 'primary',
  cancelled: 'default',
}

/** 一行任务：状态、名字、一行说明（进度 / 时长统计 / 错误），右侧动作。 */
function JobRow({
  job,
  onOpen,
  onRetry,
  onDelete,
}: {
  job: JobMeta
  onOpen: () => void
  onRetry: () => void
  onDelete: () => void
}) {
  const active = ACTIVE_STATUSES.includes(job.status)
  const secondary = active
    ? `${STAGE_LABEL[job.stage ?? 'queued'] ?? job.stage} · ${Math.round(job.progress * 100)}%`
    : job.status === 'done'
      ? `${fmtTime(job.duration)} · ${job.word_count} 词 · ${job.cue_count} 条`
      : (job.error ?? STAGE_LABEL[job.status])

  return (
    <ListItem disablePadding sx={{ mb: 0.5 }}>
      <ListItemButton onClick={onOpen} sx={{ gap: 1, alignItems: 'flex-start' }}>
        <Chip
          size="small"
          variant="outlined"
          color={STATUS_COLOR[job.status]}
          label={job.status}
          sx={{ mt: 0.25, flexShrink: 0 }}
        />
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <ListItemText
            primary={job.name}
            secondary={secondary}
            slotProps={{
              primary: { noWrap: true, sx: { fontSize: 14 } },
              secondary: { noWrap: true, sx: { fontSize: 12 }, title: secondary ?? undefined },
            }}
          />
          {active && (
            <LinearProgress
              variant="determinate"
              value={Math.max(2, job.progress * 100)}
              sx={{ mt: 0.5 }}
            />
          )}
        </Box>
        <Stack direction="row" sx={{ flexShrink: 0, alignItems: 'center' }}>
          {(job.status === 'failed' || job.status === 'cancelled') && (
            <IconButton
              aria-label="重新对齐"
              size="small"
              onClick={(e) => {
                e.stopPropagation()
                onRetry()
              }}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          )}
          <IconButton
            aria-label="删除任务"
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <DeleteOutlinedIcon fontSize="small" />
          </IconButton>
        </Stack>
      </ListItemButton>
    </ListItem>
  )
}

export default function DashboardPage() {
  const { jobs, deleteJob, retryJob } = useJobs()
  const navigate = useNavigate()
  const [actionError, setActionError] = useState('')

  const openJob = (id: string) => void navigate(`/jobs/${id}`)

  const onDelete = (id: string) =>
    deleteJob(id).catch((err) =>
      setActionError(err instanceof Error ? err.message : '删除失败'),
    )

  const onRetry = (id: string) =>
    retryJob(id)
      .then(() => openJob(id))
      .catch((err) => setActionError(err instanceof Error ? err.message : '重试失败'))

  return (
    <Card>
      <Stack direction="row" spacing={1} sx={{ px: 2, pt: 2, pb: 1, alignItems: 'baseline' }}>
        <Typography variant="h2" sx={{ flexGrow: 1 }}>
          任务
        </Typography>
        <Chip size="small" variant="outlined" label={jobs.length} />
      </Stack>
      {actionError && (
        <Typography color="primary.dark" sx={{ px: 2, fontSize: 13 }}>
          {actionError}
        </Typography>
      )}
      {jobs.length === 0 ? (
        <Typography sx={{ px: 2, pb: 2, color: 'text.secondary', fontSize: 13 }}>
          还没有任务。切到「新建」，提交音频与文本开始第一次对齐。
        </Typography>
      ) : (
        <List dense sx={{ px: 1, pb: 1 }}>
          {jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              onOpen={() => openJob(job.id)}
              onRetry={() => void onRetry(job.id)}
              onDelete={() => void onDelete(job.id)}
            />
          ))}
        </List>
      )}
    </Card>
  )
}
