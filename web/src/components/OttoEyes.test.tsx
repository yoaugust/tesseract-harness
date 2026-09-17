import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OttoEyes } from "./OttoEyes";

afterEach(cleanup);

describe("OttoEyes compatibility export", () => {
  it("renders the accessible tesseract mark", () => {
    render(<OttoEyes className="hero-mark" />);
    expect(screen.getByRole("img", { name: "tesseract" })).toHaveClass("hero-mark");
  });
});
