import { useState } from 'react'
import { useNavigate } from 'react-router'
import Alert from '@mui/material/Alert'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
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

const STATUS_COLOR: Record<JobStatus, 'default' | 'primary' | 'success' | 'warning' | 'error'> = {
  queued: 'warning',
  running: 'primary',
  done: 'success',
  failed: 'error',
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
    <ListItem
      disablePadding
      secondaryAction={
        <Stack direction="row">
          {(job.status === 'failed' || job.status === 'cancelled') && (
            <IconButton aria-label="重新对齐" onClick={onRetry}>
              <RefreshIcon />
            </IconButton>
          )}
          <IconButton aria-label="删除任务" onClick={onDelete}>
            <DeleteOutlinedIcon />
          </IconButton>
        </Stack>
      }
    >
      <ListItemButton onClick={onOpen}>
        <Chip color={STATUS_COLOR[job.status]} label={job.status} sx={{ mr: 1 }} />
        <ListItemText primary={job.name} secondary={secondary} />
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
      <CardHeader title="任务" subheader={`共 ${jobs.length} 个`} />
      {actionError && <Alert severity="error">{actionError}</Alert>}
      <CardContent>
        {jobs.length === 0 ? (
          <Typography>还没有任务。切到「新建」开始第一次对齐。</Typography>
        ) : (
          <List>
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
      </CardContent>
    </Card>
  )
}
