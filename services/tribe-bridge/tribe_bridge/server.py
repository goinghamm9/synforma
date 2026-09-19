"""Optional HTTP front for the bridge: POST /analyze (multipart video + steps JSON) → analysis JSON.

    uvicorn tribe_bridge.server:app --host 127.0.0.1 --port 8765

Runs the same code path as the CLI. Keep it on a private network: it accepts
video uploads and holds the model in memory.
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from .analyze import run

app = FastAPI(title="Synforma TRIBE bridge", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model": "facebook/tribev2", "license": "CC BY-NC 4.0 (research use)"}


@app.post("/analyze")
async def analyze(
    video: UploadFile = File(...),
    steps: str | None = Form(default=None),
    device: str = Form(default="auto"),
) -> dict:
    suffix = Path(video.filename or "recording.webm").suffix.lower() or ".webm"
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        video_path = tmp_dir / f"recording{suffix}"
        video_path.write_bytes(await video.read())
        steps_path = None
        if steps:
            try:
                json.loads(steps)
            except json.JSONDecodeError as e:
                raise HTTPException(status_code=400, detail=f"steps is not JSON: {e}") from e
            steps_path = tmp_dir / "steps.json"
            steps_path.write_text(steps)
        out = tmp_dir / "analysis.json"
        try:
            return run(video_path, steps_path, out, device, Path("./cache"), "best.ckpt")
        except SystemExit as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
