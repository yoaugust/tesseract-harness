import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2Icon, LaptopIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { redeemPairingCode, type PairingResult } from "@/lib/remoteAccessApi";
import {
  readRemotePairingCode,
  readRemotePairingEndpoint,
  saveRemoteComputerBinding,
  writeRemoteOrigin,
} from "@/lib/remotePairing";
import { useNavigate } from "@/lib/routing";

const redemptions = new Map<string, Promise<PairingResult>>();

function redeemOnce(code: string): Promise<PairingResult> {
  let request = redemptions.get(code);
  if (request === undefined) {
    request = redeemPairingCode(code);
    redemptions.set(code, request);
  }
  return request;
}

type PairingState =
  | { status: "connecting" }
  | { status: "connected"; result: PairingResult }
  | { status: "error"; message: string };

export function RemoteConnectPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<PairingState>({ status: "connecting" });

  useEffect(() => {
    const code = readRemotePairingCode(window.location.hash);
    const endpoint = readRemotePairingEndpoint(window.location.hash);
    if (!code || endpoint === null) {
      setState({ status: "error", message: "This pairing link is incomplete." });
      return;
    }
    let cancelled = false;
    void redeemOnce(code)
      .then((result) => {
        if (cancelled) return;
        saveRemoteComputerBinding({ host_id: result.host_id, name: result.host_name });
        writeRemoteOrigin(endpoint);
        window.history.replaceState({}, "", "/remote/connect");
        setState({ status: "connected", result });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not pair this phone.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "connecting") {
    return (
      <PairingShell icon={<Loader2Icon className="size-8 animate-spin" />} title="Connecting…">
        Confirming your Tailscale identity and pairing this phone.
      </PairingShell>
    );
  }

  if (state.status === "error") {
    return (
      <PairingShell
        icon={<TriangleAlertIcon className="size-8 text-destructive" />}
        title="Could not connect"
      >
        <div className="flex flex-col gap-3">
          <p>{state.message}</p>
          <p className="text-sm">
            Connect Tailscale with an approved account, then generate a new QR code on the Mac.
          </p>
        </div>
      </PairingShell>
    );
  }

  return (
    <PairingShell
      icon={<CheckCircle2Icon className="size-8 text-success" />}
      title="Phone connected"
    >
      <div className="flex flex-col items-center gap-4">
        <p>
          This phone will use{" "}
          <span className="font-medium text-foreground">{state.result.host_name}</span> as its
          Tesseract computer.
        </p>
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <LaptopIcon className="size-4" />
          <span>Authenticated as {state.result.paired_login}</span>
        </div>
        <Button onClick={() => navigate("/", { replace: true })}>Open Tesseract</Button>
      </div>
    </PairingShell>
  );
}

function PairingShell({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <section className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border bg-card p-8 text-center shadow-sm">
        {icon}
        <h1 className="text-2xl font-semibold">{title}</h1>
        <div className="text-ui text-muted-foreground">{children}</div>
      </section>
    </main>
  );
}
