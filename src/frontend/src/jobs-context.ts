import { createContext, useContext } from 'react'
import type { Health, JobMeta } from './types'

export type ServerState = Health | 'down' | 'loading'

/** loading = 还没问到 /api/me；in = 放行（已登录，或服务端根本没设口令）。 */
export type AuthState = 'loading' | 'in' | 'out'

export interface JobsContextValue {
  server: ServerState
  auth: AuthState
  /** 服务端是否配置了口令——没配就不显示「退出」这类入口 */
  authRequired: boolean
  login: (token: string) => Promise<void>
  logout: () => Promise<void>
  jobs: JobMeta[]
  createJob: (audio: File, text: string, cover?: File | null) => Promise<JobMeta>
  deleteJob: (id: string) => Promise<void>
  retryJob: (id: string) => Promise<JobMeta>
}

export const JobsContext = createContext<JobsContextValue | null>(null)

export function useJobs(): JobsContextValue {
  const ctx = useContext(JobsContext)
  if (!ctx) throw new Error('useJobs must be used inside <JobsProvider>')
  return ctx
}
