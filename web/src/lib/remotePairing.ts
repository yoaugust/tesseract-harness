import { writeLastHostChoice } from "@/lib/hostPreferences";

const BINDING_STORAGE_KEY = "tesseract:remote-computer";
const ORIGIN_STORAGE_KEY = "tesseract:remote-origin";
const APP_ORIGIN_STORAGE_KEY = "tesseract:remote-app-origin";

export interface RemoteComputerBinding {
  version: 1;
  hostId: string;
  hostName: string;
  pairedAt: number;
}

export function normalizeRemoteOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function normalizeRemoteServerOrigin(value: string): string | null {
  const origin = normalizeRemoteOrigin(value);
  if (origin === null) return null;
  const url = new URL(origin);
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (loopback || (url.protocol === "https:" && url.hostname.endsWith(".ts.net"))) return origin;
  return null;
}

export function buildRemotePairingUrl(
  appOrigin: string,
  serverOrigin: string,
  code: string,
): string {
  const normalizedAppOrigin = normalizeRemoteOrigin(appOrigin);
  const normalizedServerOrigin = normalizeRemoteServerOrigin(serverOrigin);
  if (normalizedAppOrigin === null || normalizedServerOrigin === null) {
    throw new Error("Remote URLs must be http(s) origins");
  }
  if (!code) throw new Error("Pairing code is required");
  const url = new URL("/remote/connect", normalizedAppOrigin);
  url.hash = new URLSearchParams({ code, endpoint: normalizedServerOrigin }).toString();
  return url.toString();
}

export function readRemotePairingCode(hash: string): string {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(value).get("code")?.trim() ?? "";
}

export function readRemotePairingEndpoint(hash: string): string | null {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  const endpoint = new URLSearchParams(value).get("endpoint");
  return endpoint === null ? null : normalizeRemoteServerOrigin(endpoint);
}

export function saveRemoteComputerBinding(host: { host_id: string; name: string }): void {
  if (typeof window === "undefined") return;
  const binding: RemoteComputerBinding = {
    version: 1,
    hostId: host.host_id,
    hostName: host.name,
    pairedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(BINDING_STORAGE_KEY, JSON.stringify(binding));
  } catch {
    // The normal host preference still gets a chance to persist below.
  }
  writeLastHostChoice(host.host_id);
}

export function readRemoteComputerBinding(): RemoteComputerBinding | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BINDING_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<RemoteComputerBinding>;
    if (
      parsed.version !== 1 ||
      typeof parsed.hostId !== "string" ||
      parsed.hostId === "" ||
      typeof parsed.hostName !== "string" ||
      typeof parsed.pairedAt !== "number"
    ) {
      return null;
    }
    return parsed as RemoteComputerBinding;
  } catch {
    return null;
  }
}

export function readRemoteOrigin(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    return window.localStorage.getItem(ORIGIN_STORAGE_KEY) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeRemoteOrigin(origin: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ORIGIN_STORAGE_KEY, origin);
  } catch {
    // A storage failure should not prevent displaying a one-off QR code.
  }
}

export function readRemoteAppOrigin(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    return window.localStorage.getItem(APP_ORIGIN_STORAGE_KEY) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeRemoteAppOrigin(origin: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(APP_ORIGIN_STORAGE_KEY, origin);
  } catch {
    // A storage failure should not prevent displaying a one-off QR code.
  }
}
