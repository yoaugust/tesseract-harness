import { describe, expect, it } from "vitest";
import { speechText } from "./voicePlayback";

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
});
