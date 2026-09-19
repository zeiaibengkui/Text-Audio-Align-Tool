import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useJobs } from '../jobs-context'

/** 没登录就别渲染工作台；'loading'（还没问到 /api/me）期间先不画，免得闪一下登录页。 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { auth } = useJobs()

  if (auth === 'loading') return null
  if (auth === 'out') return <Navigate to="/login" replace />
  return <>{children}</>
}
