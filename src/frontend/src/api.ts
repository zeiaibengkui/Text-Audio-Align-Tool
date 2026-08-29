import type { Health, JobMeta, JobResult } from './types'

const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init)
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      // no JSON body — keep the status message
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export function listJobs(): Promise<JobMeta[]> {
  return request('/jobs')
}

export function getHealth(): Promise<Health> {
  return request('/health')
}

export function createJob(
  audio: File,
  text: string,
  cover?: File | null,
): Promise<JobMeta> {
  const form = new FormData()
  form.append('audio', audio)
  form.append('text', text)
  if (cover) form.append('cover', cover)
  return request('/jobs', { method: 'POST', body: form })
}

export function deleteJob(id: string): Promise<void> {
  return request(`/jobs/${id}`, { method: 'DELETE' })
}

export function retryJob(id: string): Promise<JobMeta> {
  return request(`/jobs/${id}/retry`, { method: 'POST' })
}

export function getResult(id: string): Promise<JobResult> {
  return request(`/jobs/${id}/result`)
}

export const jobAudioUrl = (id: string) => `${BASE}/jobs/${id}/audio`

export const jobCoverUrl = (id: string) => `${BASE}/jobs/${id}/cover`

export interface ExportState {
  status: 'none' | 'queued' | 'rendering' | 'done' | 'failed'
  progress?: number | null
  error?: string | null
}

export function startExport(id: string): Promise<ExportState> {
  return request(`/jobs/${id}/export`, { method: 'POST' })
}

export function getExport(id: string): Promise<ExportState> {
  return request(`/jobs/${id}/export`)
}

export const exportVideoUrl = (id: string) => `${BASE}/jobs/${id}/export.mp4`
