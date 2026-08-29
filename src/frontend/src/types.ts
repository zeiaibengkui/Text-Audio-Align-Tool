export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export interface JobMeta {
  id: string
  name: string
  status: JobStatus
  stage: string | null
  progress: number
  audio_ext: string
  cover_ext: string | null
  created_at: string
  updated_at: string
  duration: number | null
  word_count: number | null
  cue_count: number | null
  error: string | null
}

export interface Word {
  text: string
  start: number
  end: number
}

export interface Cue {
  text: string
  start: number
  end: number
}

export interface JobResult {
  audio: string
  duration: number
  text: string
  words: Word[]
  cues: Cue[]
}

export interface Health {
  ok: boolean
  fake: boolean
  device: string
}

export const ACTIVE_STATUSES: JobStatus[] = ['queued', 'running']
