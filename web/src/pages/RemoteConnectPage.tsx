import { useEffect, useMemo, type ReactNode } from "react";
import { CheckCircle2Icon, LaptopIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHosts } from "@/hooks/useHosts";
import { saveRemoteComputerBinding } from "@/lib/remotePairing";
import { useNavigate, useSearchParams } from "@/lib/routing";

export function RemoteConnectPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const hostId = params.get("host_id")?.trim() ?? "";
  const { data: hosts, isLoading, error } = useHosts({ refetchOnFocus: true });
  const host = useMemo(
    () => hosts?.find((candidate) => candidate.host_id === hostId),
    [hostId, hosts],
  );

  useEffect(() => {
    if (!host) return;
    saveRemoteComputerBinding(host);
  }, [host]);

  if (isLoading) {
    return (
      <PairingShell icon={<Loader2Icon className="size-8 animate-spin" />} title="Connecting…">
        Verifying this Tesseract computer.
      </PairingShell>
    );
  }

  if (error) {
    return (
      <PairingShell
        icon={<TriangleAlertIcon className="size-8 text-destructive" />}
        title="Could not connect"
      >
        The phone could not reach the Tesseract server. Confirm that Tailscale is connected and try
        the QR code again.
      </PairingShell>
    );
  }

  if (!hostId || !host) {
    return (
      <PairingShell
        icon={<TriangleAlertIcon className="size-8 text-destructive" />}
        title="Pairing link expired"
      >
        This computer is unavailable to the current Tesseract account. Generate a new QR code from
        Remote Access settings.
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
          This phone will use <span className="font-medium text-foreground">{host.name}</span> as
          its default Tesseract computer.
        </p>
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <LaptopIcon className="size-4" />
          <span>{host.status === "online" ? "Computer online" : "Computer currently offline"}</span>
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
