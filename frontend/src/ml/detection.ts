// Placeholder detection module. The real models and all model-specific
// preprocessing (resizing, letterboxing, cropping, normalisation, mapping
// points back) replace this file later. Signatures are fixed.

export type Point = { x: number; y: number };
export type Box = { x: number; y: number; width: number; height: number };
export type Region = "left_eye" | "right_eye" | "left_ear" | "right_ear" | "nose_whiskers";

export interface LoadResult {
  modelVersion: string;
  backend: "wasm" | "webgpu";
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type UV = [number, number];

const EAR_LEFT: UV[] = [
  [0.06, 0.36],
  [0.09, 0.25],
  [0.13, 0.14],
  [0.18, 0.03],
  [0.24, 0.12],
  [0.3, 0.2],
  [0.36, 0.27],
  [0.2, 0.25],
];
const NOSE_MOUTH: UV[] = [
  [0.46, 0.6],
  [0.54, 0.6],
  [0.5, 0.66],
  [0.5, 0.71],
  [0.44, 0.76],
  [0.56, 0.76],
  [0.5, 0.79],
  [0.5, 0.83],
];
const PAD_LEFT: UV[] = [
  [0.32, 0.68],
  [0.36, 0.74],
  [0.3, 0.77],
  [0.38, 0.8],
];

const mirror = (pts: UV[]): UV[] => pts.map(([u, v]): UV => [1 - u, v]);
const ellipse = (cu: number, cv: number, ru: number, rv: number): UV[] =>
  Array.from({ length: 8 }, (_, k): UV => {
    const a = (k * Math.PI) / 4;
    return [cu + ru * Math.cos(a), cv + rv * Math.sin(a)];
  });

const TEMPLATE: UV[] = [
  ...EAR_LEFT,
  ...mirror(EAR_LEFT),
  ...ellipse(0.34, 0.47, 0.09, 0.045),
  ...ellipse(0.66, 0.47, 0.09, 0.045),
  ...NOSE_MOUTH,
  ...PAD_LEFT,
  ...mirror(PAD_LEFT),
];

const fill = (region: Region, n: number): Region[] => Array.from({ length: n }, () => region);

// Region of each of the 48 landmark indices, used only for colouring.
export const LANDMARK_REGIONS: Region[] = [
  ...fill("left_ear", 8),
  ...fill("right_ear", 8),
  ...fill("left_eye", 8),
  ...fill("right_eye", 8),
  ...fill("nose_whiskers", 16),
];

// Loads models; reports download progress from 0 to 1. Rejects on failure.
export async function loadModels(onProgress?: (fraction: number) => void): Promise<LoadResult> {
  onProgress?.(0);
  for (let i = 1; i <= 10; i++) {
    await wait(100);
    onProgress?.(i / 10);
  }
  return { modelVersion: "mock-detector-0.1.0", backend: "wasm" };
}

// Returns the head box in upright-image pixels, or null if no head is found.
export async function detectBox(image: ImageBitmap): Promise<Box | null> {
  await wait(300);
  return {
    x: image.width * 0.25,
    y: image.height * 0.25,
    width: image.width * 0.5,
    height: image.height * 0.5,
  };
}

// Returns exactly 48 points in upright-image pixels.
export async function detectLandmarks(_image: ImageBitmap, box: Box): Promise<Point[]> {
  await wait(300);
  return TEMPLATE.map(([u, v]) => ({ x: box.x + u * box.width, y: box.y + v * box.height }));
}
