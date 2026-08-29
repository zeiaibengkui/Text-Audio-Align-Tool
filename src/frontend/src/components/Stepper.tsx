import { Fragment } from 'react'
import { Link, useLocation } from 'react-router'
import { useJobs } from '../jobs-context'

interface Step {
  label: string
  to: string | null
}

export function Stepper() {
  const { jobs } = useJobs()
  const path = useLocation().pathname
  const m = path.includes('/jobs/')
  const m2 = path.includes('/render')
  const routeJobId = m ? path.split('/jobs/')[1]?.split('/')[0] : null
  const currentJobId = routeJobId ?? jobs[0]?.id ?? null
  const currentJob = currentJobId ? jobs.find((j) => j.id === currentJobId) : null
  const activeIdx = path === '/' ? 0 : path === '/create' ? 1 : m ? (m2 ? 3 : 2) : -1

  const steps: Step[] = [
    { label: '任务列表', to: '/' },
    { label: '新建任务', to: '/create' },
    { label: '对齐', to: currentJobId ? `/jobs/${currentJobId}` : null },
    {
      label: '渲染',
      to: currentJob?.status === 'done' ? `/jobs/${currentJobId}/render` : null,
    },
  ]

  return (
    <ol className="stepper" aria-label="步骤">
      {steps.map((s, i) => {
        const cls =
          'step' +
          (i === activeIdx ? ' step-active' : i < activeIdx ? ' step-done' : '') +
          (s.to === null ? ' step-disabled' : '')
        const num = (
          <span className="step-num" aria-hidden="true">
            {i + 1}
          </span>
        )
        const label = <span className="step-label">{s.label}</span>
        return (
          <Fragment key={s.label}>
            {i > 0 && (
              <li
                className={'step-sep' + (i <= activeIdx ? ' on' : '')}
                aria-hidden="true"
              />
            )}
            <li className={cls} aria-current={i === activeIdx ? 'step' : undefined}>
              {s.to ? (
                <Link className="step-link" to={s.to}>
                  {num}
                  {label}
                </Link>
              ) : (
                <span className="step-link-disabled">
                  {num}
                  {label}
                </span>
              )}
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}
