import { useEffect, useMemo, useState } from "react";
import { CheckIcon, CopyIcon, LaptopIcon, SmartphoneIcon, TriangleAlertIcon } from "lucide-react";
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
  buildRemotePairingUrl,
  normalizeRemoteOrigin,
  readRemoteOrigin,
  writeRemoteOrigin,
} from "@/lib/remotePairing";

export function RemoteAccessSection() {
  const { data: hosts, isLoading } = useHosts({ refetchOnFocus: true });
  const availableHosts = useMemo(() => hosts ?? [], [hosts]);
  const [selectedHostId, setSelectedHostId] = useState("");
  const [origin, setOrigin] = useState(() => readRemoteOrigin(window.location.origin));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (selectedHostId !== "") return;
    const preferred = availableHosts.find((host) => host.status === "online") ?? availableHosts[0];
    if (preferred) setSelectedHostId(preferred.host_id);
  }, [availableHosts, selectedHostId]);

  const selectedHost = availableHosts.find((host) => host.host_id === selectedHostId) ?? null;
  const normalizedOrigin = normalizeRemoteOrigin(origin);
  const pairingUrl = useMemo(() => {
    if (!selectedHost || normalizedOrigin === null) return null;
    return buildRemotePairingUrl(normalizedOrigin, selectedHost);
  }, [normalizedOrigin, selectedHost]);
  const loopback =
    normalizedOrigin !== null &&
    ["localhost", "127.0.0.1", "::1"].includes(new URL(normalizedOrigin).hostname);

  async function copyPairingUrl() {
    if (!pairingUrl) return;
    await navigator.clipboard.writeText(pairingUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold">Remote access</h1>
      <p className="mt-1 text-ui text-muted-foreground">
        Pair a phone with one Tesseract computer and make it the default target for new sessions.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-5">
          <label className="flex flex-col gap-2">
            <span className="text-ui font-medium">Computer</span>
            <Select value={selectedHostId} onValueChange={setSelectedHostId} disabled={isLoading}>
              <SelectTrigger aria-label="Computer">
                <SelectValue placeholder={isLoading ? "Loading computers…" : "Select a computer"} />
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
            <span className="text-ui font-medium">Phone-accessible server URL</span>
            <Input
              value={origin}
              onChange={(event) => {
                setOrigin(event.target.value);
                setCopied(false);
              }}
              onBlur={() => {
                if (normalizedOrigin !== null) writeRemoteOrigin(normalizedOrigin);
              }}
              placeholder="https://your-mac.tailnet-name.ts.net"
              aria-invalid={origin !== "" && normalizedOrigin === null}
            />
            <span className="text-sm text-muted-foreground">
              Use the private HTTPS address that opens this Tesseract server from your phone.
            </span>
          </label>

          {loopback && (
            <div className="flex gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
              <span>
                A phone cannot reach this localhost address. Enter the Mac&apos;s Tailscale HTTPS
                address before scanning.
              </span>
            </div>
          )}

          <div className="rounded-lg border p-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 text-foreground">
              <LaptopIcon className="size-4" />
              <span className="font-medium">What pairing stores</span>
            </div>
            <p className="mt-2">
              The phone remembers this computer and preselects it when creating sessions. Server
              sign-in and your private network still control who can access Tesseract.
            </p>
          </div>
        </div>

        <div className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-2xl border bg-card p-5 text-center">
          {pairingUrl && !loopback ? (
            <>
              <div className="rounded-lg bg-white p-3">
                <QRCodeSVG
                  value={pairingUrl}
                  size={200}
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
                  The link connects this browser to {selectedHost?.name}.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void copyPairingUrl()}>
                {copied ? (
                  <CheckIcon className="mr-1 size-4" />
                ) : (
                  <CopyIcon className="mr-1 size-4" />
                )}
                {copied ? "Copied" : "Copy link"}
              </Button>
            </>
          ) : (
            <>
              <SmartphoneIcon className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Select a computer and enter a phone-accessible HTTPS URL to generate its QR code.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
