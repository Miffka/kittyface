import { describe, expect, it } from "vitest";
import {
  expandBox,
  LANDMARK_REGIONS,
  letterbox,
  mapPoints,
  unletterboxXYXY,
} from "@/ml/detection";
import { measure, scoreRatio } from "@/geometry/measurements";
import { MOCK_CONFIG } from "@/api/mock";

const grid = Array.from({ length: 48 }, (_, i) => ({
  x: 100 + (i % 8) * 50,
  y: 100 + Math.floor(i / 8) * 50,
}));

describe("detection preprocessing", () => {
  it("letterboxes and maps a box back to image pixels", () => {
    const lb = letterbox(800, 400, 224);
    expect(lb).toEqual({
      scale: 0.28,
      newW: 224,
      newH: 112,
      padX: 0,
      padY: 56,
    });
    const box = unletterboxXYXY(
      [0.25, 0.25 + 56 / 224 / 2, 0.75, 1],
      224,
      lb,
      800,
      400,
    );
    expect(box[0]).toBeCloseTo(200);
    expect(box[2]).toBeCloseTo(600);
    expect(box[3]).toBe(400); // clamped
  });

  it("expands, clips and maps crop points", () => {
    expect(expandBox([10, 20, 110, 220], 0.1, 115, 1000)).toEqual([
      0, 0, 115, 240,
    ]);
    expect(mapPoints([0, 0, 0.5, 1], [10, 20, 110, 220])).toEqual([
      { x: 10, y: 20 },
      { x: 60, y: 220 },
    ]);
  });

  it("labels the real landmark index groups", () => {
    expect(LANDMARK_REGIONS).toHaveLength(48);
    expect([3, 36].map((i) => LANDMARK_REGIONS[i])).toEqual([
      "left_eye",
      "left_eye",
    ]);
    expect([1, 41].map((i) => LANDMARK_REGIONS[i])).toEqual([
      "right_eye",
      "right_eye",
    ]);
    expect([22, 31, 0].map((i) => LANDMARK_REGIONS[i])).toEqual([
      "left_ear",
      "right_ear",
      "nose_whiskers",
    ]);
  });
});

describe("mock geometry", () => {
  it("returns four measurements that change when a point moves", () => {
    const pts = grid;
    const a = measure(pts, MOCK_CONFIG.thresholds);
    expect(a.map((m) => m.unit)).toEqual([
      "ear",
      "orbital",
      "muzzle",
      "whisker",
    ]);
    const moved = pts.slice();
    moved[3] = { x: pts[3]!.x, y: pts[3]!.y + 80 };
    const b = measure(moved, MOCK_CONFIG.thresholds);
    expect(b[0]!.ratio).not.toBe(a[0]!.ratio);
    expect(measure(pts, MOCK_CONFIG.thresholds)).toEqual(a);
  });

  it("applies cut-offs and direction", () => {
    const asc = {
      cutoffs: [1, 2] as [number, number],
      direction: "ascending" as const,
    };
    const desc = { ...asc, direction: "descending" as const };
    expect([0.5, 1.5, 2.5].map((r) => scoreRatio(r, asc))).toEqual([0, 1, 2]);
    expect([0.5, 1.5, 2.5].map((r) => scoreRatio(r, desc))).toEqual([2, 1, 0]);
  });
});
