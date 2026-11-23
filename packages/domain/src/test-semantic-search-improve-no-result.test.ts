import { describe, expect, it } from "vitest";
import {
  TEST_SEMANTIC_SEARCH_IMPROVE_NO_RESULT_RELATED_CASE_IDS,
  evaluateTestSemanticSearchImproveNoResult,
  type TestSemanticSearchImproveNoResultInput,
} from "./test-semantic-search-improve-no-result.js";

function baseInput(
  overrides: Partial<TestSemanticSearchImproveNoResultInput> = {},
): TestSemanticSearchImproveNoResultInput {
  return {
    packageId: "pkg-f23-1",
    catalogOwnership: {
      catalogId: "catalog-f23-1",
      fieldOwnerIds: ["owner-capacity", "owner-av"],
      approved: true,
    },
    parsedIntent: {
      intentId: "intent-f23-1",
      customerNeed: "Boardroom for 20 with video conferencing midtown",
      parsedConstraints: ["people=20", "amenity=video", "area=midtown"],
      ambiguities: ["exact date flexible", "budget band unspecified"],
    },
    eligibility: {
      inspectionId: "elig-f23-1",
      filterTrace: [
        "parsed people=20",
        "hard amenity=video required",
        "excluded: no catalog room with video for 20 — honest no-result",
      ],
      candidateIds: ["room-12", "room-16"],
      eligibleCount: 0,
    },
    answerHandoff: {
      reviewId: "ans-f23-1",
      answerStatus: "NO_RESULT",
      citationIds: [],
      destinationLinks: [],
      bookingHandoffUrl: null,
      explicitUncertainty: true,
    },
    judgment: {
      judgmentId: "jud-f23-1",
      queryId: "q-f23-before",
      label: "NO_MATCH",
      note: "No room meets people=20 + video; do not invent handoff",
    },
    remediation: {
      remediationId: "rem-f23-1",
      judgmentId: "jud-f23-1",
      summary: "Add room-20 with verified video AV fact to approved catalog",
      kind: "CONTENT",
      status: "DONE",
    },
    evaluationComparison: {
      comparisonId: "cmp-f23-1",
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

describe("evaluateTestSemanticSearchImproveNoResult (T-F23)", () => {
  it("records complete F23 evidence package", () => {
    const decision = evaluateTestSemanticSearchImproveNoResult(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(
      "TEST_SEMANTIC_SEARCH_IMPROVE_NO_RESULT_EVIDENCE_RECORDED",
    );
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.productionWrites).toBe(false);
    expect(decision.semanticSearchImprovedRecorded).toBe(true);
    expect(decision.evidence.packageId).toBe("pkg-f23-1");
    expect(decision.evidence.catalogId).toBe("catalog-f23-1");
    expect(decision.evidence.intentId).toBe("intent-f23-1");
    expect(decision.evidence.ambiguities).toEqual([
      "exact date flexible",
      "budget band unspecified",
    ]);
    expect(decision.evidence.filterTrace.length).toBeGreaterThan(0);
    expect(decision.evidence.answerStatus).toBe("NO_RESULT");
    expect(decision.evidence.explicitUncertainty).toBe(true);
    expect(decision.evidence.judgmentLabel).toBe("NO_MATCH");
    expect(decision.evidence.remediationId).toBe("rem-f23-1");
    expect(decision.evidence.goldenImproved).toBe(true);
    expect(decision.evidence.silentFalseMatch).toBe(false);
    expect(decision.evidence.searchVerifiedLive).toBe(false);
    expect(decision.evidence.blockingDecision).toBe(
      "F23_EVIDENCE_PACKAGE_COMPLETE",
    );
    expect(TEST_SEMANTIC_SEARCH_IMPROVE_NO_RESULT_RELATED_CASE_IDS).toEqual([
      "T-F23",
    ]);
  });

  it("refuses missing catalog ownership", () => {
    const decision = evaluateTestSemanticSearchImproveNoResult(
      baseInput({ catalogOwnership: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("CATALOG_OWNERSHIP_REQUIRED");
    expect(decision.evidence?.currentState).toBe("AWAITING_CATALOG_OWNERSHIP");
  });

  it("refuses missing parsed intent", () => {
    const decision = evaluateTestSemanticSearchImproveNoResult(
      baseInput({ parsedIntent: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("PARSED_INTENT_REQUIRED");
  });

  it("refuses missing eligibility inspection", () => {
    const decision = evaluateTestSemanticSearchImproveNoResult(
      baseInput({ eligibility: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("ELIGIBILITY_INSPECTION_REQUIRED");
  });

  it("refuses missing answer/handoff review", () => {
    const decision = evaluateTestSemanticSearchImproveNoResult(
      baseInput({ answerHandoff: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("ANSWER_HANDOFF_REVIEW_REQUIRED");
  });

  it("refuses grounded answer without citations", () => {
    const decision = evaluateTestSemanticSearchImproveNoResult(
      baseInput({
        answerHandoff: {
          reviewId: "ans-bad",
          answerStatus: "GROUNDED",
          citationIds: [],
          destinationLinks: ["/book"],
          bookingHandoffUrl: "/book/room-20",
          explicitUncertainty: false,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("ANSWER_HANDOFF_REVIEW_REQUIRED");
  });

  it("refuses missing judgment", () => {
    const decision = evaluateTestSemanticSearchImproveNoResult(
      baseInput({ judgment: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("JUDGMENT_RECORD_REQUIRED");
  });

  it("refuses missing remediation", () => {
    const decision = evaluateTestSemanticSearchImproveNoResult(
      baseInput({ remediation: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("REMEDIATION_TASK_REQUIRED");
  });

  it("refuses remediation judgment mismatch", () => {
    const decision = evaluateTestSemanticSearchImproveNoResult(
      baseInput({
        remediation: {
          remediationId: "rem-bad",
          judgmentId: "jud-other",
          summary: "fix catalog",
          kind: "CONTENT",
          status: "DONE",
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("REMEDIATION_TASK_REQUIRED");
  });

  it("refuses missing evaluation comparison", () => {
    const decision = evaluateTestSemanticSearchImproveNoResult(
      baseInput({ evaluationComparison: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("EVALUATION_COMPARISON_REQUIRED");
  });

  it("refuses silent false match request", () => {
    const decision = evaluateTestSemanticSearchImproveNoResult(
      baseInput({ requestSilentFalseMatch: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SILENT_FALSE_MATCH_REFUSED");
  });

  it("refuses false live-verified claim", () => {
    const decision = evaluateTestSemanticSearchImproveNoResult(
      baseInput({ claimLiveVerifiedSearch: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_SEARCH_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const decision = evaluateTestSemanticSearchImproveNoResult(
      baseInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });
});
