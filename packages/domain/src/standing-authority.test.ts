import { describe, expect, it } from "vitest";
import { LocalRole } from "./roles.js";
import {
  ActionClass,
  OperatingMode,
  evaluateStandingAuthority,
  type CapabilityGrant,
  type StandingPolicy,
} from "./standing-authority.js";

const now = "2026-11-18T12:00:00.000Z";

const policy: StandingPolicy = {
  policyId: "pol-1",
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
  grantId: "grant-1",
  policyId: "pol-1",
  targetAccountId: "acct-1",
  allowedOperations: ["publish_page"],
  allowedAssetScope: ["page-home"],
  contentRevisionBound: "rev-1",
  rateLimitPerHour: 10,
  expiresAtIso: null,
  revoked: false,
  createdAtIso: now,
};

function baseRequest(
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

describe("evaluateStandingAuthority", () => {
  it("allows a matching standing grant", () => {
    const result = evaluateStandingAuthority(baseRequest());
    expect(result.decision).toEqual({ allowed: true });
    expect(result.match?.grant.grantId).toBe("grant-1");
  });

  it("denies unauthorized write when no grant matches", () => {
    const result = evaluateStandingAuthority(
      baseRequest({ operation: "delete_site", grants: [grant] }),
    );
    expect(result.decision).toMatchObject({
      allowed: false,
      code: "GRANT_MISSING",
    });
  });

  it("denies when stop switch is on", () => {
    const result = evaluateStandingAuthority(
      baseRequest({ outboundStopped: true }),
    );
    expect(result.decision).toMatchObject({
      allowed: false,
      code: "OUTBOUND_STOPPED",
    });
  });

  it("blocks publish in observe mode even with a grant", () => {
    const result = evaluateStandingAuthority(
      baseRequest({ operatingMode: OperatingMode.OBSERVE }),
    );
    expect(result.decision).toMatchObject({
      allowed: false,
      code: "GRANT_MISSING",
    });
  });

  it("never standing-authorizes access_or_policy_change", () => {
    const result = evaluateStandingAuthority(
      baseRequest({
        actionClass: ActionClass.ACCESS_OR_POLICY_CHANGE,
        policies: [
          { ...policy, actionClass: ActionClass.ACCESS_OR_POLICY_CHANGE },
        ],
      }),
    );
    expect(result.decision.allowed).toBe(false);
  });

  it("denies operator against administrator-only policy (F05)", () => {
    const result = evaluateStandingAuthority(
      baseRequest({ actorRole: LocalRole.OPERATOR }),
    );
    expect(result.decision).toMatchObject({
      allowed: false,
      code: "GRANT_MISSING",
    });
    expect(result.match).toBeNull();
  });

  it("denies when grant hourly rate limit is exhausted (F05)", () => {
    const result = evaluateStandingAuthority(
      baseRequest({
        grants: [{ ...grant, rateLimitPerHour: 1 }],
        grantUsesInLastHour: 1,
      }),
    );
    expect(result.decision).toMatchObject({
      allowed: false,
      code: "RATE_LIMIT_EXCEEDED",
    });
  });

  it("allows whitespace-padded in-workspace object ids (T-X006 hillclimb)", () => {
    const result = evaluateStandingAuthority(
      baseRequest({
        channelId: "  owned-site  ",
        targetAccountId: "\tacct-1\n",
        assetId: " page-home ",
      }),
    );
    expect(result.decision).toEqual({ allowed: true });
    expect(result.match?.grant.grantId).toBe("grant-1");
  });

  it("denies whitespace-only object ids without leaking (T-X006 hillclimb)", () => {
    const result = evaluateStandingAuthority(
      baseRequest({ channelId: "   ", assetId: "\t" }),
    );
    expect(result.decision).toMatchObject({
      allowed: false,
      code: "GRANT_MISSING",
      reason: "No capability grant for this action",
    });
    expect(result.match).toBeNull();
  });

  it("denies foreign channel+asset dual substitution without leak (T-X006)", () => {
    const foreignChannel = "ws-foreign-site";
    const foreignAsset = "page-foreign-secret";
    const result = evaluateStandingAuthority(
      baseRequest({
        channelId: `  ${foreignChannel}  `,
        assetId: ` ${foreignAsset} `,
      }),
    );
    expect(result.decision).toMatchObject({
      allowed: false,
      code: "GRANT_MISSING",
      reason: "No capability grant for this action",
    });
    expect(result.match).toBeNull();
    expect(result.decision.allowed).toBe(false);
    if (!result.decision.allowed) {
      expect(result.decision.reason.includes(foreignChannel)).toBe(false);
      expect(result.decision.reason.includes(foreignAsset)).toBe(false);
    }
  });
});
