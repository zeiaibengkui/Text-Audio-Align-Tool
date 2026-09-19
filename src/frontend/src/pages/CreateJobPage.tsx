import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import FormHelperText from '@mui/material/FormHelperText'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AudioFileIcon from '@mui/icons-material/AudioFile'
import ImageIcon from '@mui/icons-material/Image'
import { useJobs } from '../jobs-context'

const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.m4a,.ogg,.flac,.opus,.aac'
const IMAGE_ACCEPT = 'image/*,.jpg,.jpeg,.png,.webp'

/** 文件选择：MUI 的 Button-as-label 写法，选中的文件名进 helper text。 */
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
  icon: ReactNode
  onPick: (f: File | null) => void
}) {
  return (
    <Stack spacing={1}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Button variant="outlined" component="label" startIcon={icon}>
        {file ? '重新选择' : '选择文件'}
        <input
          hidden
          type="file"
          accept={accept}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onPick(e.target.files?.[0] ?? null)}
        />
      </Button>
      <FormHelperText>{file?.name ?? hint}</FormHelperText>
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
      void navigate(`/jobs/${job.id}`)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader title="新建任务" />
      <Stack component="form" spacing={2} onSubmit={onSubmit} sx={{ px: 2, pb: 2 }}>
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
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <FileField
          label="封面（可选）"
          accept={IMAGE_ACCEPT}
          file={coverFile}
          hint="会画在卷轴起首，也用作导出视频的首帧"
          icon={<ImageIcon />}
          onPick={setCoverFile}
        />

        <Button type="submit" variant="contained" disabled={submitting}>
          {submitting ? '正在提交…' : '开始对齐'}
        </Button>
        {formError && <Alert severity="error">{formError}</Alert>}
      </Stack>
    </Card>
  )
}
