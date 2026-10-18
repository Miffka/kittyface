// Two-stage cat face detector: cat_face_localizer.onnx finds the face box,
// cat_face_landmarks_full.onnx places 48 points in a crop around it.
// Preprocessing mirrors scripts/02_detect_landmarks.py and
// src/kittyface/core/geometry.py.
import type { InferenceSession, Tensor } from "onnxruntime-web";

export type Point = { x: number; y: number };
export type Box = { x: number; y: number; width: number; height: number };
export type Region =
  "left_eye" | "right_eye" | "left_ear" | "right_ear" | "nose_whiskers";

export interface LoadResult {
  modelVersion: string;
  backend: "wasm" | "webgpu";
}

type XYXY = [number, number, number, number];
type Ort = typeof import("onnxruntime-web");

const LOCALIZER_URL = "/models/cat_face_localizer.onnx";
const LANDMARKS_URL = "/models/cat_face_landmarks_full.onnx";
// onnx sha256 prefixes from models/manifest.json.
const MODEL_VERSION = "cat-face-landmarks-onnx-b4c72851-bf094279";
const LOCALIZER_SIZE = 224;
const LANDMARKS_SIZE = 384;
const LANDMARK_MARGIN = 0.1; // HF model card: "face box + 0.1 margin"

// Index groups from src/kittyface/core/geometry.py.
const GROUPS: [Region, number[]][] = [
  ["left_eye", [3, 4, 5, 6, 7, 36, 37, 38]],
  ["right_eye", [1, 8, 9, 10, 11, 39, 40, 41]],
  ["left_ear", [22, 23, 24, 25, 26]],
  ["right_ear", [27, 28, 29, 30, 31]],
];

// Region of each of the 48 landmark indices, used only for colouring.
export const LANDMARK_REGIONS: Region[] = Array.from(
  { length: 48 },
  (_, i) => GROUPS.find(([, idx]) => idx.includes(i))?.[0] ?? "nose_whiskers",
);

export interface Letterbox {
  scale: number;
  newW: number;
  newH: number;
  padX: number;
  padY: number;
}

export function letterbox(w: number, h: number, size: number): Letterbox {
  const scale = size / Math.max(w, h);
  const newW = Math.round(w * scale);
  const newH = Math.round(h * scale);
  return {
    scale,
    newW,
    newH,
    padX: Math.floor((size - newW) / 2),
    padY: Math.floor((size - newH) / 2),
  };
}

// Normalized xyxy in the letterboxed square -> clamped original-image pixels.
export function unletterboxXYXY(
  norm: XYXY,
  size: number,
  lb: Letterbox,
  w: number,
  h: number,
): XYXY {
  const clamp = (v: number, hi: number) => Math.max(0, Math.min(v, hi));
  const [x1, y1, x2, y2] = norm;
  return [
    clamp((x1 * size - lb.padX) / lb.scale, w),
    clamp((y1 * size - lb.padY) / lb.scale, h),
    clamp((x2 * size - lb.padX) / lb.scale, w),
    clamp((y2 * size - lb.padY) / lb.scale, h),
  ];
}

// Grow a box by margin * (width, height) on each side, rounded and clipped.
export function expandBox(
  box: XYXY,
  margin: number,
  w: number,
  h: number,
): XYXY {
  const [x1, y1, x2, y2] = box;
  const px = margin * (x2 - x1);
  const py = margin * (y2 - y1);
  return [
    Math.max(0, Math.round(x1 - px)),
    Math.max(0, Math.round(y1 - py)),
    Math.min(w, Math.round(x2 + px)),
    Math.min(h, Math.round(y2 + py)),
  ];
}

// Flat [x0, y0, x1, y1, ...] normalized to the crop -> image pixels.
export function mapPoints(flat: ArrayLike<number>, crop: XYXY): Point[] {
  const [x1, y1, x2, y2] = crop;
  return Array.from({ length: flat.length / 2 }, (_, i) => ({
    x: (flat[2 * i] as number) * (x2 - x1) + x1,
    y: (flat[2 * i + 1] as number) * (y2 - y1) + y1,
  }));
}

let ort: Ort | null = null;
let localizer: InferenceSession | null = null;
let landmarker: InferenceSession | null = null;

async function fetchAll(
  urls: string[],
  onProgress?: (fraction: number) => void,
): Promise<Uint8Array[]> {
  const responses = await Promise.all(urls.map((u) => fetch(u)));
  for (const r of responses)
    if (!r.ok || !r.body)
      throw new Error(`Model download failed (${r.status}).`);
  const total = responses.reduce(
    (n, r) => n + Number(r.headers.get("content-length") ?? 0),
    0,
  );
  let received = 0;
  return Promise.all(
    responses.map(async (r) => {
      const reader = r.body!.getReader();
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total) onProgress?.(Math.min(received / total, 1));
      }
      const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let o = 0;
      for (const c of chunks) {
        out.set(c, o);
        o += c.length;
      }
      return out;
    }),
  );
}

// Loads models; reports download progress from 0 to 1. Rejects on failure.
export async function loadModels(
  onProgress?: (fraction: number) => void,
): Promise<LoadResult> {
  onProgress?.(0);
  // Imported here so SSR never loads the wasm runtime.
  const runtime = await import("onnxruntime-web");
  const [loc, lm] = await fetchAll([LOCALIZER_URL, LANDMARKS_URL], onProgress);
  // ponytail: wasm only; try ["webgpu", "wasm"] if inference is too slow.
  const opts = { executionProviders: ["wasm"] };
  [localizer, landmarker] = await Promise.all([
    runtime.InferenceSession.create(loc!, opts),
    runtime.InferenceSession.create(lm!, opts),
  ]);
  ort = runtime;
  onProgress?.(1);
  return { modelVersion: MODEL_VERSION, backend: "wasm" };
}

// Draws into a size x size canvas and returns its pixels as NHWC RGB in [0, 1].
function toTensor(
  runtime: Ort,
  size: number,
  draw: (ctx: OffscreenCanvasRenderingContext2D) => void,
): Tensor {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas context.");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  draw(ctx);
  const rgba = ctx.getImageData(0, 0, size, size).data;
  const rgb = new Float32Array(size * size * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = (rgba[i] as number) / 255;
    rgb[j + 1] = (rgba[i + 1] as number) / 255;
    rgb[j + 2] = (rgba[i + 2] as number) / 255;
  }
  return new runtime.Tensor("float32", rgb, [1, size, size, 3]);
}

async function run(
  session: InferenceSession,
  input: Tensor,
): Promise<Float32Array> {
  const out = await session.run({ [session.inputNames[0] as string]: input });
  return out[session.outputNames[0] as string]!.data as Float32Array;
}

// Returns the head box in upright-image pixels, or null if no head is found.
export async function detectBox(image: ImageBitmap): Promise<Box | null> {
  if (!ort || !localizer) throw new Error("Models are not loaded.");
  const { width: w, height: h } = image;
  const lb = letterbox(w, h, LOCALIZER_SIZE);
  const input = toTensor(ort, LOCALIZER_SIZE, (ctx) =>
    ctx.drawImage(image, lb.padX, lb.padY, lb.newW, lb.newH),
  );
  const o = await run(localizer, input);
  // Raw tensor order is [x2, y1, x1, y2], not xyxy (see scripts/02_detect_landmarks.py).
  const norm: XYXY = [
    o[2] as number,
    o[1] as number,
    o[0] as number,
    o[3] as number,
  ];
  const [x1, y1, x2, y2] = unletterboxXYXY(norm, LOCALIZER_SIZE, lb, w, h);
  // The localizer has no confidence output; an empty box is the only "no face" signal.
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

// Returns exactly 48 points in upright-image pixels.
export async function detectLandmarks(
  image: ImageBitmap,
  box: Box,
): Promise<Point[]> {
  if (!ort || !landmarker) throw new Error("Models are not loaded.");
  const crop = expandBox(
    [box.x, box.y, box.x + box.width, box.y + box.height],
    LANDMARK_MARGIN,
    image.width,
    image.height,
  );
  const [x1, y1, x2, y2] = crop;
  if (x2 <= x1 || y2 <= y1) throw new Error("Box is outside the image.");
  const input = toTensor(ort, LANDMARKS_SIZE, (ctx) =>
    ctx.drawImage(
      image,
      x1,
      y1,
      x2 - x1,
      y2 - y1,
      0,
      0,
      LANDMARKS_SIZE,
      LANDMARKS_SIZE,
    ),
  );
  return mapPoints(await run(landmarker, input), crop);
}
