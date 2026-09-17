import { DictationSession } from "@/lib/dictation";

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike extends Event {
  results: {
    readonly length: number;
    [index: number]: {
      readonly length: number;
      [index: number]: { transcript: string };
      isFinal: boolean;
    };
  };
  resultIndex: number;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const browser = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null;
}

export interface VoiceCapture {
  cancel: () => void;
}

export interface VoiceCaptureEvents {
  onPartial: (text: string) => void;
  onCommand: (text: string) => void;
  onError: (message: string) => void;
  onSilence: () => void;
}

export async function startVoiceCapture(
  serverAvailable: boolean,
  events: VoiceCaptureEvents,
): Promise<VoiceCapture> {
  let settled = false;
  const finish = (text: string, cancel: () => void) => {
    if (settled) return;
    const command = text.trim();
    if (!command) return;
    settled = true;
    cancel();
    events.onCommand(command);
  };

  if (serverAvailable) {
    let session: DictationSession | null = null;
    session = await DictationSession.start({
      onPartial: events.onPartial,
      onFinal: (text) => finish(text, () => session?.cancel()),
      onError: events.onError,
    });
    return {
      cancel: () => {
        settled = true;
        session?.cancel();
        session = null;
      },
    };
  }

  const Ctor = recognitionCtor();
  if (!Ctor) throw new Error("Voice input is unavailable on this device");
  const recognition = new Ctor();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";
  recognition.onresult = (rawEvent) => {
    const event = rawEvent as SpeechRecognitionEventLike;
    let interim = "";
    let final = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = result[0]?.transcript ?? "";
      if (result.isFinal) final += text;
      else interim += text;
    }
    events.onPartial(interim.trim());
    if (final.trim()) finish(final, () => recognition.stop());
  };
  recognition.onerror = (rawEvent) => {
    const code = (rawEvent as Event & { error?: string }).error;
    if (settled || code === "aborted") return;
    if (code === "no-speech") events.onSilence();
    else
      events.onError(
        code === "not-allowed" ? "Microphone permission denied" : "Voice input failed",
      );
  };
  recognition.onend = () => {
    if (!settled) events.onSilence();
  };
  recognition.start();
  return {
    cancel: () => {
      settled = true;
      recognition.abort();
    },
  };
}
