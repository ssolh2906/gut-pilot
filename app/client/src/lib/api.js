// api.js — the only place that talks to the FastAPI backend. Requests go to
// /api/*, proxied to the backend by Vite in dev (see vite.config.js) so the
// browser never makes a cross-origin request.
const BASE = "/api";

async function request(path, options) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

// Cheap — just loads the fixture dataset, no model call.
export function createSession() {
  return request("/session", { method: "POST" });
}

// Not cheap — a live Claude + Paperclip call (tens of seconds, real tokens).
// Only call this from an explicit user action, never automatically.
export function getNormalizeStrategy(sessionId) {
  return request(`/session/${sessionId}/normalize/strategy`);
}

export function setNormalizeStrategy(sessionId, strategy) {
  return request(`/session/${sessionId}/normalize/strategy`, {
    method: "POST",
    body: JSON.stringify({ strategy }),
  });
}
