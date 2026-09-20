import { authenticatedFetch } from "@/lib/identity";

let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;
let settleActivePlayback: ((result: VoicePlaybackResult) => void) | null = null;
let activeSynthesisRequest: AbortController | null = null;

export type VoicePlaybackResult = "completed" | "interrupted";

const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export function speechText(markdown: string, maxChars = 3_000): string {
  const cleaned = markdown
    .replace(/```[\s\S]*?```/g, " Code output is available on screen. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/[>*_~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars - 1).trimEnd()}…`;
}

export function unlockVoicePlayback(): void {
  if (typeof Audio === "undefined") return;
  activeAudio ??= new Audio();
  activeAudio.src = SILENT_WAV;
  activeAudio.volume = 0.01;
  void activeAudio.play().then(
    () => {
      activeAudio?.pause();
      if (activeAudio) activeAudio.currentTime = 0;
    },
    () => undefined,
  );
}

export function stopVoicePlayback(): void {
  const settle = settleActivePlayback;
  settleActivePlayback = null;
  settle?.("interrupted");
  activeSynthesisRequest?.abort();
  activeSynthesisRequest = null;
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  if (activeAudio) {
    activeAudio.onended = null;
    activeAudio.onerror = null;
    activeAudio.pause();
    activeAudio.removeAttribute("src");
    activeAudio.load();
  }
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
  activeObjectUrl = null;
}

function playbackPromise(
  start: (finish: () => void, fail: (error: Error) => void) => void,
): Promise<VoicePlaybackResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (result: VoicePlaybackResult) => {
      if (settled) return;
      settled = true;
      if (settleActivePlayback === settle) settleActivePlayback = null;
      resolve(result);
    };
    settleActivePlayback = settle;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      if (settleActivePlayback === settle) settleActivePlayback = null;
      reject(error);
    };
    try {
      start(() => settle("completed"), fail);
    } catch (cause) {
      fail(cause instanceof Error ? cause : new Error("Speech output failed"));
    }
  });
}

function speakWithBrowser(text: string): Promise<VoicePlaybackResult> {
  return playbackPromise((finish, fail) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      fail(new Error("Speech output is unavailable"));
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.onend = finish;
    utterance.onerror = () => fail(new Error("Speech output failed"));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

async function speakWithServer(text: string, signal: AbortSignal): Promise<VoicePlaybackResult> {
  const response = await authenticatedFetch("/v1/voice/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!response.ok) throw new Error("Local voice synthesis failed");
  const blob = await response.blob();
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
  activeObjectUrl = URL.createObjectURL(blob);
  activeAudio ??= new Audio();
  activeAudio.volume = 1;
  activeAudio.src = activeObjectUrl;
  const finished = playbackPromise((finish, fail) => {
    if (!activeAudio) {
      fail(new Error("Audio output is unavailable"));
      return;
    }
    activeAudio.onended = finish;
    activeAudio.onerror = () => fail(new Error("Audio playback failed"));
  });
  try {
    await activeAudio.play();
  } catch (cause) {
    stopVoicePlayback();
    throw cause;
  }
  return finished;
}

export async function speakVoiceReply(
  markdown: string,
  serverAvailable: boolean,
): Promise<VoicePlaybackResult> {
  const text = speechText(markdown);
  if (!text) return "completed";
  stopVoicePlayback();
  if (serverAvailable) {
    const request = new AbortController();
    activeSynthesisRequest = request;
    try {
      return await speakWithServer(text, request.signal);
    } catch {
      if (request.signal.aborted) return "interrupted";
      // Keep voice mode usable while the optional local model is warming up.
    } finally {
      if (activeSynthesisRequest === request) activeSynthesisRequest = null;
    }
  }
  return speakWithBrowser(text);
}
