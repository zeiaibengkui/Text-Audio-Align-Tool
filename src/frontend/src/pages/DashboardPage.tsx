import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { STAGE_LABEL, fmtTime } from '../format'
import { useJobs } from '../jobs-context'

export default function DashboardPage() {
  const { jobs, deleteJob, retryJob } = useJobs()
  const navigate = useNavigate()
  const [actionError, setActionError] = useState('')

  const openJob = (id: string) => navigate(`/jobs/${id}`)

  const onDelete = (id: string) =>
    deleteJob(id).catch((err) =>
      setActionError(err instanceof Error ? err.message : '删除失败'),
    )

  const onRetry = (id: string) =>
    retryJob(id)
      .then(() => openJob(id))
      .catch((err) =>
        setActionError(err instanceof Error ? err.message : '重试失败'),
      )

  return (
    <section className="panel jobs">
      <div className="panel-title-row">
        <h2 className="panel-title">
          任务
          <span className="count">{jobs.length}</span>
        </h2>
        <Link className="btn" to="/create">
          新建任务
        </Link>
      </div>
      {actionError && <p className="form-error">{actionError}</p>}
      {jobs.length === 0 && (
        <p className="empty">还没有任务。点击“新建任务”，提交音频与文本开始第一次对齐。</p>
      )}
      <ul className="job-list">
        {jobs.map((job) => (
          <li key={job.id}>
            <div
              className="job-row"
              role="button"
              tabIndex={0}
              onClick={() => openJob(job.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') openJob(job.id)
              }}
            >
              <span className={`badge badge-${job.status}`}>{job.status}</span>
              <div className="job-main">
                <span className="job-name" title={job.name}>
                  {job.name}
                </span>
                <span className="job-meta">
                  {job.status === 'running' || job.status === 'queued'
                    ? `${STAGE_LABEL[job.stage ?? 'queued'] ?? job.stage} · ${Math.round(job.progress * 100)}%`
                    : job.status === 'done'
                      ? `${fmtTime(job.duration)} · ${job.word_count} 词 · ${job.cue_count} 条`
                      : (job.error ?? STAGE_LABEL[job.status])}
                </span>
                {(job.status === 'running' || job.status === 'queued') && (
                  <span className="progress">
                    <span
                      className="progress-fill"
                      style={{ width: `${Math.max(2, job.progress * 100)}%` }}
                    />
                  </span>
                )}
              </div>
              {(job.status === 'failed' || job.status === 'cancelled') && (
                <button
                  className="job-action job-retry"
                  title="重新对齐"
                  aria-label="重新对齐"
                  onClick={(e) => {
                    e.stopPropagation()
                    void onRetry(job.id)
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                    <path d="M21 3v6h-6" />
                  </svg>
                </button>
              )}
              <button
                className="job-action"
                title="删除任务"
                aria-label="删除任务"
                onClick={(e) => {
                  e.stopPropagation()
                  void onDelete(job.id)
                }}
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
