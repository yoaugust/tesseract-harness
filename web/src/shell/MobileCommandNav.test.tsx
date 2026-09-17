import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { MobileCommandNav } from "./MobileCommandNav";

function renderNav(path = "/", onOpenSessions = vi.fn()) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <MobileCommandNav onOpenSessions={onOpenSessions} />
    </MemoryRouter>,
  );
  return onOpenSessions;
}

describe("MobileCommandNav", () => {
  it("keeps the primary phone destinations compact and accessible", () => {
    renderNav();

    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("button", { name: "Sessions" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inbox" })).toHaveAttribute("href", "/inbox");
  });

  it("opens the existing sessions drawer without introducing a second workflow", () => {
    const onOpenSessions = renderNav("/inbox");

    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));

    expect(onOpenSessions).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Inbox" })).toHaveAttribute("data-active", "true");
  });
});
