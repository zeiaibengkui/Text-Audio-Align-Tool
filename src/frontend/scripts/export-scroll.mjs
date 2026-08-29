#!/usr/bin/env node
/**
 * 竹简卷轴 → MP4：无头渲染，与浏览器端 ScrollPlayer 共用 scroll.ts，
 * 帧画面完全一致。ScrollRenderer.draw(ctx, t) 只依赖绝对时间，因此把帧
 * 区间切成若干段并行渲染（同脚本 --range 子进程，各自 rawvideo 管道喂
 * ffmpeg 出段视频），最后 concat 段视频并混入原音频。
 *
 * 用法：
 *   node scripts/export-scroll.mjs --json <result.json|align.json> \
 *       --audio <audio|http://...> --out scroll.mp4 \
 *       [--fps 25] [--size 1280x720] [--rows 12] [--dur 12] [--no-audio]
 *       [--cover cover.jpg] [--segs 8]
 *
 * --segs 是分段数上限（默认 8，实际取 min(8, CPU 核数, 每段≥1200 帧)）；
 * 进度以 \rNN% 输出在 stdout，服务端按 \r(\d+)% 解析，契约不变。
 *
 * 依赖：@napi-rs/canvas（pnpm add -D @napi-rs/canvas）、ffmpeg 在 PATH。
 */

import { execFileSync, spawn } from 'node:child_process'
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas'
import { readFile } from 'node:fs/promises'
import { rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, resolve } from 'node:path'

import { ScrollRenderer } from '../src/scroll.ts'

// ---------- argparse ----------
const args = process.argv.slice(2)
function arg(name, def) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def
}
const jsonPath = arg('json')
const audioArg = arg('audio')
const outPath = arg('out', 'scroll.mp4')
const fps = Number(arg('fps', 25))
const [width, height] = String(arg('size', '1280x720'))
  .split('x')
  .map((n) => Number(n))
const rows = Number(arg('rows', 12))
const durOverride = Number(arg('dur', 0))
const coverPath = arg('cover')
const segsCap = Number(arg('segs', 8))
let noAudio = args.includes('--no-audio')

// 子进程段模式：--range 起点,终点（左闭右开），--seg 段序号（决定输出文件名）
const rangeArg = arg('range')
const isWorker = rangeArg != null
const [rangeA, rangeB] = isWorker ? rangeArg.split(',').map(Number) : [0, 0]
const segIndex = Number(arg('seg', 0))

if (!jsonPath) {
  console.error('用法：--json <result.json|align.json> [--audio ...] [--out out.mp4] ...')
  process.exit(1)
}

// ---------- 字体（注册系统 Noto 宋体，正立字形） ----------
const fontPath = execFileSync('fc-match', ['-f', '%{file}', 'Noto Serif CJK SC'], {
  encoding: 'utf8',
}).trim()
const fontName = 'ScrollExportSerif'
GlobalFonts.registerFromPath(fontPath, fontName)

// ---------- 数据 ----------
const raw = JSON.parse(await readFile(jsonPath, 'utf8'))
const duration = durOverride > 0 ? Math.min(durOverride, raw.duration) : raw.duration
let data = raw
if (duration < raw.duration) {
  // --dur 截断：裁剪词/字幕时间戳（逐字渐入摊平后其总量远超音频，必须同步截）
  const clip = (list) =>
    (list ?? []).filter((w) => w.start < duration).map((w) => ({ ...w, end: Math.min(w.end, duration) }))
  data = {
    ...raw,
    duration,
    words: clip(raw.words ?? []),
    cues: clip(raw.cues ?? []),
    text: (raw.words ?? []).filter((w) => w.start < duration).map((w) => w.text).join(''),
  }
}

// ---------- 音频解析：http 直读；相对路径按 json 同目录解析 ----------
const audioPath = audioArg
  ? audioArg
  : data.audio && !String(data.audio).startsWith('/')
    ? resolve(dirname(resolve(jsonPath)), data.audio)
    : data.audio
if (!noAudio && !audioPath) {
  console.error('未指定音频，跳过混音（--no-audio 可显式关闭）')
  noAudio = true
}

// ---------- 封面（可选，与浏览器同一 CoverSource 接口） ----------
let cover = null
if (coverPath) {
  const img = await loadImage(coverPath)
  if (img && img.width > 0 && img.height > 0) {
    cover = {
      width: img.width,
      height: img.height,
      draw: (ctx, x, y, w, h) => ctx.drawImage(img, x, y, w, h),
    }
  } else {
    console.error(`封面加载失败：${coverPath}`)
  }
}

// ---------- 渲染器 ----------
const canvas = createCanvas(width, height)
const ctx = canvas.getContext('2d')
const renderer = new ScrollRenderer(width, height, 1, data, {
  rows,
  font: fontName,
  cover,
})
const frames = Math.round(duration * fps)

// ---------- 子进程段：渲染 [rangeA, rangeB) 帧 → 段视频 ----------
async function renderRange() {
  const segFile = `${outPath}.seg${segIndex}.mp4`
  const ff = spawn(
    'ffmpeg',
    [
      '-y',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`,
      '-r', String(fps),
      '-i', '-',
      '-c:v', 'libx264', '-crf', '20', '-preset', 'medium',
      '-pix_fmt', 'yuv420p',
      '-an', segFile,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'], stdout: 'inherit' },
  )
  const writeFrame = (chunk) =>
    new Promise((ok, fail) => {
      ff.stdin.write(chunk, (e) => (e ? fail(e) : ok()))
    })
  const t0 = Date.now()
  for (let f = rangeA; f < rangeB; f++) {
    renderer.draw(ctx, f / fps)
    const buf = Buffer.from(ctx.getImageData(0, 0, width, height).data)
    await writeFrame(buf)
    if ((f - rangeA) % 10 === 0 || f === rangeB - 1) {
      const p = Math.round(((f - rangeA + 1) / (rangeB - rangeA)) * 100)
      process.stdout.write(`\r${p}%`)
    }
  }
  process.stdout.write('\n')
  ff.stdin.end()
  const rc = await new Promise((ok) => ff.on('close', ok))
  if (rc !== 0) {
    console.error(`段渲染失败（ffmpeg 退出码 ${rc}）`)
    process.exit(1)
  }
  process.stderr.write(`段 ${segIndex} 完成（${((Date.now() - t0) / 1000).toFixed(1)}s）\n`)
}

if (isWorker) {
  process.stderr.write(
    `段 ${segIndex} 渲染 ${rangeB - rangeA} 帧 [${rangeA},${rangeB}) @ ${fps}fps · ${width}x${height}\n`,
  )
  await renderRange()
  process.exit(0)
}

// ---------- 编排：切段 → 并发渲染 → concat+混音 ----------
console.log(
  `渲染 ${frames} 帧 · ${duration}s @ ${fps}fps · ${width}x${height} · 列高 ${rows}`,
)

const cpus = os.availableParallelism ? os.availableParallelism() : os.cpus().length
const segs = Math.max(1, Math.min(segsCap, cpus, Math.ceil(frames / 1200)))

const t0 = Date.now()
const segFiles = []
const procs = []
const pctDone = new Array(segs).fill(0)
let lastAgg = -1
const emitAgg = () => {
  const done = pctDone.reduce((s, p, i) => s + (p / 100) * (edges[i + 1] - edges[i]), 0)
  const agg = Math.round((done / frames) * 100)
  if (agg !== lastAgg) {
    process.stdout.write(`\r${agg}%`)
    lastAgg = agg
  }
}
const edges = Array.from({ length: segs + 1 }, (_, i) => Math.round((i * frames) / segs))

for (let i = 0; i < segs; i++) {
  const a = edges[i]
  const b = edges[i + 1]
  segFiles.push(resolve(`${outPath}.seg${i}.mp4`))
  const workerArgs = [
    process.argv[1],
    '--json', jsonPath, '--out', outPath,
    '--fps', String(fps), '--size', `${width}x${height}`,
    '--rows', String(rows), '--dur', String(durOverride),
    '--segs', String(segsCap),
    '--range', `${a},${b}`, '--seg', String(i),
  ]
  if (coverPath) workerArgs.push('--cover', coverPath)
  workerArgs.push('--no-audio')

  const cp = spawn(process.execPath, workerArgs, { stdio: ['ignore', 'pipe', 'inherit'] })
  let tail = ''
  cp.stdout.on('data', (chunk) => {
    tail = (tail + chunk.toString('utf8')).slice(-64)
    const m = tail.match(/\r(\d+)%/)
    if (m) {
      pctDone[i] = Number(m[1])
      emitAgg()
    }
  })
  procs.push(
    new Promise((ok) =>
      cp.on('close', (rc) => ok(rc ?? 0)).on('error', (err) => {
        console.error(`段 ${i} 启动失败：${err.message}`)
        ok(1)
      }),
    ),
  )
}

const cleanSegs = () => {
  for (const f of segFiles) {
    try {
      rmSync(f)
    } catch {}
  }
}
const results = await Promise.all(procs)
const bad = results.findIndex((rc) => rc !== 0)
if (bad >= 0) {
  cleanSegs()
  console.error(`分段 ${bad} 渲染失败，导出中止（退出码 ${results[bad]}）`)
  process.exit(results[bad] || 1)
}
process.stdout.write('\n')
console.log(`视频帧完成（${((Date.now() - t0) / 1000).toFixed(1)}s · ${segs} 段并发）`)

// ---------- concat 段视频 + 混入音频 → 最终 mp4 ----------
const listPath = `${outPath}.seg.list`
writeFileSync(listPath, segFiles.map((f) => `file '${f}'`).join('\n') + '\n')
const finalArgs = ['-y']
if (!noAudio) finalArgs.push('-i', audioPath)
finalArgs.push('-f', 'concat', '-safe', '0', '-i', listPath)
if (!noAudio) {
  finalArgs.push('-map', '1:v', '-map', '0:a', '-c:v', 'copy', '-c:a', 'aac', '-shortest')
} else {
  finalArgs.push('-map', '0:v', '-c', 'copy')
}
finalArgs.push('-movflags', '+faststart', outPath)
try {
  const final = spawn('ffmpeg', finalArgs, { stdio: 'inherit' })
  const rc = await new Promise((ok) => final.on('close', ok))
  if (rc !== 0) throw new Error(`ffmpeg 退出码 ${rc}`)
} catch (err) {
  console.error(err.message)
  process.exit(1)
} finally {
  cleanSegs()
  try {
    rmSync(listPath)
  } catch {}
}

console.log(`完成 → ${resolve(outPath)}`)
