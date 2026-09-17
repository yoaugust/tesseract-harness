import { authenticatedFetch } from "@/lib/identity";

let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;

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
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.removeAttribute("src");
    activeAudio.load();
  }
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
  activeObjectUrl = null;
}

function speakWithBrowser(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      reject(new Error("Speech output is unavailable"));
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.onend = () => resolve();
    utterance.onerror = () => reject(new Error("Speech output failed"));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

async function speakWithServer(text: string): Promise<void> {
  const response = await authenticatedFetch("/v1/voice/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error("Local voice synthesis failed");
  const blob = await response.blob();
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
  activeObjectUrl = URL.createObjectURL(blob);
  activeAudio ??= new Audio();
  activeAudio.volume = 1;
  activeAudio.src = activeObjectUrl;
  const finished = new Promise<void>((resolve, reject) => {
    if (!activeAudio) {
      reject(new Error("Audio output is unavailable"));
      return;
    }
    activeAudio.onended = () => resolve();
    activeAudio.onerror = () => reject(new Error("Audio playback failed"));
  });
  await activeAudio.play();
  await finished;
}

export async function speakVoiceReply(markdown: string, serverAvailable: boolean): Promise<void> {
  const text = speechText(markdown);
  if (!text) return;
  stopVoicePlayback();
  if (serverAvailable) {
    try {
      await speakWithServer(text);
      return;
    } catch {
      // Keep voice mode usable while the optional local model is warming up.
    }
  }
  await speakWithBrowser(text);
}
