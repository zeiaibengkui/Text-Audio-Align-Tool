import { useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { jobAudioUrl } from '../api'
import { ResultView } from '../components/ResultView'
import { STAGE_LABEL } from '../format'
import { useJobs } from '../jobs-context'
import { ACTIVE_STATUSES } from '../types'
import { useJob } from '../useJob'
import { useResult } from '../useResult'

const MISSING = '任务不存在'

/** 居中一列的状态卡片，几个分支共用。 */
function Centered({ children }: { children: ReactNode }) {
  return (
    <Stack spacing={2} sx={{ py: 4, alignItems: 'center' }}>
      {children}
    </Stack>
  )
}

export default function AlignPage() {
  const { id } = useParams()
  const { retryJob } = useJobs()
  const { job, error, reload } = useJob(id ?? '', 2000)
  const { ready, result, failed, reload: reloadResult } = useResult(
    id ?? '',
    job?.status === 'done',
  )
  const [retryError, setRetryError] = useState('')

  if (!id) return <Navigate to="/" replace />

  const onRetry = async () => {
    setRetryError('')
    try {
      await retryJob(id)
      reload()
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : '重试失败')
    }
  }

  const body = () => {
    if (error) {
      return (
        <Centered>
          <Alert severity="warning">{error === MISSING ? '任务不存在或已被删除' : error}</Alert>
          <Button onClick={reload}>重新加载</Button>
          <Button component={Link} to="/">
            返回任务列表
          </Button>
        </Centered>
      )
    }
    if (!job) return <Centered><CircularProgress /></Centered>
    if (ACTIVE_STATUSES.includes(job.status)) {
      return (
        <Centered>
          <Typography variant="h6">{STAGE_LABEL[job.stage ?? 'queued']}</Typography>
          <Typography color="text.secondary">对齐需要几秒到几分钟，页面会自动更新。</Typography>
          <LinearProgress value={job.progress * 100} variant="determinate" />
        </Centered>
      )
    }
    if (job.status === 'done') {
      if (failed && !ready) {
        return (
          <Centered>
            <Alert severity="error">结果加载失败，请刷新重试。</Alert>
            <Button onClick={reloadResult}>重新加载</Button>
          </Centered>
        )
      }
      if (!ready || !result) return <Centered><CircularProgress /></Centered>
      return (
        <>
          <ResultView
            view="cues"
            result={result}
            jobId={id}
            audioUrl={jobAudioUrl(id)}
            coverUrl={null}
          />
          <Button component={Link} to={`/jobs/${id}/render`} variant="contained" sx={{ mt: 2 }}>
            下一步：渲染
          </Button>
        </>
      )
    }
    return (
      <Centered>
        <Alert severity="error">{job.error ?? STAGE_LABEL[job.status]}</Alert>
        <Button variant="contained" onClick={() => void onRetry()}>
          重新对齐
        </Button>
        {retryError && <Alert severity="error">{retryError}</Alert>}
        <Button component={Link} to="/">
          返回任务列表
        </Button>
      </Centered>
    )
  }

  return (
    <Card aria-live="polite">
      <CardContent>{body()}</CardContent>
    </Card>
  )
}
