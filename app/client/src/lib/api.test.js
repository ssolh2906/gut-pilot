import { afterEach, describe, expect, it, vi } from "vitest";

import { getQcDepth, setRarefactionDepth } from "./api";


describe("API demo resilience", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("retries transient read-only failures", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: "Unavailable", json: async () => ({}) })
      .mockRejectedValueOnce(new Error("proxy restarting"))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ bars: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getQcDepth("demo-session")).resolves.toEqual({ bars: [] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("coalesces identical concurrent reads", async () => {
    let resolveFetch;
    const fetchMock = vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));
    vi.stubGlobal("fetch", fetchMock);

    const first = getQcDepth("demo-session");
    const second = getQcDepth("demo-session");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch({ ok: true, status: 200, json: async () => ({ bars: [] }) });
    await expect(Promise.all([first, second])).resolves.toEqual([{ bars: [] }, { bars: [] }]);
  });

  it("does not retry a non-transient response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({ detail: "session not found" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getQcDepth("expired-session")).rejects.toThrow("session not found");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not replay state-changing requests", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("connection lost"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(setRarefactionDepth("demo-session", 2100)).rejects.toThrow("connection lost");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
