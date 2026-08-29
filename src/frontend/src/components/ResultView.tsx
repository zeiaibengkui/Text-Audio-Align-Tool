import { useState } from 'react'
import { ScrollPlayer } from '../ScrollPlayer'
import { fmtTime } from '../format'
import type { JobResult } from '../types'
import { CuesPlayer } from './CuesPlayer'

export function ResultView({
  result,
  jobId,
  audioUrl,
  coverUrl,
}: {
  result: JobResult
  jobId: string
  audioUrl: string
  coverUrl: string | null
}) {
  const [view, setView] = useState<'cues' | 'scroll'>('cues')

  return (
    <>
      <header className="result-head">
        <div className="result-head-row">
          <h2 className="result-title">{result.text.slice(0, 24)}…</h2>
          <div className="view-switch" role="tablist" aria-label="视图">
            <button
              className={'seg' + (view === 'cues' ? ' seg-on' : '')}
              onClick={() => setView('cues')}
              role="tab"
              aria-selected={view === 'cues'}
            >
              字幕表
            </button>
            <button
              className={'seg' + (view === 'scroll' ? ' seg-on' : '')}
              onClick={() => setView('scroll')}
              role="tab"
              aria-selected={view === 'scroll'}
            >
              竹简卷轴
            </button>
          </div>
        </div>
        <p className="result-stats">
          时长 {fmtTime(result.duration)} · {result.words.length} 词 ·{' '}
          {result.cues.length} 条字幕
        </p>
      </header>
      {view === 'scroll' ? (
        <ScrollPlayer
          key={jobId}
          result={result}
          audioUrl={audioUrl}
          jobId={jobId}
          coverUrl={coverUrl}
        />
      ) : (
        <CuesPlayer key={jobId} result={result} audioUrl={audioUrl} />
      )}
    </>
  )
}
