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
  ownershipProven: true,
  readEvidencePresent: true,
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

  it("defaults write-class gates to deny when ownership/evidence unset", () => {
    const gateway = createActionGateway();
    const result = gateway.submitIntent(
      {
        operationId: "op-no-gates",
        actionClass: ActionClass.ROUTINE_PUBLISH,
        channelId: "owned-site",
        targetAccountId: "acct-1",
        operation: "publish_page",
        assetId: "page-home",
        contentRevision: "rev-1",
        payload: { title: "Home" },
      },
      {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        policies: [policy],
        grants: [grant],
        nowIso: now,
      },
    );
    expect(result.decision.allowed).toBe(false);
    expect(result.decision.code).toBe("OWNERSHIP_UNPROVEN");
  });

  it("denies mapped write without read evidence even with a grant", () => {
    const { state, writePathId } = createFixturePilotMapping(now);
    const formPolicy: StandingPolicy = {
      ...policy,
      policyId: "pol-form",
      actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
      allowedAssetScope: ["page-contact"],
    };
    const formGrant: CapabilityGrant = {
      ...grant,
      grantId: "grant-form",
      policyId: "pol-form",
      allowedOperations: ["submit_form_canary"],
      allowedAssetScope: ["page-contact"],
      contentRevisionBound: null,
    };
    const gateway = createActionGateway();
    const result = gateway.submitIntent(
      {
        operationId: "op-no-evidence",
        actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
        channelId: "owned-site",
        targetAccountId: "acct-1",
        operation: "submit_form_canary",
        assetId: "page-contact",
        contentRevision: null,
        writePathId,
        payload: { email: "test@example.com" },
      },
      {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        policies: [formPolicy],
        grants: [formGrant],
        nowIso: now,
        productionMapping: state,
      },
    );
    expect(result.decision.allowed).toBe(false);
    expect(result.decision.code).toBe("OWNERSHIP_UNPROVEN");
  });

  it("uses honest accept reason when observe skips pilot write gates", () => {
    const gateway = createActionGateway();
    const observePolicy: StandingPolicy = {
      ...policy,
      policyId: "pol-observe",
      actionClass: ActionClass.OBSERVE,
      allowedAssetScope: ["*"],
    };
    const observeGrant: CapabilityGrant = {
      ...grant,
      grantId: "grant-observe",
      policyId: "pol-observe",
      allowedOperations: ["*"],
      allowedAssetScope: ["*"],
      contentRevisionBound: null,
    };
    const result = gateway.submitIntent(
      {
        operationId: "op-observe",
        actionClass: ActionClass.OBSERVE,
        channelId: "owned-site",
        targetAccountId: "acct-1",
        operation: "fetch_page",
        assetId: "page-home",
        contentRevision: null,
        payload: {},
      },
      {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        policies: [observePolicy],
        grants: [observeGrant],
        nowIso: now,
      },
    );
    expect(result.decision.allowed).toBe(true);
    expect(result.decision.reason).toMatch(/skipped pilot ownership\/read-evidence gates/);
  });

  it("allows mapped write after ownership and read evidence are recorded", () => {
    const { state, writePathId } = createFixturePilotMapping(now);
    const proven = proveFixturePilotWritePath(state, writePathId, now);
    const formPolicy: StandingPolicy = {
      ...policy,
      policyId: "pol-form",
      actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
      allowedAssetScope: ["page-contact"],
    };
    const formGrant: CapabilityGrant = {
      ...grant,
      grantId: "grant-form",
      policyId: "pol-form",
      allowedOperations: ["submit_form_canary"],
      allowedAssetScope: ["page-contact"],
      contentRevisionBound: null,
    };
    const gateway = createActionGateway();
    const result = gateway.submitIntent(
      {
        operationId: "op-with-evidence",
        actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
        channelId: "owned-site",
        targetAccountId: "acct-1",
        operation: "submit_form_canary",
        assetId: "page-contact",
        contentRevision: null,
        writePathId,
        payload: { email: "test@example.com" },
      },
      {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        policies: [formPolicy],
        grants: [formGrant],
        nowIso: now,
        productionMapping: proven,
      },
    );
    expect(result.decision.allowed).toBe(true);
    expect(result.decision.outcome).toBe("ACCEPTED_PENDING");
    expect(result.decision.writePathId).toBe(writePathId);
  });
});
