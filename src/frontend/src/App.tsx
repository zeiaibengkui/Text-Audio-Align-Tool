import { Link as RouterLink, Outlet, useNavigate } from 'react-router'
import AppBar from '@mui/material/AppBar'
import Alert from '@mui/material/Alert'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import AddCircleIcon from '@mui/icons-material/AddCircle'
import AutoStoriesIcon from '@mui/icons-material/AutoStories'
import GraphicEqIcon from '@mui/icons-material/GraphicEq'
import ListAltIcon from '@mui/icons-material/ListAlt'
import LogoutIcon from '@mui/icons-material/Logout'
import { useJobs } from './jobs-context'
import { useSteps } from './steps'

const STEP_ICONS = [
  <ListAltIcon key="list" />,
  <AddCircleIcon key="new" />,
  <GraphicEqIcon key="align" />,
  <AutoStoriesIcon key="render" />,
]

function App() {
  const { server, auth, authRequired, logout } = useJobs()
  const { steps, activeIdx } = useSteps()
  const navigate = useNavigate()
  const health = server !== 'down' && server !== 'loading' ? server : null

  const go = (v: number) => {
    const to = steps[v]?.to
    if (to) void navigate(to)
  }

  return (
    <Box sx={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="sticky" color="inherit">
        <Toolbar>
          <Link component={RouterLink} to="/" variant="h6" color="inherit" underline="none">
            文本·音频对齐
          </Link>

          {/* 桌面：四步摆在顶栏；手机：走底部导航 */}
          <Tabs
            value={activeIdx < 0 ? false : activeIdx}
            onChange={(_, v: number) => go(v)}
            sx={{ ml: 3, display: { xs: 'none', md: 'flex' } }}
          >
            {steps.map((s) => (
              <Tab key={s.label} label={s.label} disabled={s.to === null} />
            ))}
          </Tabs>

          <Box sx={{ flexGrow: 1 }} />

          {server === 'down' && (
            <Chip color="error" label="后端未连接" role="alert" />
          )}
          {health && <Chip variant="outlined" label={health.device} />}
          {authRequired && auth === 'in' && (
            <Tooltip title="退出登录">
              <IconButton onClick={() => void logout()} aria-label="退出登录">
                <LogoutIcon />
              </IconButton>
            </Tooltip>
          )}
        </Toolbar>
      </AppBar>

      {/* pb 给固定的底部导航让位 */}
      <Container maxWidth="sm" sx={{ flexGrow: 1, py: 2, pb: 10 }}>
        {server === 'down' && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            无法连接后端服务。先在仓库里启动它，再刷新本页：cd src &amp;&amp;
            ../.venv/bin/python server.py
          </Alert>
        )}
        <Outlet />
      </Container>

      {/* 手机：贴底的四步导航 */}
      <Paper
        square
        sx={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: (t) => t.zIndex.appBar,
          display: { xs: 'block', md: 'none' },
        }}
      >
        <BottomNavigation value={activeIdx < 0 ? false : activeIdx} onChange={(_, v: number) => go(v)}>
          {steps.map((s, i) => (
            <BottomNavigationAction key={s.label} label={s.label} icon={STEP_ICONS[i]} disabled={s.to === null} />
          ))}
        </BottomNavigation>
      </Paper>
    </Box>
  )
}

export default App
