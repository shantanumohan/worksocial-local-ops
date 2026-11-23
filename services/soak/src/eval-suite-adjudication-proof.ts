/**
 * Fixture proof for T-US-033 — Claude/Gemini eval suites (F17/SC-14)
 * adjudication + backlog. Versioned suite + condition manifest + authorized
 * fixture run; failed cases adjudicated with linked backlog; no production
 * writes; live NOT_WIRED. Distinct from T-US-015 / T-US-017 / T-US-018 /
 * T-X037 / T-X038. External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateEvalSuiteAdjudication,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-033 fixture ACCEPTED.
 */
export function proofEvalSuiteAdjudicationBacklog(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const base = {
    suiteId: "suite-acoustic-eval-v1",
    suiteVersion: "1.0.0",
    surfaceLabel: "content_gap" as const,
    provider: "claude" as const,
    conditionManifest: {
      evidenceVersion: "ev-suite-2026-11-21",
      repetitions: 2,
      toolMode: "EVAL_ONLY" as const,
      models: ["claude-fixture-judge", "gemini-fixture-judge"],
      privacyReviewed: true,
      promptsReviewed: true,
    },
    runAuthorized: true,
    authorizationReason: "Owner approved bounded fixture eval suite",
    caseArtifacts: [
      {
        caseId: "case-pass-hours",
        verdict: "pass" as const,
        gapKind: "none" as const,
        gapSummary: "Hours answer matched SUPPORTED fact",
        redacted: true as const,
      },
      {
        caseId: "case-fail-parking",
        verdict: "fail" as const,
        gapKind: "content" as const,
        gapSummary: "Parking FAQ missing on booth page",
        redacted: true as const,
      },
    ],
    adjudications: [
      {
        caseId: "case-fail-parking",
        adjudicated: true,
        backlogItemId: "bl-parking-faq",
      },
    ],
    backlogItems: [
      {
        backlogItemId: "bl-parking-faq",
        linkedCaseId: "case-fail-parking",
        title: "Add parking FAQ to booth landing page",
        remediationKind: "content_fix" as const,
      },
    ],
    fixtureRedactionChecked: true,
    claimLiveVerifiedSuite: false,
    requestLiveEvalWiring: false,
    attemptProductionWrite: false,
  };

  const happy = evaluateEvalSuiteAdjudication(base);
  if (
    happy.allowed &&
    happy.code === "EVAL_SUITE_ADJUDICATED_BACKLOG_LINKED" &&
    happy.evidence.backlogLinkedCount === 1 &&
    happy.evidence.failedCaseCount === 1 &&
    happy.evidence.productionWrites === false &&
    happy.evidence.suiteVerifiedLive === false &&
    happy.liveEvalWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "authorized suite → EVAL_SUITE_ADJUDICATED_BACKLOG_LINKED; failed case linked to backlog; productionWrites=false",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const gemini = evaluateEvalSuiteAdjudication({
    ...base,
    provider: "gemini",
    surfaceLabel: "search_gap",
  });
  if (
    gemini.allowed &&
    gemini.code === "EVAL_SUITE_ADJUDICATED_BACKLOG_LINKED" &&
    gemini.evidence.provider === "gemini"
  ) {
    details.push("gemini provider → EVAL_SUITE_ADJUDICATED_BACKLOG_LINKED");
  } else {
    passed = false;
    details.push(`Gemini unexpectedly ${JSON.stringify(gemini)}`);
  }

  const unlinked = evaluateEvalSuiteAdjudication({
    ...base,
    adjudications: [
      {
        caseId: "case-fail-parking",
        adjudicated: true,
        backlogItemId: null,
      },
    ],
    backlogItems: [],
  });
  if (!unlinked.allowed && unlinked.code === "ADJUDICATION_BACKLOG_UNLINKED") {
    details.push(
      "failed case without backlog link → ADJUDICATION_BACKLOG_UNLINKED",
    );
  } else {
    passed = false;
    details.push(`Unlinked unexpectedly ${JSON.stringify(unlinked)}`);
  }

  const auth = evaluateEvalSuiteAdjudication({
    ...base,
    runAuthorized: false,
    authorizationReason: null,
  });
  if (!auth.allowed && auth.code === "RUN_AUTHORIZATION_REQUIRED") {
    details.push("runAuthorized=false → RUN_AUTHORIZATION_REQUIRED");
  } else {
    passed = false;
    details.push(`Auth unexpectedly ${JSON.stringify(auth)}`);
  }

  const redaction = evaluateEvalSuiteAdjudication({
    ...base,
    fixtureRedactionChecked: false,
  });
  if (
    !redaction.allowed &&
    redaction.code === "FIXTURE_REDACTION_CHECK_REQUIRED"
  ) {
    details.push(
      "fixtureRedactionChecked=false → FIXTURE_REDACTION_CHECK_REQUIRED",
    );
  } else {
    passed = false;
    details.push(`Redaction unexpectedly ${JSON.stringify(redaction)}`);
  }

  const prodWrite = evaluateEvalSuiteAdjudication({
    ...base,
    attemptProductionWrite: true,
  });
  if (!prodWrite.allowed && prodWrite.code === "PRODUCTION_WRITE_REFUSED") {
    details.push("attemptProductionWrite → PRODUCTION_WRITE_REFUSED");
  } else {
    passed = false;
    details.push(`Production write unexpectedly ${JSON.stringify(prodWrite)}`);
  }

  const falseClaim = evaluateEvalSuiteAdjudication({
    ...base,
    claimLiveVerifiedSuite: true,
  });
  if (
    !falseClaim.allowed &&
    falseClaim.code === "FALSE_LIVE_VERIFIED_SUITE_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedSuite → FALSE_LIVE_VERIFIED_SUITE_REFUSED",
    );
  } else {
    passed = false;
    details.push(`False claim unexpectedly ${JSON.stringify(falseClaim)}`);
  }

  const live = evaluateEvalSuiteAdjudication({
    ...base,
    requestLiveEvalWiring: true,
  });
  if (!live.allowed && live.code === "LIVE_EVAL_WIRING_NOT_WIRED") {
    details.push("requestLiveEvalWiring → LIVE_EVAL_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(live)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveEvalWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-015 (Claude Code + test API), T-US-017 (Gemini connect), T-US-018/T-X037 (operational tool forbid), T-X038 (no-grounding)",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: `proof-eval-suite-adj-${randomUUID()}`,
    kind: SoakProofKind.EVAL_SUITE_ADJUDICATION_BACKLOG,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-eval-suite-adj-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
