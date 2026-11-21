/**
 * Security gate suite — session auth + standing authority (already in domain).
 * CSRF / origin / expiry / stop-switch / actor-role binding. External effects: NONE.
 */
import { describe, expect, it } from "vitest";
import {
  ActionClass,
  LocalRole,
  OperatingMode,
  evaluateStandingAuthority,
  roleMayPerform,
  validateSession,
  type CapabilityGrant,
  type SessionRecord,
  type StandingPolicy,
} from "@worksocial/domain";

const now = "2026-11-21T22:00:00.000Z";

const session: SessionRecord = {
  sessionId: "sess-sec",
  userId: "user-owner",
  username: "owner",
  role: LocalRole.ADMINISTRATOR,
  csrfToken: "csrf-sec",
  createdAtIso: "2026-11-21T20:00:00.000Z",
  expiresAtIso: "2026-11-21T23:00:00.000Z",
  origin: "http://127.0.0.1:8788",
};

const policy: StandingPolicy = {
  policyId: "pol-sec",
  version: 1,
  actorRole: LocalRole.ADMINISTRATOR,
  channelId: "owned-site",
  actionClass: ActionClass.ROUTINE_PUBLISH,
  allowedAssetScope: ["page-home"],
  enabled: true,
  emergencyStopApplies: true,
  expiresAtIso: null,
  createdAtIso: now,
};

const grant: CapabilityGrant = {
  grantId: "grant-sec",
  policyId: "pol-sec",
  targetAccountId: "acct-1",
  allowedOperations: ["publish_page"],
  allowedAssetScope: ["page-home"],
  contentRevisionBound: "rev-1",
  rateLimitPerHour: 10,
  expiresAtIso: null,
  revoked: false,
  createdAtIso: now,
};

function authorityBase(
  overrides: Partial<Parameters<typeof evaluateStandingAuthority>[0]> = {},
) {
  return {
    nowIso: now,
    operatingMode: OperatingMode.OPERATE,
    outboundStopped: false,
    actorRole: LocalRole.ADMINISTRATOR,
    actionClass: ActionClass.ROUTINE_PUBLISH,
    channelId: "owned-site",
    targetAccountId: "acct-1",
    operation: "publish_page",
    assetId: "page-home",
    contentRevision: "rev-1",
    ownershipProven: true,
    readEvidencePresent: true,
    sourceStale: false,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    policies: [policy],
    grants: [grant],
    ...overrides,
  };
}

describe("security: session auth gates", () => {
  it("accepts a valid local session with matching CSRF", () => {
    const result = validateSession({
      session,
      nowIso: now,
      requestOrigin: "http://127.0.0.1:8788",
      expectedHostOrigins: ["http://127.0.0.1:8787", "http://127.0.0.1:8788"],
      csrfToken: "csrf-sec",
      requireCsrf: true,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects missing session, expired session, origin mismatch, and CSRF mismatch", () => {
    expect(
      validateSession({
        session: null,
        nowIso: now,
        requestOrigin: "http://127.0.0.1:8788",
        expectedHostOrigins: ["http://127.0.0.1:8788"],
        csrfToken: "csrf-sec",
        requireCsrf: true,
      }),
    ).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });

    expect(
      validateSession({
        session,
        nowIso: "2026-11-22T00:00:00.000Z",
        requestOrigin: "http://127.0.0.1:8788",
        expectedHostOrigins: ["http://127.0.0.1:8788"],
        csrfToken: "csrf-sec",
        requireCsrf: true,
      }),
    ).toMatchObject({ ok: false, code: "SESSION_EXPIRED" });

    expect(
      validateSession({
        session,
        nowIso: now,
        requestOrigin: "https://evil.example",
        expectedHostOrigins: ["http://127.0.0.1:8788"],
        csrfToken: "csrf-sec",
        requireCsrf: true,
      }),
    ).toMatchObject({ ok: false, code: "ORIGIN_MISMATCH" });

    expect(
      validateSession({
        session,
        nowIso: now,
        requestOrigin: "http://127.0.0.1:8788",
        expectedHostOrigins: ["http://127.0.0.1:8788"],
        csrfToken: "wrong",
        requireCsrf: true,
      }),
    ).toMatchObject({ ok: false, code: "CSRF_INVALID" });
  });

  it("denies operator privileged mutations (stop switch / grants)", () => {
    expect(roleMayPerform(LocalRole.OPERATOR, "toggle_stop_switch")).toBe(
      false,
    );
    expect(
      roleMayPerform(LocalRole.OPERATOR, "manage_capability_grants"),
    ).toBe(false);
    expect(
      roleMayPerform(LocalRole.ADMINISTRATOR, "toggle_stop_switch"),
    ).toBe(true);
  });
});

describe("security: standing authority gates", () => {
  it("allows a matching grant and denies stop-switch / operator escalation / missing grant", () => {
    expect(evaluateStandingAuthority(authorityBase()).decision).toEqual({
      allowed: true,
    });

    expect(
      evaluateStandingAuthority(authorityBase({ outboundStopped: true }))
        .decision,
    ).toMatchObject({ allowed: false, code: "OUTBOUND_STOPPED" });

    expect(
      evaluateStandingAuthority(
        authorityBase({ actorRole: LocalRole.OPERATOR }),
      ).decision,
    ).toMatchObject({ allowed: false, code: "GRANT_MISSING" });

    expect(
      evaluateStandingAuthority(
        authorityBase({ operation: "delete_site" }),
      ).decision,
    ).toMatchObject({ allowed: false, code: "GRANT_MISSING" });
  });

  it("never standing-authorizes access_or_policy_change", () => {
    const result = evaluateStandingAuthority(
      authorityBase({
        actionClass: ActionClass.ACCESS_OR_POLICY_CHANGE,
        policies: [
          { ...policy, actionClass: ActionClass.ACCESS_OR_POLICY_CHANGE },
        ],
      }),
    );
    expect(result.decision.allowed).toBe(false);
  });
});
