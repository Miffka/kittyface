// Placeholder geometry module. The real calculations replace this file later.
import type { Point } from "../ml/detection";

export type UnitKey = "ear" | "orbital" | "muzzle" | "whisker";

export interface Measurement {
  unit: UnitKey;
  ratio: number;
  score: 0 | 1 | 2;
}

export interface Thresholds {
  version: string;
  units: Record<UnitKey, { cutoffs: [number, number]; direction: "ascending" | "descending" }>;
}

export const GEOMETRY_VERSION = "mock-geometry-0.1.0";

export const UNIT_ORDER: UnitKey[] = ["ear", "orbital", "muzzle", "whisker"];

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const mean = (pts: Point[]): Point => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
});
const safe = (n: number): number => Math.max(n, 1e-6);

export function scoreRatio(
  ratio: number,
  rule: { cutoffs: [number, number]; direction: "ascending" | "descending" },
): 0 | 1 | 2 {
  const [low, high] = rule.cutoffs;
  if (rule.direction === "ascending") return ratio < low ? 0 : ratio < high ? 1 : 2;
  return ratio > high ? 0 : ratio > low ? 1 : 2;
}

// Pure and synchronous; called on every landmark drag.
export function measure(landmarks: Point[], thresholds: Thresholds): Measurement[] {
  if (landmarks.length !== 48) throw new Error(`Expected 48 landmarks, got ${landmarks.length}`);
  const p = (i: number): Point => landmarks[i] as Point;
  const leftEye = mean(landmarks.slice(16, 24));
  const rightEye = mean(landmarks.slice(24, 32));
  const iod = safe(dist(leftEye, rightEye));
  const eyeOpening = (s: number): number => dist(p(s + 2), p(s + 6)) / safe(dist(p(s), p(s + 4)));

  const ratios: Record<UnitKey, number> = {
    ear: (dist(p(3), leftEye) + dist(p(11), rightEye)) / 2 / iod,
    orbital: (eyeOpening(16) + eyeOpening(24)) / 2,
    muzzle: dist(p(36), p(37)) / iod,
    whisker: dist(mean(landmarks.slice(40, 44)), mean(landmarks.slice(44, 48))) / iod,
  };

  return UNIT_ORDER.map((unit) => ({
    unit,
    ratio: ratios[unit],
    score: scoreRatio(ratios[unit], thresholds.units[unit]),
  }));
}
