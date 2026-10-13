import { ApiError, API_MESSAGES, apiErrorFromResponse, notifyConsentRequired } from "./errors";
import type {
  ApiService,
  AppConfig,
  DetectionEvent,
  SaveResult,
  UploadDetail,
  UploadMetadata,
  UploadSummary,
} from "./types";

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export function createHttpApi(
  baseUrl: string,
  getToken: () => string,
  fetchImpl: FetchFn = (input, init) => fetch(input, init),
): ApiService {
  const url = (path: string): string => `${baseUrl.replace(/\/+$/, "")}/api/v1${path}`;

  async function send(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("X-Client-Token", getToken());
    let res: Response;
    try {
      res = await fetchImpl(url(path), { ...init, headers });
    } catch {
      throw new ApiError(0, API_MESSAGES.generic);
    }
    if (!res.ok) {
      const err = await apiErrorFromResponse(res);
      if (err.status === 403) notifyConsentRequired();
      throw err;
    }
    return res;
  }

  async function json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await send(path, init);
    return (await res.json()) as T;
  }

  const id = (v: string): string => encodeURIComponent(v);

  return {
    getConfig: () => json<AppConfig>("/config"),

    async postConsent(noticeVersion) {
      await send("/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notice_version: noticeVersion }),
      });
    },

    postEvent(event: DetectionEvent) {
      // Fire-and-forget, deliberately without the token header.
      try {
        void fetchImpl(url("/events"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event),
          keepalive: true,
        }).catch(() => undefined);
      } catch {
        // ignore
      }
    },

    saveUpload(image: Blob, metadata: UploadMetadata) {
      const form = new FormData();
      const name = image instanceof File ? image.name : "image";
      form.append("image", image, name);
      form.append(
        "metadata",
        new Blob([JSON.stringify(metadata)], { type: "application/json" }),
        "metadata.json",
      );
      return json<SaveResult>("/uploads", { method: "POST", body: form });
    },

    listUploads: () => json<UploadSummary[]>("/uploads"),
    getUpload: (uploadId) => json<UploadDetail>(`/uploads/${id(uploadId)}`),

    async getUploadImage(uploadId) {
      const res = await send(`/uploads/${id(uploadId)}/image`);
      return res.blob();
    },

    async deleteUpload(uploadId) {
      await send(`/uploads/${id(uploadId)}`, { method: "DELETE" });
    },
  };
}
