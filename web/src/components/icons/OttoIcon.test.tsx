import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OttoIcon } from "./OttoIcon";

afterEach(cleanup);

describe("OttoIcon compatibility export", () => {
  it("renders the tesseract cube mark and forwards root props", () => {
    const { container } = render(<OttoIcon className="product-mark" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("product-mark");
    expect(svg).toHaveAttribute("viewBox", "0 0 1024 1024");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg?.querySelectorAll("g > path")).toHaveLength(9);
  });

  it("lets callers expose the mark to assistive technology", () => {
    const { container } = render(
      <OttoIcon role="img" aria-label="tesseract" aria-hidden={false} />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "false");
    expect(svg).toHaveAttribute("aria-label", "tesseract");
  });
});
