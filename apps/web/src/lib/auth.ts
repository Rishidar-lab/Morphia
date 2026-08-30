/**
 * Authentication actions — thin wrappers over the /api/auth/* endpoints that
 * keep `lib/session.ts` (CSRF token + current user) in sync.
 */

import { api } from "./api";
import { clearSession, setCsrfToken, setCurrentUser } from "./session";
import type { User } from "./types";

interface LoginResponse {
  user: User;
  csrfToken: string;
}

export async function login(email: string, password: string): Promise<User> {
  const res = await api.post<LoginResponse>("/api/auth/login", { email, password });
  setCsrfToken(res.csrfToken);
  setCurrentUser(res.user);
  return res.user;
}

export async function register(
  email: string,
  password: string,
  displayName: string,
): Promise<User> {
  await api.post<User>("/api/auth/register", {
    email,
    password,
    display_name: displayName,
  });
  // Registration does not create a session; log in immediately.
  return login(email, password);
}

export async function logout(): Promise<void> {
  try {
    await api.post("/api/auth/logout");
  } finally {
    clearSession();
  }
}

/** Resolve the current user from the session cookie, or null if not signed in. */
export async function fetchCurrentUser(): Promise<User | null> {
  try {
    const user = await api.get<User>("/api/auth/me");
    setCurrentUser(user);
    return user;
  } catch {
    return null;
  }
}
