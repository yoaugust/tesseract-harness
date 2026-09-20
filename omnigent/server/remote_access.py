"""Owner-managed Tailscale access and short-lived phone pairing codes."""

from __future__ import annotations

import contextlib
import hashlib
import os
import secrets
import tempfile
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from omnigent.server.admin_list import MtimeCachedIdentitySet, resolve_data_dir

TAILSCALE_LOGIN_HEADER = "Tailscale-User-Login"
_ALLOWLIST_FILENAME = "tailscale_users"
_DEFAULT_PAIRING_TTL_SECONDS = 300


def resolve_tailscale_allowlist_path() -> Path:
    """Return the owner-editable Tailscale login allowlist path."""
    explicit = os.environ.get("OMNIGENT_TAILSCALE_ALLOWLIST_PATH", "").strip()
    return Path(explicit) if explicit else resolve_data_dir() / _ALLOWLIST_FILENAME


def normalize_tailscale_login(value: str) -> str:
    """Normalize and validate one Tailscale login identity."""
    login = value.strip().lower()
    if not login or len(login) > 320 or any(char in login for char in "\r\n\0"):
        raise ValueError("Enter a valid Tailscale login")
    return login


class TailscaleAccessStore:
    """Atomic file-backed allowlist for people trusted to control this computer."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or resolve_tailscale_allowlist_path()
        self._identities = MtimeCachedIdentitySet(self.path)
        self._lock = threading.RLock()

    def list_members(self) -> tuple[str, ...]:
        """Return approved logins in stable display order."""
        return tuple(sorted(self._identities.snapshot()))

    def is_allowed(self, login: str) -> bool:
        """Return whether *login* is approved for full computer access."""
        try:
            normalized = normalize_tailscale_login(login)
        except ValueError:
            return False
        return self._identities.contains(normalized)

    def add(self, login: str) -> str:
        """Approve *login* and return its normalized value."""
        normalized = normalize_tailscale_login(login)
        with self._lock:
            members = set(self._identities.snapshot())
            members.add(normalized)
            self._write(members)
        return normalized

    def remove(self, login: str) -> bool:
        """Revoke *login* immediately; return whether it was present."""
        normalized = normalize_tailscale_login(login)
        with self._lock:
            members = set(self._identities.snapshot())
            if normalized not in members:
                return False
            members.remove(normalized)
            self._write(members)
        return True

    def _write(self, members: set[str]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(
            dir=str(self.path.parent),
            prefix=f".{self.path.name}.",
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                if members:
                    handle.write("\n".join(sorted(members)) + "\n")
            os.replace(temporary, self.path)
        except OSError:
            with contextlib.suppress(OSError):
                os.unlink(temporary)
            raise
        # Force the next read to observe this write even on filesystems whose
        # timestamp precision cannot distinguish two rapid replacements.
        self._identities = MtimeCachedIdentitySet(self.path)


_access_stores: dict[str, TailscaleAccessStore] = {}
_access_stores_lock = threading.Lock()


def get_tailscale_access_store() -> TailscaleAccessStore:
    """Return the process-shared store for the currently configured path."""
    path = resolve_tailscale_allowlist_path().resolve()
    key = str(path)
    with _access_stores_lock:
        store = _access_stores.get(key)
        if store is None:
            store = TailscaleAccessStore(path)
            _access_stores[key] = store
        return store


@dataclass(frozen=True)
class PairingTarget:
    """The computer target bound to a one-time pairing code."""

    host_id: str
    host_name: str
    expires_at: int


class PairingCodeError(Exception):
    """Base class for pairing-code redemption failures."""


class PairingCodeExpired(PairingCodeError):
    """The pairing code existed but is no longer usable."""


class PairingCodeInvalid(PairingCodeError):
    """The pairing code is unknown or has already been used."""


class PairingCodeStore:
    """Thread-safe, in-memory store for short-lived single-use QR codes."""

    def __init__(
        self,
        *,
        ttl_seconds: int = _DEFAULT_PAIRING_TTL_SECONDS,
        clock: Callable[[], float] | None = None,
    ) -> None:
        self._ttl_seconds = ttl_seconds
        self._clock = clock or time.time
        self._records: dict[str, PairingTarget] = {}
        self._lock = threading.Lock()

    @property
    def ttl_seconds(self) -> int:
        """Configured lifetime for newly minted codes."""
        return self._ttl_seconds

    @staticmethod
    def _digest(code: str) -> str:
        return hashlib.sha256(code.encode("utf-8")).hexdigest()

    def create(self, host_id: str, host_name: str) -> tuple[str, PairingTarget]:
        """Mint a code bound to one host and return it exactly once."""
        if not host_id.strip() or not host_name.strip():
            raise ValueError("A computer is required")
        code = secrets.token_urlsafe(32)
        now = int(self._clock())
        target = PairingTarget(
            host_id=host_id.strip(),
            host_name=host_name.strip(),
            expires_at=now + self._ttl_seconds,
        )
        with self._lock:
            self._purge_expired(now)
            self._records[self._digest(code)] = target
        return code, target

    def redeem(self, code: str) -> PairingTarget:
        """Atomically consume *code* and return its target."""
        if not code:
            raise PairingCodeInvalid
        now = int(self._clock())
        with self._lock:
            target = self._records.pop(self._digest(code), None)
            self._purge_expired(now)
        if target is None:
            raise PairingCodeInvalid
        if target.expires_at <= now:
            raise PairingCodeExpired
        return target

    def _purge_expired(self, now: int) -> None:
        expired = [digest for digest, target in self._records.items() if target.expires_at <= now]
        for digest in expired:
            self._records.pop(digest, None)
