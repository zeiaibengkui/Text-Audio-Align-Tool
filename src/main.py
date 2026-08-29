import time
from qwen_aligner_toolkit import Aligner

t0 = time.time()
print("加载对齐器...", flush=True)
# 1. 加载对齐器
aligner = Aligner.from_pretrained()
print(f"对齐器就绪 ({time.time() - t0:.1f}s)", flush=True)

print("读取文本...", flush=True)
with open("./data/text.txt") as f:
    txt = f.read()
print(f"文本长度 {len(txt)} 字", flush=True)

# 2. 执行对齐
t1 = time.time()
print("对齐中...", flush=True)
words = aligner.align(
    text=txt,  # 你的文本
    audio="data/audio.mp3",  # 你的音频文件
    language="Chinese",  # 指定语言
)
print(f"对齐完成，共 {len(words)} 个词 ({time.time() - t1:.1f}s)", flush=True)


# 3. 生成字幕（SRT）
def words_to_subtitles(words, max_chars=15):
    """把对齐后的词按句子/最大长度分组，转成 SRT 字幕。"""
    sentence_end = "。！？!?；;"
    cues, cur = [], []
    for w in words:
        if cur and len("".join(x.text for x in cur)) + len(w.text) > max_chars:
            cues.append(cur)
            cur = []
        cur.append(w)
        if w.text and w.text[-1] in sentence_end:
            cues.append(cur)
            cur = []
    if cur:
        cues.append(cur)
    return cues


def format_time(sec):
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


cues = words_to_subtitles(words)
with open("subtitles.srt", "w", encoding="utf-8") as f:
    for i, cue in enumerate(cues, 1):
        start = format_time(cue[0].start_time)
        end = format_time(cue[-1].end_time)
        text = "".join(w.text for w in cue)
        f.write(f"{i}\n{start} --> {end}\n{text}\n\n")

print(f"已生成 subtitles.srt，共 {len(cues)} 条字幕 (总耗时 {time.time() - t0:.1f}s)", flush=True)
