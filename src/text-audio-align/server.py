"""文本—音频对齐的 REST 服务。

对齐一次要跑几分钟，同步接口必然超时，所以这里做成任务式：POST 立即返回
任务 id，客户端轮询状态，完成后再取结果。任务落盘保存，重启后仍在。

运行：
    cd src/text-audio-align
    ../../.venv/bin/python server.py          # 真实对齐
    ALIGN_FAKE=1 ../../.venv/bin/python server.py   # 假对齐，秒级跑通全链路

环境变量：
    ALIGN_FAKE=1     使用 fake_aligner，不加载模型
    ALIGN_DEVICE=xpu 试用 Intel GPU（未经验证；默认由 toolkit 决定，当前为 CPU）
    PORT             监听端口，默认 5000
"""

import json
import os
import queue
import shutil
import threading
import time
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

import align_core

BASE_DIR = Path(__file__).resolve().parent
JOBS_DIR = BASE_DIR / "jobs"

ALLOWED_EXTS = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".opus", ".aac"}
MAX_CONTENT_LENGTH = 1024 ** 3  # 1 GiB
MAX_TEXT_CHARS = 1_000_000

ACTIVE = ("queued", "running")


class JobCancelled(Exception):
    """由 progress_cb 抛出，用于在段边界中止对齐。"""


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class JobManager:
    """任务存储 + 单线程工作队列。

    内存中的 _jobs 是权威状态，每次状态变更同步落盘到 meta.json。写盘用
    临时文件 + os.replace，避免进程被杀时留下半个 JSON。对齐要跑几分钟，
    期间绝不持锁，否则状态接口会被阻塞。
    """

    def __init__(self, jobs_dir=JOBS_DIR):
        self.jobs_dir = Path(jobs_dir)
        self.jobs_dir.mkdir(parents=True, exist_ok=True)
        self._jobs = {}
        self._lock = threading.Lock()
        self._queue = queue.Queue()
        self._worker = None
        self._load_from_disk()

    # ---------- 持久化 ----------

    def _meta_path(self, job_id):
        return self.jobs_dir / job_id / "meta.json"

    def _write_meta(self, meta):
        path = self._meta_path(meta["id"])
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, path)

    def _load_from_disk(self):
        """启动时恢复任务列表。

        上一轮进程里 queued/running 的任务，其工作线程已随进程消失，
        不可能再有人推进它们，所以直接标成 failed，而不是让它们永远
        停在“对齐中”。
        """
        for meta_file in sorted(self.jobs_dir.glob("*/meta.json")):
            try:
                meta = json.loads(meta_file.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if meta.get("status") in ACTIVE:
                meta["status"] = "failed"
                meta["stage"] = None
                meta["error"] = "服务重启，任务已中断"
                meta["updated_at"] = _now()
                self._write_meta(meta)
            self._jobs[meta["id"]] = meta

    # ---------- 状态变更 ----------

    def _update(self, job_id, **fields):
        with self._lock:
            meta = self._jobs.get(job_id)
            if meta is None:
                return None
            meta.update(fields, updated_at=_now())
            snapshot = dict(meta)
        self._write_meta(snapshot)
        return snapshot

    def get(self, job_id):
        with self._lock:
            meta = self._jobs.get(job_id)
            return dict(meta) if meta else None

    def list(self):
        with self._lock:
            jobs = [dict(m) for m in self._jobs.values()]
        return sorted(jobs, key=lambda m: m.get("created_at", ""), reverse=True)

    # ---------- 创建 / 删除 ----------

    def create(self, audio_file, ext, text, display_name):
        job_id = uuid.uuid4().hex[:12]
        job_dir = self.jobs_dir / job_id
        job_dir.mkdir(parents=True)

        audio_file.save(job_dir / f"audio{ext}")
        (job_dir / "text.txt").write_text(text, encoding="utf-8")

        meta = {
            "id": job_id,
            "name": display_name,
            "status": "queued",
            "stage": "queued",
            "progress": 0.0,
            "audio_ext": ext,
            "created_at": _now(),
            "updated_at": _now(),
            "duration": None,
            "word_count": None,
            "cue_count": None,
            "error": None,
        }
        with self._lock:
            self._jobs[job_id] = meta
            snapshot = dict(meta)
        self._write_meta(snapshot)
        self._queue.put(job_id)
        return snapshot

    def delete(self, job_id):
        with self._lock:
            meta = self._jobs.get(job_id)
            if meta is None:
                return False
            was_active = meta["status"] in ACTIVE
            if was_active:
                # 工作线程会在下个段边界看到这个状态并自行清理目录。
                meta["status"] = "cancelled"
                meta["stage"] = None
                meta["updated_at"] = _now()
                snapshot = dict(meta)
            else:
                del self._jobs[job_id]
                snapshot = None
        if snapshot is not None:
            self._write_meta(snapshot)
        else:
            self._remove_dir(job_id)
        return True

    def _remove_dir(self, job_id):
        target = (self.jobs_dir / job_id).resolve()
        # 只删 jobs/ 里面的东西，防止 id 被构造成路径穿越。
        if target.is_relative_to(self.jobs_dir.resolve()) and target.is_dir():
            shutil.rmtree(target, ignore_errors=True)

    def job_dir(self, job_id):
        return self.jobs_dir / job_id

    # ---------- 工作线程 ----------

    def start_worker(self):
        if self._worker is not None:
            return
        # 断电重启后仍是 queued 的任务不会自动重排（_load_from_disk 已把它们
        # 标成 failed），这里只处理本进程内新建的任务。
        self._worker = threading.Thread(target=self._run_forever, daemon=True)
        self._worker.start()

    def _run_forever(self):
        while True:
            job_id = self._queue.get()
            try:
                self._run_job(job_id)
            except Exception:
                traceback.print_exc()
            finally:
                self._queue.task_done()

    def _check_cancelled(self, job_id):
        meta = self.get(job_id)
        if meta is None or meta["status"] == "cancelled":
            raise JobCancelled()

    def _run_job(self, job_id):
        try:
            self._check_cancelled(job_id)
        except JobCancelled:
            self._remove_dir(job_id)
            with self._lock:
                self._jobs.pop(job_id, None)
            return

        meta = self.get(job_id)
        job_dir = self.job_dir(job_id)
        audio_path = job_dir / f"audio{meta['audio_ext']}"
        text_path = job_dir / "text.txt"

        try:
            self._update(job_id, status="running", stage="loading_model", progress=0.0)
            aligner = get_aligner()

            self._update(job_id, stage="validating")
            self._check_cancelled(job_id)

            self._update(job_id, stage="aligning")

            def progress_cb(done, total):
                self._check_cancelled(job_id)
                self._update(
                    job_id,
                    progress=round(done / total, 4),
                    segments_done=done,
                    segments_total=total,
                )

            text, words, cues, dur = align_core.load_data(
                aligner=aligner,
                text_file=text_path,
                audio_file=audio_path,
                progress_cb=progress_cb,
            )

            self._update(job_id, stage="smoothing", progress=1.0)
            result = {
                "audio": f"/api/jobs/{job_id}/audio",
                "duration": round(dur, 3),
                "text": text,
                "words": [
                    {"text": w.text, "start": round(w.start_time, 3), "end": round(w.end_time, 3)}
                    for w in words
                ],
                "cues": [
                    {"text": t, "start": round(s, 3), "end": round(e, 3)} for t, s, e in cues
                ],
            }
            (job_dir / "result.json").write_text(
                json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            self._update(
                job_id,
                status="done",
                stage="done",
                progress=1.0,
                duration=round(dur, 3),
                word_count=len(words),
                cue_count=len(cues),
                error=None,
            )
        except JobCancelled:
            self._remove_dir(job_id)
            with self._lock:
                self._jobs.pop(job_id, None)
        except Exception as exc:
            traceback.print_exc()
            self._update(
                job_id,
                status="failed",
                stage=None,
                error=f"{type(exc).__name__}: {exc}"[:500],
            )


_fake_aligner = None


def get_aligner():
    """真实对齐器走 align_core 的单例；ALIGN_FAKE=1 时换成假对齐器。"""
    global _fake_aligner
    if os.environ.get("ALIGN_FAKE") == "1":
        if _fake_aligner is None:
            from fake_aligner import FakeAligner

            _fake_aligner = FakeAligner()
        return _fake_aligner
    return align_core.get_aligner(os.environ.get("ALIGN_DEVICE"))


def seed_sample_job(manager):
    """把仓库里现成的 data/ + align.json 灌成一个已完成任务。

    这样第一次启动就能验证列表、阅读器和音频拖动，不必先等一次几分钟的
    真实对齐。
    """
    if manager.list():
        return
    audio_src = BASE_DIR / "data" / "audio.mp3"
    text_src = BASE_DIR / "data" / "text.txt"
    align_src = BASE_DIR / "align.json"
    if not (audio_src.exists() and text_src.exists() and align_src.exists()):
        return

    job_id = "sample"
    job_dir = manager.job_dir(job_id)
    job_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(audio_src, job_dir / "audio.mp3")
    shutil.copy2(text_src, job_dir / "text.txt")

    data = json.loads(align_src.read_text(encoding="utf-8"))
    data["audio"] = f"/api/jobs/{job_id}/audio"
    (job_dir / "result.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    meta = {
        "id": job_id,
        "name": "示例：净土十要",
        "status": "done",
        "stage": "done",
        "progress": 1.0,
        "audio_ext": ".mp3",
        "created_at": _now(),
        "updated_at": _now(),
        "duration": data.get("duration"),
        "word_count": len(data.get("words", [])),
        "cue_count": len(data.get("cues", [])),
        "error": None,
    }
    with manager._lock:
        manager._jobs[job_id] = meta
    manager._write_meta(meta)


def create_app(jobs_dir=JOBS_DIR, seed=True):
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH
    manager = JobManager(jobs_dir)
    app.config["JOB_MANAGER"] = manager
    if seed:
        seed_sample_job(manager)
    manager.start_worker()

    @app.errorhandler(413)
    def too_large(_):
        return jsonify(error="音频文件过大（上限 1 GiB）"), 413

    @app.get("/api/health")
    def health():
        return jsonify(
            ok=True,
            fake=os.environ.get("ALIGN_FAKE") == "1",
            device=os.environ.get("ALIGN_DEVICE") or "auto",
        )

    @app.get("/api/jobs")
    def list_jobs():
        return jsonify(manager.list())

    @app.post("/api/jobs")
    def create_job():
        audio = request.files.get("audio")
        text = (request.form.get("text") or "").strip()

        if audio is None or not audio.filename:
            return jsonify(error="请选择音频文件"), 400
        ext = Path(audio.filename).suffix.lower()
        if ext not in ALLOWED_EXTS:
            allowed = "、".join(sorted(e.lstrip(".") for e in ALLOWED_EXTS))
            return jsonify(error=f"不支持的音频格式 {ext or '(无扩展名)'}，支持：{allowed}"), 400
        if not text:
            return jsonify(error="请输入要对齐的文本"), 400
        if len(text) > MAX_TEXT_CHARS:
            return jsonify(error="文本过长"), 400

        display_name = secure_filename(audio.filename) or f"audio{ext}"
        meta = manager.create(audio, ext, text, display_name)
        return jsonify(meta), 201

    @app.get("/api/jobs/<job_id>")
    def get_job(job_id):
        meta = manager.get(job_id)
        if meta is None:
            return jsonify(error="任务不存在"), 404
        return jsonify(meta)

    @app.get("/api/jobs/<job_id>/result")
    def get_result(job_id):
        meta = manager.get(job_id)
        if meta is None:
            return jsonify(error="任务不存在"), 404
        if meta["status"] != "done":
            return jsonify(error="任务尚未完成", status=meta["status"]), 409
        path = manager.job_dir(job_id) / "result.json"
        if not path.exists():
            return jsonify(error="结果文件缺失"), 404
        return app.response_class(
            path.read_text(encoding="utf-8"), mimetype="application/json"
        )

    @app.get("/api/jobs/<job_id>/audio")
    def get_audio(job_id):
        meta = manager.get(job_id)
        if meta is None:
            return jsonify(error="任务不存在"), 404
        # send_from_directory 默认 conditional=True，Range 请求会返回 206，
        # 阅读器的进度条拖动就是靠这个。
        return send_from_directory(
            manager.job_dir(job_id).resolve(), f"audio{meta['audio_ext']}"
        )

    @app.delete("/api/jobs/<job_id>")
    def delete_job(job_id):
        if not manager.delete(job_id):
            return jsonify(error="任务不存在"), 404
        return "", 204

    return app


if __name__ == "__main__":
    # use_reloader=False：重载器会 fork 出第二个进程，把模型加载两遍。
    app = create_app()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), use_reloader=False)
