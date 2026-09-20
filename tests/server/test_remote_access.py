"""Security and lifecycle tests for Tailscale phone pairing."""

from __future__ import annotations

from unittest.mock import MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from omnigent.server.auth import RESERVED_USER_LOCAL, UnifiedAuthProvider
from omnigent.server.remote_access import (
    TAILSCALE_LOGIN_HEADER,
    PairingCodeExpired,
    PairingCodeInvalid,
    PairingCodeStore,
    TailscaleAccessStore,
)
from omnigent.server.routes.remote_access import create_remote_access_router


def test_tailscale_identity_requires_loopback_proxy_and_allowlist(tmp_path, monkeypatch) -> None:
    allowlist_path = tmp_path / "tailscale_users"
    monkeypatch.setenv("OMNIGENT_TAILSCALE_ALLOWLIST_PATH", str(allowlist_path))
    TailscaleAccessStore(allowlist_path).add("Alice@Example.com")
    provider = UnifiedAuthProvider(source="header", local_single_user=True)

    request = MagicMock()
    request.headers = {TAILSCALE_LOGIN_HEADER: "alice@example.com"}
    request.client.host = "127.0.0.1"
    request.url.hostname = "mac.example.ts.net"
    assert provider.get_user_id(request) == RESERVED_USER_LOCAL

    request.headers = {TAILSCALE_LOGIN_HEADER: "mallory@example.com"}
    assert provider.get_user_id(request) is None

    request.headers = {TAILSCALE_LOGIN_HEADER: "alice@example.com"}
    request.client.host = "100.64.0.2"
    assert provider.get_user_id(request) is None


def test_ts_net_request_without_identity_never_falls_back_to_local() -> None:
    provider = UnifiedAuthProvider(source="header", local_single_user=True)
    request = MagicMock()
    request.headers = {}
    request.url.hostname = "mac.example.ts.net"
    assert provider.get_user_id(request) is None


def test_pairing_codes_are_single_use_and_expire() -> None:
    now = [1_000.0]
    store = PairingCodeStore(ttl_seconds=5, clock=lambda: now[0])

    code, target = store.create("host_1", "Mac")
    assert target.expires_at == 1_005
    assert store.redeem(code).host_id == "host_1"
    try:
        store.redeem(code)
    except PairingCodeInvalid:
        pass
    else:
        raise AssertionError("A redeemed pairing code must not work twice")

    expired_code, _ = store.create("host_1", "Mac")
    now[0] = 1_005.0
    try:
        store.redeem(expired_code)
    except PairingCodeExpired:
        pass
    else:
        raise AssertionError("An expired pairing code must be rejected")


class _LocalAuthProvider:
    def get_user_id(self, request: object) -> str:
        del request
        return RESERVED_USER_LOCAL


def test_remote_access_routes_require_local_management_and_approved_pairing(tmp_path) -> None:
    access_store = TailscaleAccessStore(tmp_path / "tailscale_users")
    pairing_codes = PairingCodeStore()
    app = FastAPI()
    app.include_router(
        create_remote_access_router(
            auth_provider=_LocalAuthProvider(),
            access_store=access_store,
            pairing_codes=pairing_codes,
        ),
        prefix="/v1",
    )

    with TestClient(app) as client:
        added = client.post(
            "/v1/remote-access/members",
            json={"login": "Alice@Example.com"},
        )
        assert added.status_code == 201
        assert client.get("/v1/remote-access").json()["members"] == ["alice@example.com"]

        remote_change = client.post(
            "/v1/remote-access/members",
            headers={TAILSCALE_LOGIN_HEADER: "alice@example.com"},
            json={"login": "mallory@example.com"},
        )
        assert remote_change.status_code == 403

        created = client.post(
            "/v1/remote-access/pairing-codes",
            json={"host_id": "host_1", "host_name": "Shared Mac"},
        )
        assert created.status_code == 201
        code = created.json()["code"]

        denied = client.post(
            "/v1/remote-access/pair",
            headers={TAILSCALE_LOGIN_HEADER: "mallory@example.com"},
            json={"code": code},
        )
        assert denied.status_code == 401

        paired = client.post(
            "/v1/remote-access/pair",
            headers={TAILSCALE_LOGIN_HEADER: "alice@example.com"},
            json={"code": code},
        )
        assert paired.status_code == 200
        assert paired.json() == {
            "host_id": "host_1",
            "host_name": "Shared Mac",
            "paired_login": "alice@example.com",
            "expires_at": created.json()["expires_at"],
        }

        reused = client.post(
            "/v1/remote-access/pair",
            headers={TAILSCALE_LOGIN_HEADER: "alice@example.com"},
            json={"code": code},
        )
        assert reused.status_code == 410
