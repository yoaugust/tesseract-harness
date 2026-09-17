"""Structural coverage for the model-neutral desktop-use example.

The test loads the real shipped YAML but does not start cua-driver or touch the
desktop. It protects the two architecture properties the example depends on:
the model remains selectable at launch, the default harness supports the
runner's tool loop, and the computer MCP process is owned by the runner through
a portable stdio command.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from omnigent.spec import load
from omnigent.spec.types import AgentSpec, MCPServerConfig

_DESKTOP_USE_BUNDLE = Path(__file__).resolve().parents[3] / "examples" / "desktop_use"


@pytest.fixture(scope="module")
def desktop_use_spec() -> AgentSpec:
    """Load and validate the shipped desktop-use agent without launching it."""
    return load(_DESKTOP_USE_BUNDLE)


@pytest.fixture(scope="module")
def computer_server(desktop_use_spec: AgentSpec) -> MCPServerConfig:
    """Return the example's single runner-side computer MCP server."""
    assert len(desktop_use_spec.mcp_servers) == 1
    return desktop_use_spec.mcp_servers[0]


def test_desktop_use_is_model_neutral(desktop_use_spec: AgentSpec) -> None:
    """Users can pair the desktop surface with Astra or another model."""
    assert desktop_use_spec.executor.type == "omnigent"
    assert desktop_use_spec.executor.config.get("harness") == "openai-agents"
    assert desktop_use_spec.executor.model is None


def test_desktop_use_runs_cua_driver_over_stdio(computer_server: MCPServerConfig) -> None:
    """The bound runner resolves a portable cua-driver command and owns its MCP process."""
    assert computer_server.name == "computer"
    assert computer_server.transport == "stdio"
    assert computer_server.command == "cua-driver"
    assert computer_server.args == ["mcp"]
    assert computer_server.url is None


def test_desktop_use_exposes_work_tools_but_not_driver_admin(
    computer_server: MCPServerConfig,
) -> None:
    """Normal computer work is broad, while always-on driver administration stays hidden."""
    exposed = set(computer_server.tools or [])
    assert {
        "get_desktop_state",
        "get_window_state",
        "click",
        "type_text",
        "browser_navigate",
        "browser_click",
        "clipboard_read",
        "clipboard_write",
        "verify_state",
    } <= exposed
    assert {
        "kill_app",
        "set_config",
        "install_ffmpeg",
        "replay_trajectory",
        "check_for_update",
    }.isdisjoint(exposed)
