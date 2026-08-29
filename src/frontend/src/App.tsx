import { Link, Outlet } from 'react-router'
import { Stepper } from './components/Stepper'
import { useJobs } from './jobs-context'
import './App.css'

function App() {
  const { server } = useJobs()

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          <Link to="/" className="home-link">
            文本·音频对齐
          </Link>
        </h1>
        <div className="topbar-right">
          {server === 'down' && (
            <span className="chip chip-danger" role="alert">
              后端未连接
            </span>
          )}
          {server && server !== 'down' && server !== 'loading' && (
            <span className="chip">{server.fake ? '假对齐模式' : '真实模型'}</span>
          )}
        </div>
      </header>

      {server === 'down' && (
        <div className="banner" role="alert">
          无法连接后端服务。先在仓库里启动它，再刷新本页：
          <code>
            cd src &amp;&amp; ALIGN_FAKE=1 ../.venv/bin/python
            server.py
          </code>
        </div>
      )}

      <Stepper />

      <Outlet />
    </div>
  )
}

export default App
