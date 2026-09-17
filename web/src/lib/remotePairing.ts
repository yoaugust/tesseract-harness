import type { Host } from "@/hooks/useHosts";
import { writeLastHostChoice } from "@/lib/hostPreferences";

const BINDING_STORAGE_KEY = "tesseract:remote-computer";
const ORIGIN_STORAGE_KEY = "tesseract:remote-origin";

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

export function buildRemotePairingUrl(
  origin: string,
  host: Pick<Host, "host_id" | "name">,
): string {
  const normalizedOrigin = normalizeRemoteOrigin(origin);
  if (normalizedOrigin === null) throw new Error("Remote URL must be an http(s) origin");
  const url = new URL("/remote/connect", normalizedOrigin);
  url.searchParams.set("host_id", host.host_id);
  url.searchParams.set("host_name", host.name);
  return url.toString();
}

export function saveRemoteComputerBinding(host: Pick<Host, "host_id" | "name">): void {
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
