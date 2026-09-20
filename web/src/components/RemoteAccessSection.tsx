import { useEffect, useMemo, useState } from "react";
import {
  LaptopIcon,
  Loader2Icon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UserPlusIcon,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHosts } from "@/hooks/useHosts";
import {
  addRemoteMember,
  createPairingCode,
  fetchRemoteAccessStatus,
  removeRemoteMember,
  type PairingCodeResult,
  type RemoteAccessStatus,
} from "@/lib/remoteAccessApi";
import {
  buildRemotePairingUrl,
  normalizeRemoteOrigin,
  normalizeRemoteServerOrigin,
  readRemoteAppOrigin,
  readRemoteOrigin,
  writeRemoteAppOrigin,
  writeRemoteOrigin,
} from "@/lib/remotePairing";

export function RemoteAccessSection() {
  const { data: hosts, isLoading } = useHosts({ refetchOnFocus: true });
  const availableHosts = useMemo(() => hosts ?? [], [hosts]);
  const [selectedHostId, setSelectedHostId] = useState("");
  const [origin, setOrigin] = useState(() => readRemoteOrigin(window.location.origin));
  const [appOrigin, setAppOrigin] = useState(() => readRemoteAppOrigin(window.location.origin));
  const [access, setAccess] = useState<RemoteAccessStatus | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [newLogin, setNewLogin] = useState("");
  const [memberPending, setMemberPending] = useState(false);
  const [pairing, setPairing] = useState<PairingCodeResult | null>(null);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (selectedHostId !== "") return;
    const preferred = availableHosts.find((host) => host.status === "online") ?? availableHosts[0];
    if (preferred) setSelectedHostId(preferred.host_id);
  }, [availableHosts, selectedHostId]);

  useEffect(() => {
    let cancelled = false;
    void fetchRemoteAccessStatus()
      .then((status) => {
        if (!cancelled) {
          setAccess(status);
          setAccessError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAccessError(error instanceof Error ? error.message : "Could not load remote access");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedHost = availableHosts.find((host) => host.host_id === selectedHostId) ?? null;
  const normalizedOrigin = normalizeRemoteServerOrigin(origin);
  const normalizedAppOrigin = normalizeRemoteOrigin(appOrigin);
  const pairingUrl = useMemo(() => {
    if (!pairing || normalizedOrigin === null || normalizedAppOrigin === null) return null;
    return buildRemotePairingUrl(normalizedAppOrigin, normalizedOrigin, pairing.code);
  }, [normalizedAppOrigin, normalizedOrigin, pairing]);
  const loopback =
    normalizedOrigin !== null &&
    ["localhost", "127.0.0.1", "::1"].includes(new URL(normalizedOrigin).hostname);

  async function refreshAccess() {
    const status = await fetchRemoteAccessStatus();
    setAccess(status);
    setAccessError(null);
  }

  async function addMember() {
    const login = newLogin.trim();
    if (!login) return;
    setMemberPending(true);
    setAccessError(null);
    try {
      await addRemoteMember(login);
      setNewLogin("");
      await refreshAccess();
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "Could not approve this login");
    } finally {
      setMemberPending(false);
    }
  }

  async function removeMember(login: string) {
    setMemberPending(true);
    setAccessError(null);
    try {
      await removeRemoteMember(login);
      await refreshAccess();
      setPairing(null);
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "Could not remove this login");
    } finally {
      setMemberPending(false);
    }
  }

  async function generatePairingCode() {
    if (!selectedHost || normalizedOrigin === null || normalizedAppOrigin === null || loopback) {
      return;
    }
    writeRemoteOrigin(normalizedOrigin);
    writeRemoteAppOrigin(normalizedAppOrigin);
    setGenerating(true);
    setPairingError(null);
    try {
      setPairing(await createPairingCode(selectedHost.host_id, selectedHost.name));
    } catch (error) {
      setPairingError(error instanceof Error ? error.message : "Could not create a pairing code");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold">Remote access</h1>
      <p className="mt-1 text-ui text-muted-foreground">
        Approve who can control this computer, then pair a phone with a secure one-time QR code.
      </p>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-start gap-3">
              <ShieldCheckIcon className="mt-0.5 size-5 text-primary" />
              <div>
                <h2 className="font-semibold">Approved Tailscale accounts</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Only logins listed here can use the private Tailscale address. Changes can only be
                  made directly on this computer.
                </p>
              </div>
            </div>

            <form
              className="mt-4 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void addMember();
              }}
            >
              <Input
                value={newLogin}
                onChange={(event) => setNewLogin(event.target.value)}
                placeholder="name@example.com"
                aria-label="Tailscale login"
                disabled={memberPending || access === null}
              />
              <Button type="submit" disabled={!newLogin.trim() || memberPending || access === null}>
                {memberPending ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <UserPlusIcon className="size-4" />
                )}
                Approve
              </Button>
            </form>

            {accessError && (
              <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {accessError}
              </div>
            )}

            <div className="mt-4 divide-y rounded-xl border">
              {access === null && !accessError && (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" /> Loading approved accounts…
                </div>
              )}
              {access?.members.length === 0 && (
                <div className="p-3 text-sm text-muted-foreground">
                  No remote accounts approved yet. Add your own Tailscale login first.
                </div>
              )}
              {access?.members.map((login) => (
                <div key={login} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{login}</div>
                    <div className="text-xs text-muted-foreground">Full computer control</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${login}`}
                    disabled={memberPending}
                    onClick={() => void removeMember(login)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-center gap-2">
              <LaptopIcon className="size-5" />
              <h2 className="font-semibold">Pair this phone</h2>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <label className="flex flex-col gap-2">
                <span className="text-ui font-medium">Computer</span>
                <Select
                  value={selectedHostId}
                  onValueChange={(value) => {
                    setSelectedHostId(value);
                    setPairing(null);
                  }}
                  disabled={isLoading}
                >
                  <SelectTrigger aria-label="Computer">
                    <SelectValue
                      placeholder={isLoading ? "Loading computers…" : "Select a computer"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableHosts.map((host) => (
                      <SelectItem key={host.host_id} value={host.host_id}>
                        {host.name} · {host.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-ui font-medium">Private Tailscale URL</span>
                <Input
                  value={origin}
                  onChange={(event) => {
                    setOrigin(event.target.value);
                    setPairing(null);
                  }}
                  placeholder="https://your-mac.tailnet-name.ts.net"
                  aria-invalid={origin !== "" && normalizedOrigin === null}
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-ui font-medium">Mobile web app URL</span>
                <Input
                  value={appOrigin}
                  onChange={(event) => {
                    setAppOrigin(event.target.value);
                    setPairing(null);
                  }}
                  placeholder="https://harness.tesseract.computer"
                  aria-invalid={appOrigin !== "" && normalizedAppOrigin === null}
                />
              </label>
            </div>

            {loopback && (
              <div className="mt-4 flex gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
                <span>
                  A phone cannot reach this localhost address. Enter the Mac&apos;s Tailscale HTTPS
                  address.
                </span>
              </div>
            )}
            {pairingError && (
              <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {pairingError}
              </div>
            )}

            <Button
              className="mt-4"
              onClick={() => void generatePairingCode()}
              disabled={
                generating ||
                selectedHost === null ||
                normalizedOrigin === null ||
                normalizedAppOrigin === null ||
                loopback ||
                access === null ||
                access.members.length === 0
              }
            >
              {generating ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : pairing ? (
                <RefreshCwIcon className="size-4" />
              ) : (
                <SmartphoneIcon className="size-4" />
              )}
              {pairing ? "Generate a new code" : "Generate secure QR code"}
            </Button>
          </div>
        </div>

        <div className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-2xl border bg-card p-5 text-center">
          {pairingUrl ? (
            <>
              <div className="rounded-lg bg-white p-3">
                <QRCodeSVG
                  value={pairingUrl}
                  size={220}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#000000"
                  aria-label="Pair phone with Tesseract"
                />
              </div>
              <div>
                <div className="flex items-center justify-center gap-2 font-medium">
                  <SmartphoneIcon className="size-4" />
                  Scan with your phone
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sign in through Tailscale. This code expires in five minutes and works once.
                </p>
              </div>
            </>
          ) : (
            <>
              <SmartphoneIcon className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Approve at least one account, select the computer, and generate a secure QR code.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
