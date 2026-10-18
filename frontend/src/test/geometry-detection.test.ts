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

// Same landmark set as tests/test_geometry.py's SHAPE.
const CAT = [
  [200.3, 207.9],
  [239.6, 168.0],
  [200.0, 213.4],
  [175.0, 164.3],
  [165.7, 154.3],
  [187.0, 168.1],
  [175.1, 155.1],
  [175.2, 170.2],
  [250.3, 160.5],
  [223.7, 168.2],
  [239.2, 155.8],
  [239.7, 173.8],
  [196.4, 184.3],
  [204.5, 184.9],
  [191.7, 188.1],
  [208.9, 189.7],
  [200.0, 199.5],
  [200.2, 204.9],
  [204.9, 210.3],
  [215.7, 214.2],
  [194.4, 209.9],
  [182.8, 215.3],
  [153.9, 125.7],
  [144.3, 104.0],
  [139.0, 79.8],
  [159.7, 88.7],
  [175.8, 103.5],
  [269.0, 114.2],
  [289.0, 102.6],
  [314.4, 98.3],
  [303.0, 127.0],
  [292.0, 157.0],
  [150.0, 186.0],
  [178.0, 200.0],
  [223.0, 202.0],
  [249.0, 195.0],
  [170.0, 160.0],
  [180.0, 160.0],
  [175.0, 158.0],
  [239.0, 159.0],
  [234.0, 162.0],
  [244.0, 162.0],
  [177.0, 187.0],
  [227.0, 193.0],
  [195.0, 191.0],
  [204.0, 191.0],
  [158.0, 205.0],
  [240.0, 214.0],
].map(([x, y]) => ({ x: x!, y: y! }));

describe("geometry", () => {
  it("matches kittyface.core.geometry on the same landmarks", () => {
    const ratios = measure(CAT, MOCK_CONFIG.thresholds).map((m) => [
      m.unit,
      m.ratio,
    ]);
    // Values printed by the Python metrics for tests/test_geometry.py's SHAPE.
    const python = [
      2.0792103104392696, 0.6226164872786786, 0.4015627417227618,
      23.09025196252292,
    ];
    expect(ratios.map(([u]) => u)).toEqual([
      "ear",
      "orbital",
      "muzzle",
      "whisker",
    ]);
    ratios.forEach(([, r], i) => expect(r).toBeCloseTo(python[i]!, 10));
  });

  it("applies cut-offs and direction, ties to the lower score", () => {
    const asc = {
      cutoffs: [1, 2] as [number, number],
      direction: "ascending" as const,
    };
    const desc = { ...asc, direction: "descending" as const };
    const values = [0.9, 1, 1.1, 1.9, 2, 2.1];
    expect(values.map((r) => scoreRatio(r, asc))).toEqual([0, 0, 1, 1, 1, 2]);
    expect(values.map((r) => scoreRatio(r, desc))).toEqual([2, 1, 1, 1, 0, 0]);
  });
});
