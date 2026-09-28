"""Convert every tflite model in models/manifest.json to ONNX and check it
against the tflite original on real cat photos.

Usage: uv run python scripts/03_export_onnx.py [--images data/catflw/images]
Needs the train group (uv sync --group train --group dev).

Each model goes tflite -> tf2onnx -> onnxsim, then onnxruntime and OpenVINO
(running the tflite file, as scripts/02_detect_landmarks.py does) score every
fixture image. The ONNX file is written to models/<stem>.onnx and recorded in
the manifest only if every raw output element agrees within TOLERANCE.

TOLERANCE = 1e-4 (max absolute difference per raw output element, in
normalized [0, 1] units). In pixels that is 1e-4 x 224 = 0.022 px for the
localizer and 1e-4 x 384 = 0.038 px for the landmark model.

Basis: on the five CatFLW fixtures (tf2onnx 1.17.0, onnxruntime 1.30.0,
OpenVINO 2026.4.0) the largest divergence measured was
  cat_face_localizer       1.8e-7 (4.0e-5 px at 224)
  cat_face_landmarks_full  2.3e-5 (8.8e-3 px at 384)
so the tolerance sits about 4x above the worst case, and still two orders of
magnitude below a pixel.
"""

import argparse
import hashlib
import json
import sys
from functools import cache
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
import onnxsim
import openvino as ov
import tf2onnx

from kittyface.core.geometry import (
    crop_and_resize,
    expand_box,
    letterbox_square,
    unletterbox_xyxy,
)

ROOT = Path(__file__).resolve().parent.parent
TOLERANCE = 1e-4  # basis in the module docstring
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg"}


@cache
def _openvino(tflite_path: Path) -> ov.CompiledModel:
    core = ov.Core()
    return core.compile_model(core.read_model(tflite_path), "CPU")


def _to_model_input(bgr_image: np.ndarray) -> np.ndarray:
    # Same conversion as scripts/02_detect_landmarks.py.
    rgb = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    return rgb[None]


def model_input(tflite_path: Path, image_path: Path) -> np.ndarray:
    """Preprocess one photo for the model the way script 02 does."""
    image = cv2.imread(str(image_path))
    if image is None:
        raise ValueError(f"could not read image: {image_path}")
    letterboxed, scale, pad_x, pad_y = letterbox_square(image, 224)
    if tflite_path.stem == "cat_face_localizer":
        return _to_model_input(letterboxed)
    localizer = _openvino(tflite_path.parent / "cat_face_localizer.tflite")
    out = localizer(_to_model_input(letterboxed))[0].reshape(-1)
    h, w = image.shape[:2]
    box = unletterbox_xyxy((out[2], out[1], out[0], out[3]), 224, scale, pad_x, pad_y, orig_w=w, orig_h=h)
    crop_box = expand_box(box, margin=0.1, img_w=w, img_h=h)
    return _to_model_input(crop_and_resize(image, crop_box, 384))


def _rename_by_position(model) -> None:
    """tf2onnx names nodes and constants from a global counter, and the counts
    differ from process to process. Renaming every internal tensor by its first
    appearance makes identical graphs serialize to identical bytes, so a re-run
    reproduces the same sha256."""
    g = model.graph
    keep = {v.name for v in [*g.input, *g.output]}
    names: dict[str, str] = {}
    for i, node in enumerate(g.node):
        node.name = f"n{i}"
        for t in [*node.input, *node.output]:
            if t and t not in keep:
                names.setdefault(t, f"t{len(names)}")
        node.input[:] = [names.get(t, t) for t in node.input]
        node.output[:] = [names.get(t, t) for t in node.output]
    for t in [*g.initializer, *g.value_info]:
        t.name = names.get(t.name, t.name)
    g.initializer.sort(key=lambda t: int(t.name[1:]))
    g.value_info.sort(key=lambda t: t.name)


def export_and_check(tflite_path: Path, images: list[Path], tolerance: float = TOLERANCE) -> str:
    """Convert, simplify, check against OpenVINO on every image, then save
    models/<stem>.onnx next to the tflite file. Returns the ONNX sha256."""
    tflite_path = Path(tflite_path)
    model, _ = tf2onnx.convert.from_tflite(str(tflite_path))
    model, ok = onnxsim.simplify(model)
    if not ok:
        raise ValueError(f"{tflite_path.name}: onnxsim could not validate the simplified model")
    _rename_by_position(model)
    data = model.SerializeToString()
    session = ort.InferenceSession(data, providers=["CPUExecutionProvider"])
    reference = _openvino(tflite_path)
    for image_path in images:
        x = model_input(tflite_path, image_path)
        got = session.run(None, {session.get_inputs()[0].name: x})[0]
        want = reference(x)[0]
        # Raw tensors, not boxes: the localizer emits [x2, y1, x1, y2], but both
        # runtimes emit that same tensor, so no reordering is needed to compare.
        diff = float(np.abs(got - want).max()) if got.shape == want.shape else np.inf
        print(f"{tflite_path.stem}: {image_path.name} max |onnx - tflite| = {diff:.2e}")
        if diff > tolerance:
            raise ValueError(
                f"{tflite_path.name}: ONNX output diverges on {image_path.name} "
                f"(max {diff:.2e} > tolerance {tolerance:.0e})"
            )
    out = tflite_path.with_suffix(".onnx")
    out.write_bytes(data)
    return hashlib.sha256(data).hexdigest()


def fixture_images(directory: Path) -> list[Path]:
    images = sorted(p for p in directory.glob("*") if p.suffix.lower() in IMAGE_SUFFIXES)
    if not images:
        raise ValueError(f"no fixture images in {directory} (missing or empty)")
    return images


def dump_manifest(manifest: dict) -> str:
    # Hand-formatted to match the committed file: one key per line, compact values.
    entries = [
        f"  {json.dumps(name)}: {{\n" + ",\n".join(f"    {json.dumps(k)}: {json.dumps(v)}" for k, v in entry.items()) + "\n  }"
        for name, entry in manifest.items()
    ]
    return "{\n" + ",\n".join(entries) + "\n}\n"


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--images", type=Path, default=ROOT / "data" / "catflw" / "images")
    parser.add_argument("--manifest", type=Path, default=ROOT / "models" / "manifest.json")
    args = parser.parse_args(argv)

    manifest = json.loads(args.manifest.read_text())
    try:
        images = fixture_images(args.images)
        for name, entry in manifest.items():
            tflite = args.manifest.parent / entry["file"]
            ref = {"file": tflite.with_suffix(".onnx").name, "sha256": export_and_check(tflite, images)}
            # Put "onnx" right after "sha256" so the manifest diff is additions only.
            manifest[name] = {"file": entry["file"], "sha256": entry["sha256"], "onnx": None} | entry | {"onnx": ref}
    except ValueError as e:
        sys.exit(str(e))
    args.manifest.write_text(dump_manifest(manifest))
    print(f"wrote {args.manifest}")


if __name__ == "__main__":
    main(sys.argv[1:])
