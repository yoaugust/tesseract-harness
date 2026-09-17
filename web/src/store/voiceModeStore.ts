import { create } from "zustand";

export type VoiceModePhase = "off" | "listening" | "thinking" | "speaking" | "error";

interface VoiceModeState {
  enabled: boolean;
  phase: VoiceModePhase;
  partial: string;
  error: string | null;
  awaitingReply: boolean;
  replyBaseline: string | null;
  enable: (replyBaseline: string | null) => void;
  disable: () => void;
  setListening: (partial?: string) => void;
  setPartial: (partial: string) => void;
  setThinking: (replyBaseline: string | null) => void;
  setSpeaking: () => void;
  finishReply: (replyKey: string | null) => void;
  fail: (message: string) => void;
}

export const useVoiceModeStore = create<VoiceModeState>((set) => ({
  enabled: false,
  phase: "off",
  partial: "",
  error: null,
  awaitingReply: false,
  replyBaseline: null,
  enable: (replyBaseline) =>
    set({ enabled: true, phase: "listening", partial: "", error: null, replyBaseline }),
  disable: () =>
    set({
      enabled: false,
      phase: "off",
      partial: "",
      error: null,
      awaitingReply: false,
      replyBaseline: null,
    }),
  setListening: (partial = "") =>
    set((state) => (state.enabled ? { phase: "listening", partial, error: null } : state)),
  setPartial: (partial) => set((state) => (state.enabled ? { partial } : state)),
  setThinking: (replyBaseline) =>
    set((state) =>
      state.enabled
        ? { phase: "thinking", partial: "", awaitingReply: true, replyBaseline }
        : state,
    ),
  setSpeaking: () => set((state) => (state.enabled ? { phase: "speaking", partial: "" } : state)),
  finishReply: (replyKey) =>
    set((state) =>
      state.enabled
        ? {
            phase: "listening",
            partial: "",
            awaitingReply: false,
            replyBaseline: replyKey,
          }
        : state,
    ),
  fail: (message) =>
    set((state) => (state.enabled ? { phase: "error", partial: "", error: message } : state)),
}));
