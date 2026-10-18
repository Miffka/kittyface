"""Detect the face and landmarks on images, score each FGS action unit against
models/thresholds.json, and write overlays with the ratios and scores drawn on.

Usage: uv run python scripts/05_score_image.py <image_or_dir>... --out <dir> [--json <file>]
"""

import argparse
import importlib.util
import json
import sys
from pathlib import Path

import cv2

from kittyface.core.geometry import (
    ear_spread_ratio,
    eye_opening_ratio,
    muzzle_roundness,
    score_ratio,
    whisker_elevation,
)

ROOT = Path(__file__).resolve().parents[1]
THRESHOLDS = ROOT / "models" / "thresholds.json"
METRICS = {
    "ear": ear_spread_ratio,
    "orbital": eye_opening_ratio,
    "muzzle": muzzle_roundness,
    "whisker": whisker_elevation,
}

_spec = importlib.util.spec_from_file_location("detect", ROOT / "scripts" / "02_detect_landmarks.py")
assert _spec and _spec.loader
detect = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(detect)


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs", type=Path, nargs="+", help="image files or directories of images")
    parser.add_argument("--out", type=Path, required=True, help="directory for the overlays")
    parser.add_argument("--json", type=Path, help="also write each image's box, landmarks, ratios and scores here")
    args = parser.parse_args(argv)

    images = [p for i in args.inputs for p in (sorted(i.iterdir()) if i.is_dir() else [i])]
    version = json.loads(THRESHOLDS.read_text())["version"]
    localizer, landmarks_model = detect.load_models(ROOT / "models" / "manifest.json")
    args.out.mkdir(parents=True, exist_ok=True)
    results: dict = {"threshold_version": version, "images": {}}

    for path in images:
        image = cv2.imread(str(path))
        detect.validate_image(image, path)
        box = detect.detect_face_box(image, localizer)
        landmarks = detect.detect_landmarks(image, box, landmarks_model)
        lines = [version]
        ratios, scores = {}, {}
        for unit, metric in METRICS.items():
            ratios[unit] = float(metric(landmarks[None])[0])
            scores[unit] = score_ratio(ratios[unit], unit, version, THRESHOLDS)
            lines.append(f"{unit} {ratios[unit]:.3f} -> {scores[unit]}")
        results["images"][path.name] = {
            "box": [float(v) for v in box],
            "landmarks": landmarks.tolist(),
            "ratios": ratios,
            "scores": scores,
        }

        overlay = detect.draw_overlay(image, box, landmarks)
        cv2.rectangle(overlay, (0, 0), (230, 12 + 22 * len(lines)), (0, 0, 0), -1)
        for i, line in enumerate(lines):
            cv2.putText(overlay, line, (8, 24 + 22 * i), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
        cv2.imwrite(str(args.out / path.name), overlay)
        print(f"{path.name}: {', '.join(lines[1:])}")
    if args.json:
        args.json.write_text(json.dumps(results, indent=2) + "\n")


if __name__ == "__main__":
    main(sys.argv[1:])
