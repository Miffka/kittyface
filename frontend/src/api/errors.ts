export const API_MESSAGES = {
  consent: "Please accept the notice to continue.",
  notFound: "This upload no longer exists.",
  tooLarge: "The file is larger than 5 MB.",
  unsupported: "Only JPEG, PNG and WebP files are supported.",
  generic: "Something went wrong. Please try again.",
} as const;

export class ApiError extends Error {
  readonly status: number;
  readonly retryAfter: number | null;

  constructor(status: number, message: string, retryAfter: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  return null;
}

function extractCheck(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  for (const key of ["check", "check_name", "detail", "message"]) {
    const v = record[key];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "object" && v !== null) {
      const nested = extractCheck(v);
      if (nested) return nested;
    }
  }
  return null;
}

/** Maps a non-OK response to a user-facing ApiError. */
export async function apiErrorFromResponse(res: Response): Promise<ApiError> {
  switch (res.status) {
    case 403:
      return new ApiError(403, API_MESSAGES.consent);
    case 404:
      return new ApiError(404, API_MESSAGES.notFound);
    case 413:
      return new ApiError(413, API_MESSAGES.tooLarge);
    case 415:
      return new ApiError(415, API_MESSAGES.unsupported);
    case 422: {
      let check = "unknown check";
      try {
        const body: unknown = await res.json();
        check = extractCheck(body) ?? check;
      } catch {
        // body was not JSON
      }
      return new ApiError(422, `The landmarks could not be saved: ${check}`);
    }
    case 429: {
      const seconds = parseRetryAfter(res.headers.get("Retry-After"));
      return new ApiError(
        429,
        `Too many requests. Please try again in ${seconds ?? 60} seconds`,
        seconds,
      );
    }
    default:
      return new ApiError(res.status, API_MESSAGES.generic);
  }
}

type Listener = () => void;
const consentListeners = new Set<Listener>();

/** Subscribe to "server answered 403" so the UI can show the consent modal again. */
export function onConsentRequired(listener: Listener): () => void {
  consentListeners.add(listener);
  return () => {
    consentListeners.delete(listener);
  };
}

export function notifyConsentRequired(): void {
  consentListeners.forEach((l) => l());
}
