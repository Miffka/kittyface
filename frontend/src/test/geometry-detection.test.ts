import { describe, expect, it } from "vitest";
import { detectBox, detectLandmarks, LANDMARK_REGIONS } from "@/ml/detection";
import { measure, scoreRatio } from "@/geometry/measurements";
import { MOCK_CONFIG } from "@/api/mock";

const img = { width: 800, height: 800 } as ImageBitmap;

describe("mock detection", () => {
  it("returns the central box and 48 points inside it", async () => {
    const box = await detectBox(img);
    expect(box).toEqual({ x: 200, y: 200, width: 400, height: 400 });
    const pts = await detectLandmarks(img, box!);
    expect(pts).toHaveLength(48);
    expect(LANDMARK_REGIONS).toHaveLength(48);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(200);
      expect(p.x).toBeLessThanOrEqual(600);
    }
  });
});

describe("mock geometry", () => {
  it("returns four measurements that change when a point moves", async () => {
    const pts = await detectLandmarks(img, (await detectBox(img))!);
    const a = measure(pts, MOCK_CONFIG.thresholds);
    expect(a.map((m) => m.unit)).toEqual(["ear", "orbital", "muzzle", "whisker"]);
    const moved = pts.slice();
    moved[3] = { x: pts[3]!.x, y: pts[3]!.y + 80 };
    const b = measure(moved, MOCK_CONFIG.thresholds);
    expect(b[0]!.ratio).not.toBe(a[0]!.ratio);
    expect(measure(pts, MOCK_CONFIG.thresholds)).toEqual(a);
  });

  it("applies cut-offs and direction", () => {
    const asc = { cutoffs: [1, 2] as [number, number], direction: "ascending" as const };
    const desc = { ...asc, direction: "descending" as const };
    expect([0.5, 1.5, 2.5].map((r) => scoreRatio(r, asc))).toEqual([0, 1, 2]);
    expect([0.5, 1.5, 2.5].map((r) => scoreRatio(r, desc))).toEqual([2, 1, 0]);
  });
});
