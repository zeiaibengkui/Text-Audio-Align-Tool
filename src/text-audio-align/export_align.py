"""运行对齐并把原始单词时间戳、字幕行、原文导出为 JSON，供 HTML 使用。"""

import json

from manim_video import load_data, AUDIO_FILE


def main():
    text, words, cues, dur = load_data()
    data = {
        "audio": AUDIO_FILE,
        "duration": round(dur, 3),
        "text": text,
        "words": [
            {"text": w.text, "start": round(w.start_time, 3), "end": round(w.end_time, 3)}
            for w in words
        ],
        "cues": [
            {"text": t, "start": round(s, 3), "end": round(e, 3)}
            for t, s, e in cues
        ],
    }
    with open("align.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"导出完成：{len(data['words'])} 词，{len(data['cues'])} 条字幕 -> align.json")


if __name__ == "__main__":
    main()
