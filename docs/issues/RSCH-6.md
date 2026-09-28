# RSCH-6 (export): tflite to ONNX conversion and equivalence check

Groomed from the RSCH-6 entry in [`docs/backlog.md`](../backlog.md#rsch-6-export-tflite-to-onnx-conversion-and-equivalence-check). This file supersedes that entry.

**Problem.** The browser needs ONNX versions of the two tflite models (`cat_face_localizer`, `cat_face_landmarks_full`) to run ONNX Runtime Web (PLAN_PROJECT.md items 14, 15). A converted model can drift from its original, so every export has to be checked against the tflite model on real cat photos before anyone trusts it. The export and the check live in one script, so a model can't reach `models/` without passing the check.

**Scope.**
- A new `train` dependency group in `pyproject.toml` holding `tf2onnx` and `tensorflow-cpu`, pinned to versions that install and run together on Python 3.12. If the pair needs an older numpy, pin numpy in the group too. `onnxruntime` and `onnxsim` stay in `dev`; OpenVINO stays a runtime dep. If no set of tf2onnx, TensorFlow and numpy versions works on 3.12, stop and report which combinations you tried and how each failed. Do not switch to another converter.
- One script, `scripts/03_export_onnx.py`, in the style of `scripts/01_fetch_weights.py` and `scripts/02_detect_landmarks.py`. It lives in `scripts/`, not in a `catface.ml` package.
- A function `export_and_check(tflite_path, images)` that handles one tflite file end to end: convert it with tf2onnx, simplify the result with onnxsim, save it as `models/<stem>.onnx` (for example `models/cat_face_localizer.onnx`), then run the ONNX model with `onnxruntime` and the tflite model with OpenVINO (loaded as `scripts/02_detect_landmarks.py` loads it) on every fixture image and compare their raw output tensors. It returns the ONNX file's sha256 on success and raises on failure, naming the fixture file and the model.
- Model inputs come from real preprocessed photos, never random tensors. Build them the way `scripts/02_detect_landmarks.py` does, with `kittyface.core.geometry`: the localizer gets `letterbox_square(image, 224)`; the landmark model gets `crop_and_resize(image, expand_box(box, margin=0.1, ...), 384)`, where `box` comes from the OpenVINO localizer run on the same image. Both inputs go through the RGB, float32, /255 conversion in script 02's `_to_model_input`. Script 02's filename starts with a digit, so either copy the few lines you need or load it with `importlib`.
- Compare raw output tensors element-wise. The localizer's raw output order is `[x2, y1, x1, y2]` (see the comment in `detect_face_box`), but both runtimes emit the same tensor, so the order has no bearing on equivalence. Do not reorder before comparing, and say so in a code comment.
- `main()` reads `models/manifest.json`, calls `export_and_check` for each entry, and writes the result into that entry as a nested object: `"onnx": {"file": "<stem>.onnx", "sha256": "<hex>"}`. The existing keys (`file`, `sha256`, `source`, `licence`, `input_shape`, `metrics`) stay as they are. On any failure `main()` exits non-zero with a message naming the fixture and the model, and leaves the manifest unwritten.
- The fixture image directory is a CLI argument (`--images`) defaulting to `data/catflw/images`. The five CatFLW images there have no redistribution rights: they stay local and must never be committed. Keep `data/` in `.gitignore` (the line already sits in the working tree, uncommitted; commit it with this task). A missing or empty image directory raises an error naming the path. It never passes silently.
- Re-running the script with unchanged models and fixtures leaves `models/manifest.json` byte-identical.
- The script's module docstring states the tolerance and its basis. Measure the largest absolute divergence per model across the fixtures first, set the tolerance with headroom above it, and express it both in raw normalized units and in pixels (normalized error × input size: 224 for the localizer, 384 for the landmark model).
- Tests in `tests/test_export_onnx.py` (`tests/` doesn't exist yet; create it). They skip with a stated reason when `tf2onnx` is not installed or the fixture directory is missing or empty, so a plain `uv run pytest` passes on a machine without the `train` group or the CatFLW images.
- Record three decisions in `docs/DECISIONS.md` (create it if missing): OpenVINO as the tflite reference runtime, the tolerance with its measured basis, and CatFLW images as local-only fixtures.
- Fix the stale `catface.ml` references. In `AGENTS.md`, line 8's research-script command becomes `uv run python scripts/<script>.py`, and line 3's description of the `train` group lists what the group contains after this task. In `docs/backlog.md`, line 3's track tag `(research track, catface.ml)` and RSCH-5's scope ("A script under `catface.ml`") both point to `scripts/`.

**Acceptance criteria.**
- [ ] `uv sync --group train --group dev` succeeds on Python 3.12, and `pyproject.toml` shows a `train` group with `tf2onnx` and `tensorflow-cpu` pinned.
- [ ] With the five CatFLW images in `data/catflw/images/`, `uv run python scripts/03_export_onnx.py` exits zero and leaves `models/cat_face_localizer.onnx` and `models/cat_face_landmarks_full.onnx` on disk.
- [ ] After that run, each entry in `models/manifest.json` has an `"onnx"` object with `file` and `sha256`, each `sha256` matches `sha256sum` of its file, and `git diff models/manifest.json` shows no change to any pre-existing key.
- [ ] A second run produces no diff in `models/manifest.json`.
- [ ] Running with `--images` pointed at a nonexistent or empty directory exits non-zero with a message naming that path, and the manifest is unchanged.
- [ ] A test that sets the tolerance below the measured divergence (or perturbs one ONNX output) makes `export_and_check` raise an error naming the fixture file and the model.
- [ ] The script's docstring states the tolerance in raw units and in pixels, plus the measured maximum divergence per model it came from.
- [ ] The comparison compares raw tensors, with a comment explaining why the localizer's `[x2, y1, x1, y2]` order doesn't matter there.
- [ ] `git status` shows nothing under `data/`, and the committed `.gitignore` contains `data/`.
- [ ] `uv run pytest` passes with the `train` group and fixtures present, and also passes, reporting the tests as skipped, without `tf2onnx` or without the fixture directory.
- [ ] `docs/DECISIONS.md` has entries for the OpenVINO reference, the tolerance, and the local-only CatFLW fixtures.
- [ ] `grep -rn catface.ml AGENTS.md docs/backlog.md` returns nothing.

**Depends on.** Nothing outstanding. `scripts/01_fetch_weights.py` supplies the tflite files; the fixture images already sit in `data/catflw/images/` on the product owner's machine.

**Engineer notes (open, not delivered).**
- Pins: `tf2onnx==1.17.0`, `tensorflow-cpu==2.21.0` in the new `train` group. The first pair tried installed and converted on Python 3.12 with numpy 2.5.3, so the group pins no numpy.
- tf2onnx names internal nodes from a global counter, and its output differs between processes, so two runs produced different sha256s. `scripts/03_export_onnx.py` renames every internal tensor by position after onnxsim, and three consecutive runs now leave `models/manifest.json` byte-identical.
- The ONNX file is written only after every fixture passes, so a failed check leaves nothing in `models/`.
- Measured max divergence: localizer 1.8e-7, landmarks 2.3e-5. Tolerance 1e-4 (0.022 px at 224, 0.038 px at 384).
- The `.onnx` files (34 MB and 23 MB) are not committed. The issue doesn't say whether they belong in git; the manifest records their sha256, and the product owner should decide.
