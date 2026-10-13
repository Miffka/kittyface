import { describe, expect, it } from "vitest";
import { createMockApi, MOCK_CONFIG } from "@/api/mock";
import { ApiError } from "@/api/errors";
import { detectLandmarks } from "@/ml/detection";
import { GEOMETRY_VERSION, measure } from "@/geometry/measurements";
import type { UploadMetadata } from "@/api/types";

async function metadata(): Promise<UploadMetadata> {
  const box = { x: 0, y: 0, width: 100, height: 100 };
  const lm = await detectLandmarks({ width: 200, height: 200 } as ImageBitmap, box);
  const xy = lm.map((p): [number, number] => [p.x, p.y]);
  const m = measure(lm, MOCK_CONFIG.thresholds);
  return {
    orientation: 1,
    detector_box: box,
    final_box: box,
    model_landmarks: xy,
    user_landmarks: xy,
    moved_flags: xy.map(() => false),
    model_measurements: m,
    user_measurements: m,
    model_version: "mock",
    threshold_version: MOCK_CONFIG.threshold_version,
    geometry_version: GEOMETRY_VERSION,
    notice_version: MOCK_CONFIG.notice_version,
  };
}

describe("mock API", () => {
  it("saves, lists, opens and deletes uploads", async () => {
    const api = createMockApi({ latencyMs: 0 });
    const image = new File(["abc"], "cat.png", { type: "image/png" });
    const { id } = await api.saveUpload(image, await metadata());
    expect((await api.listUploads()).map((u) => u.id)).toEqual([id]);
    expect((await api.getUpload(id)).metadata.user_landmarks).toHaveLength(48);
    expect(await api.getUploadImage(id)).toBe(image);
    await api.deleteUpload(id);
    await expect(api.getUpload(id)).rejects.toThrow("This upload no longer exists.");
  });

  it("rejects bad uploads with mapped errors", async () => {
    const api = createMockApi({ latencyMs: 0 });
    const meta = await metadata();
    await expect(api.saveUpload(new Blob(["x"], { type: "image/gif" }), meta)).rejects.toThrow(
      "Only JPEG, PNG and WebP files are supported.",
    );
    const err = await api
      .saveUpload(new Blob(["x"], { type: "image/jpeg" }), { ...meta, moved_flags: [] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe("The landmarks could not be saved: moved_flags_count");
  });

  it("records consent and events", async () => {
    const api = createMockApi({ latencyMs: 0 });
    await api.postConsent("v1");
    api.postEvent({ model_version: null, backend: null, outcome: "load_failure", load_ms: 3, inference_ms: null });
    expect(api.consents).toEqual(["v1"]);
    expect(api.events[0]?.outcome).toBe("load_failure");
  });
});
