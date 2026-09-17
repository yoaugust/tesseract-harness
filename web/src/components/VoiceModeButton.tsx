"use client";

import { Button } from "@/components/ui/button";
import { useServerInfo } from "@/lib/CapabilitiesContext";
import { startVoiceCapture, type VoiceCapture } from "@/lib/voiceCapture";
import { speakVoiceReply, stopVoicePlayback, unlockVoicePlayback } from "@/lib/voicePlayback";
import { cn } from "@/lib/utils";
import { useVoiceModeStore } from "@/store/voiceModeStore";
import { AudioLinesIcon, LoaderCircleIcon, MicIcon, Volume2Icon } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

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
  const mountedRef = useRef(true);
  const latestRef = useRef({ busy, disabled, replyKey, onCommand });
  latestRef.current = { busy, disabled, replyKey, onCommand };
  const startListeningRef = useRef<() => void>(() => undefined);

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
    playbackActiveRef.current = true;
    useVoiceModeStore.getState().setSpeaking();
    void speakVoiceReply(replyText, voiceAvailable)
      .catch(() => {
        if (mountedRef.current) useVoiceModeStore.getState().fail("Voice output failed");
      })
      .then(() => {
        if (!mountedRef.current || !useVoiceModeStore.getState().enabled) return;
        if (useVoiceModeStore.getState().phase === "error") return;
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

  const Icon =
    phase === "thinking"
      ? LoaderCircleIcon
      : phase === "speaking"
        ? Volume2Icon
        : phase === "listening"
          ? MicIcon
          : AudioLinesIcon;
  const label = error ?? (partial ? `Listening: ${partial}` : PHASE_LABEL[phase]);

  return (
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
      <Icon className={cn("size-3.5", phase === "thinking" && "animate-spin")} aria-hidden="true" />
      {enabled && <span className="max-w-24 truncate">{PHASE_LABEL[phase]}</span>}
    </Button>
  );
}
