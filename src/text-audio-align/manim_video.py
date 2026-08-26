"""用 Manim 直接渲染对齐器输出的带字幕视频。

直接使用 qwen_aligner_toolkit 对齐得到的每个词时间戳（模型输出），
不经过中间 SRT 文件；以 data/icon.webp 为背景、data/audio.mp3 为音轨，
字幕按时间戳逐条出现。

运行：
    manim render -qm manim_video.py SubtitleVideo
"""

import math
import subprocess

from qwen_aligner_toolkit import Aligner
from manim import *

TEXT_FILE = "./data/text.txt"
AUDIO_FILE = "data/audio.mp3"
FONT = "Noto Serif CJK SC"
PAPER = "#f6efdd"
INK = "#3a2f28"


def clean_positions(text, words):
    """把对齐词映射回原文位置，返回 [(orig_start, orig_end, start, end, text)]。

    强制对齐器输出的词是“去掉标点和空白后的原文”，因此按顺序在原文中
    逐字找回每个词的位置，用于之后重新插入标点。
    """
    joined = "".join(w.text for w in words)
    pos = []
    oi = 0
    for cs in joined:
        while text[oi] != cs:
            oi += 1
        pos.append(oi)
        oi += 1

    spans = []
    ci = 0
    for w in words:
        t = w.text
        n = len(t)
        if n:
            spans.append((pos[ci], pos[ci + n - 1] + 1, w.start_time, w.end_time, t))
        ci += n
    return spans


def build_cues(words, text, max_chars=20, sentence_min=12):
    """按原文段落切分字幕：段落换行、成句合并，长句才在分词处折行。"""
    sentence_end = "。！？!?"
    clause_end = "，、；：,;:"
    spans = clean_positions(text, words)
    cues = []
    cur = []
    for idx, sp in enumerate(spans):
        o_start, o_end = sp[0], sp[1]
        cur.append(sp)
        nxt = spans[idx + 1][0] if idx + 1 < len(spans) else len(text)
        between = text[o_end:nxt]
        cur_len = nxt - cur[0][0]
        close = False
        if "\n" in between:            # 原文段落换行
            close = True
        elif any(c in sentence_end for c in between):
            close = cur_len >= sentence_min   # 成句才断开，短句并入下句
        elif any(c in clause_end for c in between) and cur_len >= max_chars:
            close = True               # 长句在标点处折行
        elif cur_len >= max_chars:
            close = True               # 过长则按词折行
        if close:
            display = "".join(text[cur[0][0]:nxt].split())
            cues.append((display, min(c[2] for c in cur), max(c[3] for c in cur)))
            cur = []
    if cur:
        display = "".join(text[cur[0][0]:].split())
        cues.append((display, min(c[2] for c in cur), max(c[3] for c in cur)))
    return _merge_unbalanced(cues)


def _merge_unbalanced(cues):
    """把以未闭合括号收尾的字幕与下一行合并，避免把【原文】这类拆开。"""
    res = []
    for d, s, e in cues:
        if res and res[-1][0].endswith(("【", "（", "《", "「")):
            pd, ps, pe = res[-1]
            res[-1] = (pd + d, ps, e)
        else:
            res.append((d, s, e))
    out = []
    for d, s, e in res:
        if out and d and d[0] in ("】", "）", "》", "」"):
            pd, ps, pe = out[-1]
            out[-1] = (pd + d, ps, e)
        else:
            out.append((d, s, e))
    return out


def split_text_by_weight(text, k):
    """按“非空白字符数”把原文尽量均匀切成 k 段，保持原文标点。"""
    total = sum(1 for ch in text if not ch.isspace())
    if total == 0 or k <= 1:
        return [text]
    target = total / k
    chunks = []
    acc = 0
    start = 0
    for i, ch in enumerate(text):
        if not ch.isspace():
            acc += 1
            if acc >= target and len(chunks) < k - 1:
                chunks.append(text[start:i + 1])
                start = i + 1
                acc = 0
    chunks.append(text[start:])
    return chunks


def align_chunked(aligner, text, audio, dur, target_sec=130.0):
    """把整段音频按时间切成若干段，逐段对齐，绕开模型对超长音频的限制。"""
    k = max(3, math.ceil(dur / target_sec))
    chunks = split_text_by_weight(text, k)
    segments = [
        {"text": c, "start": i * dur / k, "end": min((i + 1) * dur / k, dur)}
        for i, c in enumerate(chunks)
    ]
    return aligner.align_segments(segments, audio, language="Chinese", padding_sec=0.3)


def _interp(result, lo, hi, t0, t1):
    total = sum(len(result[i].text) for i in range(lo, hi))
    if total <= 0:
        return
    if t1 <= t0:
        t1 = t0 + 0.05
    t = t0
    for i in range(lo, hi):
        w = result[i]
        frac = len(w.text) / total
        w.start_time = t
        t += frac * (t1 - t0)
        w.end_time = t


def smooth_words(words, audio_end):
    """把被模型钉死/重叠的时间戳在可信词之间线性插值，消除零时长词。"""
    n = len(words)
    good = [
        i for i, w in enumerate(words)
        if w.end_time > w.start_time and (i == 0 or w.start_time > words[i - 1].start_time)
    ]
    if not good:
        _interp(words, 0, n, 0.0, audio_end)
        return words
    if good[0] > 0:
        _interp(words, 0, good[0], 0.0, words[good[0]].start_time)
    for k in range(len(good) - 1):
        a, b = good[k], good[k + 1]
        if b > a + 1:
            _interp(words, a + 1, b, words[a].end_time, words[b].start_time)
    if good[-1] < n - 1:
        _interp(words, good[-1] + 1, n, words[good[-1]].end_time, audio_end)
    return words


def write_srt(cues, path="subtitles.srt"):
    """把字幕行 [(display, start, end)] 写入 SRT 文件。"""
    def ts(sec):
        ms = int(round(sec * 1000))
        h, ms = divmod(ms, 3600000)
        m, ms = divmod(ms, 60000)
        s, ms = divmod(ms, 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

    with open(path, "w", encoding="utf-8") as f:
        for i, (text, start, end) in enumerate(cues, 1):
            f.write(f"{i}\n{ts(start)} --> {ts(end)}\n{text}\n\n")


def load_data():
    """运行对齐，返回 (text, words, cues, duration)。时间戳来自模型输出。"""
    aligner = Aligner.from_pretrained()
    with open(TEXT_FILE, encoding="utf-8") as f:
        text = f.read()
    dur = audio_duration(AUDIO_FILE)
    words = align_chunked(aligner, text, AUDIO_FILE, dur)
    words = smooth_words(words, dur)
    return text, words, build_cues(words, text), dur


def load_cues():
    """运行对齐并返回字幕行 [(display, start, end)]。"""
    return load_data()[2]


def audio_duration(path):
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path]
    )
    return float(out.strip())


def make_vertical_text(line_text, chars_per_col=9, font_size=42, buff=0.12):
    """把一行字幕排成竖排（每列从上到下、列序从右到左），返回逐字平铺的组。"""
    tokens = list(line_text)
    cols = []
    for i in range(0, len(tokens), chars_per_col):
        chunk = tokens[i:i + chars_per_col]
        col = VGroup(
            *[Text(ch, font=FONT, font_size=font_size, color=INK)
              for ch in chunk]
        ).arrange(DOWN, buff=buff)
        cols.append(col)
    cols = cols[::-1]  # 第一列放在最右侧（竖排从右往左读）
    total_w = sum(c.width for c in cols) + 0.5 * (len(cols) - 1)
    chars = []
    x = total_w / 2
    for col in cols:
        col.move_to([x, 0, 0])
        x -= col.width + 0.5
        chars.extend(col)  # 列内已从上到下排好
    return VGroup(*chars)


class SubtitleVideo(Scene):
    def construct(self):
        cues = load_cues()
        write_srt(cues)
        dur = audio_duration(AUDIO_FILE)
        self.add_sound(AUDIO_FILE)

        # 纸面背景
        paper = Rectangle(
            width=config.frame_width, height=config.frame_height,
            fill_color=PAPER, fill_opacity=1.0, stroke_width=0,
        )
        paper.set_z_index(-10)
        self.add(paper)

        # 长卷：已被写下的文字都放在 holder 里，随写作整体向左滚动
        holder = VGroup()
        self.add(holder)
        write_x = config.frame_width / 2 - 1.6  # 当前书写位（屏幕右侧）
        col_gap = 0.6
        elapsed = 0.0

        for line_text, start, end in cues:
            seg_dur = end - start
            if seg_dur <= 0.0:
                continue
            if start > elapsed:
                self.wait(start - elapsed)
                elapsed = start

            block = make_vertical_text(line_text)
            block.move_to([write_x, 0, 0])
            holder.add(block)

            write_time = min(seg_dur, max(0.5, seg_dur * 0.55))
            advance = block.width + col_gap
            # 逐字浮现，同时整卷从右向左滚动
            self.play(
                FadeIn(block, lag_ratio=0.5, run_time=write_time),
                holder.animate.shift(LEFT * advance),
                run_time=write_time,
            )
            elapsed += write_time

            hold = seg_dur - write_time
            if hold > 0.0:
                self.wait(hold)
                elapsed += hold

        # 补足到音频结束，避免结尾被截掉
        if dur - elapsed > 0:
            self.wait(dur - elapsed)


if __name__ == "__main__":
    cues = load_cues()
    write_srt(cues)
    print(f"已生成 {len(cues)} 条字幕 -> subtitles.srt")
