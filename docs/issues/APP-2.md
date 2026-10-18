# APP-2: detect the face box in the browser

Groomed retrospectively from the [APP-2 entry](../backlog.md#app-2-detect-the-face-box-in-the-browser). Status: delivered (partial). The flow is built on a placeholder detector.

**Story.** As a user, I want the app to draw a box around my cat's face after I upload a photo, so I can see what it found.

**Scope.**
- `frontend/src/ml/detection.ts`: `loadModels` and `detectBox(image)`. Both are placeholders. `loadModels` waits one second and reports progress. `detectBox` returns the central half of the image after 300 ms. Signatures are fixed so the real code can replace the file.
- `frontend/src/state/app.tsx` `ensureModels`: loads once, keeps progress and error state, allows retry.
- `frontend/src/components/ModelLoader.tsx`: progress bar while loading, error with a Retry button on failure.
- `frontend/src/components/Workspace.tsx`: a "Finding the cat's face…" spinner during detection. A `null` box shows "No cat face found in this photo" with "Try another photo". A thrown error shows "Detection failed on this photo."

**Acceptance criteria.**
- [x] After a valid upload the box is drawn on the image.
- [x] When `detectBox` returns `null`, the panel reads "No cat face found in this photo" and the spinner is gone.
- [x] When model loading fails, the loader shows the error and a Retry button, and an upload reports that the models could not be loaded.
- [x] Each outcome (face, no face, load failure, error) sends an event (see [APP-21](APP-21.md)).

**Depends on.** [APP-1](APP-1.md).

**Out of scope.**
- ONNX Runtime Web with `cat_face_localizer` loaded from `models/`. Open in [APP-2 in the backlog](../backlog.md#app-2-detect-the-face-box-in-the-browser). The criterion "a clear cat face gets a box within a few seconds" is unverified until it lands.
- Model hash verification: [APP-18](../backlog.md#app-18-verify-models-before-running-them).
