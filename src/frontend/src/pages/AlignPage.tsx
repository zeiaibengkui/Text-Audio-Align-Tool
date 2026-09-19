import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
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

  return (
    <Card sx={{ p: 2 }} aria-live="polite">
      {error ? (
        <Stack spacing={2} sx={{ py: 4, alignItems: 'center' }}>
          <Alert severity="warning">
            {error === MISSING ? '任务不存在或已被删除' : error}
          </Alert>
          <Button variant="outlined" onClick={reload}>
            重新加载
          </Button>
          <Button component={Link} to="/">
            返回任务列表
          </Button>
        </Stack>
      ) : !job ? (
        <Stack spacing={2} sx={{ py: 4, alignItems: 'center' }}>
          <CircularProgress size={22} />
          <Typography sx={{ color: 'text.secondary' }}>加载中…</Typography>
        </Stack>
      ) : ACTIVE_STATUSES.includes(job.status) ? (
        <Stack spacing={2} sx={{ py: 5, alignItems: 'center' }}>
          <Typography variant="h2">{STAGE_LABEL[job.stage ?? 'queued']}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            对齐需要几秒到几分钟，页面会自动更新。
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.max(2, job.progress * 100)}
            sx={{ width: '100%', maxWidth: 320, mt: 1 }}
          />
        </Stack>
      ) : job.status === 'done' ? (
        failed && !ready ? (
          <Stack spacing={2} sx={{ py: 4, alignItems: 'center' }}>
            <Typography>结果加载失败，请刷新重试。</Typography>
            <Button variant="outlined" onClick={reloadResult}>
              重新加载
            </Button>
          </Stack>
        ) : !ready || !result ? (
          <Stack spacing={2} sx={{ py: 4, alignItems: 'center' }}>
            <CircularProgress size={22} />
            <Typography sx={{ color: 'text.secondary' }}>加载中…</Typography>
          </Stack>
        ) : (
          <>
            <ResultView
              view="cues"
              result={result}
              jobId={id}
              audioUrl={jobAudioUrl(id)}
              coverUrl={null}
            />
            <Button
              component={Link}
              to={`/jobs/${id}/render`}
              variant="contained"
              fullWidth
              sx={{ mt: 2 }}
            >
              下一步：渲染
            </Button>
          </>
        )
      ) : (
        <Stack spacing={2} sx={{ py: 4, alignItems: 'center' }}>
          <Alert severity="error" sx={{ width: '100%' }}>
            {job.error ?? STAGE_LABEL[job.status]}
          </Alert>
          <Button variant="contained" onClick={() => void onRetry()} sx={{ minWidth: 160 }}>
            重新对齐
          </Button>
          {retryError && (
            <Typography color="primary.dark" sx={{ fontSize: 13 }}>
              {retryError}
            </Typography>
          )}
          <Button component={Link} to="/">
            返回任务列表
          </Button>
        </Stack>
      )}
    </Card>
  )
}
