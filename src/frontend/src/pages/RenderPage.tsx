import { Navigate, useParams } from 'react-router'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import { jobAudioUrl, jobCoverUrl } from '../api'
import { ResultView } from '../components/ResultView'
import { useJob } from '../useJob'
import { useResult } from '../useResult'

export default function RenderPage() {
  const { id } = useParams()
  const { job, error } = useJob(id ?? '', 0)
  const { ready, result, failed, reload } = useResult(id ?? '', job?.status === 'done')

  if (!id) return <Navigate to="/" replace />
  if (error || (job && job.status !== 'done')) {
    return <Navigate to={`/jobs/${id}`} replace />
  }

  const centered = (children: React.ReactNode) => (
    <Card>
      <CardContent>
        <Stack spacing={2} sx={{ py: 4, alignItems: 'center' }}>
          {children}
        </Stack>
      </CardContent>
    </Card>
  )

  if (!job) return centered(<CircularProgress />)
  if (failed && !ready) {
    return centered(
      <>
        <Button onClick={reload}>重新加载</Button>
      </>,
    )
  }
  if (!ready || !result) return centered(<CircularProgress />)
  return (
    <Card aria-live="polite">
      <CardContent>
        <ResultView
          key={id}
          view="scroll"
          result={result}
          jobId={id}
          audioUrl={jobAudioUrl(id)}
          coverUrl={job.cover_ext ? jobCoverUrl(id) : null}
        />
      </CardContent>
    </Card>
  )
}
