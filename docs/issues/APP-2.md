# APP-2: detect the face box in the browser

Groomed retrospectively from the [APP-2 entry](../backlog.md#app-2-detect-the-face-box-in-the-browser). Status: delivered (partial). The real localizer runs in the browser. Nobody has checked its boxes on real photos yet, and it cannot report "no face".

**Story.** As a user, I want the app to draw a box around my cat's face after I upload a photo, so I can see what it found.

**Scope.**
- `frontend/public/models/cat_face_localizer.onnx`: a copy of `models/cat_face_localizer.onnx`, served at `/models/`. Git LFS tracks both copies.
- `frontend/src/ml/detection.ts` `loadModels`: imports `onnxruntime-web` on first call (so SSR never loads it), downloads both ONNX files with byte-level progress, and creates WASM sessions. It returns model version `cat-face-landmarks-onnx-b4c72851-bf094279`, built from the ONNX sha256 prefixes in `models/manifest.json`, and backend `wasm`.
- `detectBox(image)`: ports `scripts/02_detect_landmarks.py`. It letterboxes the image onto a black 224 × 224 square, feeds RGB in [0, 1] as NHWC, reorders the raw `[x2, y1, x1, y2]` output to xyxy, maps it back to image pixels, and clamps it to the image. It returns `null` only for a zero-area box.
- `frontend/src/state/app.tsx` `ensureModels`: loads once, keeps progress and error state, allows retry.
- `frontend/src/components/ModelLoader.tsx`: a progress bar while loading ("about 55 MB"), and an error with a Retry button on failure.
- `frontend/src/components/Workspace.tsx`: a "Finding the cat's face…" spinner during detection. A `null` box shows "No cat face found in this photo" with "Try another photo". A thrown error shows "Detection failed on this photo."
- `frontend/src/test/geometry-detection.test.ts`: covers the letterbox and unletterbox maths.

**Acceptance criteria.**
- [x] After a valid upload the box is drawn on the image.
- [x] When `detectBox` returns `null`, the panel reads "No cat face found in this photo" and the spinner is gone.
- [x] When model loading fails, the loader shows the error and a Retry button, and an upload reports that the models could not be loaded.
- [x] Each outcome (face, no face, load failure, error) sends an event (see [APP-21](APP-21.md)).
- [ ] Uploading a photo with a clear cat face draws a box around it within a few seconds. Unit tests and the build pass; nobody has run the app in a browser.

**Depends on.** [APP-1](APP-1.md).

**Out of scope.**
- A real "no face found" outcome. The localizer has no confidence output, so a photo without a cat still gets a box. Open in [APP-2 in the backlog](../backlog.md#app-2-detect-the-face-box-in-the-browser).
- The WebGPU backend.
- The ORT WASM runtime (28 MB, about 7 MB gzipped) loads outside the progress bar.
- Model hash verification: [APP-18](../backlog.md#app-18-verify-models-before-running-them).
