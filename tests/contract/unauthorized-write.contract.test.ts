/**
 * Contract: unauthorized writes are denied by the action gateway.
 */
import { describe, expect, it } from "vitest";
import {
  ActionClass,
  LocalRole,
  OperatingMode,
  type CapabilityGrant,
  type StandingPolicy,
} from "@worksocial/domain";
import { createActionGateway } from "@worksocial/action-gateway";

const now = "2026-11-18T12:00:00.000Z";

describe("contract: unauthorized-write", () => {
  it("denies a write outside standing grant scope", () => {
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

    const gateway = createActionGateway();
    const result = gateway.submitIntent(
      {
        operationId: "contract-unauth-1",
        actionClass: ActionClass.ROUTINE_PUBLISH,
        channelId: "owned-site",
        targetAccountId: "acct-1",
        operation: "publish_page",
        assetId: "page-other",
        contentRevision: "rev-1",
        payload: { body: "nope" },
        // Ownership/evidence satisfied so this contract isolates grant scope.
        ownershipProven: true,
        readEvidencePresent: true,
      },
      {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        actorRole: LocalRole.ADMINISTRATOR,
        policies: [policy],
        grants: [grant],
        nowIso: now,
      },
    );

    expect(result.decision.allowed).toBe(false);
    expect(result.decision.code).toBe("GRANT_MISSING");
    expect(result.decision.outcome).toBe("DENIED");
  });
});
