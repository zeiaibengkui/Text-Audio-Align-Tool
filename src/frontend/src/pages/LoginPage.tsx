import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useJobs } from '../jobs-context'

export default function LoginPage() {
  const { auth, login } = useJobs()
  const navigate = useNavigate()
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // 已经进来了（或服务端根本没设口令）就别停在登录页
  if (auth === 'in') return <Navigate to="/" replace />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!token.trim()) {
      setError('请输入访问口令')
      return
    }
    setBusy(true)
    setError('')
    try {
      await login(token.trim())
      void navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container maxWidth="xs" sx={{ py: 8 }}>
      <Card>
        <CardHeader title="文本·音频对齐" />
        <CardContent>
          <Stack component="form" spacing={2} onSubmit={onSubmit}>
            <Typography color="text.secondary">
              这台服务只给知道口令的人用。口令由部署者在服务端设置。
            </Typography>
            <TextField
              type="password"
              label="口令"
              autoFocus
              autoComplete="current-password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <Button type="submit" variant="contained" disabled={busy}>
              {busy ? '验证中…' : '进入'}
            </Button>
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </CardContent>
      </Card>
    </Container>
  )
}
