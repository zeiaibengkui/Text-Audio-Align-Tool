import { createContext, useContext } from 'react'
import type { Health, JobMeta } from './types'

export type ServerState = Health | 'down' | 'loading'

export interface JobsContextValue {
  server: ServerState
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
