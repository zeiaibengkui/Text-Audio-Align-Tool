import { useLocation } from 'react-router'
import { useJobs } from './jobs-context'

export interface Step {
  label: string
  to: string | null
}

/**
 * 向导的四步及其可达性：路由里的 job id 优先，其次最近一个任务。
 * 「对齐」要有任务才能进，「渲染」还要那个任务已经 done。
 */
export function useSteps() {
  const { jobs } = useJobs()
  const path = useLocation().pathname
  const inJobs = path.includes('/jobs/')
  const routeJobId = inJobs ? path.split('/jobs/')[1]?.split('/')[0] : null
  const currentJobId = routeJobId ?? jobs[0]?.id ?? null
  const currentJob = currentJobId ? jobs.find((j) => j.id === currentJobId) : null
  const activeIdx =
    path === '/' ? 0 : path === '/create' ? 1 : inJobs ? (path.includes('/render') ? 3 : 2) : -1

  const steps: Step[] = [
    { label: '任务', to: '/' },
    { label: '新建', to: '/create' },
    { label: '对齐', to: currentJobId ? `/jobs/${currentJobId}` : null },
    {
      label: '渲染',
      to: currentJob?.status === 'done' ? `/jobs/${currentJobId}/render` : null,
    },
  ]

  return { steps, activeIdx, currentJobId }
}
