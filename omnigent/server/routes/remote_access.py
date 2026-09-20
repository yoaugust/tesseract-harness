"""Owner-managed Tailscale access and secure phone pairing routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from omnigent.server.auth import RESERVED_USER_LOCAL, AuthProvider
from omnigent.server.remote_access import (
    TAILSCALE_LOGIN_HEADER,
    PairingCodeExpired,
    PairingCodeInvalid,
    PairingCodeStore,
    TailscaleAccessStore,
)


class AddRemoteMemberRequest(BaseModel):
    login: str = Field(min_length=1, max_length=320)


class CreatePairingCodeRequest(BaseModel):
    host_id: str = Field(min_length=1, max_length=256)
    host_name: str = Field(min_length=1, max_length=256)


class RedeemPairingCodeRequest(BaseModel):
    code: str = Field(min_length=1, max_length=256)


def create_remote_access_router(
    *,
    auth_provider: AuthProvider | None,
    access_store: TailscaleAccessStore,
    pairing_codes: PairingCodeStore,
) -> APIRouter:
    """Build the local-owner management and remote enrollment API."""
    router = APIRouter()

    def require_local_owner(request: Request) -> None:
        user_id = auth_provider.get_user_id(request) if auth_provider is not None else None
        if user_id != RESERVED_USER_LOCAL or request.headers.get(TAILSCALE_LOGIN_HEADER):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Remote access can only be managed directly on this computer",
            )

    @router.get("/remote-access")
    async def get_remote_access(request: Request, response: Response) -> dict[str, object]:
        require_local_owner(request)
        response.headers["Cache-Control"] = "no-store"
        return {
            "members": list(access_store.list_members()),
            "pairing_ttl_seconds": pairing_codes.ttl_seconds,
        }

    @router.post("/remote-access/members", status_code=status.HTTP_201_CREATED)
    async def add_remote_member(
        body: AddRemoteMemberRequest,
        request: Request,
        response: Response,
    ) -> dict[str, str]:
        require_local_owner(request)
        try:
            login = access_store.add(body.login)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
            ) from exc
        response.headers["Cache-Control"] = "no-store"
        return {"login": login, "role": "full_control"}

    @router.delete("/remote-access/members/{login}", status_code=status.HTTP_204_NO_CONTENT)
    async def remove_remote_member(login: str, request: Request) -> Response:
        require_local_owner(request)
        try:
            removed = access_store.remove(login)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
            ) from exc
        if not removed:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.post("/remote-access/pairing-codes", status_code=status.HTTP_201_CREATED)
    async def create_pairing_code(
        body: CreatePairingCodeRequest,
        request: Request,
        response: Response,
    ) -> dict[str, object]:
        require_local_owner(request)
        try:
            code, target = pairing_codes.create(body.host_id, body.host_name)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
            ) from exc
        response.headers["Cache-Control"] = "no-store"
        return {"code": code, "expires_at": target.expires_at}

    @router.post("/remote-access/pair")
    async def redeem_pairing_code(
        body: RedeemPairingCodeRequest,
        request: Request,
        response: Response,
    ) -> dict[str, object]:
        tailscale_login = request.headers.get(TAILSCALE_LOGIN_HEADER, "")
        user_id = auth_provider.get_user_id(request) if auth_provider is not None else None
        if (
            user_id != RESERVED_USER_LOCAL
            or not tailscale_login
            or not access_store.is_allowed(tailscale_login)
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Sign in to Tailscale with an approved account",
            )
        try:
            target = pairing_codes.redeem(body.code)
        except PairingCodeExpired as exc:
            raise HTTPException(
                status_code=status.HTTP_410_GONE, detail="Pairing code expired"
            ) from exc
        except PairingCodeInvalid as exc:
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="Pairing code is invalid or has already been used",
            ) from exc
        response.headers["Cache-Control"] = "no-store"
        return {
            "host_id": target.host_id,
            "host_name": target.host_name,
            "paired_login": tailscale_login.strip().lower(),
            "expires_at": target.expires_at,
        }

    return router
