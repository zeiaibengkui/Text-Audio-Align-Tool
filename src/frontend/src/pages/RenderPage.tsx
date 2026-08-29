import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { getResult, jobAudioUrl, jobCoverUrl } from '../api'
import { ResultView } from '../components/ResultView'
import type { JobResult } from '../types'
import { useJob } from '../useJob'

export default function RenderPage() {
  const { id } = useParams()
  const { job, error } = useJob(id ?? '', 0)
  const [resultFor, setResultFor] = useState<string | null>(null)
  const [result, setResult] = useState<JobResult | null>(null)
  const [resultError, setResultError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!id || !job || job.status !== 'done') return
    let live = true
    getResult(id)
      .then((d) => {
        if (!live) return
        setResultFor(id)
        setResult(d)
      })
      .catch(() => live && setResultError(true))
    return () => {
      live = false
    }
  }, [id, job, attempt])

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
  if (resultFor === id && resultError) {
    return (
      <section className="panel result">
        <div className="result-empty">
          <p>结果加载失败，请刷新重试。</p>
          <p className="result-sub">
            <button className="btn" onClick={() => setAttempt((n) => n + 1)}>
              重新加载
            </button>
          </p>
        </div>
      </section>
    )
  }
  if (resultFor !== id || !result) {
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
        result={result}
        jobId={id}
        audioUrl={jobAudioUrl(id)}
        coverUrl={job.cover_ext ? jobCoverUrl(id) : null}
      />
    </section>
  )
}
