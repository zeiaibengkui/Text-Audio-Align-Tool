#!/usr/bin/env node
/**
 * 竹简卷轴 → MP4：无头渲染，与浏览器端 ScrollPlayer 共用 scroll.ts，
 * 帧画面完全一致。帧以 rawvideo 管道喂给 ffmpeg，最后混入原音频。
 *
 * 用法：
 *   node scripts/export-scroll.mjs --json <result.json|align.json> \
 *       --audio <audio|http://...> --out scroll.mp4 \
 *       [--fps 25] [--size 1280x720] [--rows 12] [--dur 12] [--no-audio]
 *       [--cover cover.jpg]
 *
 * 依赖：@napi-rs/canvas（pnpm add -D @napi-rs/canvas）、ffmpeg 在 PATH。
 */

import { execFileSync, spawn } from 'node:child_process'
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
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
let noAudio = args.includes('--no-audio')

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

console.log(
  `渲染 ${frames} 帧 · ${duration}s @ ${fps}fps · ${width}x${height} · 列高 ${rows}`,
)

// ---------- 管道 → ffmpeg ----------
const tmpVid = `${outPath}.tmp.mp4`
const ff = spawn(
  'ffmpeg',
  [
    '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`,
    '-r', String(fps),
    '-i', '-',
    '-c:v', 'libx264', '-crf', '20', '-preset', 'medium',
    '-pix_fmt', 'yuv420p',
    '-an', tmpVid,
  ],
  { stdio: ['pipe', 'inherit', 'inherit'] },
)

function writeFrameBuffer(buf) {
  return new Promise((ok, fail) => {
    ff.stdin.write(buf, (e) => (e ? fail(e) : ok()))
  })
}

const t0 = Date.now()
for (let f = 0; f < frames; f++) {
  renderer.draw(ctx, f / fps)
  const raw = Buffer.from(ctx.getImageData(0, 0, width, height).data)
  await writeFrameBuffer(raw)
  if (f % 10 === 0 || f === frames - 1) {
    const p = Math.round(((f + 1) / frames) * 100)
    process.stdout.write(`\r${p}%`)
  }
}
process.stdout.write('\n')
ff.stdin.end()
await new Promise((ok) => ff.on('close', ok))

console.log(`视频帧完成（${((Date.now() - t0) / 1000).toFixed(1)}s）`)

// ---------- 混入音频 → 最终 mp4 ----------
const finalArgs = ['-y']
if (!noAudio) finalArgs.push('-i', audioPath)
finalArgs.push('-i', tmpVid)
if (!noAudio) {
  finalArgs.push('-map', '1:v', '-map', '0:a', '-c:v', 'copy', '-c:a', 'aac', '-shortest')
} else {
  finalArgs.push('-map', '0:v', '-c', 'copy')
}
finalArgs.push('-movflags', '+faststart', outPath)
const final = spawn('ffmpeg', finalArgs, { stdio: 'inherit' })
await new Promise((ok) => final.on('close', ok))

if (existsSync(tmpVid)) execFileSync('rm', [tmpVid])
console.log(`完成 → ${resolve(outPath)}`)
