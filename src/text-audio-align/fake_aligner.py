"""不加载模型的假对齐器，供开发与测试使用（设 ALIGN_FAKE=1 启用）。

真实对齐一次要跑几分钟，用它无法迭代 HTTP、任务队列和前端。这里按字符
在每段的时间区间内均匀铺开，产出与真实对齐同构的 Word 列表，让整条链路
（上传 → 排队 → 轮询 → 渲染）能在几秒内跑通。时间戳是假的，不要用它
评估对齐质量。
"""

from dataclasses import dataclass


@dataclass
class FakeWord:
    text: str
    start_time: float
    end_time: float


class FakeAligner:
    """与 Aligner 同签名的替身，只实现 align_segments。"""

    def align_segments(self, segments, audio, language="Chinese", padding_sec=0.3):
        words = []
        for seg in segments:
            text = seg["text"] if isinstance(seg, dict) else seg.text
            start = float(seg["start"] if isinstance(seg, dict) else seg.start)
            end = float(seg["end"] if isinstance(seg, dict) else seg.end)

            # 真实对齐器输出的是“去掉标点和空白后的原文”，这里必须保持同样的
            # 口径：若把标点也当成词，build_cues 检查的词间空隙里就再也看不到
            # 句末标点，断句会退化成纯按长度折行，跟真实结果不同构。
            # CJK 汉字 isalnum() 为真，标点与空白为假，正好符合这个口径。
            chars = [c for c in text if c.isalnum()]
            if not chars:
                continue
            step = (end - start) / len(chars)
            for i, ch in enumerate(chars):
                words.append(FakeWord(ch, start + i * step, start + (i + 1) * step))
        return words
