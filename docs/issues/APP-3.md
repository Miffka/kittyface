# APP-3: detect the 48 landmarks

Groomed retrospectively from the [APP-3 entry](../backlog.md#app-3-detect-the-48-landmarks). Status: delivered (partial). The real landmark model runs in the browser. Nobody has checked its points on real photos yet.

**Story.** As a user, I want to see 48 facial landmarks on my cat's face, so I can check the detection before I edit anything.

**Scope.**
- `frontend/public/models/cat_face_landmarks_full.onnx`: a copy of `models/cat_face_landmarks_full.onnx`, served at `/models/`. Git LFS tracks both copies.
- `frontend/src/ml/detection.ts` `detectLandmarks(image, box)`: ports `scripts/02_detect_landmarks.py` and `kittyface.core.geometry`. It grows the box by 0.1 of its size on each side (`expandBox`, rounded and clipped), stretches the crop to 384 × 384, runs the model, and maps the 48 crop-normalized points back to upright-image pixels (`mapPoints`).
- `LANDMARK_REGIONS`: the region of each index from the groups in `kittyface.core.geometry` (left eye 3-7 and 36-38, right eye 1, 8-11 and 39-41, left ear 22-26, right ear 27-31, all others nose and whisker pads). Point colours use it.
- `frontend/src/components/Editor.tsx`: draws the points over the image in the image's own pixel space.
- `frontend/src/test/geometry-detection.test.ts`: covers `expandBox`, `mapPoints` and the region groups.

**Acceptance criteria.**
- [x] After a box is found, 48 points appear on the image.
- [x] Point coordinates are in upright-image pixels, not crop-normalized values.
- [x] Points are coloured by region.
- [ ] After a box is detected, 48 points land on the face within a few seconds. Unit tests and the build pass; nobody has run the app in a browser.

**Depends on.** [APP-2](APP-2.md).

**Out of scope.**
- `frontend/src/geometry/measurements.ts` still reads the old placeholder's index layout (eyes at 16-31), so its ratios mean nothing against real landmarks. [APP-7](APP-7.md) owns that module.
