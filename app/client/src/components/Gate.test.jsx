import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GateNote, sanitizeReviewerHtml } from "./Gate";

describe("reviewer note rendering", () => {
  it("preserves contracted emphasis while escaping executable markup", () => {
    const unsafe = '<b>Retain 264</b> <img src=x onerror="alert(1)"> <span class="mono">2,100</span> <b onclick="alert(2)">bad</b>';
    const sanitized = sanitizeReviewerHtml(unsafe);

    expect(sanitized).toContain("<b>Retain 264</b>");
    expect(sanitized).toContain('<span class="mono">2,100</span>');
    expect(sanitized).toContain("&lt;img");
    expect(sanitized).toContain("&lt;b onclick=");
    expect(sanitized).not.toContain("<img");
    expect(sanitized).not.toContain("<b onclick=");

    const { container } = render(<GateNote html={unsafe} />);
    expect(screen.getByText("Retain 264").tagName).toBe("B");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[onclick]")).toBeNull();
  });
});
