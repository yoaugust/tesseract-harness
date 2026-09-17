"""Local text-to-speech engines for mobile voice mode.

The default engine is Kokoro-82M. Imports and model loading stay lazy so the
base server keeps its existing dependency and startup footprint.
"""

from __future__ import annotations

import importlib.util
import io
import os
import threading
import wave
from functools import lru_cache
from typing import Any, Protocol

ENGINE_ENV = "OMNIGENT_TTS_ENGINE"
VOICE_ENV = "OMNIGENT_TTS_VOICE"

ENGINE_KOKORO = "kokoro"
DEFAULT_ENGINE = ENGINE_KOKORO
DEFAULT_VOICE = "af_heart"
SAMPLE_RATE = 24_000


class VoiceEngine(Protocol):
    """Synthesize a complete WAV response."""

    def synthesize(self, text: str, *, voice: str, speed: float) -> bytes: ...


class VoiceUnavailableError(RuntimeError):
    """The configured voice engine cannot serve synthesis."""


def selected_engine_name() -> str:
    return os.environ.get(ENGINE_ENV, "").strip() or DEFAULT_ENGINE


def default_voice() -> str:
    return os.environ.get(VOICE_ENV, "").strip() or DEFAULT_VOICE


def engine_availability() -> tuple[bool, str | None]:
    """Probe configuration and optional dependencies without loading weights."""

    engine = selected_engine_name()
    if engine != ENGINE_KOKORO:
        return False, "unknown_engine"
    if importlib.util.find_spec("kokoro") is None:
        return False, "extra_not_installed"
    if importlib.util.find_spec("numpy") is None:
        return False, "extra_not_installed"
    return True, None


def _wav_bytes(audio: object) -> bytes:
    import numpy as np

    samples = np.asarray(audio, dtype=np.float32).reshape(-1)
    if samples.size == 0:
        raise VoiceUnavailableError("voice engine produced no audio")
    pcm = (np.clip(samples, -1.0, 1.0) * 32767.0).astype("<i2", copy=False)
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm.tobytes())
    return output.getvalue()


class KokoroVoiceEngine:
    """Process-wide Kokoro pipeline with serialized inference."""

    def __init__(self) -> None:
        try:
            from kokoro import KPipeline
        except ImportError as exc:  # pragma: no cover - guarded by availability
            raise VoiceUnavailableError("Kokoro voice dependencies are not installed") from exc
        self._pipeline = KPipeline(lang_code="a")
        self._lock = threading.Lock()

    def synthesize(self, text: str, *, voice: str, speed: float) -> bytes:
        import numpy as np

        chunks: list[Any] = []
        with self._lock:
            for _graphemes, _phonemes, audio in self._pipeline(
                text,
                voice=voice,
                speed=speed,
                split_pattern=r"\n+",
            ):
                if hasattr(audio, "detach"):
                    audio = audio.detach().cpu().numpy()
                chunks.append(audio)
        if not chunks:
            raise VoiceUnavailableError("Kokoro produced no audio")
        return _wav_bytes(np.concatenate(chunks))


@lru_cache(maxsize=1)
def get_engine() -> VoiceEngine:
    available, reason = engine_availability()
    if not available:
        raise VoiceUnavailableError(reason or "voice engine unavailable")
    return KokoroVoiceEngine()
