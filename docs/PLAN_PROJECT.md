# PLAN_PROJECT.md

cat-face-studio: a research tool that computes geometric proxies for the Feline
Grimace Scale (FGS) from cat face landmarks.

## Scope

1. **Flow.** The user uploads a cat photo, the browser detects the head box and 48
   landmarks, the user corrects them, and the result is saved to the server.
2. **Output.** Each FGS action unit gets a raw ratio and a 0–2 proxy score, with no
   combined total.
3. **Thresholds.** The 0–2 cut-offs come from a versioned `thresholds.json`
   produced by separate research. Every result records the threshold version, so
   it can be re-scored from its landmarks.
4. **Framing.** Units are labelled "(proxy)" and a persistent notice says the
   scores are not a validated pain assessment. The word "pain" appears only on the
   About page.

## Action units

5. **Ear position.** Ear base-to-tip angle against the inter-ocular axis.
6. **Orbital tightening.** Vertical eyelid distance over corner-to-corner distance.
7. **Muzzle tension.** Aspect ratio of the muzzle outline.
8. **Whisker change.** Forward displacement of the whisker pads relative to the
   nose, labelled as measuring the pads. Its correlation with muzzle tension is
   reported on the About page.
9. **Head position.** Always "not possible to score".

## Legal

10. **FGS material.** The FGS is cited, and none of its images, text or logo are
    used. No endorsement is implied.
11. **Model licence.** The CC BY-NC 4.0 weights are served non-commercially, with
    attribution shown in the app.
12. **Terms.** Uploaders confirm they hold the rights to their photos, and a
    takedown contact is listed. Impressum requirement to be checked.

## Browser inference

13. **Devices.** Desktop browsers only; phones see a notice.
14. **Runtime.** ONNX Runtime Web, WASM backend, WebGPU optional.
15. **Conversion.** A script converts the tflite models to ONNX with tf2onnx, and
    CI checks the outputs match on fixture photos.
16. **Delivery.** Models are listed in `models/manifest.json` with sha256, verified
    by the browser, and served with long-lived cache headers.

## Geometry and validation

17. **Authority.** The browser computes ratios and scores; Python `core` is the
    reference implementation.
18. **Equivalence.** Shared test vectors are checked by Vitest and pytest in CI.
    The JS geometry module is hand-written and every result records its version.
19. **Server validation.** The server checks schema and plausibility and returns
    422 naming the failed check. Rejections are counted by reason.

## Editor

20. **Box editing.** When the user confirms a new box, landmarks are re-detected on
    that crop, after a confirmation if points had been moved.
21. **Stored versions.** Save stores the detector box, final box, model landmarks,
    user landmarks, moved-point flags, and ratios and scores for both landmark sets.

## Users and data

22. **Accounts.** None; a random token in the browser links a user to their
    uploads, history and delete button. Rate limiting is per IP.
23. **Consent.** Research use is a condition of use, accepted before the first
    upload and recorded with timestamp and notice version. Deletion also removes
    research data.
24. **Retention.** All data expires after 12 months.
25. **Images.** The browser uploads the original with EXIF stripped and sends the
    orientation value. The server applies orientation, strips metadata again, and
    stores the upright image.
26. **Formats.** JPEG, PNG and WebP up to 5 MB; landmarks are stored in
    original-image pixel coordinates.

## Stack

27. **Frontend.** React, Vite and TypeScript, prototyped in Lovable and maintained
    in the repo by hand.
28. **Backend.** FastAPI with SQLite locally and Postgres in production, switched
    by `DATABASE_URL`.
29. **Schema.** Alembic migrations run on container start, with one column per
    ratio and score.

## Operations

30. **Hosting.** AWS EC2 free tier, t3.micro, with a 2 GB swap file.
31. **Telemetry.** After each detection the browser sends an anonymous event
    (load time, inference time, outcome, backend, model version) to
    `POST /api/v1/events`.
32. **Alerts.** No-face rate, model-load failures, and disk usage above 80%.
