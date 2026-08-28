/**
 * 古风竹简卷轴渲染引擎 — 纯 Canvas 逻辑，不依赖 DOM。
 *
 * 浏览器（ScrollPlayer）与无头导出（scripts/export-scroll.mjs）共用同一份代码，
 * 保证「播放」与「视频」的字幕入墨完全一致。
 *
 * 运动模型（弹性卷位，读序从右往左）：
 *  - 纸面上列按书写顺序排列（layoutChars 第 0 列 = 最早的文字），整幅画面
 *    水平镜像：第 0 列显现在最右侧，后续文字向左逐列排开；
 *  - 正在入墨的字符被钉在屏幕左侧的「笔位」上，纸面因此在笔位处向右滑出
 *    一整列，先写好的字随之向右滑动、直到换回起点循环；从左到右的画面顺序
 *    是「新→旧」，读者按从右往左读即为正常的书写顺序；
 *  - 每个字符独立渐入：透明度 + 缩放 + 墨色渐变（从淡墨到浓墨），
 *    渐入时刻来自对齐器的逐词时间戳（buildChars 摊平为逐字并找回标点，
 *    标点跟随前一字的时刻入墨；段落换行另起一列）。
 *  - 竖排标点：绘制时把横排标点换成竖排形式（U+FE10–FE1F 竖排形式、
 *    U+FE30–FE4F 的竖排括号/破折号），见 toVertical()。
 */

export interface Word {
  text: string
  start: number
  end: number
}

export interface Cue {
  text: string
  start: number
  end: number
}

export interface ScrollData {
  text: string
  words: Word[]
  cues: Cue[]
  duration: number
}

export interface ScriptChar {
  ch: string
  t: number // 渐入时刻（相对于卷轴周期）
}

export interface PlacedChar extends ScriptChar {
  col: number
  row: number
}

/**
 * 封面图像源：浏览器（HTMLImageElement 适配器）与无头导出
 * （@napi-rs/canvas Image 适配器）共用同一接口，交给 setCover()。
 */
export interface CoverSource {
  readonly width: number
  readonly height: number
  /** 在 (x, y) 处以 w×h 绘制。 */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void
}

export interface ScrollOptions {
  rows?: number // 每列最大字数
  entrySec?: number // 单个字符的入墨时长
  scaleIn?: number // 入墨起始缩放（相对 1）
  font?: string
  cover?: CoverSource | null // 卷轴最右侧的全高封面（读序起点）
  style?: Partial<ScrollStyle>
}

export interface ScrollStyle {
  paper: string
  paperShade: string
  slipLine: string
  roll: string
  inkLight: string
  inkDark: string
}

export const DEFAULT_STYLE: ScrollStyle = {
  paper: '#efe5cb',
  paperShade: '#e4d5b4',
  slipLine: 'rgba(120, 92, 44, 0.16)',
  roll: '#cdb98e',
  inkLight: '#98917f',
  inkDark: '#262019',
}

const FONT_FALLBACK = "'Noto Serif CJK SC', 'AR PL UKai CN', 'KaiTi', 'SimSun', serif"

function easeOut(p: number): number {
  return 1 - Math.pow(1 - p, 3)
}

/**
 * 竖排标点映射表：横排标点 → 竖排形式。
 * U+FE10–FE1F（竖排形式）+ 部分 U+FE30–FE4F（CJK 兼容符号：竖排括号/破折号）。
 * 全角 ，！？等与半角同义，一并替换。
 */
const VERTICAL_FORMS: Record<string, string> = {
  ',': '︐', // ︐ 竖排逗号
  '，': '︐',
  '、': '︑', // ︑ 竖排顿号
  '。': '︒', // ︒ 竖排句号
  ':': '︓', // ︓ 竖排冒号
  '：': '︓',
  ';': '︔', // ︔ 竖排分号
  '；': '︔',
  '!': '︕', // ︕ 竖排叹号
  '！': '︕',
  '?': '︖', // ︖ 竖排问号
  '？': '︖',
  '〖': '︗', // ︗ 竖排左空心括号
  '〗': '︘', // ︘ 竖排右空心括号
  '…': '︙', // ︙ 竖排水平省略号
  '——': '︱', // ︱ 竖排破折号（双连字符）
  '—': '︱',
  '《': '︽', // ︽ 竖排左书名号（双）
  '》': '︾', // ︾ 竖排右书名号（双）
  '〈': '︿', // ︿ 竖排左书名号（单）
  '〉': '﹀', // ﹀ 竖排右书名号（单）
  '「': '﹁', // ﹁ 竖排左上角括号
  '」': '﹂', // ﹂ 竖排右上角括号
  '『': '﹃', // ﹃ 竖排左上角白括号
  '』': '﹄', // ﹄ 竖排右上角白括号
  '“': '﹃', // 双引号 → 竖排白角括号
  '”': '﹄',
  '(': '︵', // ︵ 竖排左括号
  '（': '︵',
  ')': '︶', // ︶ 竖排右括号
  '）': '︶',
  '{': '︷', // ︷ 竖排左花括号
  '}': '︸', // ︸ 竖排右花括号
}

/** 竖排文本中标点使用竖排形式；无对应则原样返回。 */
export function toVertical(ch: string): string {
  return VERTICAL_FORMS[ch] ?? ch
}

/**
 * 把对齐词时间戳摊平为逐字渐入时刻；words 为空时退回 cues 均匀摊平。
 * words 只含汉字/数字（不要丢标点），所以逐字对照 data.text 找回标点：
 * 标点沿用前一字的时间（停顿落在字后），空白不占格，\n 让 layoutChars 另起一列。
 */
export function buildChars(data: ScrollData): ScriptChar[] {
  if (data.words.length === 0) {
    return data.cues.flatMap((c) => {
      const chars = [...c.text]
      const step = (c.end - c.start) / chars.length
      return chars.map((ch, i) => ({ ch, t: c.start + i * step }))
    })
  }
  const stream: ScriptChar[] = data.words.flatMap((w) => {
    const chars = [...w.text]
    const step = (w.end - w.start) / chars.length
    return chars.map((ch, i) => ({ ch, t: w.start + i * step }))
  })
  const out: ScriptChar[] = []
  let i = 0
  let lastT = 0
  let quoteOpen = false
  for (const ch of data.text) {
    if (i < stream.length && stream[i].ch === ch) {
      lastT = stream[i].t
      out.push({ ch, t: lastT })
      i += 1
    } else if (ch === '\n') {
      out.push({ ch, t: lastT })
    } else if (ch === '"') {
      // ASCII 引号不分开闭：按出现次序交替成竖排白角括号 ﹃/﹄
      quoteOpen = !quoteOpen
      out.push({ ch: quoteOpen ? '﹃' : '﹄', t: lastT })
    } else if (!/\s/.test(ch)) {
      out.push({ ch, t: lastT }) // 标点：跟前一字同时入墨
    }
    // 其余空白不占格
  }
  return out
}

/** 把逐字时间序列排到卷轴列网格上（col 递增 = 向左）；换行与分句后另起一列。 */
export function layoutChars(chars: ScriptChar[], rows: number): PlacedChar[] {
  const SENT_END = /[。！？!?；:]/
  const placed: PlacedChar[] = []
  let col = 0
  let row = 0
  for (const c of chars) {
    if (c.ch === '\n') {
      // 段落换行：另起一列（不占格）
      col += 1
      row = 0
      continue
    }
    placed.push({ ...c, col, row })
    row += 1
    if (row >= rows || (SENT_END.test(c.ch) && row < rows)) {
      col += 1
      row = 0
    }
  }
  return placed
}

export class ScrollRenderer {
  private readonly width: number
  private readonly height: number
  private readonly dpr: number
  private readonly style: ScrollStyle
  private readonly font: string
  private readonly rows: number
  private readonly size: number
  private readonly colW: number
  private readonly margin: number
  private readonly penX: number
  private readonly entrySec: number
  private readonly scaleIn: number
  private readonly chars: PlacedChar[]
  private readonly duration: number
  private totalW: number
  private cover: CoverSource | null
  private coverW: number // 封面在纸面上的宽度（占卷轴最右端一档）

  constructor(
    width: number,
    height: number,
    dpr: number,
    data: ScrollData,
    opts: ScrollOptions = {},
  ) {
    this.width = width
    this.height = height
    this.dpr = dpr
    this.style = { ...DEFAULT_STYLE, ...opts.style }
    this.rows = opts.rows ?? 12
    this.margin = Math.round(this.height * 0.08)
    this.size = Math.floor((this.height - 2 * this.margin) / this.rows)
    this.colW = Math.round(this.size * 1.14)
    // penX 是未镜像坐标里的右缘笔位；draw() 统一水平镜像后笔位落在左侧
    this.penX = width - this.margin - this.colW / 2
    this.entrySec = opts.entrySec ?? 0.5
    this.scaleIn = opts.scaleIn ?? 0.88
    this.font = `${this.size}px ${opts.font ?? FONT_FALLBACK}`
    this.chars = layoutChars(buildChars(data), this.rows)
    this.duration = data.duration
    this.cover = opts.cover ?? null
    this.coverW = this.cover
      ? Math.max(0, Math.round((this.height * this.cover.width) / this.cover.height))
      : 0
    this.totalW = this.margin * 2 + this.chars.length * this.colW + this.coverW
  }

  /** 更换封面：高度占满纸面，宽度按原图比例；封面占据卷轴最右端（读序起点）。 */
  setCover(cover: CoverSource): void {
    this.cover = cover
    this.coverW = Math.max(0, Math.round((this.height * cover.width) / cover.height))
    this.totalW = this.margin * 2 + this.chars.length * this.colW + this.coverW
  }

  /** 纸面横坐标：第 col 列中心（col 递增 = 写在纸面上靠右；封面带在首列左侧占宽）。 */
  private contentX(col: number): number {
    return this.margin + this.coverW + (col + 0.5) * this.colW
  }

  /** 弹性卷位：已入墨的最后列 k 与当前笔位字的入墨进度 pk。 */
  private frontier(cycle: number): { k: number; pk: number } {
    const { chars, entrySec } = this
    let k = -1
    for (let i = 0; i < chars.length; i++) {
      if (chars[i].t <= cycle) k = i
      else break
    }
    const pk = k >= 0 ? Math.min(1, Math.max(0, (cycle - chars[k].t) / entrySec)) : 0
    return { k, pk }
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    const { width: W, height: H, dpr } = this
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    // 桌面（画布外底）— 深木色，衬托宣纸
    ctx.fillStyle = '#3b342a'
    ctx.fillRect(0, 0, W, H)

    const cycle = this.duration > 0 ? Math.min(time, this.duration - 0.001) % this.duration : 0
    // 循环回卷头时纸面快速淡入，提示「重新开卷」
    const wrapA = Math.min(1, cycle / 0.35)

    // 笔位固定在当前列：写一列时纸面不动；该列头字入墨期间整卷左滑一格，
    // 于是前一列流向左、新列缓缓滑到笔位下。先写的字一路向左循环。
    const { k, pk } = this.frontier(cycle)
    const baseCol = k < 0 ? -1 : this.chars[k].col
    const lead = k < 0 ? 0 : this.chars[k].row === 0 ? pk : 1
    const shift =
      this.chars.length === 0
        ? -(W - this.totalW) / 2
        : this.contentX(baseCol - 1 + lead) - this.penX

    ctx.save()
    ctx.globalAlpha = ctx.globalAlpha * wrapA
    this.drawBand(ctx, shift)
    this.drawChars(ctx, cycle, shift)
    ctx.restore()
  }

  private drawBand(ctx: CanvasRenderingContext2D, shift: number): void {
    const { width: W, height: H, colW } = this
    // 纸面横跨 [0, totalW]，随 shift 平移到屏幕；再水平镜像（读序从右往左）
    const x0 = -shift
    const x1 = x0 + this.totalW
    const xa = W - x1
    const xb = W - x0
    const xl = Math.max(0, xa)
    const xr = Math.min(W, xb)

    ctx.save()
    if (xr > xl) {
      ctx.fillStyle = this.style.paper
      ctx.fillRect(xl, 0, xr - xl, H)

      // 上下卷轴边缘压条（竹简捆轴）
      const rollH = Math.round(H * 0.045)
      ctx.fillStyle = this.style.roll
      ctx.fillRect(xl, 0, xr - xl, rollH)
      ctx.fillRect(xl, H - rollH, xr - xl, rollH)
    }

    // 每列之间的竹节细缝
    ctx.strokeStyle = this.style.slipLine
    ctx.lineWidth = 1
    for (let col = 0; col <= this.chars.length; col++) {
      const x = W - (this.margin + this.coverW + col * colW - shift) + 0.5
      if (x < xl || x > xr) continue
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
    }

    // 卷轴两端的木杆
    const rodW = Math.round(colW * 0.66)
    ctx.fillStyle = this.style.roll
    ctx.fillRect(W - x1, 0, rodW, H)
    ctx.fillRect(W - x0 - rodW, 0, rodW, H)

    // 卷轴最右端的封面（读序起点，屏幕右缘）：高度 100%，宽度按原图比例；
    // 图片按屏幕方向正立绘制（仅位置镜像，不翻转内容）。
    if (this.cover && this.coverW > 0) {
      const cx = W - (this.margin + this.coverW - shift) // 封面带的屏幕左缘
      this.cover.draw(ctx, cx, 0, this.coverW, H)
      ctx.strokeStyle = 'rgba(80, 60, 30, 0.45)'
      ctx.lineWidth = 2
      ctx.strokeRect(cx + 1, 1, this.coverW - 2, H - 2)
    }
    ctx.restore()
  }

  private inkColor(p: number): [number, number, number] {
    const L = [0x98, 0x91, 0x7f] // 淡墨
    const D = [0x26, 0x20, 0x19] // 浓墨
    return [
      Math.round(L[0] + (D[0] - L[0]) * p),
      Math.round(L[1] + (D[1] - L[1]) * p),
      Math.round(L[2] + (D[2] - L[2]) * p),
    ]
  }

  /** 入墨 = 透明度渐显 + 微缩放 + 墨色由淡到浓；不模糊。 */
  private drawInkChar(
    ctx: CanvasRenderingContext2D,
    ch: string,
    x: number,
    y: number,
    p: number,
  ): void {
    const q = easeOut(p)
    const [r, g, b] = this.inkColor(q)
    ctx.save()
    ctx.globalAlpha = 0.12 + 0.88 * q
    ctx.fillStyle = `rgb(${r},${g},${b})`
    const s = 1 - (1 - q) * (1 - this.scaleIn)
    ctx.translate(x, y)
    ctx.scale(s, s)
    ctx.fillText(toVertical(ch), 0, 0)
    ctx.restore()
  }

  private drawChars(
    ctx: CanvasRenderingContext2D,
    cycle: number,
    shift: number,
  ): void {
    const { width: W } = this
    ctx.save()
    ctx.font = this.font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const marginTop = this.margin + this.size / 2
    for (const c of this.chars) {
      const x = W - (this.contentX(c.col) - shift) // 水平镜像：读序从右往左
      if (x < -this.size || x > W + this.size) continue
      const y = marginTop + c.row * this.size
      // 尚未到渐入时刻的字不画（每轮重新入墨）
      const p = Math.min(1, Math.max(0, (cycle - c.t) / this.entrySec))
      if (p <= 0) continue
      this.drawInkChar(ctx, c.ch, x, y, p)
    }
    ctx.restore()
  }
}
