import { ScrollPlayer } from '../ScrollPlayer'
import { fmtTime } from '../format'
import type { JobResult } from '../types'
import { CuesPlayer } from './CuesPlayer'

/**
 * 分步视图：对齐步骤看字幕表（view='cues'），渲染步骤看竹简卷轴
 * （view='scroll'）。两种视图不再互切，各自归属一个向导步骤。
 */
export function ResultView({
  result,
  jobId,
  audioUrl,
  coverUrl,
  view,
}: {
  result: JobResult
  jobId: string
  audioUrl: string
  coverUrl: string | null
  view: 'cues' | 'scroll'
}) {
  return (
    <>
      <header className="result-head">
        <div className="result-head-row">
          <h2 className="result-title">{result.text.slice(0, 24)}…</h2>
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
