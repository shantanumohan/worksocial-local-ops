import { describe, expect, it } from "vitest";
import {
  AutonomyMode,
  ControlTestKind,
  GRANT_STANDING_AUTONOMY_SAFELY_RELATED_CASE_IDS,
  PolicyTestExpectation,
  evaluateGrantStandingAutonomySafely,
  type GrantStandingAutonomySafelyInput,
} from "./grant-standing-autonomy-safely.js";

function baseInput(
  overrides: Partial<GrantStandingAutonomySafelyInput> = {},
): GrantStandingAutonomySafelyInput {
  return {
    packageId: "pkg-f12-1",
    scope: {
      scopeSnapshotId: "scope-f12-1",
      workstreamId: "ws-local-seo-pilot",
      siteIds: ["site-nyc-1"],
      channelIds: ["ch-gbp-1", "ch-social-1"],
      actionClasses: ["observe", "draft_content", "post_local"],
      delegatedAgentIds: ["agent-a07", "agent-a14"],
    },
    autonomyMode: AutonomyMode.REVIEW_REQUIRED,
    authorityDraftId: "auth-draft-f12-1",
    authorityDraftVersion: 1,
    constraints: {
      inferenceBudgetMinor: 5000,
      adSpendBudgetMinor: 0,
      expiresAtIso: "2026-12-31T23:59:59.000Z",
      notificationRulesPresent: true,
      excludedActions: ["ad_spend_mutate", "live_publish_without_review"],
    },
    policyTestMatrix: [
      {
        actionId: "act-observe-1",
        actionClass: "observe",
        expectation: PolicyTestExpectation.ALLOWED,
      },
      {
        actionId: "act-spend-1",
        actionClass: "ad_spend_mutate",
        expectation: PolicyTestExpectation.BLOCKED,
      },
    ],
    ownerIdentity: "owner-1",
    ownerSigned: true,
    signedGrantId: "grant-f12-1",
    auditEventId: "audit-f12-1",
    controlTests: [
      {
        kind: ControlTestKind.PAUSE_NEW_WORK,
        receiptId: "rcpt-pause-f12-1",
      },
      {
        kind: ControlTestKind.STOP_WRITES,
        receiptId: "rcpt-stop-writes-f12-1",
      },
      {
        kind: ControlTestKind.PAUSE_REPLIES,
        receiptId: "rcpt-pause-replies-f12-1",
      },
    ],
    agentSelfApprove: false,
    requestAdSpendIncreaseAsSideEffect: false,
    claimLiveVerifiedGrant: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

describe("evaluateGrantStandingAutonomySafely (T-F12)", () => {
  it("records complete F12 evidence package", () => {
    const decision = evaluateGrantStandingAutonomySafely(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(
      "GRANT_STANDING_AUTONOMY_SAFELY_EVIDENCE_RECORDED",
    );
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.productionWrites).toBe(false);
    expect(decision.routineEligibleActionsMayProceed).toBe(true);
    expect(decision.materialExceptionsExplicit).toBe(true);
    expect(decision.spendingExplicit).toBe(true);
    expect(decision.evidence.scopeSnapshotId).toBe("scope-f12-1");
    expect(decision.evidence.autonomyMode).toBe(AutonomyMode.REVIEW_REQUIRED);
    expect(decision.evidence.authorityDraftVersion).toBe(1);
    expect(decision.evidence.allowedPreviewCount).toBe(1);
    expect(decision.evidence.blockedPreviewCount).toBe(1);
    expect(decision.evidence.controlTestReceipts).toHaveLength(3);
    expect(decision.evidence.grantVerifiedLive).toBe(false);
    expect(decision.evidence.blockingDecision).toBe(
      "F12_EVIDENCE_PACKAGE_COMPLETE",
    );
    expect(GRANT_STANDING_AUTONOMY_SAFELY_RELATED_CASE_IDS).toEqual(["T-F12"]);
  });

  it("refuses missing scope", () => {
    const decision = evaluateGrantStandingAutonomySafely(
      baseInput({ scope: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SCOPE_SNAPSHOT_REQUIRED");
  });

  it("refuses missing autonomy mode", () => {
    const decision = evaluateGrantStandingAutonomySafely(
      baseInput({ autonomyMode: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("AUTONOMY_MODE_REQUIRED");
  });

  it("refuses invalid authority draft", () => {
    const decision = evaluateGrantStandingAutonomySafely(
      baseInput({ authorityDraftId: null, authorityDraftVersion: 0 }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("AUTHORITY_DRAFT_REQUIRED");
  });

  it("refuses incomplete policy constraints", () => {
    const decision = evaluateGrantStandingAutonomySafely(
      baseInput({ constraints: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("POLICY_CONSTRAINTS_REQUIRED");
  });

  it("refuses incomplete policy test matrix", () => {
    const decision = evaluateGrantStandingAutonomySafely(
      baseInput({
        policyTestMatrix: [
          {
            actionId: "act-1",
            actionClass: "observe",
            expectation: PolicyTestExpectation.ALLOWED,
          },
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("POLICY_TEST_MATRIX_REQUIRED");
  });

  it("refuses unsigned grant", () => {
    const decision = evaluateGrantStandingAutonomySafely(
      baseInput({ ownerSigned: false, signedGrantId: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("OWNER_SIGNATURE_REQUIRED");
  });

  it("refuses incomplete control tests", () => {
    const decision = evaluateGrantStandingAutonomySafely(
      baseInput({
        controlTests: [
          {
            kind: ControlTestKind.PAUSE_NEW_WORK,
            receiptId: "rcpt-pause-only",
          },
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("CONTROL_TESTS_REQUIRED");
  });

  it("refuses agent self-approve", () => {
    const decision = evaluateGrantStandingAutonomySafely(
      baseInput({ agentSelfApprove: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("AGENT_SELF_APPROVE_REFUSED");
  });

  it("refuses ad spend side effect", () => {
    const decision = evaluateGrantStandingAutonomySafely(
      baseInput({ requestAdSpendIncreaseAsSideEffect: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("AD_SPEND_SIDE_EFFECT_REFUSED");
  });

  it("refuses false live-verified claim", () => {
    const decision = evaluateGrantStandingAutonomySafely(
      baseInput({ claimLiveVerifiedGrant: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_GRANT_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const decision = evaluateGrantStandingAutonomySafely(
      baseInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });
});
