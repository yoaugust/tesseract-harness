import { authenticatedFetch } from "@/lib/identity";

export interface RemoteAccessStatus {
  members: string[];
  pairing_ttl_seconds: number;
}

export interface PairingCodeResult {
  code: string;
  expires_at: number;
}

export interface PairingResult {
  host_id: string;
  host_name: string;
  paired_login: string;
  expires_at: number;
}

async function errorFromResponse(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { detail?: unknown; error?: unknown };
    const detail = typeof body.detail === "string" ? body.detail : body.error;
    if (typeof detail === "string" && detail) return new Error(detail);
  } catch {
    // Keep the status fallback for a non-JSON error response.
  }
  return new Error(`${response.status} ${response.statusText}`);
}

export async function fetchRemoteAccessStatus(): Promise<RemoteAccessStatus> {
  const response = await authenticatedFetch("/v1/remote-access", { cache: "no-store" });
  if (!response.ok) throw await errorFromResponse(response);
  return (await response.json()) as RemoteAccessStatus;
}

export async function addRemoteMember(login: string): Promise<void> {
  const response = await authenticatedFetch("/v1/remote-access/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login }),
  });
  if (!response.ok) throw await errorFromResponse(response);
}

export async function removeRemoteMember(login: string): Promise<void> {
  const response = await authenticatedFetch(
    `/v1/remote-access/members/${encodeURIComponent(login)}`,
    { method: "DELETE" },
  );
  if (!response.ok) throw await errorFromResponse(response);
}

export async function createPairingCode(
  hostId: string,
  hostName: string,
): Promise<PairingCodeResult> {
  const response = await authenticatedFetch("/v1/remote-access/pairing-codes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ host_id: hostId, host_name: hostName }),
  });
  if (!response.ok) throw await errorFromResponse(response);
  return (await response.json()) as PairingCodeResult;
}

export async function redeemPairingCode(code: string): Promise<PairingResult> {
  const response = await authenticatedFetch("/v1/remote-access/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) throw await errorFromResponse(response);
  return (await response.json()) as PairingResult;
}
