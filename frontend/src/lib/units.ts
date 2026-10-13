import type { UnitKey } from "@/geometry/measurements";

export const UNIT_LABELS: Record<UnitKey, string> = {
  ear: "Ear position (proxy)",
  orbital: "Orbital tightening (proxy)",
  muzzle: "Muzzle tension (proxy)",
  whisker: "Whisker change (proxy, measures whisker pads)",
};

export const HEAD_POSITION_LABEL = "Head position";
export const HEAD_POSITION_TEXT = "Not possible to score";
