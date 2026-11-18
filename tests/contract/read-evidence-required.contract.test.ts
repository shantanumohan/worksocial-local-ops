/**
 * Contract: pilot writes require mapped ownership + prior read evidence (R1-03).
 */
import { describe, expect, it } from "vitest";
import {
  ActionClass,
  LocalRole,
  OperatingMode,
  createFixturePilotMapping,
  proveFixturePilotWritePath,
  type CapabilityGrant,
  type StandingPolicy,
} from "@worksocial/domain";
import { createActionGateway } from "@worksocial/action-gateway";

const now = "2026-11-18T12:00:00.000Z";

describe("contract: read-evidence-required", () => {
  it("denies a granted write when production mapping lacks read evidence", () => {
    const { state, writePathId } = createFixturePilotMapping(now);
    const policy: StandingPolicy = {
      policyId: "pol-form",
      version: 1,
      actorRole: LocalRole.ADMINISTRATOR,
      channelId: "owned-site",
      actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
      allowedAssetScope: ["page-contact"],
      enabled: true,
      emergencyStopApplies: true,
      expiresAtIso: null,
      createdAtIso: now,
    };
    const grant: CapabilityGrant = {
      grantId: "grant-form",
      policyId: "pol-form",
      targetAccountId: "acct-1",
      allowedOperations: ["submit_form_canary"],
      allowedAssetScope: ["page-contact"],
      contentRevisionBound: null,
      rateLimitPerHour: null,
      expiresAtIso: null,
      revoked: false,
      createdAtIso: now,
    };

    const gateway = createActionGateway();
    const denied = gateway.submitIntent(
      {
        operationId: "contract-no-evidence",
        actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
        channelId: "owned-site",
        targetAccountId: "acct-1",
        operation: "submit_form_canary",
        assetId: "page-contact",
        contentRevision: null,
        writePathId,
        payload: { email: "canary@example.com" },
      },
      {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        policies: [policy],
        grants: [grant],
        nowIso: now,
        productionMapping: state,
      },
    );
    expect(denied.decision.allowed).toBe(false);
    expect(denied.decision.code).toBe("OWNERSHIP_UNPROVEN");

    const proven = proveFixturePilotWritePath(state, writePathId, now);
    const allowed = gateway.submitIntent(
      {
        operationId: "contract-with-evidence",
        actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
        channelId: "owned-site",
        targetAccountId: "acct-1",
        operation: "submit_form_canary",
        assetId: "page-contact",
        contentRevision: null,
        writePathId,
        payload: { email: "canary@example.com" },
      },
      {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        policies: [policy],
        grants: [grant],
        nowIso: now,
        productionMapping: proven,
      },
    );
    expect(allowed.decision.allowed).toBe(true);
    expect(allowed.decision.outcome).toBe("ACCEPTED_PENDING");
  });
});
