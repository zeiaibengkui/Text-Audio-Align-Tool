import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useJobs } from '../jobs-context'

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
    <section className="page-narrow">
      <form className="panel form" onSubmit={onSubmit}>
        <h2 className="panel-title">新建任务</h2>
        <label className="field">
          <span className="field-label">音频文件</span>
          <input
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.opus,.aac"
            onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
          />
          {audioFile && <span className="file-hint">{audioFile.name}</span>}
        </label>
        <label className="field">
          <span className="field-label">文本</span>
          <textarea
            rows={8}
            placeholder="粘贴或输入要对齐的中文文本"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">封面（可选）</span>
          <input
            type="file"
            accept="image/*,.jpg,.jpeg,.png,.webp"
            onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
          />
          {coverFile && <span className="file-hint">{coverFile.name}</span>}
        </label>
        <button className="btn" type="submit" disabled={submitting}>
          {submitting ? '正在提交…' : '开始对齐'}
        </button>
        {formError && <p className="form-error">{formError}</p>}
      </form>
      <p className="back-link">
        <Link to="/">返回任务列表</Link>
      </p>
    </section>
  )
}
