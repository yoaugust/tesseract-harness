# tesseract on Tailscale

[Tailscale](https://tailscale.com) gives every device on your network a
stable private hostname (`<machine>.ts.net`) and connects them peer-to-peer
over WireGuard — no port forwarding, no firewall rules. This makes it easy
to access a server running on your laptop from your phone, tablet, or any
other device you own.

> [!NOTE]
> This is not a cloud deploy. Tailscale is a networking layer, not a hosting
> service — you still run the server yourself (laptop, VPS, home server).
> If you want the server to stay up when your laptop closes, deploy to a
> cloud platform (see [../README.md](../README.md)) and use Tailscale just
> for private access.

## Prerequisites

- Tailscale installed on your server machine and every client device.
  Each person may use their own Tailscale login, but their device must be able
  to reach this machine through the tailnet.
- tesseract server running locally using either:
  - the bare CLI (`omnigent start` or `omnigent server`) on the default
    `localhost:6767`; or
  - Docker Compose from `deploy/docker/` on `localhost:8000`.

## Tailnet-only access (phone / tablet / remote laptop)

Expose the local server over HTTPS to every device on your tailnet. Run the
command that matches how you started tesseract:

```bash
# Bare CLI (`omnigent start` or `omnigent server`)
tailscale serve --bg 6767

# Docker Compose
tailscale serve --bg 8000
```

Tailscale issues a TLS certificate for `https://<machine>.ts.net` and
proxies traffic to the selected local port. No other device on the internet
can reach it.

The server coordinates sessions, while host-local tools run on the host or
runner selected for the session. If you select this laptop, its shell,
filesystem, local MCP servers, and computer-use drivers run on this laptop.

Set two environment variables on the server before starting it:

```dotenv
# Trust the Tailscale origin so WebSocket handshakes and multipart
# uploads are accepted from the browser on your phone/tablet.
OMNIGENT_WS_ALLOWED_ORIGINS=https://<machine>.ts.net,https://harness.tesseract.computer

# Public base URL — used to build the correct __Host- cookie prefix
# and any invite / magic-link URLs.
OMNIGENT_ACCOUNTS_BASE_URL=https://<machine>.ts.net
```

The first origin is the app served directly by the Mac. The second is the
optional Vercel-hosted mobile shell; omit it until you deploy that shell.
The same explicit list enables credentialed CORS for shell-to-Mac API calls.

Without `OMNIGENT_WS_ALLOWED_ORIGINS` the browser will get WebSocket close
code `4403` and an HTTP 403 *"Forbidden: this endpoint requires a trusted
Origin header"* on chat and file uploads. Without `OMNIGENT_ACCOUNTS_BASE_URL`
session cookies won't use the `__Host-` prefix and invite links resolve to
the wrong host.

**With Docker Compose** (`deploy/docker/`), add both lines to your `.env`:

```bash
# generate and edit .env if you haven't already
cp deploy/docker/.env.example deploy/docker/.env

# add to .env:
OMNIGENT_WS_ALLOWED_ORIGINS=https://<machine>.ts.net,https://harness.tesseract.computer
OMNIGENT_ACCOUNTS_BASE_URL=https://<machine>.ts.net
```

Then restart:

```bash
docker compose up -d
```

Before opening the remote URL, use the local app on the Mac:

1. Open **Settings → Remote access**.
2. Add each person's exact Tailscale login (usually their email address).
3. Select the computer, enter `https://<machine>.ts.net` as the private server,
   and enter the deployed mobile shell URL (for example
   `https://harness.tesseract.computer`). Until the shell is deployed, use the
   private server URL in both fields.
4. Generate and scan the QR code.

Tailscale Serve supplies a verified `Tailscale-User-Login` header. Tesseract
accepts it only from the loopback proxy and only when that login is in the
owner-managed allowlist. Approved people act on the shared local computer, but
only a browser opened directly on the Mac can change the allowlist. Pairing QR
codes expire after five minutes, work once, and keep their code in the URL
fragment so it is not sent in the initial HTTP request or normal access logs.

Removing a login in **Settings → Remote access** takes effect on its next HTTP
or WebSocket request. The allowlist is stored at
`~/.omnigent/tailscale_users` by default.

The Vercel site contains only the static web app. It does not proxy commands or
hold computer credentials: after pairing, the browser calls the private
`.ts.net` server directly. The private endpoint is carried in the QR fragment
and saved only in that phone browser after the one-time code succeeds.

To deploy that shell, import this repository into Vercel with the repository
root as the project root. The checked-in `vercel.json` installs the pnpm
workspace, builds `web/`, publishes the generated static bundle, and rewrites
client-side routes such as `/remote/connect` to `index.html`. Attach
`harness.tesseract.computer` to that Vercel project, then use that exact origin
in both the Mac's allowed-origins setting and the Remote Access screen.

## Cloud sandbox hosts and Tailscale Funnel

Cloud sandbox providers (Modal, Daytona, E2B, …) run the tesseract host
process *inside* a remote container. That host dials **out** to
`server_url` over WebSocket to receive work — so it needs to reach the
server from the sandbox provider's cloud network, not just from your
tailnet.

A server behind plain `tailscale serve` is only reachable from your
tailnet. **Tailscale Funnel** fixes this: it makes a specific port
reachable from the public internet while keeping the same
`<machine>.ts.net` hostname.

Run the command that matches how you started tesseract:

```bash
# Bare CLI (`omnigent start` or `omnigent server`)
tailscale funnel --bg 6767

# Docker Compose
tailscale funnel --bg 8000
```

Then point the sandbox config at the public Tailscale URL:

```yaml
# config.yaml (or /data/config.yaml in Docker)
sandbox:
  provider: modal          # or daytona, e2b, …
  server_url: https://<machine>.ts.net
```

> [!IMPORTANT]
> Funnel makes the server reachable from the public internet, so enable
> auth before turning it on:
>
> ```dotenv
> OMNIGENT_AUTH_ENABLED=1
> OMNIGENT_ACCOUNTS_BASE_URL=https://<machine>.ts.net
> ```
>
> See [Auth](../README.md#auth) for the full setup.

## Summary

| Goal | Server mode | Command | Reachable from |
|---|---|---|---|
| Access from devices on your tailnet | Bare CLI | `tailscale serve --bg 6767` | Tailnet only |
| Access from devices on your tailnet | Docker Compose | `tailscale serve --bg 8000` | Tailnet only |
| Cloud sandbox hosts + tailnet | Bare CLI | `tailscale funnel --bg 6767` | Public internet + tailnet |
| Cloud sandbox hosts + tailnet | Docker Compose | `tailscale funnel --bg 8000` | Public internet + tailnet |

## Environment variable reference

| Variable | Purpose |
|---|---|
| `OMNIGENT_WS_ALLOWED_ORIGINS` | Comma-separated browser-origin allowlist for WebSockets, protected multipart routes, and CORS. Include both `https://<machine>.ts.net` and the mobile shell origin when using Vercel. |
| `OMNIGENT_ACCOUNTS_BASE_URL` | Public base URL. Used for session cookie security (`__Host-` prefix) and invite / magic-link URLs. |
| `OMNIGENT_AUTH_ENABLED` | `1` to require login. Recommended when using Tailscale Funnel (public internet exposure). |
| `OMNIGENT_TAILSCALE_ALLOWLIST_PATH` | Optional path for the owner-managed Tailscale login allowlist. Defaults to `<data_dir>/tailscale_users`. |
