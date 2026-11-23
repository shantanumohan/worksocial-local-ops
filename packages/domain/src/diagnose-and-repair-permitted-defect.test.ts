import { describe, expect, it } from "vitest";
import {
  DIAGNOSE_AND_REPAIR_PERMITTED_DEFECT_RELATED_CASE_IDS,
  evaluateDiagnoseAndRepairPermittedDefect,
  type DiagnoseAndRepairPermittedDefectInput,
} from "./diagnose-and-repair-permitted-defect.js";

function baseInput(
  overrides: Partial<DiagnoseAndRepairPermittedDefectInput> = {},
): DiagnoseAndRepairPermittedDefectInput {
  return {
    packageId: "pkg-f21-1",
    incident: {
      incidentId: "inc-f21-1",
      affectedJourneyIds: ["journey-form-crm"],
      firstFailureIso: "2026-11-22T10:00:00.000Z",
      lastFailureIso: "2026-11-22T12:00:00.000Z",
      relatedReleaseIds: ["rel-cms-broken-meta"],
      businessImpactSummary: "Form→CRM canary failing; leads not landing",
    },
    sourceBinding: {
      bindingId: "bind-f21-1",
      sourceRootId: "src-cms-midtown",
      assetLimit: "ONE_ASSET",
    },
    repairPolicy: {
      policyId: "pol-repair-f21-1",
      maxAttempts: 2,
      weakenTestsForbidden: true,
      authorSelfApproveForbidden: true,
    },
    repairPlan: {
      planId: "plan-f21-1",
      sourceRevision: "rev-abc123",
      worktreeId: "wt-f21-1",
      leaseId: "lease-f21-1",
      scopeSummary: "Restore meta field mapping on booking form page",
    },
    patchAndTests: {
      diffId: "diff-f21-1",
      diffSummary: "Revert broken meta tag; restore CRM field map",
      regressionSuiteId: "suite-form-crm-canary",
      regressionPassed: true,
      attemptLedgerId: "ledger-f21-1",
      attemptCount: 1,
    },
    independentReview: {
      reviewId: "revw-f21-1",
      reviewerId: "reviewer-a25",
      authorId: "author-a24",
      decision: "APPROVED",
      policyDecisionId: "pol-dec-f21-1",
    },
    canaryRelease: {
      canaryReleaseId: "canary-f21-1",
      readBackId: "rb-f21-1",
      readBackMatched: true,
      repeatedJourneyTestId: "rj-f21-1",
      repeatedJourneyPassed: true,
    },
    closeOutcome: {
      closeId: "close-f21-1",
      outcome: "VERIFIED_RESOLUTION",
      handoffAcknowledged: false,
      resolutionNote: "Original form→CRM journey recovered in canary",
    },
    claimLiveVerifiedRepair: false,
    requestLiveProviderWiring: false,
    requestWeakenTest: false,
    ...overrides,
  };
}

describe("evaluateDiagnoseAndRepairPermittedDefect (T-F21)", () => {
  it("records complete F21 evidence package", () => {
    const decision = evaluateDiagnoseAndRepairPermittedDefect(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(
      "DIAGNOSE_AND_REPAIR_PERMITTED_DEFECT_EVIDENCE_RECORDED",
    );
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.productionWrites).toBe(false);
    expect(decision.defectRecoveredOrEscalatedRecorded).toBe(true);
    expect(decision.evidence.packageId).toBe("pkg-f21-1");
    expect(decision.evidence.incidentId).toBe("inc-f21-1");
    expect(decision.evidence.reviewerId).toBe("reviewer-a25");
    expect(decision.evidence.closeOutcome).toBe("VERIFIED_RESOLUTION");
    expect(decision.evidence.repairVerifiedLive).toBe(false);
    expect(decision.evidence.blockingDecision).toBe(
      "F21_EVIDENCE_PACKAGE_COMPLETE",
    );
    expect(DIAGNOSE_AND_REPAIR_PERMITTED_DEFECT_RELATED_CASE_IDS).toEqual([
      "T-F21",
    ]);
  });

  it("records acknowledged human handoff close", () => {
    const decision = evaluateDiagnoseAndRepairPermittedDefect(
      baseInput({
        closeOutcome: {
          closeId: "close-handoff-1",
          outcome: "ACKNOWLEDGED_HUMAN_HANDOFF",
          handoffAcknowledged: true,
          resolutionNote: "Escalated to on-call after two attempts",
        },
      }),
    );
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.evidence.closeOutcome).toBe("ACKNOWLEDGED_HUMAN_HANDOFF");
    expect(decision.evidence.handoffAcknowledged).toBe(true);
  });

  it("refuses missing incident bundle", () => {
    const decision = evaluateDiagnoseAndRepairPermittedDefect(
      baseInput({ incident: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("INCIDENT_BUNDLE_REQUIRED");
    expect(decision.evidence?.currentState).toBe("AWAITING_INCIDENT_BUNDLE");
  });

  it("refuses missing source binding", () => {
    const decision = evaluateDiagnoseAndRepairPermittedDefect(
      baseInput({ sourceBinding: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SOURCE_BINDING_REQUIRED");
  });

  it("refuses missing repair policy", () => {
    const decision = evaluateDiagnoseAndRepairPermittedDefect(
      baseInput({ repairPolicy: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("BOUNDED_REPAIR_POLICY_REQUIRED");
  });

  it("refuses missing repair plan", () => {
    const decision = evaluateDiagnoseAndRepairPermittedDefect(
      baseInput({ repairPlan: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("REPAIR_PLAN_REQUIRED");
  });

  it("refuses missing patch and tests", () => {
    const decision = evaluateDiagnoseAndRepairPermittedDefect(
      baseInput({ patchAndTests: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("PATCH_AND_TESTS_REQUIRED");
  });

  it("refuses author self-approve", () => {
    const decision = evaluateDiagnoseAndRepairPermittedDefect(
      baseInput({
        independentReview: {
          reviewId: "revw-self",
          reviewerId: "author-a24",
          authorId: "author-a24",
          decision: "APPROVED",
          policyDecisionId: "pol-dec-self",
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("AUTHOR_SELF_APPROVE_REFUSED");
  });

  it("refuses missing independent review", () => {
    const decision = evaluateDiagnoseAndRepairPermittedDefect(
      baseInput({ independentReview: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("INDEPENDENT_REVIEW_REQUIRED");
  });

  it("refuses missing canary release", () => {
    const decision = evaluateDiagnoseAndRepairPermittedDefect(
      baseInput({ canaryRelease: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("CANARY_RELEASE_REQUIRED");
  });

  it("refuses unacknowledged handoff", () => {
    const decision = evaluateDiagnoseAndRepairPermittedDefect(
      baseInput({
        closeOutcome: {
          closeId: "close-no-ack",
          outcome: "ACKNOWLEDGED_HUMAN_HANDOFF",
          handoffAcknowledged: false,
          resolutionNote: "Needs ack",
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("HANDOFF_ACKNOWLEDGEMENT_REQUIRED");
  });

  it("refuses missing close outcome", () => {
    const decision = evaluateDiagnoseAndRepairPermittedDefect(
      baseInput({ closeOutcome: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("CLOSE_OUTCOME_REQUIRED");
  });

  it("refuses weaken-test request", () => {
    const decision = evaluateDiagnoseAndRepairPermittedDefect(
      baseInput({ requestWeakenTest: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("WEAKEN_TEST_REFUSED");
  });

  it("refuses false live-verified claim", () => {
    const decision = evaluateDiagnoseAndRepairPermittedDefect(
      baseInput({ claimLiveVerifiedRepair: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_REPAIR_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const decision = evaluateDiagnoseAndRepairPermittedDefect(
      baseInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });
});
