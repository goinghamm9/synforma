"""Aggregate vertex-level predictions into a few cortical systems.

TRIBE v2 predicts one value per fsaverage5 vertex (20,484 vertices) per TR for
an *average subject*. Synforma does not need vertices; it needs a handful of
interpretable series. This module groups the HCP-MMP1 "combined" sections (the
22 neuroanatomical sections of Glasser et al. 2016, as shipped by MNE) into six
coarse systems and averages vertices within each.

The grouping is a documented approximation, chosen for readability, not a
claim about function. Pass your own mapping to `build_systems` to change it.
Everything here is plain numpy so it can be tested without the model.
"""

from __future__ import annotations

import numpy as np

SYSTEM_IDS = ("visual", "language", "attention", "motor", "default", "other")

# Substrings matched (case-insensitively) against the HCP-MMP1 combined section
# names, e.g. "Early Visual Cortex", "Auditory Association Cortex". The medial
# wall ("???") is never included.
DEFAULT_MAPPING: dict[str, tuple[str, ...]] = {
    "visual": ("visual",),
    "language": ("auditory", "lateral temporal", "temporo-parieto-occipital", "inferior frontal"),
    "attention": ("superior parietal", "inferior parietal", "dorsolateral prefrontal"),
    "motor": ("somatosensory and motor", "paracentral", "premotor"),
    "default": ("medial temporal", "posterior cingulate", "anterior cingulate", "orbital and polar"),
}

MEDIAL_WALL = ("???", "medial_wall", "medial wall", "unknown")


def system_of(section_name: str, mapping: dict[str, tuple[str, ...]] | None = None) -> str | None:
    """Return the system id for a section name, "other" if unmatched, None for the medial wall."""
    name = section_name.strip().lower()
    if name in MEDIAL_WALL:
        return None
    for system, needles in (mapping or DEFAULT_MAPPING).items():
        if any(needle in name for needle in needles):
            return system
    return "other"


def build_systems(
    section_vertices: dict[str, np.ndarray],
    mapping: dict[str, tuple[str, ...]] | None = None,
) -> dict[str, np.ndarray]:
    """Map {section name: vertex indices} to {system id: vertex indices}.

    Sections that match no needle land in "other"; the medial wall is dropped.
    Systems with no vertices are omitted so the caller can report coverage.
    """
    buckets: dict[str, list[np.ndarray]] = {s: [] for s in SYSTEM_IDS}
    for section, vertices in section_vertices.items():
        system = system_of(section, mapping)
        if system is None:
            continue
        buckets[system].append(np.asarray(vertices, dtype=np.int64))
    return {s: np.unique(np.concatenate(v)) for s, v in buckets.items() if v}


def aggregate(preds: np.ndarray, systems: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """Mean prediction per system per sample. preds: (n_samples, n_vertices)."""
    if preds.ndim != 2:
        raise ValueError(f"preds must be 2-D (samples × vertices), got shape {preds.shape}")
    out: dict[str, np.ndarray] = {}
    for system, vertices in systems.items():
        if vertices.size == 0:
            continue
        if vertices.max() >= preds.shape[1]:
            raise ValueError(f"system {system!r} references vertex {int(vertices.max())} but preds has {preds.shape[1]} vertices")
        out[system] = preds[:, vertices].mean(axis=1)
    return out


def zscore(series: np.ndarray) -> np.ndarray:
    """Standardise across time; a flat series becomes zeros rather than NaN."""
    series = np.asarray(series, dtype=np.float64)
    sd = series.std()
    if not np.isfinite(sd) or sd == 0:
        return np.zeros_like(series)
    return (series - series.mean()) / sd


def resample_to_grid(times: np.ndarray, values: np.ndarray, sample_s: float, duration_s: float) -> np.ndarray:
    """Place irregular (time, value) samples on a regular grid by nearest sample; gaps hold the previous value."""
    n = int(np.ceil(duration_s / sample_s))
    grid = np.full(n, np.nan)
    if len(times) == 0 or n == 0:
        return np.zeros(n)
    idx = np.clip(np.round(np.asarray(times) / sample_s).astype(int), 0, n - 1)
    for i, v in zip(idx, values):
        grid[i] = v
    # forward-fill, then back-fill the leading gap
    last = np.nan
    for i in range(n):
        if np.isnan(grid[i]):
            grid[i] = last
        else:
            last = grid[i]
    first = next((g for g in grid if not np.isnan(g)), 0.0)
    return np.where(np.isnan(grid), first, grid)
