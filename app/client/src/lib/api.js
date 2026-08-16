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

// Cheap — real ingestion, no model call either way.
//
// `file`, if given, is a real .tar.gz upload (MicrobiomeHD format — same
// shape as the bundled datasets) sent as multipart/form-data and parsed for
// real server-side. Without a file, falls back to `dataset` — the bundled
// "crc_baxter" (default) or the synthetic "fixture" for fast dev iteration.
// A file upload can't go through the shared `request()` helper: that
// forces a "Content-Type: application/json" header, which would break a
// multipart body — the browser needs to set its own boundary header.
export async function createSession(file, dataset) {
  if (file) {
    const form = new FormData();
    form.append("count_table", file);
    const res = await fetch(`${BASE}/session`, { method: "POST", body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `${res.status} ${res.statusText}`);
    }
    return res.json();
  }
  const qs = dataset ? `?dataset=${encodeURIComponent(dataset)}` : "";
  return request(`/session${qs}`, { method: "POST" });
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

// Cheap — pure Compute, no model call. Real per-sample rarefaction curves
// (exact expected richness, see compute/p04_rarefaction.py) plus a
// plateau-derived suggested depth (G7), for the Normalize page's chart.
export function getRarefactionCurves(sessionId) {
  return request(`/session/${sessionId}/rarefaction/curves`);
}

// Not cheap — same live Claude + Paperclip cost pattern as normalize/strategy.
// Combined G1+G2+G3 in one call (see reasoning/study_design.py).
export function getStudyDesign(sessionId) {
  return request(`/session/${sessionId}/design/study-design`);
}

// Not cheap — same live Claude + Paperclip cost pattern as normalize/strategy.
export function getRank(sessionId) {
  return request(`/session/${sessionId}/design/rank`);
}

export function setRank(sessionId, rank) {
  return request(`/session/${sessionId}/design/rank`, {
    method: "POST",
    body: JSON.stringify({ rank }),
  });
}

// Not cheap — same live Claude + Paperclip cost pattern as normalize/strategy.
export function getAlphaSignificance(sessionId) {
  return request(`/session/${sessionId}/alpha/significance`);
}

// Not cheap — same live Claude + Paperclip cost pattern as normalize/strategy.
export function getBetaMetric(sessionId) {
  return request(`/session/${sessionId}/beta/metric`);
}

// Not cheap — every message is a live Claude call (Paperclip tools available
// but only used when the question calls for it). Only call from an explicit
// send action, never automatically.
// `clientState` is the frontend's own current selections (design/betaMetric/
// alphaLevel/correction) — several gates (G1-G3, the live G8/G9 pickers)
// have no backend apply_*/POST endpoint yet, so without this the chatbot
// would answer from stale or absent backend state instead of what's
// actually on the user's screen. See reasoning/chatbot.py's _client_state_block.
export function sendChatMessage(sessionId, message, page, clientState) {
  return request(`/session/${sessionId}/chat`, {
    method: "POST",
    body: JSON.stringify({ message, page, client_state: clientState }),
  });
}
