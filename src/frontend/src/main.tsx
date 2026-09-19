import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import App from './App.tsx'
import { JobsProvider } from './JobsProvider'
import { RequireAuth } from './components/RequireAuth'
import { theme } from './theme'
import AlignPage from './pages/AlignPage'
import CreateJobPage from './pages/CreateJobPage'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import RenderPage from './pages/RenderPage'

const router = createBrowserRouter([
  // 登录页在工作台之外：没有顶栏和底部导航
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <App />
      </RequireAuth>
    ),
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
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <JobsProvider>
        <RouterProvider router={router} />
      </JobsProvider>
    </ThemeProvider>
  </StrictMode>,
)
