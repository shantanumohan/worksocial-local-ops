import { describe, expect, it } from "vitest";
import {
  findActiveUser,
  validateSession,
  type LocalUserRecord,
  type SessionRecord,
} from "./session-auth.js";
import { LocalRole } from "./roles.js";

const session: SessionRecord = {
  sessionId: "sess-1",
  userId: "user-1",
  username: "owner",
  role: LocalRole.ADMINISTRATOR,
  csrfToken: "csrf-1",
  createdAtIso: "2026-11-18T11:00:00.000Z",
  expiresAtIso: "2026-11-18T15:00:00.000Z",
  origin: "http://127.0.0.1:8788",
};

describe("validateSession", () => {
  it("accepts a valid local session with matching CSRF", () => {
    const result = validateSession({
      session,
      nowIso: "2026-11-18T12:00:00.000Z",
      requestOrigin: "http://127.0.0.1:8788",
      expectedHostOrigins: ["http://127.0.0.1:8787", "http://127.0.0.1:8788"],
      csrfToken: "csrf-1",
      requireCsrf: true,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects expired sessions", () => {
    const result = validateSession({
      session,
      nowIso: "2026-11-18T16:00:00.000Z",
      requestOrigin: "http://127.0.0.1:8788",
      expectedHostOrigins: ["http://127.0.0.1:8788"],
      csrfToken: "csrf-1",
      requireCsrf: true,
    });
    expect(result).toMatchObject({ ok: false, code: "SESSION_EXPIRED" });
  });

  it("rejects origin mismatch", () => {
    const result = validateSession({
      session,
      nowIso: "2026-11-18T12:00:00.000Z",
      requestOrigin: "https://evil.example",
      expectedHostOrigins: ["http://127.0.0.1:8788"],
      csrfToken: "csrf-1",
      requireCsrf: true,
    });
    expect(result).toMatchObject({ ok: false, code: "ORIGIN_MISMATCH" });
  });
});

describe("findActiveUser", () => {
  const users: LocalUserRecord[] = [
    {
      userId: "u1",
      username: "Owner",
      role: LocalRole.ADMINISTRATOR,
      passwordVerifier: "x",
      createdAtIso: "2026-11-18T00:00:00.000Z",
      disabled: false,
    },
  ];

  it("matches usernames case-insensitively", () => {
    expect(findActiveUser(users, "owner")?.userId).toBe("u1");
  });
});
