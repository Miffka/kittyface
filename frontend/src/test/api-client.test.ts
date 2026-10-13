import { describe, expect, it, vi } from "vitest";
import { createHttpApi } from "@/api/http";
import { ApiError, onConsentRequired, parseRetryAfter } from "@/api/errors";
import type { UploadMetadata } from "@/api/types";

type Call = { url: string; init: RequestInit | undefined };

function setup(response: () => Response) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return response();
  });
  const api = createHttpApi("https://api.test/", () => "a".repeat(32), fetchImpl);
  return { api, calls };
}

const status = (s: number, body?: unknown, headers?: Record<string, string>) => () =>
  new Response(body === undefined ? null : JSON.stringify(body), { status: s, headers: headers ?? {} });

async function errorOf(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error("expected rejection");
}

describe("API client error handling", () => {
  it("maps 404", async () => {
    const { api } = setup(status(404));
    expect((await errorOf(api.getUpload("x"))).message).toBe("This upload no longer exists.");
  });

  it("maps 413 and 415", async () => {
    const meta = {} as UploadMetadata;
    expect((await errorOf(setup(status(413)).api.saveUpload(new Blob(), meta))).message).toBe(
      "The file is larger than 5 MB.",
    );
    expect((await errorOf(setup(status(415)).api.saveUpload(new Blob(), meta))).message).toBe(
      "Only JPEG, PNG and WebP files are supported.",
    );
  });

  it("maps 422 with the check name", async () => {
    const { api } = setup(status(422, { check: "landmarks_inside_box" }));
    expect((await errorOf(api.saveUpload(new Blob(), {} as UploadMetadata))).message).toBe(
      "The landmarks could not be saved: landmarks_inside_box",
    );
  });

  it("maps 429 using Retry-After", async () => {
    const { api } = setup(status(429, undefined, { "Retry-After": "17" }));
    const err = await errorOf(api.listUploads());
    expect(err.message).toBe("Too many requests. Please try again in 17 seconds");
    expect(err.retryAfter).toBe(17);
  });

  it("maps other statuses and network errors to the generic message", async () => {
    expect((await errorOf(setup(status(500)).api.listUploads())).message).toBe(
      "Something went wrong. Please try again.",
    );
    const api = createHttpApi("https://api.test", () => "t", async () => {
      throw new TypeError("network");
    });
    expect((await errorOf(api.listUploads())).message).toBe("Something went wrong. Please try again.");
  });

  it("notifies consent listeners on 403", async () => {
    const listener = vi.fn();
    const off = onConsentRequired(listener);
    const err = await errorOf(setup(status(403)).api.getConfig());
    expect(err.status).toBe(403);
    expect(listener).toHaveBeenCalledOnce();
    off();
  });

  it("parses Retry-After dates", () => {
    expect(parseRetryAfter(new Date(Date.now() + 5000).toUTCString())).toBeGreaterThanOrEqual(4);
    expect(parseRetryAfter(null)).toBeNull();
  });
});

describe("API client requests", () => {
  it("sends the token header and correct URLs", async () => {
    const { api, calls } = setup(() => new Response("[]", { status: 200 }));
    await api.listUploads();
    expect(calls[0]?.url).toBe("https://api.test/api/v1/uploads");
    expect(new Headers(calls[0]?.init?.headers).get("X-Client-Token")).toBe("a".repeat(32));
  });

  it("sends events without the token header", async () => {
    const { api, calls } = setup(() => new Response(null, { status: 204 }));
    api.postEvent({ model_version: "m", backend: "wasm", outcome: "face", load_ms: 1, inference_ms: 2 });
    await Promise.resolve();
    expect(calls[0]?.url).toBe("https://api.test/api/v1/events");
    expect(new Headers(calls[0]?.init?.headers).has("X-Client-Token")).toBe(false);
  });

  it("sends save as multipart with image and metadata parts", async () => {
    const { api, calls } = setup(() => new Response(JSON.stringify({ id: "1" }), { status: 201 }));
    const res = await api.saveUpload(new File(["x"], "cat.jpg", { type: "image/jpeg" }), {
      orientation: 6,
    } as UploadMetadata);
    expect(res.id).toBe("1");
    const body = calls[0]?.init?.body as FormData;
    expect(body.get("image")).toBeInstanceOf(Blob);
    const meta = body.get("metadata") as Blob;
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(meta);
    });
    expect(JSON.parse(text)).toEqual({ orientation: 6 });
  });
});
