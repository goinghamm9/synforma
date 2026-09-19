import json
import numpy as np

from tribe_bridge import systems as s
from tribe_bridge.analyze import build_document, load_steps, DISCLAIMER


SECTIONS = {
    "???": np.array([0, 1]),
    "Primary Visual Cortex (V1)": np.array([2, 3]),
    "Early Visual Cortex": np.array([4]),
    "Auditory Association Cortex": np.array([5, 6]),
    "Inferior Frontal Cortex": np.array([7]),
    "Superior Parietal Cortex": np.array([8]),
    "Somatosensory and Motor Cortex": np.array([9]),
    "Posterior Cingulate Cortex": np.array([10]),
    "Insular and Frontal Opercular Cortex": np.array([11]),
}


def test_mapping_covers_sections_and_drops_medial_wall():
    sv = s.build_systems(SECTIONS)
    assert set(sv) == {"visual", "language", "attention", "motor", "default", "other"}
    assert sv["visual"].tolist() == [2, 3, 4]
    assert sv["language"].tolist() == [5, 6, 7]
    assert sv["other"].tolist() == [11]
    assert 0 not in np.concatenate(list(sv.values())) and 1 not in np.concatenate(list(sv.values()))


def test_aggregate_means_vertices_per_system():
    preds = np.zeros((3, 12))
    preds[:, 2] = [1, 2, 3]
    preds[:, 3] = [3, 2, 1]
    preds[:, 4] = [2, 2, 2]
    out = s.aggregate(preds, s.build_systems(SECTIONS))
    assert np.allclose(out["visual"], [2, 2, 2])
    assert np.allclose(out["motor"], [0, 0, 0])


def test_zscore_flat_series_is_zero_not_nan():
    assert np.all(s.zscore(np.array([1.0, 1.0, 1.0])) == 0)
    z = s.zscore(np.array([0.0, 2.0]))
    assert np.allclose(z, [-1, 1])


def test_resample_forward_fills_gaps():
    grid = s.resample_to_grid(np.array([0.0, 3.0]), np.array([1.0, 5.0]), sample_s=1.0, duration_s=5.0)
    assert grid.tolist() == [1.0, 1.0, 1.0, 5.0, 5.0]


def test_document_matches_synforma_contract(tmp_path):
    steps_file = tmp_path / "steps.json"
    steps_file.write_text(json.dumps({"runId": "run_1", "programId": "p_1", "steps": [{"stepId": "s1", "title": "Open", "startS": 0, "endS": 2}, {"stepId": "s2", "title": "Fill", "startS": 2, "endS": 4}]}))
    steps, meta = load_steps(steps_file)
    preds = np.random.default_rng(0).normal(size=(4, 12))
    times = np.arange(4) * 1.0
    doc = build_document(preds, times, 1.0, 4.0, SECTIONS, file_name="run.webm", checkpoint="best.ckpt", steps=steps, meta=meta)
    assert doc["version"] == 1 and doc["runId"] == "run_1" and doc["programId"] == "p_1"
    assert doc["model"]["subject"] == "average" and "CC BY-NC" in doc["model"]["license"]
    assert doc["disclaimer"] == DISCLAIMER and "not a measurement of any person" in doc["disclaimer"]
    assert [x["id"] for x in doc["systems"]] == ["visual", "language", "attention", "motor", "default", "other"]
    assert all(len(x["values"]) == 4 for x in doc["systems"])
    assert doc["source"]["sampleS"] == 1.0 and doc["source"]["lagS"] == 5.0
    assert doc["steps"][1]["title"] == "Fill"
