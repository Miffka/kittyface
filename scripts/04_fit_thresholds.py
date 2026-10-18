"""Fit 0-2 cutoffs per FGS action unit from the labeled FGS manual images and
write them to models/thresholds.json. Also prints the correlation between
whisker elevation and muzzle roundness for the About page.

Landmarks are cached in data/fsg/landmarks.json, so refitting does not re-run
detection unless --redetect is given.

Usage: uv run python scripts/04_fit_thresholds.py [--redetect]
"""

import argparse
import csv
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np

from kittyface.core.geometry import (
    AU_SCORE_RISES,
    ear_spread_ratio,
    eye_opening_ratio,
    muzzle_roundness,
    score_au,
    whisker_elevation,
)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "fsg"
VERSION = "fgs-manual-1.0.0"
# annotations.csv feature name -> (thresholds.json unit, metric)
FEATURES = {
    "ear_position": ("ear", ear_spread_ratio),
    "orbital_tightening": ("orbital", eye_opening_ratio),
    "muzzle_tension": ("muzzle", muzzle_roundness),
    "whiskers_change": ("whisker", whisker_elevation),
}

_spec = importlib.util.spec_from_file_location("detect", ROOT / "scripts" / "02_detect_landmarks.py")
assert _spec and _spec.loader
detect = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(detect)


def load_landmarks(image_paths: list[str], cache_path: Path, redetect: bool) -> dict[str, np.ndarray]:
    """48x2 landmarks per image path, detecting only what the cache lacks."""
    cache = {} if redetect or not cache_path.exists() else json.loads(cache_path.read_text())
    missing = [p for p in image_paths if p not in cache]
    if missing:
        localizer, landmarks_model = detect.load_models(ROOT / "models" / "manifest.json")
        for path in missing:
            image = cv2.imread(str(DATA / path))
            detect.validate_image(image, DATA / path)
            box = detect.detect_face_box(image, localizer)
            cache[path] = detect.detect_landmarks(image, box, landmarks_model).round(2).tolist()
        cache_path.write_text(json.dumps(cache, indent=2, sort_keys=True) + "\n")
    print(f"detected {len(missing)}, cached {len(image_paths) - len(missing)}")
    return {p: np.array(cache[p]) for p in image_paths}


def fit_unit(ratios: np.ndarray, scores: np.ndarray, rises: bool) -> dict:
    """Cutoffs at the midpoints between adjacent score levels' mean ratios."""
    # ponytail: midpoints of n=1 class means; ordinal regression once there are more labeled images
    means = [float(ratios[scores == s].mean()) for s in (0, 1, 2)]
    cutoffs = sorted([(means[0] + means[1]) / 2, (means[1] + means[2]) / 2])
    agreement = int((score_au(ratios, cutoffs, rises) == scores).sum())
    return {
        "cutoffs": [round(c, 4) for c in cutoffs],
        "direction": "ascending" if rises else "descending",
        "fit": {"ratios": [round(m, 4) for m in means], "agreement": f"{agreement}/{len(scores)}"},
    }


def pearson_with_ci(x: np.ndarray, y: np.ndarray) -> tuple[float, float, float]:
    """Pearson r and its 95% CI from Fisher's z."""
    r = float(np.corrcoef(x, y)[0, 1])
    half = 1.96 / math.sqrt(len(x) - 3)
    return r, math.tanh(math.atanh(r) - half), math.tanh(math.atanh(r) + half)


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--redetect", action="store_true", help="ignore the landmark cache")
    args = parser.parse_args(argv)

    rows = list(csv.DictReader((DATA / "annotations.csv").open()))
    landmarks = load_landmarks(sorted({r["image_path"] for r in rows}), DATA / "landmarks.json", args.redetect)

    units = {}
    for feature, (unit, metric) in FEATURES.items():
        labeled = [r for r in rows if r["feature"] == feature]
        ratios = metric(np.stack([landmarks[r["image_path"]] for r in labeled]))
        units[unit] = fit_unit(ratios, np.array([int(r["score"]) for r in labeled]), AU_SCORE_RISES[unit])
        print(f"{unit:8s} {units[unit]}")

    # Several manual pages reuse a photo; count each photo once.
    unique = {hashlib.sha256((DATA / p).read_bytes()).hexdigest(): p for p in sorted(landmarks)}
    shapes = np.stack([landmarks[p] for p in sorted(unique.values())])
    r, low, high = pearson_with_ci(whisker_elevation(shapes), muzzle_roundness(shapes))
    print(f"whisker elevation vs muzzle roundness: r = {r:.2f} (95% CI {low:.2f} to {high:.2f}), n = {len(shapes)}")

    out = ROOT / "models" / "thresholds.json"
    out.write_text(json.dumps({"version": VERSION, "units": units}, indent=2) + "\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    main(sys.argv[1:])
