"""Tests for the local text-to-speech route."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from omnigent.server.routes.voice import create_voice_router


class _FakeVoiceEngine:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, float]] = []

    def synthesize(self, text: str, *, voice: str, speed: float) -> bytes:
        self.calls.append((text, voice, speed))
        return b"RIFF-fake-wave"


class _NoIdentityAuthProvider:
    def get_user_id(self, request: object) -> None:
        del request
        return


def _app(engine: _FakeVoiceEngine, **kwargs: object) -> FastAPI:
    app = FastAPI()
    app.include_router(
        create_voice_router(engine_provider=lambda: engine, **kwargs),
        prefix="/v1",
    )
    return app


def test_synthesize_returns_wav_and_forwards_options() -> None:
    engine = _FakeVoiceEngine()
    with TestClient(_app(engine)) as client:
        response = client.post(
            "/v1/voice/synthesize",
            json={"text": " Hello there. ", "voice": "af_heart", "speed": 1.15},
        )
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.headers["cache-control"] == "no-store"
    assert response.content == b"RIFF-fake-wave"
    assert engine.calls == [("Hello there.", "af_heart", 1.15)]


def test_synthesize_rejects_blank_text_and_unsafe_voice() -> None:
    engine = _FakeVoiceEngine()
    with TestClient(_app(engine)) as client:
        assert client.post("/v1/voice/synthesize", json={"text": "   "}).status_code == 422
        assert (
            client.post(
                "/v1/voice/synthesize",
                json={"text": "hello", "voice": "../../voice"},
            ).status_code
            == 422
        )
    assert engine.calls == []


def test_synthesize_requires_identity_when_auth_is_configured() -> None:
    engine = _FakeVoiceEngine()
    with TestClient(_app(engine, auth_provider=_NoIdentityAuthProvider())) as client:
        response = client.post("/v1/voice/synthesize", json={"text": "hello"})
    assert response.status_code == 401
    assert engine.calls == []
