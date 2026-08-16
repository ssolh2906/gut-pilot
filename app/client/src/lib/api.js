// api.js — the only place that talks to the FastAPI backend. Requests go to
// /api/*, proxied to the backend by Vite in dev (see vite.config.js) so the
// browser never makes a cross-origin request.
const BASE = "/api";
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const RETRY_DELAY_MS = 250;
const inFlightReads = new Map();

function retryDelay(attempt) {
  return new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
}

async function performRequest(path, options, method) {
  const maxAttempts = method === "GET" ? 3 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let res;
    try {
      res = await fetch(BASE + path, {
        headers: { "Content-Type": "application/json" },
        ...options,
      });
    } catch (error) {
      if (attempt >= maxAttempts) throw error;
      await retryDelay(attempt);
      continue;
    }

    if (res.ok) return res.json();
    if (attempt < maxAttempts && TRANSIENT_STATUSES.has(res.status)) {
      await retryDelay(attempt);
      continue;
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `${res.status} ${res.statusText}`);
  }
}

function request(path, options = {}) {
  const method = (options.method ?? "GET").toUpperCase();
  if (method !== "GET") return performRequest(path, options, method);

  // React Strict Mode intentionally re-runs effects in development. Share
  // one identical read while it is in flight so evidence/model endpoints do
  // not incur duplicate latency or provider calls during the demo.
  if (inFlightReads.has(path)) return inFlightReads.get(path);
  const pending = performRequest(path, options, method).finally(() => {
    inFlightReads.delete(path);
  });
  inFlightReads.set(path, pending);
  return pending;
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

export function deleteSession(sessionId) {
  return request(`/session/${sessionId}`, { method: "DELETE" });
}

// Cheap — compute-only (G5), no model call. Real per-sample depth from
// whatever dataset createSession() actually loaded.
export function getQcDepth(sessionId) {
  return request(`/session/${sessionId}/qc/depth`);
}

export function getAlphaDiversity(sessionId, correction = "bh", nIterations = 50) {
  return request(
    `/session/${sessionId}/alpha/diversity?correction=${encodeURIComponent(correction)}&n_iterations=${encodeURIComponent(nIterations)}`,
  );
}

export function setRarefactionDepth(sessionId, depth) {
  return request(`/session/${sessionId}/rarefaction/depth`, {
    method: "POST",
    body: JSON.stringify({ depth }),
  });
}

export function getBetaDiversity(sessionId, metric = "jaccard") {
  return request(`/session/${sessionId}/beta/diversity?metric=${encodeURIComponent(metric)}`);
}

export function getDifferentialAbundance(sessionId, prevalence = 0.10) {
  return request(`/session/${sessionId}/differential-abundance?prevalence=${encodeURIComponent(prevalence)}`);
}

// Final scientific payoff: computed results plus a cached Claude + Paperclip
// interpretation, with a deterministic literature-grounded fallback.
export function getScientificSynthesis(sessionId, correction = "bh", prevalence = 0.10) {
  return request(
    `/session/${sessionId}/synthesis?correction=${encodeURIComponent(correction)}&n_iterations=50&metric=jaccard&prevalence=${encodeURIComponent(prevalence)}`,
  );
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

// Not cheap — every message is a live Claude call (Paperclip tools available
// but only used when the question calls for it). Only call from an explicit
// send action, never automatically.
export function sendChatMessage(sessionId, message, page) {
  return request(`/session/${sessionId}/chat`, {
    method: "POST",
    body: JSON.stringify({ message, page }),
  });
}
