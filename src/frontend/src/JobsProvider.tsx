import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as api from './api'
import { JobsContext, type ServerState } from './jobs-context'
import { ACTIVE_STATUSES, type JobMeta } from './types'

export function JobsProvider({ children }: { children: ReactNode }) {
  const [server, setServer] = useState<ServerState>('loading')
  const [jobs, setJobs] = useState<JobMeta[]>([])

  // ---- server health (one-shot) ----
  useEffect(() => {
    let live = true
    api
      .getHealth()
      .then((h) => live && setServer(h))
      .catch(() => live && setServer('down'))
    return () => {
      live = false
    }
  }, [])

  // ---- job list (poll fast while anything is active) ----
  const hasActive = jobs.some((j) => ACTIVE_STATUSES.includes(j.status))
  useEffect(() => {
    let live = true
    const load = () =>
      api
        .listJobs()
        .then((js) => {
          if (live) setJobs(js)
        })
        .catch(() => {})
    // schedule the first fetch off the effect's synchronous path
    const id = setInterval(load, hasActive ? 2000 : 15000)
    const first = setTimeout(load, 0)
    return () => {
      live = false
      clearInterval(id)
      clearTimeout(first)
    }
  }, [hasActive])

  // ---- wrappers keep the list fresh for the stepper ----
  const createJob = useCallback(
    async (audio: File, text: string, cover?: File | null) => {
      const job = await api.createJob(audio, text, cover)
      setJobs((prev) => [job, ...prev])
      return job
    },
    [],
  )

  const retryJob = useCallback(async (id: string) => {
    const updated = await api.retryJob(id)
    setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)))
    return updated
  }, [])

  const deleteJob = useCallback(async (id: string) => {
    await api.deleteJob(id)
    setJobs((prev) => prev.filter((j) => j.id !== id))
  }, [])

  const value = useMemo(
    () => ({ server, jobs, createJob, deleteJob, retryJob }),
    [server, jobs, createJob, deleteJob, retryJob],
  )

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>
}
