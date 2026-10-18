# APP-3: detect the 48 landmarks

Groomed retrospectively from the [APP-3 entry](../backlog.md#app-3-detect-the-48-landmarks). Status: delivered (partial). The flow is built on a placeholder detector.

**Story.** As a user, I want to see 48 facial landmarks on my cat's face, so I can check the detection before I edit anything.

**Scope.**
- `frontend/src/ml/detection.ts` `detectLandmarks(image, box)`: placeholder that returns 48 points from a fixed template, placed inside the box in upright-image pixels after 300 ms.
- `LANDMARK_REGIONS`: the region of each index (ears 0-15, eyes 16-31, nose and whisker pads 32-47), used for point colours.
- `frontend/src/components/Editor.tsx`: draws the points over the image in the image's own pixel space.
- `frontend/src/test/geometry-detection.test.ts`: checks 48 points inside the box.

**Acceptance criteria.**
- [x] After a box is found, 48 points appear on the image.
- [x] Point coordinates are in upright-image pixels, not crop-normalized values.
- [x] Points are coloured by region.

**Depends on.** [APP-2](APP-2.md).

**Out of scope.**
- Running `cat_face_landmarks_full` on the crop, with the letterbox and crop math ported from `kittyface.core.geometry`. Open in [APP-3 in the backlog](../backlog.md#app-3-detect-the-48-landmarks).
