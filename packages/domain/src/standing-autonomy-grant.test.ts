import { describe, expect, it } from "vitest";
import {
  AutonomyMode,
  ControlTestKind,
  PolicyTestExpectation,
  evaluateStandingAutonomyGrant,
  type StandingAutonomyGrantInput,
} from "./standing-autonomy-grant.js";

function baseInput(
  overrides: Partial<StandingAutonomyGrantInput> = {},
): StandingAutonomyGrantInput {
  return {
    scope: {
      scopeSnapshotId: "scope-fixture-1",
      workstreamId: "ws-seo-pilot",
      siteIds: ["site-1"],
      channelIds: ["owned-site", "inbox"],
      actionClasses: ["observe", "routine_publish"],
      delegatedAgentIds: ["A01", "A07"],
    },
    autonomyMode: AutonomyMode.BOUNDED_AUTOMATIC,
    authorityDraftId: "draft-auth-1",
    authorityDraftVersion: 1,
    constraints: {
      inferenceBudgetMinor: 5_000,
      adSpendBudgetMinor: 0,
      expiresAtIso: "2026-12-31T00:00:00.000Z",
      notificationRulesPresent: true,
      excludedActions: ["ACCESS_OR_POLICY_CHANGE", "ADS_MUTATE"],
    },
    policyTestMatrix: [
      {
        actionId: "act-routine-publish",
        actionClass: "routine_publish",
        expectation: PolicyTestExpectation.ALLOWED,
      },
      {
        actionId: "act-ad-spend",
        actionClass: "material_change",
        expectation: PolicyTestExpectation.BLOCKED,
      },
    ],
    ownerIdentity: "owner@fixture.local",
    ownerSigned: true,
    signedGrantId: "grant-signed-1",
    auditEventId: "audit-grant-1",
    controlTests: [
      {
        kind: ControlTestKind.PAUSE_NEW_WORK,
        receiptId: "rcpt-pause-new-work",
      },
      {
        kind: ControlTestKind.STOP_WRITES,
        receiptId: "rcpt-stop-writes",
      },
      {
        kind: ControlTestKind.PAUSE_REPLIES,
        receiptId: "rcpt-pause-replies",
      },
    ],
    agentSelfApprove: false,
    requestAdSpendIncreaseAsSideEffect: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

describe("standing-autonomy-grant (T-US-023)", () => {
  it("grants standing autonomy with control-test receipts offline", () => {
    const result = evaluateStandingAutonomyGrant(baseInput());
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.code).toBe("STANDING_AUTONOMY_GRANT_READY");
      expect(result.routineEligibleActionsMayProceed).toBe(true);
      expect(result.materialExceptionsExplicit).toBe(true);
      expect(result.spendingExplicit).toBe(true);
      expect(result.liveProviderWiring).toBe("NOT_WIRED");
      expect(result.externalEffects).toBe("NONE");
      expect(result.evidence.controlTestReceipts).toHaveLength(3);
      expect(result.evidence.signedGrantId).toBe("grant-signed-1");
      expect(result.evidence.policyConstraints.adSpendBudgetMinor).toBe(0);
    }
  });

  it("refuses agent self-approval", () => {
    const result = evaluateStandingAutonomyGrant(
      baseInput({ agentSelfApprove: true }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("AGENT_SELF_APPROVE_REFUSED");
      expect(result.externalEffects).toBe("NONE");
    }
  });

  it("refuses ad-spend increase as a side effect", () => {
    const result = evaluateStandingAutonomyGrant(
      baseInput({ requestAdSpendIncreaseAsSideEffect: true }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("AD_SPEND_SIDE_EFFECT_REFUSED");
    }
  });

  it("refuses live provider wiring", () => {
    const result = evaluateStandingAutonomyGrant(
      baseInput({ requestLiveProviderWiring: true }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
    }
  });

  it("requires owner signature and audit event", () => {
    const result = evaluateStandingAutonomyGrant(
      baseInput({ ownerSigned: false, signedGrantId: null }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("OWNER_SIGNATURE_REQUIRED");
    }
  });

  it("requires complete control tests with receipts", () => {
    const result = evaluateStandingAutonomyGrant(
      baseInput({
        controlTests: [
          {
            kind: ControlTestKind.PAUSE_NEW_WORK,
            receiptId: "rcpt-pause-new-work",
          },
        ],
      }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("CONTROL_TESTS_INCOMPLETE");
    }
  });

  it("requires allowed and blocked policy test previews", () => {
    const result = evaluateStandingAutonomyGrant(
      baseInput({
        policyTestMatrix: [
          {
            actionId: "act-only-allowed",
            actionClass: "observe",
            expectation: PolicyTestExpectation.ALLOWED,
          },
          {
            actionId: "act-also-allowed",
            actionClass: "create",
            expectation: PolicyTestExpectation.ALLOWED,
          },
        ],
      }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("POLICY_TEST_MATRIX_INCOMPLETE");
    }
  });

  it("requires a complete scope snapshot", () => {
    const result = evaluateStandingAutonomyGrant(
      baseInput({
        scope: {
          scopeSnapshotId: "scope-empty",
          workstreamId: "ws-1",
          siteIds: [],
          channelIds: ["owned-site"],
          actionClasses: ["observe"],
          delegatedAgentIds: ["A01"],
        },
      }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("SCOPE_SNAPSHOT_INCOMPLETE");
    }
  });
});
