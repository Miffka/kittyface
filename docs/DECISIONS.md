# Decisions

## OpenVINO runs the tflite reference in the ONNX export check (RSCH-6)

`scripts/03_export_onnx.py` compares each ONNX export against the tflite original run through OpenVINO, the runtime `scripts/02_detect_landmarks.py` already uses. OpenVINO is a runtime dependency, so the check needs no second tflite interpreter, and it validates the ONNX file against the same outputs the app pipeline has produced so far. TensorFlow's `tf.lite.Interpreter` is deprecated and only arrives with the `train` group.

## ONNX export tolerance: 1e-4 normalized, measured basis (RSCH-6)

The check fails when any raw output element differs by more than 1e-4 in normalized [0, 1] units: 0.022 px on the 224 px localizer input and 0.038 px on the 384 px landmark crop. On the five CatFLW fixtures (tf2onnx 1.17.0, TensorFlow 2.21.0, onnxruntime 1.30.0, OpenVINO 2026.4.0) the largest divergence was 1.8e-7 for `cat_face_localizer` and 2.3e-5 for `cat_face_landmarks_full`. The tolerance gives about 4x headroom over the worst model and stays two orders of magnitude under a pixel. If a dependency upgrade pushes divergence past it, re-measure before raising it.

## CatFLW images stay local-only fixtures (RSCH-6)

The export check runs on five CatFLW photos in `data/catflw/images/`. We have no redistribution rights for them, so `.gitignore` excludes `data/` and nothing under it gets committed. Tests that need the photos skip with a stated reason when the directory is missing or empty, and `scripts/03_export_onnx.py` exits non-zero naming the path.
