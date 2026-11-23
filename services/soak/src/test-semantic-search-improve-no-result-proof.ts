/**
 * Fixture proof for T-F23 — Test semantic search and improve no-result cases.
 * Complete F23 evidence package: approved catalog/ownership, parsed intent
 * with ambiguities, eligibility filter trace, answer/handoff review, judgment,
 * remediation, golden evaluation comparison; unsafe claims refused; live
 * providers NOT_WIRED. Distinct from T-US-045 evaluation-comparison focused
 * path, T-US-046/T-X048 hard constraints, and T-X038 eval no-grounding.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateTestSemanticSearchImproveNoResult,
  type TestSemanticSearchImproveNoResultInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<TestSemanticSearchImproveNoResultInput> = {},
): TestSemanticSearchImproveNoResultInput {
  return {
    packageId: "pkg-f23-soak",
    catalogOwnership: {
      catalogId: "catalog-f23-soak",
      fieldOwnerIds: ["owner-capacity-soak", "owner-av-soak"],
      approved: true,
    },
    parsedIntent: {
      intentId: "intent-f23-soak",
      customerNeed: "Boardroom for 20 with video conferencing midtown",
      parsedConstraints: ["people=20", "amenity=video", "area=midtown"],
      ambiguities: ["exact date flexible", "budget band unspecified"],
    },
    eligibility: {
      inspectionId: "elig-f23-soak",
      filterTrace: [
        "parsed people=20",
        "hard amenity=video required",
        "excluded: no catalog room with video for 20 — honest no-result",
      ],
      candidateIds: ["room-12-soak", "room-16-soak"],
      eligibleCount: 0,
    },
    answerHandoff: {
      reviewId: "ans-f23-soak",
      answerStatus: "NO_RESULT",
      citationIds: [],
      destinationLinks: [],
      bookingHandoffUrl: null,
      explicitUncertainty: true,
    },
    judgment: {
      judgmentId: "jud-f23-soak",
      queryId: "q-f23-before-soak",
      label: "NO_MATCH",
      note: "No room meets people=20 + video; do not invent handoff",
    },
    remediation: {
      remediationId: "rem-f23-soak",
      judgmentId: "jud-f23-soak",
      summary: "Add room-20 with verified video AV fact to approved catalog",
      kind: "CONTENT",
      status: "DONE",
    },
    evaluationComparison: {
      comparisonId: "cmp-f23-soak",
      beforeAnswerStatus: "NO_RESULT",
      afterAnswerStatus: "GROUNDED",
      beforeIndexVersion: 1,
      afterIndexVersion: 2,
      goldenImproved: true,
      silentFalseMatch: false,
    },
    claimLiveVerifiedSearch: false,
    requestLiveProviderWiring: false,
    requestSilentFalseMatch: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-F23 fixture ACCEPTED.
 */
export function proofTestSemanticSearchImproveNoResult(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateTestSemanticSearchImproveNoResult(baseInput());
  if (
    happy.allowed &&
    happy.code ===
      "TEST_SEMANTIC_SEARCH_IMPROVE_NO_RESULT_EVIDENCE_RECORDED" &&
    happy.evidence.searchVerifiedLive === false &&
    happy.semanticSearchImprovedRecorded === true &&
    happy.evidence.goldenImproved === true &&
    happy.evidence.silentFalseMatch === false &&
    happy.evidence.explicitUncertainty === true &&
    happy.evidence.filterTrace.length >= 1 &&
    happy.evidence.ambiguities.length >= 1 &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F23 evidence package → TEST_SEMANTIC_SEARCH_IMPROVE_NO_RESULT_EVIDENCE_RECORDED; approved catalog/ownership; parsed intent+ambiguities; eligibility filter trace; answer/handoff review; judgment; remediation; golden evaluation comparison; searchVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noCatalog = evaluateTestSemanticSearchImproveNoResult(
    baseInput({ catalogOwnership: null }),
  );
  if (!noCatalog.allowed && noCatalog.code === "CATALOG_OWNERSHIP_REQUIRED") {
    details.push("catalogOwnership=null → CATALOG_OWNERSHIP_REQUIRED");
  } else {
    passed = false;
    details.push(`Catalog unexpectedly ${JSON.stringify(noCatalog)}`);
  }

  const noIntent = evaluateTestSemanticSearchImproveNoResult(
    baseInput({ parsedIntent: null }),
  );
  if (!noIntent.allowed && noIntent.code === "PARSED_INTENT_REQUIRED") {
    details.push("parsedIntent=null → PARSED_INTENT_REQUIRED");
  } else {
    passed = false;
    details.push(`Intent unexpectedly ${JSON.stringify(noIntent)}`);
  }

  const noElig = evaluateTestSemanticSearchImproveNoResult(
    baseInput({ eligibility: null }),
  );
  if (
    !noElig.allowed &&
    noElig.code === "ELIGIBILITY_INSPECTION_REQUIRED"
  ) {
    details.push("eligibility=null → ELIGIBILITY_INSPECTION_REQUIRED");
  } else {
    passed = false;
    details.push(`Eligibility unexpectedly ${JSON.stringify(noElig)}`);
  }

  const noAns = evaluateTestSemanticSearchImproveNoResult(
    baseInput({ answerHandoff: null }),
  );
  if (
    !noAns.allowed &&
    noAns.code === "ANSWER_HANDOFF_REVIEW_REQUIRED"
  ) {
    details.push("answerHandoff=null → ANSWER_HANDOFF_REVIEW_REQUIRED");
  } else {
    passed = false;
    details.push(`Answer unexpectedly ${JSON.stringify(noAns)}`);
  }

  const noJud = evaluateTestSemanticSearchImproveNoResult(
    baseInput({ judgment: null }),
  );
  if (!noJud.allowed && noJud.code === "JUDGMENT_RECORD_REQUIRED") {
    details.push("judgment=null → JUDGMENT_RECORD_REQUIRED");
  } else {
    passed = false;
    details.push(`Judgment unexpectedly ${JSON.stringify(noJud)}`);
  }

  const noRem = evaluateTestSemanticSearchImproveNoResult(
    baseInput({ remediation: null }),
  );
  if (!noRem.allowed && noRem.code === "REMEDIATION_TASK_REQUIRED") {
    details.push("remediation=null → REMEDIATION_TASK_REQUIRED");
  } else {
    passed = false;
    details.push(`Remediation unexpectedly ${JSON.stringify(noRem)}`);
  }

  const noCmp = evaluateTestSemanticSearchImproveNoResult(
    baseInput({ evaluationComparison: null }),
  );
  if (
    !noCmp.allowed &&
    noCmp.code === "EVALUATION_COMPARISON_REQUIRED"
  ) {
    details.push("evaluationComparison=null → EVALUATION_COMPARISON_REQUIRED");
  } else {
    passed = false;
    details.push(`Comparison unexpectedly ${JSON.stringify(noCmp)}`);
  }

  const falseMatch = evaluateTestSemanticSearchImproveNoResult(
    baseInput({ requestSilentFalseMatch: true }),
  );
  if (
    !falseMatch.allowed &&
    falseMatch.code === "SILENT_FALSE_MATCH_REFUSED"
  ) {
    details.push("requestSilentFalseMatch → SILENT_FALSE_MATCH_REFUSED");
  } else {
    passed = false;
    details.push(`Silent false match unexpectedly ${JSON.stringify(falseMatch)}`);
  }

  const liveClaim = evaluateTestSemanticSearchImproveNoResult(
    baseInput({ claimLiveVerifiedSearch: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_SEARCH_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedSearch → FALSE_LIVE_VERIFIED_SEARCH_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateTestSemanticSearchImproveNoResult(
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
    "Distinct from T-US-045 (evaluation-comparison focused no-result→golden path), T-US-046/T-X048 (hard search constraints), and T-X038 (eval no-grounding) — complete F23 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.TEST_SEMANTIC_SEARCH_IMPROVE_NO_RESULT,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-test-semantic-search-improve-no-result-f23",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
