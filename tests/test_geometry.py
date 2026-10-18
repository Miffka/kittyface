import json
from pathlib import Path

import numpy as np
import pytest

from kittyface.core.geometry import (
    AU_SCORE_RISES,
    ear_spread_ratio,
    eye_opening_ratio,
    muzzle_roundness,
    score_au,
    score_ratio,
    whisker_elevation,
)

# CatFLW 00000001_000.json ground truth, rounded; pupil points 36-41 are
# approximate (no metric reads them).
SHAPE = np.array([
    [200.3, 207.9], [239.6, 168.0], [200.0, 213.4], [175.0, 164.3], [165.7, 154.3], [187.0, 168.1],
    [175.1, 155.1], [175.2, 170.2], [250.3, 160.5], [223.7, 168.2], [239.2, 155.8], [239.7, 173.8],
    [196.4, 184.3], [204.5, 184.9], [191.7, 188.1], [208.9, 189.7], [200.0, 199.5], [200.2, 204.9],
    [204.9, 210.3], [215.7, 214.2], [194.4, 209.9], [182.8, 215.3], [153.9, 125.7], [144.3, 104.0],
    [139.0, 79.8], [159.7, 88.7], [175.8, 103.5], [269.0, 114.2], [289.0, 102.6], [314.4, 98.3],
    [303.0, 127.0], [292.0, 157.0], [150.0, 186.0], [178.0, 200.0], [223.0, 202.0], [249.0, 195.0],
    [170.0, 160.0], [180.0, 160.0], [175.0, 158.0], [239.0, 159.0], [234.0, 162.0], [244.0, 162.0],
    [177.0, 187.0], [227.0, 193.0], [195.0, 191.0], [204.0, 191.0], [158.0, 205.0], [240.0, 214.0],
])  # fmt: skip
METRICS = (ear_spread_ratio, eye_opening_ratio, muzzle_roundness, whisker_elevation)


def moved(changes: dict[int, tuple[float, float]]) -> np.ndarray:
    shape = SHAPE.copy()
    for index, delta in changes.items():
        shape[index] += delta
    return shape[None]


def test_metrics_ignore_rotation_and_scale():
    t = np.radians(25)
    rotation = np.array([[np.cos(t), -np.sin(t)], [np.sin(t), np.cos(t)]])
    transformed = (SHAPE @ rotation.T * 3.7 + 40)[None]
    for metric in METRICS:
        np.testing.assert_allclose(metric(transformed), metric(SHAPE[None]))


def test_metrics_move_with_their_au():
    base = SHAPE[None]
    assert ear_spread_ratio(moved({24: (-15, 0), 29: (15, 0)})) > ear_spread_ratio(base)
    assert eye_opening_ratio(moved({6: (0, 6), 10: (0, 6)})) < eye_opening_ratio(base)
    # Raising both pads tilts each upward from its muzzle side, on both sides.
    assert whisker_elevation(moved({32: (0, -10), 35: (0, -10)})) > whisker_elevation(base)
    assert whisker_elevation(moved({32: (0, 10), 35: (0, 10)})) < whisker_elevation(base)

    circle = np.zeros((1, 48, 2))
    angles = np.linspace(0, 2 * np.pi, 9, endpoint=False)
    circle[0, [12, 13, 35, 47, 19, 2, 21, 46, 32]] = np.stack([np.cos(angles), np.sin(angles)], axis=1)
    np.testing.assert_allclose(muzzle_roundness(circle), 1)
    assert muzzle_roundness(circle * [1, 0.5]) < 0.6


def test_score_au_boundaries():
    values = np.array([0.9, 1.0, 1.1, 1.9, 2.0, 2.1])
    np.testing.assert_array_equal(score_au(values, (1.0, 2.0)), [0, 0, 1, 1, 1, 2])
    np.testing.assert_array_equal(score_au(values, (1.0, 2.0), rises=False), [2, 1, 1, 1, 0, 0])


def write_thresholds(path: Path, version: str, ear: list[float], muzzle: list[float]) -> Path:
    units = {"ear": {"cutoffs": ear}, "muzzle": {"cutoffs": muzzle}}
    path.write_text(json.dumps({"version": version, "units": units}))
    return path


def test_score_ratio_boundaries(tmp_path):
    path = write_thresholds(tmp_path / "t.json", "v1", ear=[1.7, 2.0], muzzle=[0.37, 0.42])
    eps = 1e-6
    ear = [score_ratio(v, "ear", "v1", path) for v in (1.7 - eps, 1.7, 1.7 + eps, 2.0 - eps, 2.0, 2.0 + eps)]
    assert ear == [0, 0, 1, 1, 1, 2]  # rises
    muzzle = [score_ratio(v, "muzzle", "v1", path) for v in (0.37 - eps, 0.37, 0.37 + eps, 0.42 - eps, 0.42, 0.42 + eps)]
    assert muzzle == [2, 1, 1, 1, 0, 0]  # falls


def test_score_ratio_rejects_other_version(tmp_path):
    path = write_thresholds(tmp_path / "t.json", "v1", ear=[1.7, 2.0], muzzle=[0.37, 0.42])
    with pytest.raises(ValueError, match="v2"):
        score_ratio(1.8, "ear", "v2", path)


def test_rescoring_stored_landmarks_needs_no_detection(tmp_path):
    ratio = float(ear_spread_ratio(SHAPE[None])[0])
    old = write_thresholds(tmp_path / "old.json", "v1", ear=[ratio + 1, ratio + 2], muzzle=[0, 1])
    new = write_thresholds(tmp_path / "new.json", "v2", ear=[ratio - 2, ratio - 1], muzzle=[0, 1])
    assert (score_ratio(ratio, "ear", "v1", old), score_ratio(ratio, "ear", "v2", new)) == (0, 2)


def test_committed_thresholds_cover_every_au():
    thresholds = json.loads((Path(__file__).parents[1] / "models" / "thresholds.json").read_text())
    assert thresholds["version"]
    assert thresholds["units"].keys() == AU_SCORE_RISES.keys()
