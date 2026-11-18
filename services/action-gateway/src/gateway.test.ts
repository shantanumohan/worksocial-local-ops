import { describe, expect, it } from "vitest";
import {
  ActionClass,
  LocalRole,
  OperatingMode,
  type CapabilityGrant,
  type StandingPolicy,
} from "@worksocial/domain";
import { createActionGateway } from "./gateway.js";

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

const allowedIntent = {
  operationId: "op-1",
  actionClass: ActionClass.ROUTINE_PUBLISH,
  channelId: "owned-site",
  targetAccountId: "acct-1",
  operation: "publish_page",
  assetId: "page-home",
  contentRevision: "rev-1",
  payload: { title: "Home" },
};

describe("action-gateway", () => {
  it("denies unauthorized writes without a matching grant", () => {
    const gateway = createActionGateway();
    const result = gateway.submitIntent(
      { ...allowedIntent, operation: "wipe_site", operationId: "op-unauth" },
      {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        policies: [policy],
        grants: [grant],
        nowIso: now,
      },
    );
    expect(result.decision.allowed).toBe(false);
    expect(result.decision.code).toBe("GRANT_MISSING");
    expect(result.decision.outcome).toBe("DENIED");
    expect(gateway.ledger.hasVerified("op-unauth")).toBe(false);
  });

  it("enforces stop switch before every external effect", () => {
    const gateway = createActionGateway();
    const result = gateway.submitIntent(allowedIntent, {
      outboundStopped: true,
      operatingMode: OperatingMode.OPERATE,
      policies: [policy],
      grants: [grant],
      nowIso: now,
    });
    expect(result.decision.allowed).toBe(false);
    expect(result.decision.code).toBe("OUTBOUND_STOPPED");
    expect(result.decision.outcome).toBe("DENIED");
  });

  it("records acceptance without implying verified", () => {
    const gateway = createActionGateway();
    const result = gateway.submitIntent(allowedIntent, {
      outboundStopped: false,
      operatingMode: OperatingMode.OPERATE,
      policies: [policy],
      grants: [grant],
      nowIso: now,
    });
    expect(result.decision.allowed).toBe(true);
    expect(result.decision.outcome).toBe("ACCEPTED_PENDING");
    expect(gateway.ledger.hasVerified("op-1")).toBe(false);

    const verified = gateway.markVerified("op-1", "2026-11-18T12:05:00.000Z");
    expect(verified.outcome).toBe("VERIFIED");
    expect(gateway.ledger.hasVerified("op-1")).toBe(true);
  });
});
