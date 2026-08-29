import { useCallback, useEffect, useState } from 'react'
import { getResult } from './api'
import type { JobResult } from './types'

/**
 * 一次结果拉取：id/active 变化时取一次，进入终态即定；reload() 强制重取。
 * ready=False 时 result 一定为 null（不会拿旧 id 的缓存冒充）。
 */
export function useResult(id: string, active: boolean) {
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [result, setResult] = useState<JobResult | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!id || !active) return
    let live = true
    getResult(id)
      .then((d) => {
        if (!live) return
        setResult(d)
        setLoadedFor(id)
        setFailed(false)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [id, active, attempt])

  const ready = loadedFor === id && !failed
  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  return { ready, result: ready ? result : null, failed, reload }
}
