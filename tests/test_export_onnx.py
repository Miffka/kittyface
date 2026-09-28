import hashlib
import importlib.util
import json
import shutil
from pathlib import Path

import pytest

pytest.importorskip("tf2onnx", reason="tf2onnx not installed (uv sync --group train)")

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("export_onnx", ROOT / "scripts" / "03_export_onnx.py")
export_onnx = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(export_onnx)

MANIFEST = ROOT / "models" / "manifest.json"
IMAGES = ROOT / "data" / "catflw" / "images"


@pytest.fixture
def images():
    try:
        return export_onnx.fixture_images(IMAGES)
    except ValueError:
        pytest.skip(f"CatFLW fixtures missing or empty: {IMAGES}")


@pytest.fixture
def localizer(tmp_path):
    # Copy the tflite so the export writes into tmp_path, never into models/.
    return Path(shutil.copy(ROOT / "models" / "cat_face_localizer.tflite", tmp_path))


def test_export_matches_manifest(localizer, images):
    sha = export_onnx.export_and_check(localizer, images)
    onnx_file = localizer.with_suffix(".onnx")
    assert sha == hashlib.sha256(onnx_file.read_bytes()).hexdigest()
    recorded = json.loads(MANIFEST.read_text())["cat_face_localizer"].get("onnx")
    if recorded:  # a re-export reproduces the committed hash byte for byte
        assert sha == recorded["sha256"]


def test_perturbed_onnx_output_fails_naming_fixture_and_model(localizer, images, monkeypatch):
    class Perturbed(export_onnx.ort.InferenceSession):
        def run(self, *args, **kwargs):
            out = super().run(*args, **kwargs)
            return [out[0] + 1e-3, *out[1:]]

    monkeypatch.setattr(export_onnx.ort, "InferenceSession", Perturbed)
    with pytest.raises(ValueError, match=rf"cat_face_localizer\.tflite.*{images[0].name}"):
        export_onnx.export_and_check(localizer, images)
    assert not localizer.with_suffix(".onnx").exists()


@pytest.mark.parametrize("name", ["missing", "empty"])
def test_bad_image_dir_exits_naming_path(tmp_path, name):
    images = tmp_path / name
    if name == "empty":
        images.mkdir()
    before = MANIFEST.read_bytes()
    with pytest.raises(SystemExit, match=str(images)):
        export_onnx.main(["--images", str(images)])
    assert MANIFEST.read_bytes() == before
