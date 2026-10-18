import { apiErrorFromResponse } from "./errors";
import type {
  ApiService,
  AppConfig,
  DetectionEvent,
  UploadDetail,
  UploadMetadata,
} from "./types";

export const MOCK_CONFIG: AppConfig = {
  threshold_version: "mock-thresholds-0.1.0",
  notice_version: "2026-10-04",
  thresholds: {
    version: "mock-thresholds-0.1.0",
    units: {
      ear: { cutoffs: [1.9, 2.2], direction: "ascending" },
      orbital: { cutoffs: [0.35, 0.55], direction: "descending" },
      muzzle: { cutoffs: [0.3, 0.4], direction: "descending" },
      whisker: { cutoffs: [10.0, 25.0], direction: "ascending" },
    },
  },
};

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export interface MockApi extends ApiService {
  readonly events: DetectionEvent[];
  readonly consents: string[];
}

/** In-memory backend used only when VITE_USE_MOCK_API=true. Errors go through the same mapping as HTTP. */
export function createMockApi(options: { latencyMs?: number } = {}): MockApi {
  const latency = options.latencyMs ?? 150;
  const store = new Map<string, { detail: UploadDetail; image: Blob }>();
  const events: DetectionEvent[] = [];
  const consents: string[] = [];
  let counter = 0;

  const delay = (): Promise<void> =>
    latency > 0
      ? new Promise((r) => setTimeout(r, latency))
      : Promise.resolve();
  const fail = async (status: number, body?: unknown): Promise<never> => {
    throw await apiErrorFromResponse(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
      }),
    );
  };
  const find = async (id: string) => store.get(id) ?? (await fail(404));

  const validate = (m: UploadMetadata): string | null => {
    if (m.model_landmarks.length !== 48 || m.user_landmarks.length !== 48)
      return "landmark_count";
    if (m.moved_flags.length !== 48) return "moved_flags_count";
    if (m.model_measurements.length !== 4 || m.user_measurements.length !== 4)
      return "measurement_count";
    if (m.notice_version !== MOCK_CONFIG.notice_version)
      return "notice_version";
    return null;
  };

  return {
    events,
    consents,
    async getConfig() {
      await delay();
      return structuredClone(MOCK_CONFIG);
    },
    async postConsent(noticeVersion) {
      await delay();
      consents.push(noticeVersion);
    },
    postEvent(event) {
      events.push(event);
    },
    async saveUpload(image, metadata) {
      await delay();
      if (!ALLOWED.includes(image.type)) return fail(415);
      if (image.size > MAX_BYTES) return fail(413);
      const check = validate(metadata);
      if (check) return fail(422, { check });
      counter += 1;
      const id = `mock-${Date.now().toString(36)}-${counter}`;
      store.set(id, {
        image,
        detail: {
          id,
          created_at: new Date().toISOString(),
          model_version: metadata.model_version,
          user_measurements: metadata.user_measurements,
          metadata: structuredClone(metadata),
        },
      });
      return { id };
    },
    async listUploads() {
      await delay();
      return [...store.values()]
        .map(({ detail: { metadata: _m, ...summary } }) => summary)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async getUpload(id) {
      await delay();
      return structuredClone((await find(id)).detail);
    },
    async getUploadImage(id) {
      await delay();
      return (await find(id)).image;
    },
    async deleteUpload(id) {
      await delay();
      await find(id);
      store.delete(id);
    },
  };
}
