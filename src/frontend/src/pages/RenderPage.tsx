import { Navigate, useParams } from 'react-router'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { jobAudioUrl, jobCoverUrl } from '../api'
import { ResultView } from '../components/ResultView'
import { useJob } from '../useJob'
import { useResult } from '../useResult'

/** 居中的「加载中…」卡片，几个分支共用。 */
function LoadingCard() {
  return (
    <Card sx={{ p: 2 }}>
      <Stack spacing={2} sx={{ py: 4, alignItems: 'center' }}>
        <CircularProgress size={22} />
        <Typography sx={{ color: 'text.secondary' }}>加载中…</Typography>
      </Stack>
    </Card>
  )
}

export default function RenderPage() {
  const { id } = useParams()
  const { job, error } = useJob(id ?? '', 0)
  const { ready, result, failed, reload } = useResult(id ?? '', job?.status === 'done')

  if (!id) return <Navigate to="/" replace />
  if (error || (job && job.status !== 'done')) {
    return <Navigate to={`/jobs/${id}`} replace />
  }
  if (!job) return <LoadingCard />
  if (failed && !ready) {
    return (
      <Card sx={{ p: 2 }}>
        <Stack spacing={2} sx={{ py: 4, alignItems: 'center' }}>
          <Typography>结果加载失败，请刷新重试。</Typography>
          <Button variant="outlined" onClick={reload}>
            重新加载
          </Button>
        </Stack>
      </Card>
    )
  }
  if (!ready || !result) return <LoadingCard />
  return (
    <Card sx={{ p: 2 }} aria-live="polite">
      <ResultView
        key={id}
        view="scroll"
        result={result}
        jobId={id}
        audioUrl={jobAudioUrl(id)}
        coverUrl={job.cover_ext ? jobCoverUrl(id) : null}
      />
    </Card>
  )
}
