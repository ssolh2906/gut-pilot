import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppErrorBoundary from "./AppErrorBoundary";


function BrokenView() {
  throw new Error("render failed");
}

describe("demo error boundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows a scientist-facing recovery screen instead of a raw crash", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<AppErrorBoundary><BrokenView /></AppErrorBoundary>);

    expect(screen.getByRole("heading", { name: "Refresh the demo interface" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh Gut Pilot" })).toBeTruthy();
    expect(screen.queryByText(/render failed/i)).toBeNull();
  });
});
