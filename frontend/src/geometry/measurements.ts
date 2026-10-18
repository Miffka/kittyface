// Hand port of kittyface.core.geometry's AU metrics (ear_spread_ratio,
// eye_opening_ratio, muzzle_roundness, whisker_elevation, score_au). Indices
// follow the legend in models/graph_edge_schemes/graph_edges_manual_v2.txt.
import type { Point } from "../ml/detection";

export type UnitKey = "ear" | "orbital" | "muzzle" | "whisker";

export interface Measurement {
  unit: UnitKey;
  ratio: number;
  score: 0 | 1 | 2;
}

export interface Thresholds {
  version: string;
  units: Record<
    UnitKey,
    { cutoffs: [number, number]; direction: "ascending" | "descending" }
  >;
}

export const GEOMETRY_VERSION = "fgs-geometry-1.0.0";

export const UNIT_ORDER: UnitKey[] = ["ear", "orbital", "muzzle", "whisker"];

const EAR_TIPS = [24, 29] as const;
const OCULAR_PAIR = [4, 8] as const;
// (top, bottom, outside, inside)
const EYELIDS = [
  [6, 7, 4, 5],
  [10, 11, 8, 9],
] as const;
// (muzzle middle, muzzle outside, pad middle, pad outside), left then right.
const WHISKER_SIDES = [
  [33, 46, 42, 32],
  [34, 47, 43, 35],
] as const;
const MUZZLE_OUTLINE = [12, 13, 35, 47, 19, 2, 21, 46, 32];

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

// Same boundary rule as score_au: a value equal to a cutoff gets the lower score.
export function scoreRatio(
  ratio: number,
  rule: { cutoffs: [number, number]; direction: "ascending" | "descending" },
): 0 | 1 | 2 {
  const [low, high] = rule.cutoffs;
  if (rule.direction === "ascending")
    return ratio <= low ? 0 : ratio <= high ? 1 : 2;
  return ratio >= high ? 0 : ratio >= low ? 1 : 2;
}

// Minor/major axis ratio of the outline's second-moment ellipse: sqrt of the
// 2x2 covariance's eigenvalue ratio, in closed form.
function roundness(pts: Point[]): number {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p.x - cx) ** 2;
    syy += (p.y - cy) ** 2;
    sxy += (p.x - cx) * (p.y - cy);
  }
  const half = (sxx + syy) / 2;
  const root = Math.hypot((sxx - syy) / 2, sxy);
  return Math.sqrt((half - root) / (half + root));
}

// Degrees from vector a->b to c->d; positive is clockwise on screen.
function signedAngle(a: Point, b: Point, c: Point, d: Point): number {
  const [bx, by, vx, vy] = [b.x - a.x, b.y - a.y, d.x - c.x, d.y - c.y];
  return (Math.atan2(bx * vy - by * vx, bx * vx + by * vy) * 180) / Math.PI;
}

// Pure and synchronous; called on every landmark drag.
export function measure(
  landmarks: Point[],
  thresholds: Thresholds,
): Measurement[] {
  if (landmarks.length !== 48)
    throw new Error(`Expected 48 landmarks, got ${landmarks.length}`);
  const p = (i: number): Point => landmarks[i] as Point;
  const span = ([a, b]: readonly [number, number]): number => dist(p(a), p(b));
  const [left, right] = WHISKER_SIDES.map(([mm, mo, wm, wo]) =>
    signedAngle(p(mm), p(mo), p(wm), p(wo)),
  ) as [number, number];

  const ratios: Record<UnitKey, number> = {
    ear: span(EAR_TIPS) / span(OCULAR_PAIR),
    orbital:
      EYELIDS.reduce(
        (s, [top, bottom, outside, inside]) =>
          s + span([top, bottom]) / span([outside, inside]),
        0,
      ) / 2,
    muzzle: roundness(MUZZLE_OUTLINE.map(p)),
    whisker: (left - right) / 2,
  };

  return UNIT_ORDER.map((unit) => ({
    unit,
    ratio: ratios[unit],
    score: scoreRatio(ratios[unit], thresholds.units[unit]),
  }));
}
