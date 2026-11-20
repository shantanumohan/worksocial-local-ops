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
import { createActionGateway, digestPayload } from "./gateway.js";

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

const adminAuthority = {
  outboundStopped: false,
  operatingMode: OperatingMode.OPERATE,
  actorRole: LocalRole.ADMINISTRATOR,
  policies: [policy],
  grants: [grant],
  nowIso: now,
};

describe("action-gateway", () => {
  it("nested payload title/price changes alter digest (F04)", () => {
    const a = digestPayload({
      meta: { title: "Home", price: 10 },
      channel: "owned-site",
    });
    const b = digestPayload({
      meta: { title: "Home", price: 11 },
      channel: "owned-site",
    });
    const c = digestPayload({
      meta: { title: "About", price: 10 },
      channel: "owned-site",
    });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
  });

  it("denies unauthorized writes without a matching grant", () => {
    const gateway = createActionGateway();
    const result = gateway.submitIntent(
      { ...allowedIntent, operation: "wipe_site", operationId: "op-unauth" },
      adminAuthority,
    );
    expect(result.decision.allowed).toBe(false);
    expect(result.decision.code).toBe("GRANT_MISSING");
    expect(result.decision.outcome).toBe("DENIED");
    expect(gateway.ledger.hasVerified("op-unauth")).toBe(false);
  });

  it("enforces stop switch before every external effect", () => {
    const gateway = createActionGateway();
    const result = gateway.submitIntent(allowedIntent, {
      ...adminAuthority,
      outboundStopped: true,
    });
    expect(result.decision.allowed).toBe(false);
    expect(result.decision.code).toBe("OUTBOUND_STOPPED");
    expect(result.decision.outcome).toBe("DENIED");
  });

  it("denies operator using administrator-only policy (F05)", () => {
    const gateway = createActionGateway();
    const result = gateway.submitIntent(allowedIntent, {
      ...adminAuthority,
      actorRole: LocalRole.OPERATOR,
    });
    expect(result.decision.allowed).toBe(false);
    expect(result.decision.code).toBe("GRANT_MISSING");
    expect(result.decision.outcome).toBe("DENIED");
  });

  it("rejects a second request when rateLimitPerHour is one (F05)", () => {
    const gateway = createActionGateway();
    const limited = {
      ...adminAuthority,
      grants: [{ ...grant, rateLimitPerHour: 1 }],
    };
    const first = gateway.submitIntent(
      { ...allowedIntent, operationId: "op-rate-1" },
      limited,
    );
    expect(first.decision.allowed).toBe(true);
    const second = gateway.submitIntent(
      { ...allowedIntent, operationId: "op-rate-2" },
      limited,
    );
    expect(second.decision.allowed).toBe(false);
    expect(second.decision.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("rehydrates pending decisions and settles FAILED on markFailed", () => {
    const gateway = createActionGateway();
    gateway.rehydratePending({
      operationId: "op-rehydrate",
      writePathId: "wp-1",
      decidedAtIso: now,
    });
    expect(gateway.getDecision("op-rehydrate")?.outcome).toBe("ACCEPTED_PENDING");
    const failed = gateway.markFailed(
      "op-rehydrate",
      "2026-11-18T12:06:00.000Z",
      "read-back mismatch",
    );
    expect(failed.outcome).toBe("FAILED");
    expect(() =>
      gateway.markVerified("op-rehydrate", "2026-11-18T12:07:00.000Z"),
    ).toThrow(/Failed operation/);
  });

  it("records acceptance without implying verified", () => {
    const gateway = createActionGateway();
    const result = gateway.submitIntent(allowedIntent, adminAuthority);
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
      adminAuthority,
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
        ...adminAuthority,
        policies: [formPolicy],
        grants: [formGrant],
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
        ...adminAuthority,
        policies: [observePolicy],
        grants: [observeGrant],
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
        ...adminAuthority,
        policies: [formPolicy],
        grants: [formGrant],
        productionMapping: proven,
      },
    );
    expect(result.decision.allowed).toBe(true);
    expect(result.decision.outcome).toBe("ACCEPTED_PENDING");
    expect(result.decision.writePathId).toBe(writePathId);
  });
});
