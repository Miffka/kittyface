import numpy as np

from kittyface.core.geometry import (
    ear_spread_ratio,
    eye_opening_ratio,
    muzzle_roundness,
    score_au,
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
