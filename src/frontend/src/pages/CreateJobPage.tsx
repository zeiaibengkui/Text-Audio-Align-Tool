import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AudioFileIcon from '@mui/icons-material/AudioFile'
import ImageIcon from '@mui/icons-material/Image'
import { useJobs } from '../jobs-context'

const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.m4a,.ogg,.flac,.opus,.aac'
const IMAGE_ACCEPT = 'image/*,.jpg,.jpeg,.png,.webp'

/** 文件选择：按钮 + 下面一行文件名，手机上好点得多。 */
function FileField({
  label,
  accept,
  file,
  hint,
  icon,
  onPick,
}: {
  label: string
  accept: string
  file: File | null
  hint: string
  icon: React.ReactNode
  onPick: (f: File | null) => void
}) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Button variant="outlined" component="label" startIcon={icon} size="large">
        {file ? '重新选择' : '选择文件'}
        <Box
          component="input"
          type="file"
          accept={accept}
          sx={{ display: 'none' }}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onPick(e.target.files?.[0] ?? null)
          }
        />
      </Button>
      <Typography variant="caption" sx={{ color: file ? 'text.primary' : 'text.disabled' }}>
        {file?.name ?? hint}
      </Typography>
    </Stack>
  )
}

export default function CreateJobPage() {
  const { createJob } = useJobs()
  const navigate = useNavigate()
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!audioFile || !text.trim()) {
      setFormError('请选择音频文件并输入文本')
      return
    }
    setSubmitting(true)
    setFormError('')
    try {
      const job = await createJob(audioFile, text.trim(), coverFile)
      setAudioFile(null)
      setCoverFile(null)
      setText('')
      navigate(`/jobs/${job.id}`)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <Stack component="form" spacing={2.5} sx={{ p: 2 }} onSubmit={onSubmit}>
        <Typography variant="h2">新建任务</Typography>

        <FileField
          label="音频文件"
          accept={AUDIO_ACCEPT}
          file={audioFile}
          hint="mp3 / wav / m4a / flac 都可以，交给 ffmpeg 转码"
          icon={<AudioFileIcon />}
          onPick={setAudioFile}
        />

        <TextField
          label="文本"
          placeholder="粘贴或输入要对齐的中文文本"
          multiline
          minRows={8}
          fullWidth
          value={text}
          onChange={(e) => setText(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <FileField
          label="封面（可选）"
          accept={IMAGE_ACCEPT}
          file={coverFile}
          hint="会画在卷轴起首，也用作导出视频的首帧"
          icon={<ImageIcon />}
          onPick={setCoverFile}
        />

        <Button type="submit" variant="contained" size="large" disabled={submitting}>
          {submitting ? '正在提交…' : '开始对齐'}
        </Button>
        {formError && (
          <Typography color="primary.dark" sx={{ fontSize: 13 }}>
            {formError}
          </Typography>
        )}
      </Stack>
    </Card>
  )
}
