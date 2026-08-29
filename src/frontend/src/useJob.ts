import { useCallback, useEffect, useState } from 'react'
import { getJob } from './api'
import { ACTIVE_STATUSES, type JobMeta } from './types'

/**
 * 单任务状态：id 变化时取一次；任务处于排队/运行中且 pollMs>0 时轮询，
 * 进入终态或出错即停止。reload() 强制重新拉取。
 */
export function useJob(
  id: string,
  pollMs = 0,
): { job: JobMeta | null; error: string | null; reload: () => void } {
  const [job, setJob] = useState<JobMeta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const fetchOnce = useCallback((live: () => boolean) => {
    getJob(id)
      .then((j) => {
        if (!live()) return
        setJob(j)
        setError(null)
      })
      .catch((e) => {
        if (!live()) return
        setJob(null)
        setError(e instanceof Error ? e.message : '加载失败')
      })
  }, [id])

  // one-shot fetch on id / reload (id 为空时页面会立即跳走，无需重置)
  useEffect(() => {
    let alive = true
    if (id) fetchOnce(() => alive)
    return () => {
      alive = false
    }
  }, [id, attempt, fetchOnce])

  // poll while the job is active (deps on status keep it restarting/stopping)
  const status = job?.status ?? null
  useEffect(() => {
    if (pollMs <= 0 || !status || !ACTIVE_STATUSES.includes(status)) return
    let alive = true
    const iv = setInterval(() => fetchOnce(() => alive), pollMs)
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [id, pollMs, status, attempt, fetchOnce])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  return { job, error, reload }
}
