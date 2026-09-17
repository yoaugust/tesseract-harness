"""Unit tests for the optional local TTS engine."""

from __future__ import annotations

import wave
from io import BytesIO

import pytest

from omnigent.server import voice


def test_availability_reports_missing_extra(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(voice.ENGINE_ENV, raising=False)
    monkeypatch.setattr(voice.importlib.util, "find_spec", lambda name: None)
    assert voice.engine_availability() == (False, "extra_not_installed")


def test_availability_rejects_unknown_engine(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(voice.ENGINE_ENV, "unknown")
    assert voice.engine_availability() == (False, "unknown_engine")


def test_wav_bytes_encodes_mono_pcm() -> None:
    np = pytest.importorskip("numpy")
    encoded = voice._wav_bytes(np.array([-1.0, 0.0, 1.0], dtype=np.float32))
    with wave.open(BytesIO(encoded), "rb") as wav:
        assert wav.getnchannels() == 1
        assert wav.getsampwidth() == 2
        assert wav.getframerate() == voice.SAMPLE_RATE
        assert wav.getnframes() == 3
