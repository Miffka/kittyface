# Frontend Specification

Oct 4, 2026 · @Nastya

## Scope

Build the browser frontend of cat-face-studio: a web app for desktop and mobile browsers where a user uploads a cat photo, corrects a head box and 48 facial landmarks, sees four geometric measurements, and saves the result to the mock backend.

**Build**

- All pages, layout, navigation and styling
- Photo upload and preview
- An interactive editor for the head box and the 48 landmarks
- A results panel for the measurements
- Calls to the backend REST API
- Consent, history and About pages

**Added later by hand — do not implement**

- The machine learning models and the code that runs them
- All model-specific preprocessing: resizing, letterboxing, cropping, normalisation and mapping points back to the image
- The geometry calculations that turn landmarks into ratios and scores

Use the placeholder interfaces in this document for these parts, with simple mock implementations so the app works end to end.

**Stack.** React, Vite and TypeScript, with Tailwind for styling. No Supabase, no authentication, and no backend code: replace it with the mock implementation.

## Pages and layout

The app has four routes that work on desktop and mobile browsers, and every page shows the same research-tool notice in a persistent banner.

| Route | Purpose |
| --- | --- |
| `/` | Workspace: upload, editor and results side by side |
| `/history` | This browser's saved uploads |
| `/history/:id` | One saved upload, opened read-only in the editor |
| `/about` | What the measurements mean, limitations, credits |

**Consent gate.** On the first visit, a modal shows the privacy and research-use notice before anything else is usable. It has one button, "I agree"; there is no way to dismiss it otherwise.

**Workspace layout.** A header with the app name and links to History and About. On screens 1024 px and wider, the editor canvas fills about two thirds of the width and the results panel sits on the right.

**Persistent banner.** A slim, non-dismissible banner under the header: "Research tool. These are geometric proxy measurements, not a medical or welfare assessment."

**Mobile layout.** Below 1024 px the layout is a single column: the canvas at full width, then the results panel, with the Save button fixed at the bottom of the screen. The header links collapse into a menu, and everything must work down to 360 px width in portrait and landscape.

**Model loading on mobile.** Show a progress bar during `loadModels`, with a note that the first load downloads about 26 MB and is faster on Wi-Fi. If loading fails, show the error and a "Retry" button.

**Footer.** Links to About, the privacy notice, and a contact address for takedown and deletion requests.

## Upload and image handling

The user uploads one photo at a time by drag-and-drop or a file picker on desktop, and by taking a photo or choosing one from the library on mobile. The original file is kept for saving, with its metadata removed.

**Accepted files.** JPEG, PNG and WebP up to 5 MB. Anything else is rejected immediately with a message naming the allowed types and the size limit, and nothing is sent to the server.

**Orientation.** Read the EXIF orientation value (1–8, default 1) before stripping, keep it for the save request, and display the image upright.

**Metadata removal.** Strip all EXIF data from the original file without re-encoding the pixels. The stripped file is the one sent on save.

**Coordinates.** All boxes and landmarks the editor shows or saves are in pixels of the upright original image. Display scaling is purely visual.

**States.** Empty (drop zone with instructions), loading (spinner while detection runs), ready (editor shown), and error (message with a "Try another photo" button).

## Editor

The editor is a canvas over the photo with two modes: box editing and landmark editing. Landmark editing is the default once detection finishes.

**Canvas**

- Zoom with the mouse wheel or a two-finger pinch, pan by dragging empty space or with two fingers, and a "Fit" button resets the view
- The head box is drawn as a rectangle, and the 48 landmarks as small circles
- Point colour depends on region: eyes, ears, or nose and whiskers; the region of each index comes from the detection placeholder
- Hovering or tapping a point shows its index
- Use pointer events throughout, so mouse, touch and pen behave the same; the page itself must not scroll or zoom while the user interacts with the canvas

**Box editing mode**

1. The user clicks "Edit box". Landmarks are hidden, and the box shows corner and edge handles.
2. The user drags the box or its handles. Nothing is re-detected while dragging.
3. The user clicks "Done". If any landmark had been moved by hand, a dialog asks "Re-detecting will replace your landmark edits. Continue?"
4. On confirmation, call `detectLandmarks(image, box)` and replace the landmarks with the result. On cancel, restore the box from before editing.

**Landmark editing mode**

- Drag a point to move it; clicking or tapping a point selects it, and on desktop arrow keys move the selected point by 1 image pixel
- On touch screens each point has a hit area of at least 44 × 44 CSS px, and while dragging, a magnifier above the finger shows the point and the image around it
- Track which points the user moved (48 booleans)
- Measurements in the results panel update live while dragging
- "Reset landmarks" restores the detected positions and clears the moved flags
- A "Show detected" toggle draws the original detected points as faint outlines for comparison

**No head found.** If detection returns no box, show "No cat face found in this photo" and the "Try another photo" button. No editor is shown.

## Results panel and wording

The results panel lists five action units, each with a raw value and a 0–2 proxy score, and never shows a total.

| Row label | Value shown | Score shown |
| --- | --- | --- |
| Ear position (proxy) | Ratio, 3 decimals | 0, 1 or 2 |
| Orbital tightening (proxy) | Ratio, 3 decimals | 0, 1 or 2 |
| Muzzle tension (proxy) | Ratio, 3 decimals | 0, 1 or 2 |
| Whisker change (proxy, measures whisker pads) | Ratio, 3 decimals | 0, 1 or 2 |
| Head position | — | "Not possible to score" |

Show each score as a neutral badge, using the same colour for 0, 1 and 2. Do not use red, green or warning colours.

**Save.** A "Save" button under the table sends the save request (see Backend API). Afterwards it shows "Saved" with a link to the entry in History; on error it shows the server's message.

**Versions.** In small text under the table: model version, threshold version and geometry version.

**Wording rules**

- Never use the words "pain", "painful", "suffering", "diagnosis" or "health" anywhere except the About page
- Always label scores "(proxy)"
- Never imply a veterinary or welfare judgement

**About page content**

- What the Feline Grimace Scale is, with a citation link
- How each proxy is measured, in one or two sentences each, and that head position cannot be measured from a face photo
- Limitations, including that the muzzle and whisker proxies use overlapping face regions
- Model attribution and the CC BY-NC 4.0 licence
- A statement that the app is non-commercial, and a contact address

Use placeholder text marked `TODO` for citations, attribution and the contact address.

## Placeholder interfaces

The UI reaches detection and geometry only through two modules with fixed signatures. Create them with mock implementations; the real code replaces the mocks later without touching any UI file.

**`src/ml/detection.ts`** — models and all model-specific preprocessing go here later.

```typescript
export type Point = { x: number; y: number };
export type Box = { x: number; y: number; width: number; height: number };
export type Region = 'left_eye' | 'right_eye' | 'left_ear' | 'right_ear' | 'nose_whiskers';

export interface LoadResult { modelVersion: string; backend: 'wasm' | 'webgpu' }

// Loads models; reports download progress from 0 to 1. Rejects on failure.
export function loadModels(onProgress?: (fraction: number) => void): Promise<LoadResult>;

// Returns the head box in upright-image pixels, or null if no head is found.
export function detectBox(image: ImageBitmap): Promise<Box | null>;

// Returns exactly 48 points in upright-image pixels.
export function detectLandmarks(image: ImageBitmap, box: Box): Promise<Point[]>;

// Region of each of the 48 landmark indices, used only for colouring.
export const LANDMARK_REGIONS: Region[];
```

**Mock behaviour.** `loadModels` waits 1 second while reporting progress. `detectBox` returns a box covering the central 50% of the image. `detectLandmarks` places 48 points in a plausible face layout inside the box, and each call waits 300 ms.

**`src/geometry/measurements.ts`** — the real calculations go here later.

```typescript
import type { Point } from '../ml/detection';

export type UnitKey = 'ear' | 'orbital' | 'muzzle' | 'whisker';
export interface Measurement { unit: UnitKey; ratio: number; score: 0 | 1 | 2 }

export interface Thresholds {
  version: string;
  units: Record<UnitKey, { cutoffs: [number, number]; direction: 'ascending' | 'descending' }>;
}

export const GEOMETRY_VERSION: string;

// Pure and synchronous; called on every landmark drag.
export function measure(landmarks: Point[], thresholds: Thresholds): Measurement[];
```

**Mock behaviour.** `measure` returns deterministic values derived from the landmark coordinates, so dragging a point visibly changes the numbers. Scores apply the cut-offs and direction.

The UI never resizes, crops or normalises images for detection, and never computes ratios itself.

## Backend API

All backend calls go through one module, `src/api/client.ts`, against a base URL from `VITE_API_BASE_URL`. When `VITE_USE_MOCK_API=true`, the module returns in-memory mock data so the UI runs without a backend.

**Token.** On first load, generate 16 random bytes with `crypto.getRandomValues`, hex-encode them, and store the result in `localStorage`. Send it as the `X-Client-Token` header on every request.

| When | Call |
| --- | --- |
| App start | `GET /api/v1/config` → thresholds, threshold version, notice version |
| Consent modal "I agree" | `POST /api/v1/consent` with `{ notice_version }` |
| After each detection run, or a model-load failure | `POST /api/v1/events` (below) |
| Save | `POST /api/v1/uploads`, multipart (below) |
| History page | `GET /api/v1/uploads` |
| Open a history entry | `GET /api/v1/uploads/{id}` and `GET /api/v1/uploads/{id}/image` |
| Delete in history | `DELETE /api/v1/uploads/{id}`, after a confirmation dialog |

**Consent.** Show the consent modal when no consent is stored locally for the current notice version, or when the server answers 403.

**Event body.** `{ model_version, backend, outcome, load_ms, inference_ms }`, where outcome is `face`, `no_face`, `load_failure` or `error`. Measure times with `performance.now()` around the placeholder calls. Send events fire-and-forget, without the token header.

**Save request.** Two multipart parts: `image` (the EXIF-stripped original) and `metadata` (JSON):

```json
{
  "orientation": 1,
  "detector_box": { "x": 0, "y": 0, "width": 0, "height": 0 },
  "final_box": { "x": 0, "y": 0, "width": 0, "height": 0 },
  "model_landmarks": [[0, 0]],
  "user_landmarks": [[0, 0]],
  "moved_flags": [false],
  "model_measurements": [{ "unit": "ear", "ratio": 0.0, "score": 0 }],
  "user_measurements": [{ "unit": "ear", "ratio": 0.0, "score": 0 }],
  "model_version": "",
  "threshold_version": "",
  "geometry_version": "",
  "notice_version": ""
}
```

Landmark arrays and `moved_flags` have 48 entries; measurement arrays have four, one per unit.

**Errors.**

| Status | Message to the user |
| --- | --- |
| 403 | Show the consent modal again |
| 404 | "This upload no longer exists." |
| 413 | "The file is larger than 5 MB." |
| 415 | "Only JPEG, PNG and WebP files are supported." |
| 422 | "The landmarks could not be saved: " followed by the check name from the response |
| 429 | "Too many requests. Please try again in N seconds", using `Retry-After` |
| Other | "Something went wrong. Please try again." |

## Constraints and acceptance

The generated code must run as a static site against the existing backend, with the placeholder modules swappable for real code.

**Constraints**

- No Supabase, no authentication provider, no backend or serverless functions
- No analytics, tracking scripts or third-party fonts loaded at runtime
- `npm run build` produces a static `dist/` folder
- Keep `src/ml/`, `src/geometry/` and `src/api/` free of UI code; UI components import only their exported functions and types
- `localStorage` holds only the token and the accepted notice version
- Strict TypeScript with no `any` in these three modules
- Vitest is set up, with at least one test for the API client's error handling

**Acceptance checklist**

- [ ] The consent modal blocks the app on first visit, and "I agree" calls the consent endpoint
- [ ] The app works on desktop and on mobile browsers down to 360 px width, with mouse and touch
- [ ] Unsupported or oversized files are rejected before any upload
- [ ] With mock modules, a photo goes from upload to box, landmarks and measurements
- [ ] Box editing re-detects landmarks on "Done", and asks first if points were moved
- [ ] Dragging a landmark updates the measurements live and sets its moved flag
- [ ] Head position always shows "Not possible to score"
- [ ] The banner is visible on every page, and the forbidden words appear only on the About page
- [ ] Save sends both multipart parts and handles every listed error status
- [ ] History lists, opens and deletes uploads
- [ ] Each detection run sends one event, including load failures
- [ ] `VITE_USE_MOCK_API=true` runs the whole app without a backend
