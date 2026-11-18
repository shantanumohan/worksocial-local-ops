/**
 * Contract: form-to-CRM canary requires grant + read evidence; correlated fixture
 * receipt reconciles SUCCESS; live Zoho stays NOT_WIRED; ambiguous fails closed.
 * Catalog refs T-F11 / T-X040 — not product VERIFIED.
 */
import { describe, expect, it } from "vitest";
import {
  ActionClass,
  LocalRole,
  OperatingMode,
  ProbeVerdict,
  ReconciliationStatus,
  createFixturePilotMapping,
  proveFixturePilotWritePath,
  type CapabilityGrant,
  type StandingPolicy,
} from "@worksocial/domain";
import { createActionGateway } from "@worksocial/action-gateway";
import { runFormToCrmCanary } from "@worksocial/probes";

const now = "2026-11-18T18:00:00.000Z";

function authority(mapping: ReturnType<typeof proveFixturePilotWritePath>) {
  const policy: StandingPolicy = {
    policyId: "pol-contract-canary",
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
    grantId: "grant-contract-canary",
    policyId: "pol-contract-canary",
    targetAccountId: "acct-fixture-canary",
    allowedOperations: ["submit_form_canary"],
    allowedAssetScope: ["page-contact"],
    contentRevisionBound: null,
    rateLimitPerHour: null,
    expiresAtIso: null,
    revoked: false,
    createdAtIso: now,
  };
  return {
    outboundStopped: false,
    operatingMode: OperatingMode.OPERATE,
    policies: [policy],
    grants: [grant],
    productionMapping: mapping,
  };
}

describe("contract: form-to-CRM canary", () => {
  it("passes fixture canary with correlated receipt after grant + read evidence", () => {
    const { state, writePathId } = createFixturePilotMapping(now);
    const proven = proveFixturePilotWritePath(state, writePathId, now);
    const gateway = createActionGateway();
    const result = runFormToCrmCanary({
      writePathId,
      nowIso: now,
      authority: authority(proven),
      gateway,
    });

    expect(result.gatewayAllowed).toBe(true);
    expect(result.intent?.synthetic).toBe(true);
    expect(result.receipt?.correlationId).toBe(result.intent?.correlationId);
    expect(result.run.verdict).toBe(ProbeVerdict.SUCCESS);
    expect(result.run.reconciliation?.status).toBe(ReconciliationStatus.MATCHED);
    expect(result.outcome?.fixtureOnly).toBe(true);
    expect(result.outcome?.label).toBe("SUCCESS");
    expect(result.run.acceptanceCaseIds).toContain("T-F11");
  });

  it("denies canary without read evidence and labels FAILURE for learning", () => {
    const { state, writePathId } = createFixturePilotMapping(now);
    const result = runFormToCrmCanary({
      writePathId,
      nowIso: now,
      authority: authority(state),
    });
    expect(result.gatewayAllowed).toBe(false);
    expect(result.run.verdict).toBe(ProbeVerdict.FAILURE);
    expect(result.outcome?.label).toBe("FAILURE");
    expect(result.outcome?.fixtureOnly).toBe(true);
  });

  it("returns NOT_WIRED for live Zoho and fails closed on ambiguous receipts", () => {
    const { state, writePathId } = createFixturePilotMapping(now);
    const proven = proveFixturePilotWritePath(state, writePathId, now);

    const live = runFormToCrmCanary({
      writePathId,
      nowIso: now,
      authority: authority(proven),
      liveZoho: true,
    });
    expect(live.run.verdict).toBe(ProbeVerdict.NOT_WIRED);

    const ambiguous = runFormToCrmCanary({
      writePathId,
      nowIso: now,
      authority: authority(proven),
      ambiguousReceipt: true,
    });
    expect(ambiguous.run.verdict).toBe(ProbeVerdict.UNKNOWN);
    expect(ambiguous.run.reconciliation?.blocksRetry).toBe(true);
    expect(ambiguous.outcome).toBeNull();
  });
});
