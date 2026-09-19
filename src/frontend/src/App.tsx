import { Link, Outlet, useNavigate } from 'react-router'
import AppBar from '@mui/material/AppBar'
import Alert from '@mui/material/Alert'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
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

  return (
    <Box sx={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="sticky">
        <Toolbar sx={{ gap: 1, px: { xs: 2, sm: 3 } }}>
          <Typography
            variant="h1"
            component={Link}
            to="/"
            sx={{
              fontSize: { xs: 17, sm: 20 },
              color: 'inherit',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            文本·音频对齐
          </Typography>

          {/* 桌面：四步摆在顶栏；手机：走底部导航 */}
          <Tabs
            value={activeIdx < 0 ? false : activeIdx}
            sx={{ ml: 3, display: { xs: 'none', md: 'flex' } }}
          >
            {steps.map((s) => (
              <Tab
                key={s.label}
                label={s.label}
                component={Link}
                to={s.to ?? '#'}
                disabled={s.to === null}
              />
            ))}
          </Tabs>

          <Box sx={{ flexGrow: 1 }} />

          {server === 'down' && (
            <Chip size="small" color="primary" variant="outlined" label="后端未连接" role="alert" />
          )}
          {health && <Chip size="small" variant="outlined" label={health.device} />}
          {authRequired && auth === 'in' && (
            <Tooltip title="退出登录">
              <IconButton onClick={() => void logout()} aria-label="退出登录" sx={{ ml: 0.5 }}>
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Toolbar>
      </AppBar>

      <Container
        maxWidth="sm"
        sx={{
          flexGrow: 1,
          py: { xs: 2, md: 3 },
          maxWidth: { md: 860 }, // 桌面比手机宽一些，但不是另一套布局
          // 给固定的底部导航让位（含 iPhone home 指示条）
          pb: 'calc(80px + env(safe-area-inset-bottom))',
          '@media (min-width: 900px)': { pb: 4 },
        }}
      >
        {server === 'down' && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            无法连接后端服务。先在仓库里启动它，再刷新本页：
            <Box component="code" sx={{ ml: 0.5, wordBreak: 'break-all' }}>
              cd src &amp;&amp; ../.venv/bin/python server.py
            </Box>
          </Alert>
        )}
        <Outlet />
      </Container>

      {/* 手机：贴底的四步导航，一屏一指可及 */}
      <Paper
        square
        sx={{
          position: 'fixed',
          insetInline: 0,
          bottom: 0,
          zIndex: (t) => t.zIndex.appBar,
          display: { xs: 'block', md: 'none' },
          pb: 'env(safe-area-inset-bottom)',
        }}
      >
        <BottomNavigation
          showLabels
          value={activeIdx < 0 ? false : activeIdx}
          onChange={(_, v: number) => {
            const to = steps[v]?.to
            if (to) navigate(to)
          }}
        >
          {steps.map((s, i) => (
            <BottomNavigationAction
              key={s.label}
              label={s.label}
              icon={STEP_ICONS[i]}
              disabled={s.to === null}
            />
          ))}
        </BottomNavigation>
      </Paper>
    </Box>
  )
}

export default App
