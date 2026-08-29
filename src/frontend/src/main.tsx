import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import './index.css'
import App from './App.tsx'
import { JobsProvider } from './JobsProvider'
import AlignPage from './pages/AlignPage'
import CreateJobPage from './pages/CreateJobPage'
import DashboardPage from './pages/DashboardPage'
import RenderPage from './pages/RenderPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'create', element: <CreateJobPage /> },
      { path: 'jobs/:id', element: <AlignPage /> },
      { path: 'jobs/:id/render', element: <RenderPage /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <JobsProvider>
      <RouterProvider router={router} />
    </JobsProvider>
  </StrictMode>,
)
