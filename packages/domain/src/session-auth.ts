/**
 * Pure local session rules for single-owner host login (R1-02).
 * Password hashing and cookie I/O live outside domain.
 */

import { isLocalRole, type LocalRoleValue } from "./roles.js";

export type SessionRecord = {
  sessionId: string;
  userId: string;
  username: string;
  role: LocalRoleValue;
  csrfToken: string;
  createdAtIso: string;
  expiresAtIso: string;
  origin: string;
};

export type SessionValidationInput = {
  session: SessionRecord | null;
  nowIso: string;
  requestOrigin: string | null;
  expectedHostOrigins: string[];
  csrfToken: string | null;
  requireCsrf: boolean;
};

export type SessionValidationResult =
  | { ok: true; session: SessionRecord }
  | {
      ok: false;
      code:
        | "UNAUTHENTICATED"
        | "SESSION_EXPIRED"
        | "ORIGIN_MISMATCH"
        | "CSRF_INVALID"
        | "ROLE_INVALID";
      reason: string;
    };

export function validateSession(
  input: SessionValidationInput,
): SessionValidationResult {
  const { session } = input;
  if (!session) {
    return {
      ok: false,
      code: "UNAUTHENTICATED",
      reason: "No active session",
    };
  }
  if (!isLocalRole(session.role)) {
    return {
      ok: false,
      code: "ROLE_INVALID",
      reason: "Session role is not a recognized local role",
    };
  }
  if (Date.parse(session.expiresAtIso) <= Date.parse(input.nowIso)) {
    return {
      ok: false,
      code: "SESSION_EXPIRED",
      reason: "Session has expired",
    };
  }
  if (input.requestOrigin === null || input.requestOrigin === "") {
    return {
      ok: false,
      code: "ORIGIN_MISMATCH",
      reason: "Request origin is required for local console/API access",
    };
  }
  const allowed = new Set([
    ...input.expectedHostOrigins,
    session.origin,
  ]);
  if (!allowed.has(input.requestOrigin)) {
    return {
      ok: false,
      code: "ORIGIN_MISMATCH",
      reason: "Request origin is not an allowed local host origin",
    };
  }
  if (input.requireCsrf) {
    if (!input.csrfToken || input.csrfToken !== session.csrfToken) {
      return {
        ok: false,
        code: "CSRF_INVALID",
        reason: "CSRF token missing or mismatched",
      };
    }
  }
  return { ok: true, session };
}

export type LoginCredentials = {
  username: string;
  password: string;
};

export type LocalUserRecord = {
  userId: string;
  username: string;
  role: LocalRoleValue;
  /** Opaque password verifier string produced outside domain (e.g. scrypt). */
  passwordVerifier: string;
  createdAtIso: string;
  disabled: boolean;
};

export function findActiveUser(
  users: LocalUserRecord[],
  username: string,
): LocalUserRecord | null {
  const normalized = username.trim().toLowerCase();
  for (const user of users) {
    if (user.disabled) {
      continue;
    }
    if (user.username.toLowerCase() === normalized) {
      return user;
    }
  }
  return null;
}
