import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { STAGE_LABEL, fmtTime } from '../format'
import { useJobs } from '../jobs-context'
import { ACTIVE_STATUSES } from '../types'
import { useJob } from '../useJob'

const MISSING = '任务不存在'

export default function AlignPage() {
  const { id } = useParams()
  const { retryJob } = useJobs()
  const { job, error, reload } = useJob(id ?? '', 2000)
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

  const retryBlock = (
    <>
      <button className="btn" onClick={onRetry}>
        重新对齐
      </button>
      {retryError && <p className="form-error">{retryError}</p>}
    </>
  )

  return (
    <section className="panel result" aria-live="polite">
      {error ? (
        <div className="result-empty">
          <p className="form-error">{error === MISSING ? '任务不存在或已被删除' : error}</p>
          <p className="result-sub">
            <button className="btn" onClick={reload}>
              重新加载
            </button>
          </p>
          <p className="result-sub">
            <Link to="/">返回任务列表</Link>
          </p>
        </div>
      ) : !job ? (
        <div className="result-empty">
          <p>加载中…</p>
        </div>
      ) : ACTIVE_STATUSES.includes(job.status) ? (
        <>
          <div className="result-empty">
            <p>{STAGE_LABEL[job.stage ?? 'queued']}</p>
            <p className="result-sub">对齐需要几秒到几分钟，页面会自动更新。</p>
          </div>
          <div className="result-progress">
            <span className="progress">
              <span
                className="progress-fill"
                style={{ width: `${Math.max(2, job.progress * 100)}%` }}
              />
            </span>
          </div>
        </>
      ) : job.status === 'done' ? (
        <div className="result-empty">
          <p>{STAGE_LABEL.done}</p>
          <p className="result-sub">
            {fmtTime(job.duration)} · {job.word_count} 词 · {job.cue_count} 条
          </p>
          <p className="result-sub">
            <Link className="btn" to={`/jobs/${id}/render`}>
              下一步：渲染
            </Link>
          </p>
        </div>
      ) : (
        <div className="result-empty">
          <p className="form-error">{job.error ?? STAGE_LABEL[job.status]}</p>
          <p className="result-sub">{retryBlock}</p>
          <p className="result-sub">
            <Link to="/">返回任务列表</Link>
          </p>
        </div>
      )}
    </section>
  )
}
