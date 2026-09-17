# Desktop use

This example gives a Tesseract agent native desktop and browser tools through
[`cua-driver`](https://github.com/trycua/cua). The important boundary is where
the tool runs: **the computer driver starts on the runner you select for the
session**. The Tesseract server can live on this Mac, a home server, or in the
cloud; it does not click the Mac unless a runner on this Mac is connected.

The agent does not pin a model. It defaults to the `openai-agents` harness, and
you can override the harness and model at launch without changing its desktop
tool configuration.

## Start on this Mac

Install `cua-driver` so it is on the same `PATH` as Tesseract, then grant the
macOS permissions to the driver application:

```bash
command -v cua-driver
cua-driver permissions grant
cua-driver doctor --json
```

macOS should show Accessibility and Screen Recording prompts. Grant both to
CuaDriver, then rerun `cua-driver doctor --json`. Desktop capture and input must
pass before an agent can operate the Mac.

Run the example with the configured default model:

```bash
omnigent run examples/desktop_use
```

The MCP server name is `computer`, so its model-facing tools are namespaced as
`computer__get_desktop_state`, `computer__click`, and so on. The example exposes
normal native/browser work, clipboard access, verification, cursor display, and
recording. It deliberately withholds driver self-update/configuration, forced
process killing, deprecated compatibility tools, and trajectory replay.

## Use it from a phone on the same tailnet

Follow the repository's [Tailscale guide](../../deploy/tailscale/README.md) for
the canonical HTTPS proxy and required origin/base-URL environment variables.
For a bare local server on the default port, pre-register this agent when the
server starts:

```bash
OMNIGENT_WS_ALLOWED_ORIGINS=https://<machine>.ts.net \
OMNIGENT_ACCOUNTS_BASE_URL=https://<machine>.ts.net \
omnigent server --host 127.0.0.1 --port 6767 --agent examples/desktop_use
```

In another terminal, expose that server exactly as the Tailscale guide
describes:

```bash
tailscale serve --bg 6767
```

Register this Mac as a persistent host for the HTTPS server:

```bash
omnigent login https://<machine>.ts.net
omnigent host enable --server https://<machine>.ts.net
omnigent host status
```

Open `https://<machine>.ts.net` on the phone, start the `desktop-use` agent, and
select this Mac as its host. The phone is the client; Tesseract approval prompts
can be answered there, while macOS permission/onboarding prompts remain on the
Mac. The Mac runner launches `cua-driver mcp` and performs the actual desktop
actions, so it must remain awake in an interactive logged-in desktop session.

Do not substitute Tailscale Funnel casually. Funnel exposes the server to the
public internet; the linked guide requires server authentication before using
it.

## Keep the control plane always online

For a server that survives when this laptop closes, deploy the Tesseract server
using the [deployment guide](../../deploy/README.md). On this Mac, authenticate
once and install the per-user host service against that stable URL:

```bash
omnigent login https://your-tesseract-server.example
omnigent host enable --server https://your-tesseract-server.example
omnigent host status
```

This separates the always-online control plane from the computer being
controlled:

- The server stores sessions and serves the phone/web UI.
- The selected runner runs the agent loop, MCP subprocesses, and desktop driver.
- The inference provider supplies model compute and can be fully remote.

`host enable` keeps the runner registered as a per-user service, but it cannot
make a sleeping or logged-out Mac automatable. If this Mac is offline, its
desktop sessions wait for a usable host or must be routed to another one.

For recurring work, create an Automation from Tesseract's Tasks page. The
always-online server stores and fires the schedule, while a connected host runs
each agent session. This provides scheduled background work; it is not yet a
continuous wake-word/listening loop, and closed-app mobile push notifications
still require separate APNs/FCM integration.

## Move the desktop host to the cloud later

Install Tesseract and `cua-driver` on a GUI-capable macOS, Windows, or Linux VM,
grant that machine's desktop permissions, and connect it to the same server with
`omnigent host enable --server ...`. Select the cloud GUI host instead of this
Mac when starting a session. A headless server or container alone is not a
desktop: the chosen runner needs a real interactive graphical session.

This means the migration does not change the agent bundle or mobile client.
Only the selected runner changes:

```text
phone/web UI -> always-online Tesseract server -> selected Mac or cloud GUI runner
                                                -> local cua-driver -> that desktop
```

## Choose the brain independently

Desktop control is model-neutral. `cua-driver` supplies observation and action;
the selected model decides which tools to call.

- **Astra:** keep the default `openai-agents` harness and select the configured
  Astra model in the UI or with `--model <astra-model-id>`.
- **Hermes:** use `omnigent run examples/desktop_use --harness hermes`. Hermes
  can use its configured provider while the same runner-local MCP tools perform
  desktop actions.
- **Kimi K3 or another open model:** configure an OpenAI-compatible provider
  such as OpenRouter, LiteLLM, vLLM, Ollama, or a hosted endpoint through
  `omnigent setup`, then select its model with the default harness. Hermes is
  also a good open-model-oriented harness if that provider is already
  configured there.

For now, route Kimi K3 through `openai-agents` or Hermes. Tesseract's dedicated
Kimi Code harness does not yet inject agent-declared MCP tools, so selecting
that harness would omit the `computer__*` desktop surface.

Changing the model does not move desktop authority to the model provider. The
provider receives model context; the selected runner remains the component that
owns and executes computer-use tools.
