/**
 * Contract: stop switch blocks external effects at the action gateway.
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

describe("contract: stop-switch", () => {
  it("denies an otherwise-authorized write when outbound is stopped", () => {
    const policy: StandingPolicy = {
      policyId: "pol-1",
      version: 1,
      actorRole: LocalRole.ADMINISTRATOR,
      channelId: "owned-site",
      actionClass: ActionClass.ROUTINE_PUBLISH,
      allowedAssetScope: ["*"],
      enabled: true,
      emergencyStopApplies: true,
      expiresAtIso: null,
      createdAtIso: now,
    };
    const grant: CapabilityGrant = {
      grantId: "grant-1",
      policyId: "pol-1",
      targetAccountId: "*",
      allowedOperations: ["*"],
      allowedAssetScope: ["*"],
      contentRevisionBound: null,
      rateLimitPerHour: null,
      expiresAtIso: null,
      revoked: false,
      createdAtIso: now,
    };

    const gateway = createActionGateway();
    const result = gateway.submitIntent(
      {
        operationId: "contract-stop-1",
        actionClass: ActionClass.ROUTINE_PUBLISH,
        channelId: "owned-site",
        targetAccountId: "acct-1",
        operation: "publish_page",
        assetId: "page-home",
        contentRevision: "rev-1",
        payload: { body: "blocked" },
      },
      {
        outboundStopped: true,
        operatingMode: OperatingMode.OPERATE,
        policies: [policy],
        grants: [grant],
        nowIso: now,
      },
    );

    expect(result.decision.allowed).toBe(false);
    expect(result.decision.code).toBe("OUTBOUND_STOPPED");
    expect(result.decision.outcome).toBe("DENIED");
  });
});
