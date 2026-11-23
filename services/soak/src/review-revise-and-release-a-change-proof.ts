/**
 * Fixture proof for T-F18 — Review, revise and release a change.
 * Complete F18 evidence package: review-queue selection, why-proposed,
 * before/after + source drawer, technical/factual/policy gate inspection,
 * QA bundle, independent decision bound to revision+policy, release
 * track/verify (receipt or blocked exception); unsafe claims refused;
 * live providers NOT_WIRED. Distinct from T-US-035 receipt-or-blocked
 * summary, T-US-036/T-X019 stale approval, and T-US-054/T-X018
 * self-approval alone. External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateReviewReviseAndReleaseAChange,
  type ReviewReviseAndReleaseAChangeInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<ReviewReviseAndReleaseAChangeInput> = {},
): ReviewReviseAndReleaseAChangeInput {
  return {
    packageId: "pkg-f18-soak",
    queueSelection: {
      queueId: "queue-f18-soak",
      selectedItemId: "item-rev-f18-soak",
      opened: true,
    },
    whyProposed: {
      evidenceSummaryId: "evsum-f18-soak",
      whyProposed:
        "Update Midtown day-pass FAQ answer to match approved hours fact",
      supportingObservationIds: ["obs-faq-gap-soak", "obs-hours-drift-soak"],
    },
    beforeAfter: {
      compareId: "cmp-f18-soak",
      beforeSummary: "FAQ cites weekday close 6pm",
      afterSummary: "FAQ cites weekday close 7pm per approved fact",
      humanReadableDiff:
        "- close at 6pm\n+ close at 7pm (fact-hours-approved)",
    },
    sourceDrawer: {
      drawerId: "drawer-f18-soak",
      sourceIds: ["fact-hours-approved", "page-/faq/day-pass"],
      drawerOpened: true,
    },
    gateInspection: [
      {
        gateId: "gate-tech-soak",
        kind: "technical",
        status: "pass",
        inspected: true,
      },
      {
        gateId: "gate-fact-soak",
        kind: "factual",
        status: "pass",
        inspected: true,
      },
      {
        gateId: "gate-pol-soak",
        kind: "policy",
        status: "pass",
        inspected: true,
      },
    ],
    qa: {
      qaBundleId: "qa-f18-soak",
      revisionId: "rev-f18-soak",
      technicalPassed: true,
      factualPassed: true,
      policyPassed: true,
    },
    decision: {
      decisionId: "dec-f18-soak",
      decision: "APPROVE",
      reviewerRoleId: "role-owner-reviewer",
      authorRoleId: "role-editor-a13",
      revisionId: "rev-f18-soak",
      policyVersion: "policy-release-v3",
      decisionReason: null,
    },
    releaseTrack: {
      trackId: "track-f18-soak",
      revisionId: "rev-f18-soak",
      releaseReceiptId: "rcpt-f18-soak",
      blockedExceptionCode: null,
      tracked: true,
      verifiedInFixture: true,
    },
    revisionChangedAfterDecision: false,
    claimLiveVerifiedRelease: false,
    requestLiveProviderWiring: false,
    attemptProductionWrite: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-F18 fixture ACCEPTED.
 */
export function proofReviewReviseAndReleaseAChange(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateReviewReviseAndReleaseAChange(baseInput());
  if (
    happy.allowed &&
    happy.code ===
      "REVIEW_REVISE_AND_RELEASE_A_CHANGE_EVIDENCE_RECORDED" &&
    happy.evidence.releaseVerifiedLive === false &&
    happy.changeReviewedAndReleasedRecorded === true &&
    happy.evidence.queueOpened === true &&
    happy.evidence.drawerOpened === true &&
    happy.evidence.technicalGateInspected === true &&
    happy.evidence.factualGateInspected === true &&
    happy.evidence.policyGateInspected === true &&
    happy.evidence.releaseTracked === true &&
    happy.evidence.releaseVerifiedInFixture === true &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F18 evidence package → REVIEW_REVISE_AND_RELEASE_A_CHANGE_EVIDENCE_RECORDED; review-queue selection; why-proposed; before/after + source drawer; technical/factual/policy gates; QA; independent decision bound to revision+policy; release track/verify; releaseVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const blockedPath = evaluateReviewReviseAndReleaseAChange(
    baseInput({
      decision: {
        decisionId: "dec-f18-soak-reject",
        decision: "REJECT",
        reviewerRoleId: "role-owner-reviewer",
        authorRoleId: "role-editor-a13",
        revisionId: "rev-f18-soak",
        policyVersion: "policy-release-v3",
        decisionReason: "Factual gate conflict with approved hours",
      },
      releaseTrack: {
        trackId: "track-f18-soak-blocked",
        revisionId: "rev-f18-soak",
        releaseReceiptId: null,
        blockedExceptionCode: "FACTUAL_GATE_CONFLICT",
        tracked: true,
        verifiedInFixture: true,
      },
    }),
  );
  if (
    blockedPath.allowed &&
    blockedPath.evidence.currentState === "BLOCKED_EXCEPTION_TRACKED" &&
    blockedPath.evidence.blockedExceptionCode === "FACTUAL_GATE_CONFLICT"
  ) {
    details.push(
      "reject + blockedException → BLOCKED_EXCEPTION_TRACKED with FACTUAL_GATE_CONFLICT",
    );
  } else {
    passed = false;
    details.push(`Blocked path unexpectedly ${JSON.stringify(blockedPath)}`);
  }

  const noQueue = evaluateReviewReviseAndReleaseAChange(
    baseInput({ queueSelection: null }),
  );
  if (
    !noQueue.allowed &&
    noQueue.code === "REVIEW_QUEUE_SELECTION_REQUIRED"
  ) {
    details.push("queueSelection=null → REVIEW_QUEUE_SELECTION_REQUIRED");
  } else {
    passed = false;
    details.push(`Queue unexpectedly ${JSON.stringify(noQueue)}`);
  }

  const noWhy = evaluateReviewReviseAndReleaseAChange(
    baseInput({ whyProposed: null }),
  );
  if (!noWhy.allowed && noWhy.code === "WHY_PROPOSED_EVIDENCE_REQUIRED") {
    details.push("whyProposed=null → WHY_PROPOSED_EVIDENCE_REQUIRED");
  } else {
    passed = false;
    details.push(`Why-proposed unexpectedly ${JSON.stringify(noWhy)}`);
  }

  const noCompare = evaluateReviewReviseAndReleaseAChange(
    baseInput({ beforeAfter: null }),
  );
  if (
    !noCompare.allowed &&
    noCompare.code === "BEFORE_AFTER_COMPARE_REQUIRED"
  ) {
    details.push("beforeAfter=null → BEFORE_AFTER_COMPARE_REQUIRED");
  } else {
    passed = false;
    details.push(`Compare unexpectedly ${JSON.stringify(noCompare)}`);
  }

  const noDrawer = evaluateReviewReviseAndReleaseAChange(
    baseInput({ sourceDrawer: null }),
  );
  if (!noDrawer.allowed && noDrawer.code === "SOURCE_DRAWER_REQUIRED") {
    details.push("sourceDrawer=null → SOURCE_DRAWER_REQUIRED");
  } else {
    passed = false;
    details.push(`Drawer unexpectedly ${JSON.stringify(noDrawer)}`);
  }

  const noGates = evaluateReviewReviseAndReleaseAChange(
    baseInput({ gateInspection: null }),
  );
  if (!noGates.allowed && noGates.code === "GATE_INSPECTION_REQUIRED") {
    details.push("gateInspection=null → GATE_INSPECTION_REQUIRED");
  } else {
    passed = false;
    details.push(`Gates unexpectedly ${JSON.stringify(noGates)}`);
  }

  const noQa = evaluateReviewReviseAndReleaseAChange(
    baseInput({ qa: null }),
  );
  if (!noQa.allowed && noQa.code === "QA_BUNDLE_REQUIRED") {
    details.push("qa=null → QA_BUNDLE_REQUIRED");
  } else {
    passed = false;
    details.push(`QA unexpectedly ${JSON.stringify(noQa)}`);
  }

  const noDecision = evaluateReviewReviseAndReleaseAChange(
    baseInput({ decision: null }),
  );
  if (!noDecision.allowed && noDecision.code === "DECISION_RECORD_REQUIRED") {
    details.push("decision=null → DECISION_RECORD_REQUIRED");
  } else {
    passed = false;
    details.push(`Decision unexpectedly ${JSON.stringify(noDecision)}`);
  }

  const selfApproval = evaluateReviewReviseAndReleaseAChange(
    baseInput({
      decision: {
        decisionId: "dec-self-soak",
        decision: "APPROVE",
        reviewerRoleId: "role-editor-a13",
        authorRoleId: "role-editor-a13",
        revisionId: "rev-f18-soak",
        policyVersion: "policy-release-v3",
        decisionReason: null,
      },
    }),
  );
  if (
    !selfApproval.allowed &&
    selfApproval.code === "SELF_APPROVAL_FORBIDDEN"
  ) {
    details.push("self-approval → SELF_APPROVAL_FORBIDDEN");
  } else {
    passed = false;
    details.push(`Self-approval unexpectedly ${JSON.stringify(selfApproval)}`);
  }

  const stale = evaluateReviewReviseAndReleaseAChange(
    baseInput({ revisionChangedAfterDecision: true }),
  );
  if (!stale.allowed && stale.code === "STALE_APPROVAL_INVALIDATED") {
    details.push(
      "revisionChangedAfterDecision → STALE_APPROVAL_INVALIDATED",
    );
  } else {
    passed = false;
    details.push(`Stale unexpectedly ${JSON.stringify(stale)}`);
  }

  const noTrack = evaluateReviewReviseAndReleaseAChange(
    baseInput({ releaseTrack: null }),
  );
  if (!noTrack.allowed && noTrack.code === "RELEASE_TRACK_REQUIRED") {
    details.push("releaseTrack=null → RELEASE_TRACK_REQUIRED");
  } else {
    passed = false;
    details.push(`Release track unexpectedly ${JSON.stringify(noTrack)}`);
  }

  const prodWrite = evaluateReviewReviseAndReleaseAChange(
    baseInput({ attemptProductionWrite: true }),
  );
  if (!prodWrite.allowed && prodWrite.code === "PRODUCTION_WRITE_REFUSED") {
    details.push("attemptProductionWrite → PRODUCTION_WRITE_REFUSED");
  } else {
    passed = false;
    details.push(`Production write unexpectedly ${JSON.stringify(prodWrite)}`);
  }

  const liveClaim = evaluateReviewReviseAndReleaseAChange(
    baseInput({ claimLiveVerifiedRelease: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_RELEASE_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedRelease → FALSE_LIVE_VERIFIED_RELEASE_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateReviewReviseAndReleaseAChange(
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
    "Distinct from T-US-035 (review/revise/release receipt-or-blocked summary), T-US-036/T-X019 (stale approval), and T-US-054/T-X018 (self-approval alone) — complete F18 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.REVIEW_REVISE_AND_RELEASE_A_CHANGE,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-review-revise-and-release-a-change-f18",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
