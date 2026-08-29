"""不加载模型的假对齐器，供开发与测试使用（设 ALIGN_FAKE=1 启用）。"""

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

            chars = [c for c in text if c.isalnum()]
            if not chars:
                continue
            step = (end - start) / len(chars)
            for i, ch in enumerate(chars):
                words.append(FakeWord(ch, start + i * step, start + (i + 1) * step))
        return words
