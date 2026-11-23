/**
 * Fixture proof for T-F21 — Diagnose and repair a permitted defect.
 * Complete F21 evidence package: incident bundle, source binding, bounded
 * repair policy, repair plan + lease, patch/diff + regression + attempt
 * ledger, independent review, canary read-back + repeated journey, verified
 * resolution or acknowledged handoff; weaken-test / self-approve / false
 * live-verified / live CMS wiring refused. Distinct from T-US-041 canary
 * resolve/handoff path, T-X010/T-US-042 weaken-test reject, and T-X011
 * attempt-limit escalate. External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateDiagnoseAndRepairPermittedDefect,
  type DiagnoseAndRepairPermittedDefectInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<DiagnoseAndRepairPermittedDefectInput> = {},
): DiagnoseAndRepairPermittedDefectInput {
  return {
    packageId: "pkg-f21-soak",
    incident: {
      incidentId: "inc-f21-soak",
      affectedJourneyIds: ["journey-form-crm-soak"],
      firstFailureIso: "2026-11-22T10:00:00.000Z",
      lastFailureIso: "2026-11-22T12:00:00.000Z",
      relatedReleaseIds: ["rel-cms-broken-meta-soak"],
      businessImpactSummary: "Form→CRM canary failing; leads not landing",
    },
    sourceBinding: {
      bindingId: "bind-f21-soak",
      sourceRootId: "src-cms-midtown-soak",
      assetLimit: "ONE_ASSET",
    },
    repairPolicy: {
      policyId: "pol-repair-f21-soak",
      maxAttempts: 2,
      weakenTestsForbidden: true,
      authorSelfApproveForbidden: true,
    },
    repairPlan: {
      planId: "plan-f21-soak",
      sourceRevision: "rev-soak-abc",
      worktreeId: "wt-f21-soak",
      leaseId: "lease-f21-soak",
      scopeSummary: "Restore meta field mapping on booking form page",
    },
    patchAndTests: {
      diffId: "diff-f21-soak",
      diffSummary: "Revert broken meta tag; restore CRM field map",
      regressionSuiteId: "suite-form-crm-canary-soak",
      regressionPassed: true,
      attemptLedgerId: "ledger-f21-soak",
      attemptCount: 1,
    },
    independentReview: {
      reviewId: "revw-f21-soak",
      reviewerId: "reviewer-a25-soak",
      authorId: "author-a24-soak",
      decision: "APPROVED",
      policyDecisionId: "pol-dec-f21-soak",
    },
    canaryRelease: {
      canaryReleaseId: "canary-f21-soak",
      readBackId: "rb-f21-soak",
      readBackMatched: true,
      repeatedJourneyTestId: "rj-f21-soak",
      repeatedJourneyPassed: true,
    },
    closeOutcome: {
      closeId: "close-f21-soak",
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

/**
 * Complete expected proof set for T-F21 fixture ACCEPTED.
 */
export function proofDiagnoseAndRepairPermittedDefect(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateDiagnoseAndRepairPermittedDefect(baseInput());
  if (
    happy.allowed &&
    happy.code ===
      "DIAGNOSE_AND_REPAIR_PERMITTED_DEFECT_EVIDENCE_RECORDED" &&
    happy.evidence.repairVerifiedLive === false &&
    happy.defectRecoveredOrEscalatedRecorded === true &&
    happy.evidence.closeOutcome === "VERIFIED_RESOLUTION" &&
    happy.evidence.readBackMatched === true &&
    happy.evidence.repeatedJourneyPassed === true &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F21 evidence package → DIAGNOSE_AND_REPAIR_PERMITTED_DEFECT_EVIDENCE_RECORDED; incident bundle; source binding; bounded policy; repair plan+lease; patch/diff+regression+ledger; independent review; canary read-back+repeated journey; verified resolution; repairVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const handoff = evaluateDiagnoseAndRepairPermittedDefect(
    baseInput({
      closeOutcome: {
        closeId: "close-handoff-soak",
        outcome: "ACKNOWLEDGED_HUMAN_HANDOFF",
        handoffAcknowledged: true,
        resolutionNote: "Escalated to on-call after bounded attempts",
      },
    }),
  );
  if (
    handoff.allowed &&
    handoff.evidence.closeOutcome === "ACKNOWLEDGED_HUMAN_HANDOFF" &&
    handoff.evidence.handoffAcknowledged === true
  ) {
    details.push(
      "ACKNOWLEDGED_HUMAN_HANDOFF close → defectRecoveredOrEscalatedRecorded",
    );
  } else {
    passed = false;
    details.push(`Handoff close unexpectedly ${JSON.stringify(handoff)}`);
  }

  const noIncident = evaluateDiagnoseAndRepairPermittedDefect(
    baseInput({ incident: null }),
  );
  if (!noIncident.allowed && noIncident.code === "INCIDENT_BUNDLE_REQUIRED") {
    details.push("incident=null → INCIDENT_BUNDLE_REQUIRED");
  } else {
    passed = false;
    details.push(`Incident unexpectedly ${JSON.stringify(noIncident)}`);
  }

  const noBinding = evaluateDiagnoseAndRepairPermittedDefect(
    baseInput({ sourceBinding: null }),
  );
  if (!noBinding.allowed && noBinding.code === "SOURCE_BINDING_REQUIRED") {
    details.push("sourceBinding=null → SOURCE_BINDING_REQUIRED");
  } else {
    passed = false;
    details.push(`Binding unexpectedly ${JSON.stringify(noBinding)}`);
  }

  const noPolicy = evaluateDiagnoseAndRepairPermittedDefect(
    baseInput({ repairPolicy: null }),
  );
  if (
    !noPolicy.allowed &&
    noPolicy.code === "BOUNDED_REPAIR_POLICY_REQUIRED"
  ) {
    details.push("repairPolicy=null → BOUNDED_REPAIR_POLICY_REQUIRED");
  } else {
    passed = false;
    details.push(`Policy unexpectedly ${JSON.stringify(noPolicy)}`);
  }

  const noPlan = evaluateDiagnoseAndRepairPermittedDefect(
    baseInput({ repairPlan: null }),
  );
  if (!noPlan.allowed && noPlan.code === "REPAIR_PLAN_REQUIRED") {
    details.push("repairPlan=null → REPAIR_PLAN_REQUIRED");
  } else {
    passed = false;
    details.push(`Plan unexpectedly ${JSON.stringify(noPlan)}`);
  }

  const noPatch = evaluateDiagnoseAndRepairPermittedDefect(
    baseInput({ patchAndTests: null }),
  );
  if (!noPatch.allowed && noPatch.code === "PATCH_AND_TESTS_REQUIRED") {
    details.push("patchAndTests=null → PATCH_AND_TESTS_REQUIRED");
  } else {
    passed = false;
    details.push(`Patch unexpectedly ${JSON.stringify(noPatch)}`);
  }

  const selfApprove = evaluateDiagnoseAndRepairPermittedDefect(
    baseInput({
      independentReview: {
        reviewId: "revw-self-soak",
        reviewerId: "author-a24-soak",
        authorId: "author-a24-soak",
        decision: "APPROVED",
        policyDecisionId: "pol-dec-self-soak",
      },
    }),
  );
  if (
    !selfApprove.allowed &&
    selfApprove.code === "AUTHOR_SELF_APPROVE_REFUSED"
  ) {
    details.push("author===reviewer → AUTHOR_SELF_APPROVE_REFUSED");
  } else {
    passed = false;
    details.push(`Self-approve unexpectedly ${JSON.stringify(selfApprove)}`);
  }

  const noReview = evaluateDiagnoseAndRepairPermittedDefect(
    baseInput({ independentReview: null }),
  );
  if (
    !noReview.allowed &&
    noReview.code === "INDEPENDENT_REVIEW_REQUIRED"
  ) {
    details.push("independentReview=null → INDEPENDENT_REVIEW_REQUIRED");
  } else {
    passed = false;
    details.push(`Review unexpectedly ${JSON.stringify(noReview)}`);
  }

  const noCanary = evaluateDiagnoseAndRepairPermittedDefect(
    baseInput({ canaryRelease: null }),
  );
  if (!noCanary.allowed && noCanary.code === "CANARY_RELEASE_REQUIRED") {
    details.push("canaryRelease=null → CANARY_RELEASE_REQUIRED");
  } else {
    passed = false;
    details.push(`Canary unexpectedly ${JSON.stringify(noCanary)}`);
  }

  const noClose = evaluateDiagnoseAndRepairPermittedDefect(
    baseInput({ closeOutcome: null }),
  );
  if (!noClose.allowed && noClose.code === "CLOSE_OUTCOME_REQUIRED") {
    details.push("closeOutcome=null → CLOSE_OUTCOME_REQUIRED");
  } else {
    passed = false;
    details.push(`Close unexpectedly ${JSON.stringify(noClose)}`);
  }

  const weaken = evaluateDiagnoseAndRepairPermittedDefect(
    baseInput({ requestWeakenTest: true }),
  );
  if (!weaken.allowed && weaken.code === "WEAKEN_TEST_REFUSED") {
    details.push("requestWeakenTest → WEAKEN_TEST_REFUSED");
  } else {
    passed = false;
    details.push(`Weaken test unexpectedly ${JSON.stringify(weaken)}`);
  }

  const liveClaim = evaluateDiagnoseAndRepairPermittedDefect(
    baseInput({ claimLiveVerifiedRepair: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_REPAIR_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedRepair → FALSE_LIVE_VERIFIED_REPAIR_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateDiagnoseAndRepairPermittedDefect(
    baseInput({ requestLiveProviderWiring: true }),
  );
  if (
    !liveWire.allowed &&
    liveWire.code === "LIVE_PROVIDER_WIRING_NOT_WIRED"
  ) {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(liveWire)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-041 (canary resolve/handoff path), T-X010/T-US-042 (weaken-test reject), and T-X011 (attempt-limit escalate) — complete F21 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.DIAGNOSE_AND_REPAIR_PERMITTED_DEFECT,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-diagnose-and-repair-permitted-defect-f21",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
