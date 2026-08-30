/**
 * Client-side session state: the CSRF token and the signed-in user.
 *
 * The API issues a per-session `csrfToken` in the login response body and
 * requires it echoed in the `X-CSRF-Token` header on every state-changing
 * request (double-submit pattern — see docs/security.md §3). This module is
 * the single place that token lives; `lib/api.ts` reads it on every mutation.
 *
 * The token is a CSRF token, not a credential — the actual session is the
 * HttpOnly `sid` cookie the browser sends automatically. We keep the CSRF
 * token in `sessionStorage` so a page reload inside an authenticated session
 * doesn't lock the user out of mutations until they re-login.
 */

import type { User } from "./types";

const CSRF_KEY = "morphia.csrf";

let csrfToken: string | null = readStoredCsrf();
let currentUser: User | null = null;

const listeners = new Set<() => void>();

function readStoredCsrf(): string | null {
  try {
    return window.sessionStorage.getItem(CSRF_KEY);
  } catch {
    return null;
  }
}

function notify(): void {
  for (const fn of listeners) fn();
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
  try {
    if (token) window.sessionStorage.setItem(CSRF_KEY, token);
    else window.sessionStorage.removeItem(CSRF_KEY);
  } catch {
    /* private mode / storage disabled — in-memory token still works for this tab */
  }
  notify();
}

export function getCurrentUser(): User | null {
  return currentUser;
}

export function setCurrentUser(user: User | null): void {
  currentUser = user;
  notify();
}

/** Clear all client-side session state (called on logout and on any 401). */
export function clearSession(): void {
  csrfToken = null;
  currentUser = null;
  try {
    window.sessionStorage.removeItem(CSRF_KEY);
  } catch {
    /* ignore */
  }
  notify();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
