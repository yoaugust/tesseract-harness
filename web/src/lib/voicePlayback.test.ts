import { afterEach, describe, expect, it, vi } from "vitest";
import { speakVoiceReply, speechText, stopVoicePlayback } from "./voicePlayback";

afterEach(() => {
  stopVoicePlayback();
  vi.unstubAllGlobals();
});

describe("speechText", () => {
  it("turns assistant markdown into concise spoken text", () => {
    expect(
      speechText("## Done\n\n- Open [the file](https://example.test).\n- Run `pnpm test`."),
    ).toBe("Done Open the file. Run pnpm test.");
  });

  it("does not read fenced code aloud", () => {
    expect(speechText("I fixed it.\n```ts\nconst secret = 1;\n```\nTry again.")).toBe(
      "I fixed it. Code output is available on screen. Try again.",
    );
  });

  it("caps very long replies", () => {
    expect(speechText("a".repeat(100), 20)).toBe(`${"a".repeat(19)}…`);
  });

  it("settles an interrupted browser response without reporting a playback failure", async () => {
    class FakeUtterance {
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
    }
    let activeUtterance: FakeUtterance | null = null;
    const speechSynthesis = {
      cancel: vi.fn(() => activeUtterance?.onerror?.()),
      speak: vi.fn((utterance: FakeUtterance) => {
        activeUtterance = utterance;
      }),
    };
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: speechSynthesis,
    });

    const playback = speakVoiceReply("Still speaking", false);
    stopVoicePlayback();

    await expect(playback).resolves.toBe("interrupted");
    expect(speechSynthesis.speak).toHaveBeenCalledOnce();
  });
});
