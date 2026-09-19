import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as api from './api'
import { JobsContext, type AuthState, type ServerState } from './jobs-context'
import { ACTIVE_STATUSES, type JobMeta } from './types'

export function JobsProvider({ children }: { children: ReactNode }) {
  const [server, setServer] = useState<ServerState>('loading')
  const [auth, setAuth] = useState<AuthState>('loading')
  const [authRequired, setAuthRequired] = useState(false)
  const [jobs, setJobs] = useState<JobMeta[]>([])

  // 会话过期（或另一处登出）时后端回 401，统一在这里退回登录页
  useEffect(() => {
    api.setUnauthorizedHandler(() => setAuth('out'))
    return () => api.setUnauthorizedHandler(null)
  }, [])

  // ---- 进站先问 /api/me：要不要口令、我算不算已登录 ----
  useEffect(() => {
    let live = true
    api
      .getMe()
      .then((m) => {
        if (!live) return
        setAuthRequired(m.required)
        setAuth(m.authed ? 'in' : 'out')
      })
      .catch(() => live && setAuth('out'))
    return () => {
      live = false
    }
  }, [])

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
    if (auth !== 'in') return   // 没登录就别轮询，省得刷一屏 401
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
  }, [hasActive, auth])

  const login = useCallback(async (token: string) => {
    await api.login(token)   // 口令不对会带着后端的「口令不对」抛出来
    setAuth('in')
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setAuth('out')
      setJobs([])
    }
  }, [])

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
    () => ({ server, auth, authRequired, login, logout, jobs, createJob, deleteJob, retryJob }),
    [server, auth, authRequired, login, logout, jobs, createJob, deleteJob, retryJob],
  )

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>
}
