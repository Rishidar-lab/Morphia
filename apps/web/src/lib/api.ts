/**
 * API client for the MORPHIA backend.
 * All requests go through this layer for consistent error handling, CSRF
 * token injection, and session-expiry handling.
 */

import { clearSession, getCsrfToken } from "./session";

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Called when any request comes back 401 — the session is gone. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> | undefined),
  };

  // Double-submit CSRF: echo the per-session token on every mutation.
  if (MUTATING.has(method)) {
    const token = getCsrfToken();
    if (token) headers["X-CSRF-Token"] = token;
  }

  const res = await fetch(path, {
    credentials: "include",
    ...options,
    headers,
  });

  if (res.status === 401) {
    // Session expired or missing. Drop local state and let the app redirect.
    clearSession();
    onUnauthorized?.();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      body.code || "UNKNOWN",
      body.detail || body.message || `Request failed (${res.status})`,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T = unknown>(path: string) => request<T>(path),

  post: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),

  put: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),

  patch: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),

  delete: <T = unknown>(path: string) => request<T>(path, { method: "DELETE" }),
};

export { ApiError };
