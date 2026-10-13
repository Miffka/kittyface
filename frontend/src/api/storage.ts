// localStorage holds only the client token and the accepted notice version.
const TOKEN_KEY = "cfs.client_token";
const NOTICE_KEY = "cfs.notice_version";

const hasStorage = (): boolean => typeof window !== "undefined" && !!window.localStorage;

export function generateToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getClientToken(): string {
  if (!hasStorage()) return "";
  let token = localStorage.getItem(TOKEN_KEY);
  if (!token || !/^[0-9a-f]{32}$/.test(token)) {
    token = generateToken();
    localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

export function getAcceptedNotice(): string | null {
  return hasStorage() ? localStorage.getItem(NOTICE_KEY) : null;
}

export function setAcceptedNotice(version: string): void {
  if (hasStorage()) localStorage.setItem(NOTICE_KEY, version);
}

export function clearAcceptedNotice(): void {
  if (hasStorage()) localStorage.removeItem(NOTICE_KEY);
}
