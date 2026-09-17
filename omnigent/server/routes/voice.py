"""Text-to-speech endpoint used by mobile voice mode."""

from __future__ import annotations

import asyncio
import re
from collections.abc import Callable

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field, field_validator

from omnigent.server.auth import AuthProvider
from omnigent.server.voice import VoiceEngine, VoiceUnavailableError, default_voice, get_engine

_VOICE_NAME = re.compile(r"^[a-z]{2}_[a-z0-9_]{1,40}$")


class VoiceSynthesisRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4_000)
    voice: str = Field(default_factory=default_voice)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)

    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text must not be blank")
        return value

    @field_validator("voice")
    @classmethod
    def voice_must_be_safe(cls, value: str) -> str:
        if not _VOICE_NAME.fullmatch(value):
            raise ValueError("invalid voice name")
        return value


def create_voice_router(
    *,
    auth_provider: AuthProvider | None = None,
    engine_provider: Callable[[], VoiceEngine] | None = None,
) -> APIRouter:
    """Build the identity-scoped local TTS route."""

    router = APIRouter()
    resolve_engine = engine_provider or get_engine
    synthesis_slot = asyncio.Semaphore(1)

    @router.post("/voice/synthesize")
    async def synthesize(body: VoiceSynthesisRequest, request: Request) -> Response:
        if auth_provider is not None and auth_provider.get_user_id(request) is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
            )
        try:
            async with synthesis_slot:
                engine = await asyncio.to_thread(resolve_engine)
                audio = await asyncio.to_thread(
                    engine.synthesize,
                    body.text,
                    voice=body.voice,
                    speed=body.speed,
                )
        except VoiceUnavailableError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Voice synthesis is unavailable",
            ) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Voice synthesis failed",
            ) from exc
        return Response(
            content=audio,
            media_type="audio/wav",
            headers={"Cache-Control": "no-store"},
        )

    return router
