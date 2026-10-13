// The single entry point for every backend call in the app.
import { createHttpApi } from "./http";
import { createMockApi } from "./mock";
import { getClientToken } from "./storage";
import type { ApiService } from "./types";

const env = import.meta.env;
const baseUrl: string = env["VITE_API_BASE_URL"] ?? "";

/** Mock mode when explicitly requested, or when no backend URL is configured. */
export const USE_MOCK_API: boolean = env["VITE_USE_MOCK_API"] === "true" || baseUrl === "";

export const api: ApiService = USE_MOCK_API
  ? createMockApi()
  : createHttpApi(baseUrl, getClientToken);

export { ApiError, onConsentRequired } from "./errors";
export {
  getClientToken,
  getAcceptedNotice,
  setAcceptedNotice,
  clearAcceptedNotice,
} from "./storage";
export type * from "./types";
