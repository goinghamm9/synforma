"""CLI: screen recording → stimulus-analysis JSON for Synforma.

    python -m tribe_bridge.analyze --video run.webm --steps run-steps.json --out analysis.json

What this produces is the predicted response of an AVERAGE SUBJECT's cortex to
the recorded screen content, from the TRIBE v2 encoding model. It is a property
of the screens, not a measurement of any person. The JSON carries that sentence
and Synforma shows it wherever the data appears.

Requirements: `pip install -e ".[model]"`, a Hugging Face login with access to
the gated backbones TRIBE v2 downloads, and a GPU for practical run times.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
import uuid
from pathlib import Path

import numpy as np

from . import systems as sysmod

log = logging.getLogger("tribe_bridge")

VERSION = 1
MODEL_REPO = "facebook/tribev2"
LICENSE = "CC BY-NC 4.0 (research use)"
LAG_S = 5.0  # TRIBE v2 shifts predictions 5 s into the past to undo the hemodynamic lag (README).
DISCLAIMER = (
    "Predicted response of an average subject's cortex to the recorded screen content "
    "(TRIBE v2 encoding model). A property of the screens, not a measurement of any person. "
    "Research use; the model is licensed CC BY-NC 4.0."
)


def load_steps(path: Path | None) -> tuple[list[dict], dict]:
    """Accept either a bare list of step windows or {runId, programId, steps: [...]}."""
    if path is None:
        return [], {}
    raw = json.loads(path.read_text())
    meta: dict = {}
    steps = raw
    if isinstance(raw, dict):
        meta = {k: raw[k] for k in ("runId", "programId") if k in raw}
        steps = raw.get("steps", [])
    out = []
    for s in steps:
        out.append({
            "stepId": str(s["stepId"]),
            "title": str(s.get("title", s["stepId"])),
            "startS": max(0.0, float(s["startS"])),
            "endS": max(0.0, float(s["endS"])),
        })
    return out, meta


def segment_times(segments: list, sample_s: float) -> np.ndarray:
    """Absolute start time of each prediction sample, in seconds.

    TRIBE splits the recording into chunks and each chunk into TR-long segments;
    the segment objects carry their timing. If they do not expose it under a
    known attribute, fall back to a regular grid and say so.
    """
    times = []
    for i, seg in enumerate(segments):
        t = None
        for attr in ("start", "onset", "offset"):
            v = getattr(seg, attr, None)
            if isinstance(v, (int, float)):
                t = float(v)
                break
        times.append(i * sample_s if t is None else t)
    arr = np.asarray(times)
    if np.allclose(arr, np.arange(len(segments)) * sample_s):
        log.info("segment timing not exposed; using a regular grid of %.3f s", sample_s)
    return arr


def build_document(
    preds: np.ndarray,
    times: np.ndarray,
    sample_s: float,
    duration_s: float,
    section_vertices: dict[str, np.ndarray],
    *,
    file_name: str,
    checkpoint: str,
    steps: list[dict],
    meta: dict,
) -> dict:
    """Pure assembly of the JSON document; testable without the model."""
    sys_vertices = sysmod.build_systems(section_vertices)
    per_system = sysmod.aggregate(preds, sys_vertices)
    series = []
    for system_id in sysmod.SYSTEM_IDS:
        if system_id not in per_system:
            continue
        on_grid = sysmod.resample_to_grid(times, per_system[system_id], sample_s, duration_s)
        series.append({
            "id": system_id,
            "vertices": int(sys_vertices[system_id].size),
            "values": [round(float(v), 4) for v in sysmod.zscore(on_grid)],
        })
    doc = {
        "version": VERSION,
        "id": f"sa_{uuid.uuid4().hex[:12]}",
        "createdAt": int(time.time() * 1000),
        **meta,
        "source": {"fileName": file_name, "durationS": float(duration_s), "sampleS": float(sample_s), "lagS": LAG_S},
        "model": {"name": MODEL_REPO, "checkpoint": checkpoint, "subject": "average", "license": LICENSE},
        "systems": series,
        "steps": steps,
        "disclaimer": DISCLAIMER,
    }
    return doc


def run(video: Path, steps_path: Path | None, out: Path, device: str, cache: Path, checkpoint: str) -> dict:
    # Imported here so the pure parts of the package work without the model installed.
    from tribev2 import TribeModel  # type: ignore
    from tribev2.utils import get_hcp_labels  # type: ignore

    if video.suffix.lower() not in {".mp4", ".avi", ".mkv", ".mov", ".webm"}:
        raise SystemExit(f"unsupported video format {video.suffix!r}")
    steps, meta = load_steps(steps_path)

    log.info("loading %s (%s) on %s", MODEL_REPO, checkpoint, device)
    model = TribeModel.from_pretrained(MODEL_REPO, checkpoint_name=checkpoint, cache_folder=str(cache), device=device)
    sample_s = float(model.data.TR)

    log.info("extracting events from %s", video)
    events = model.get_events_dataframe(video_path=str(video))
    preds, segments = model.predict(events=events)
    times = segment_times(segments, sample_s)
    duration_s = float(max(times.max() + sample_s if len(times) else 0.0, max((s["endS"] for s in steps), default=0.0)))

    log.info("aggregating %d samples × %d vertices into systems", *preds.shape)
    section_vertices = get_hcp_labels(mesh="fsaverage5", combine=True, hemi="both")
    doc = build_document(preds, times, sample_s, duration_s, section_vertices, file_name=video.name, checkpoint=checkpoint, steps=steps, meta=meta)
    out.write_text(json.dumps(doc, indent=2))
    covered = {s["id"]: s["vertices"] for s in doc["systems"]}
    log.info("wrote %s · systems: %s", out, covered)
    return doc


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--video", required=True, type=Path, help="screen recording (webm/mp4/mov/mkv/avi)")
    p.add_argument("--steps", type=Path, help="run-steps.json exported by Synforma (step windows)")
    p.add_argument("--out", required=True, type=Path, help="where to write the analysis JSON")
    p.add_argument("--device", default="auto", help='"auto", "cuda" or "cpu"')
    p.add_argument("--cache", default=Path("./cache"), type=Path, help="model cache folder")
    p.add_argument("--checkpoint", default="best.ckpt", help="checkpoint file inside the HF repo")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    run(args.video, args.steps, args.out, args.device, args.cache, args.checkpoint)
    return 0


if __name__ == "__main__":
    sys.exit(main())
