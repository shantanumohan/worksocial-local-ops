import { describe, expect, it } from "vitest";
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
  actorRole: "administrator",
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
});
