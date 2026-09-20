"use client";

import { Button } from "@/components/ui/button";
import { useServerInfo } from "@/lib/CapabilitiesContext";
import { startVoiceCapture, type VoiceCapture } from "@/lib/voiceCapture";
import { speakVoiceReply, stopVoicePlayback, unlockVoicePlayback } from "@/lib/voicePlayback";
import { cn } from "@/lib/utils";
import { useVoiceModeStore } from "@/store/voiceModeStore";
import {
  AudioLinesIcon,
  LoaderCircleIcon,
  MicIcon,
  PhoneOffIcon,
  Volume2Icon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface VoiceModeButtonProps {
  disabled?: boolean;
  busy: boolean;
  replyKey: string | null;
  replyText: string | null;
  onCommand: (text: string) => boolean;
  className?: string;
}

const PHASE_LABEL = {
  off: "Voice mode",
  listening: "Listening",
  thinking: "Working",
  speaking: "Speaking",
  error: "Voice error",
} as const;

export function VoiceModeButton({
  disabled = false,
  busy,
  replyKey,
  replyText,
  onCommand,
  className,
}: VoiceModeButtonProps) {
  const serverInfo = useServerInfo();
  const dictationAvailable = serverInfo !== "loading" && serverInfo.dictation_available;
  const voiceAvailable = serverInfo !== "loading" && serverInfo.voice_available === true;
  const enabled = useVoiceModeStore((state) => state.enabled);
  const phase = useVoiceModeStore((state) => state.phase);
  const partial = useVoiceModeStore((state) => state.partial);
  const error = useVoiceModeStore((state) => state.error);
  const awaitingReply = useVoiceModeStore((state) => state.awaitingReply);
  const replyBaseline = useVoiceModeStore((state) => state.replyBaseline);
  const captureRef = useRef<VoiceCapture | null>(null);
  const captureStartRef = useRef<Promise<void> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackActiveRef = useRef(false);
  const bargeInRef = useRef(false);
  const mountedRef = useRef(true);
  const latestRef = useRef({ busy, disabled, replyKey, onCommand });
  latestRef.current = { busy, disabled, replyKey, onCommand };
  const startListeningRef = useRef<() => void>(() => undefined);
  const startBargeInRef = useRef<() => void>(() => undefined);

  const clearCapture = useCallback(() => {
    captureRef.current?.cancel();
    captureRef.current = null;
    if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  const startListening = useCallback(() => {
    const state = useVoiceModeStore.getState();
    const latest = latestRef.current;
    if (
      !mountedRef.current ||
      !state.enabled ||
      state.awaitingReply ||
      latest.busy ||
      latest.disabled ||
      captureRef.current ||
      captureStartRef.current
    ) {
      return;
    }
    state.setListening();
    const pending = startVoiceCapture(dictationAvailable, {
      onPartial: (text) => useVoiceModeStore.getState().setPartial(text),
      onCommand: (text) => {
        captureRef.current = null;
        const current = latestRef.current;
        if (!useVoiceModeStore.getState().enabled) return;
        if (!current.onCommand(text)) {
          useVoiceModeStore.getState().fail("This session cannot accept a command right now");
          return;
        }
        useVoiceModeStore.getState().setThinking(current.replyKey);
      },
      onError: (message) => {
        captureRef.current = null;
        useVoiceModeStore.getState().fail(message);
      },
      onSilence: () => {
        captureRef.current = null;
        if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => startListeningRef.current(), 350);
      },
    })
      .then((capture) => {
        if (!mountedRef.current || !useVoiceModeStore.getState().enabled) capture.cancel();
        else captureRef.current = capture;
      })
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : "Voice input failed";
        useVoiceModeStore.getState().fail(message);
      })
      .finally(() => {
        captureStartRef.current = null;
      });
    captureStartRef.current = pending;
  }, [dictationAvailable]);
  startListeningRef.current = startListening;

  const interruptPlayback = useCallback((interimText = "") => {
    if (!playbackActiveRef.current || bargeInRef.current) return;
    bargeInRef.current = true;
    stopVoicePlayback();
    useVoiceModeStore.getState().finishReply(latestRef.current.replyKey);
    useVoiceModeStore.getState().setListening(interimText);
  }, []);

  const startBargeIn = useCallback(() => {
    const state = useVoiceModeStore.getState();
    if (
      !mountedRef.current ||
      !state.enabled ||
      state.phase !== "speaking" ||
      captureRef.current ||
      captureStartRef.current ||
      typeof window === "undefined" ||
      !window.matchMedia?.("(max-width: 767px)").matches
    ) {
      return;
    }
    let heardSpeech = false;
    const pending = startVoiceCapture(dictationAvailable, {
      onPartial: (text) => {
        if (!text.trim()) return;
        heardSpeech = true;
        interruptPlayback(text);
        useVoiceModeStore.getState().setPartial(text);
      },
      onCommand: (text) => {
        captureRef.current = null;
        if (!bargeInRef.current) interruptPlayback(text);
        const current = latestRef.current;
        if (!useVoiceModeStore.getState().enabled) return;
        if (!current.onCommand(text)) {
          useVoiceModeStore.getState().fail("This session cannot accept a command right now");
          return;
        }
        useVoiceModeStore.getState().setThinking(current.replyKey);
      },
      onError: () => {
        captureRef.current = null;
        // Interruption detection is an enhancement. Playback can continue if
        // the browser cannot keep the microphone open while audio is playing.
        if (playbackActiveRef.current) {
          retryTimerRef.current = setTimeout(() => startBargeInRef.current(), 500);
        }
      },
      onSilence: () => {
        captureRef.current = null;
        if (!heardSpeech && playbackActiveRef.current) {
          retryTimerRef.current = setTimeout(() => startBargeInRef.current(), 350);
        }
      },
    })
      .then((capture) => {
        const current = useVoiceModeStore.getState();
        if (!mountedRef.current || !current.enabled || current.phase !== "speaking") {
          capture.cancel();
        } else {
          captureRef.current = capture;
        }
      })
      .catch(() => undefined)
      .finally(() => {
        captureStartRef.current = null;
        const current = useVoiceModeStore.getState();
        if (current.enabled && current.phase === "listening" && !captureRef.current) {
          startListeningRef.current();
        }
      });
    captureStartRef.current = pending;
  }, [dictationAvailable, interruptPlayback]);
  startBargeInRef.current = startBargeIn;

  useEffect(() => {
    if (enabled && !awaitingReply && !busy && phase !== "speaking" && phase !== "error") {
      startListening();
    }
  }, [enabled, awaitingReply, busy, phase, startListening]);

  useEffect(() => {
    if (
      !enabled ||
      !awaitingReply ||
      busy ||
      !replyText ||
      !replyKey ||
      replyKey === replyBaseline ||
      playbackActiveRef.current
    ) {
      return;
    }
    clearCapture();
    bargeInRef.current = false;
    playbackActiveRef.current = true;
    useVoiceModeStore.getState().setSpeaking();
    void speakVoiceReply(replyText, voiceAvailable)
      .catch(() => {
        if (mountedRef.current) useVoiceModeStore.getState().fail("Voice output failed");
      })
      .then((result) => {
        if (!mountedRef.current || !useVoiceModeStore.getState().enabled) return;
        if (result === "interrupted" || bargeInRef.current) return;
        if (useVoiceModeStore.getState().phase === "error") return;
        clearCapture();
        useVoiceModeStore.getState().finishReply(replyKey);
        startListeningRef.current();
      })
      .finally(() => {
        playbackActiveRef.current = false;
      });
  }, [
    enabled,
    awaitingReply,
    busy,
    replyText,
    replyKey,
    replyBaseline,
    voiceAvailable,
    clearCapture,
  ]);

  useEffect(() => {
    if (enabled && phase === "speaking") startBargeIn();
  }, [enabled, phase, startBargeIn]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearCapture();
    };
  }, [clearCapture]);

  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Voice mode still works; the phone may simply dim normally.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && sentinel?.released !== false) void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 767px)");
    if (!media.matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [enabled]);

  const toggle = () => {
    if (enabled) {
      clearCapture();
      stopVoicePlayback();
      useVoiceModeStore.getState().disable();
      return;
    }
    unlockVoicePlayback();
    useVoiceModeStore.getState().enable(replyKey);
    startListeningRef.current();
  };

  const endVoiceMode = () => {
    clearCapture();
    stopVoicePlayback();
    playbackActiveRef.current = false;
    bargeInRef.current = false;
    useVoiceModeStore.getState().disable();
  };

  const retry = () => {
    clearCapture();
    stopVoicePlayback();
    useVoiceModeStore.getState().disable();
    useVoiceModeStore.getState().enable(replyKey);
    startListeningRef.current();
  };

  const Icon =
    phase === "thinking"
      ? LoaderCircleIcon
      : phase === "speaking"
        ? Volume2Icon
        : phase === "listening"
          ? MicIcon
          : AudioLinesIcon;
  const label = error ?? (partial ? `Listening: ${partial}` : PHASE_LABEL[phase]);

  const mobilePanel =
    enabled && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] hidden min-h-[100dvh] flex-col overflow-hidden bg-[#070708] text-white max-md:flex"
            role="dialog"
            aria-modal="true"
            aria-label="Tesseract voice session"
            data-testid="mobile-voice-panel"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(220,35,48,0.18),transparent_42%)]" />
            <header className="relative flex items-center justify-between px-5 pb-4 pt-[max(1.25rem,var(--omnigent-safe-top,0px))]">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/45">
                  tesseract
                </p>
                <p className="mt-1 text-sm text-white/75">Live voice</p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={endVoiceMode}
                className="size-10 rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                aria-label="Close voice mode"
              >
                <XIcon className="size-4" aria-hidden="true" />
              </Button>
            </header>

            <main className="relative flex flex-1 flex-col items-center justify-center px-8 pb-8 text-center">
              <p className="mb-10 text-base font-medium text-white/80">{PHASE_LABEL[phase]}</p>
              <button
                type="button"
                onClick={
                  phase === "speaking"
                    ? () => interruptPlayback()
                    : phase === "error"
                      ? retry
                      : undefined
                }
                disabled={phase !== "speaking" && phase !== "error"}
                className={cn(
                  "group relative flex size-48 items-center justify-center rounded-full outline-none transition-transform duration-300",
                  (phase === "speaking" || phase === "error") && "active:scale-95",
                )}
                aria-label={
                  phase === "speaking"
                    ? "Interrupt Tesseract and speak"
                    : phase === "error"
                      ? "Retry voice mode"
                      : PHASE_LABEL[phase]
                }
              >
                <span
                  className={cn(
                    "absolute inset-0 rounded-full bg-red-500/10 blur-2xl transition-all duration-500",
                    phase === "listening" && "scale-110 animate-pulse bg-red-500/25",
                    phase === "speaking" && "scale-125 animate-pulse bg-red-600/30",
                  )}
                />
                <span
                  className={cn(
                    "absolute inset-4 rounded-full border border-white/10 bg-gradient-to-br from-red-500 via-red-700 to-red-950 shadow-[0_24px_80px_rgba(185,20,35,0.38)] transition-all duration-500",
                    phase === "listening" && "scale-105",
                    phase === "thinking" && "animate-pulse saturate-50",
                    phase === "speaking" && "scale-110",
                    phase === "error" && "from-red-800 via-red-950 to-black saturate-50",
                  )}
                />
                <Icon
                  className={cn(
                    "relative size-10 text-white drop-shadow-lg",
                    phase === "thinking" && "animate-spin",
                  )}
                  aria-hidden="true"
                />
              </button>

              <div className="mt-10 min-h-20 max-w-sm" aria-live="polite">
                <p className="text-balance text-lg leading-7 text-white/90">
                  {error ||
                    partial ||
                    (phase === "speaking" ? "You can interrupt me anytime." : "")}
                </p>
                {phase === "listening" && !partial && (
                  <p className="text-sm text-white/45">Go ahead — I’m listening.</p>
                )}
                {phase === "thinking" && (
                  <p className="text-sm text-white/45">Working on your Mac…</p>
                )}
                {phase === "error" && (
                  <p className="mt-2 text-sm text-white/45">Tap the orb to try again.</p>
                )}
              </div>
            </main>

            <footer className="relative flex flex-col items-center gap-3 px-6 pb-[max(1.5rem,var(--omnigent-safe-bottom,0px))]">
              {phase === "speaking" && (
                <button
                  type="button"
                  onClick={() => interruptPlayback()}
                  className="mb-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/65 active:bg-white/10"
                >
                  Tap to interrupt
                </button>
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={endVoiceMode}
                className="size-14 rounded-full bg-white text-black hover:bg-white/90 hover:text-black"
                aria-label="End voice session"
              >
                <PhoneOffIcon className="size-5" aria-hidden="true" />
              </Button>
            </footer>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled && !enabled}
        aria-pressed={enabled}
        aria-label={enabled ? "Stop voice mode" : "Start voice mode"}
        title={label}
        onClick={toggle}
        className={cn(
          "h-8 min-w-8 gap-1.5 rounded-full px-2 text-xs",
          enabled && "bg-brand-accent/15 text-brand-accent hover:bg-brand-accent/20",
          phase === "error" && "text-destructive",
          className,
        )}
        data-testid="voice-mode-toggle"
      >
        <Icon
          className={cn("size-3.5", phase === "thinking" && "animate-spin")}
          aria-hidden="true"
        />
        {enabled && <span className="max-w-24 truncate">{PHASE_LABEL[phase]}</span>}
      </Button>
      {mobilePanel}
    </>
  );
}
