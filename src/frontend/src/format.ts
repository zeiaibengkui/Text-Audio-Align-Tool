export const STAGE_LABEL: Record<string, string> = {
  queued: '排队中',
  loading_model: '加载模型',
  validating: '校验',
  aligning: '对齐中',
  smoothing: '平滑时间戳',
  done: '完成',
  failed: '失败',
  cancelled: '已取消',
}

export function fmtTime(sec: number | null | undefined, decimals = 0): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '--:--'
  const m = Math.floor(sec / 60)
  const s = (sec - m * 60).toFixed(decimals)
  // 秒数补成「两位整数 + 小数点 + decimals 位小数」：1:40 / 0:00.0 / 0:03.45
  return `${m}:${s.padStart(decimals > 0 ? 3 + decimals : 2, '0')}`
}
