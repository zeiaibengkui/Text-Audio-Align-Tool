import { Navigate, useParams } from 'react-router'
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
  if (!job) {
    return (
      <section className="panel result">
        <div className="result-empty">
          <p>加载中…</p>
        </div>
      </section>
    )
  }
  if (failed && !ready) {
    return (
      <section className="panel result">
        <div className="result-empty">
          <p>结果加载失败，请刷新重试。</p>
          <p className="result-sub">
            <button className="btn" onClick={reload}>
              重新加载
            </button>
          </p>
        </div>
      </section>
    )
  }
  if (!ready || !result) {
    return (
      <section className="panel result">
        <div className="result-empty">
          <p>加载中…</p>
        </div>
      </section>
    )
  }
  return (
    <section className="panel result" aria-live="polite">
      <ResultView
        key={id}
        view="scroll"
        result={result}
        jobId={id}
        audioUrl={jobAudioUrl(id)}
        coverUrl={job.cover_ext ? jobCoverUrl(id) : null}
      />
    </section>
  )
}
