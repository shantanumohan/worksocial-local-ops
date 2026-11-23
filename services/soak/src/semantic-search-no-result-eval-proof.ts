/**
 * Fixture proof for T-US-045 — Semantic search / no-result with evaluation
 * comparison (F23/SC-11).
 *
 * Honest NO_RESULT → judgment + remediation → COMPARE_GOLDEN re-run shows
 * improvement after catalog correction. External effects: NONE.
 * Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  EvalToolClass,
  SearchAnswerStatus,
  SearchJudgmentLabel,
  SoakProofKind,
  SupportLabel,
  createSearchRemediation,
  evaluateEvalToolAttempt,
  recordSearchJudgment,
  runSemanticSearch,
  type SemanticSearchIndex,
  type SoakProofRecord,
} from "@worksocial/domain";

function fixtureIndex(nowIso: string): SemanticSearchIndex {
  return {
    indexId: "idx-t-us-045-fixture",
    version: 1,
    updatedAtIso: nowIso,
    fixtureOnly: true,
    entries: [
      {
        entryId: "room-8",
        name: "Hudson Boardroom",
        category: "Meeting",
        capacity: 8,
        location: "Jersey City",
        amenities: ["display", "whiteboard"],
        sourcePageId: "page-rooms",
        groundedFactIds: ["fact-capacity-8"],
        inaccessible: false,
        priceKnown: false,
        priceLabel: null,
        fixtureOnly: true,
      },
    ],
  };
}

/**
 * Complete expected proof set for T-US-045 fixture ACCEPTED.
 */
export function proofSemanticSearchNoResultEvalComparison(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const index = fixtureIndex(nowIso);
  const rawQuery = "Training room for 20 in Jersey City with video";

  // 1. Hard-constraint miss → honest NO_RESULT (not a false match).
  const before = runSemanticSearch({
    queryId: "q-us045-before",
    rawQuery,
    index,
    createdAtIso: nowIso,
    factLabels: new Map([["fact-capacity-8", SupportLabel.SUPPORTED]]),
  });
  if (
    before.hits.length === 0 &&
    before.answerStatus === SearchAnswerStatus.NO_RESULT &&
    /No eligible inventory/i.test(before.noMatchReason ?? "") &&
    before.bookingHandoffUrl === null &&
    before.constraints.people === 20 &&
    before.constraints.requiredAmenities.includes("video")
  ) {
    details.push(
      "Hard-constraint miss → NO_RESULT with parsed intent (people=20, video) and no invented handoff",
    );
  } else {
    passed = false;
    details.push(
      `Before search unexpectedly status=${before.answerStatus} hits=${before.hits.length} reason=${before.noMatchReason}`,
    );
  }

  // 2. Judgment record — mark no-match (T-F23 step 4).
  const judgment = recordSearchJudgment({
    judgmentId: `jud-${randomUUID().slice(0, 8)}`,
    queryId: before.queryId,
    label: SearchJudgmentLabel.NO_MATCH,
    note: "Fixture: capacity/amenity inventory gap — no eligible training room",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  if (
    judgment.label === SearchJudgmentLabel.NO_MATCH &&
    judgment.queryId === before.queryId &&
    judgment.fixtureOnly === true
  ) {
    details.push(
      `Judgment ${judgment.judgmentId} → NO_MATCH for query ${judgment.queryId}`,
    );
  } else {
    passed = false;
    details.push(`Judgment unexpectedly ${JSON.stringify(judgment)}`);
  }

  // 3. Remediation task linked to judgment (T-F23 step 5).
  const remediation = createSearchRemediation({
    taskId: `rem-${randomUUID().slice(0, 8)}`,
    queryId: before.queryId,
    judgmentId: judgment.judgmentId,
    summary:
      "Add Exchange Training (capacity 20, video) to semantic catalog — fixture correction only",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  if (
    remediation.status === "open" &&
    remediation.judgmentId === judgment.judgmentId &&
    remediation.fixtureOnly === true
  ) {
    details.push(
      `Remediation ${remediation.taskId} open, linked to judgment ${remediation.judgmentId}`,
    );
  } else {
    passed = false;
    details.push(`Remediation unexpectedly ${JSON.stringify(remediation)}`);
  }

  // 4. EVAL_ONLY COMPARE_GOLDEN allowed (evaluation comparison tool class).
  const compareGate = evaluateEvalToolAttempt(EvalToolClass.COMPARE_GOLDEN);
  if (compareGate.allowed && compareGate.tool === EvalToolClass.COMPARE_GOLDEN) {
    details.push("EVAL_ONLY COMPARE_GOLDEN tool allowed for evaluation comparison");
  } else {
    passed = false;
    details.push(`COMPARE_GOLDEN gate unexpectedly ${JSON.stringify(compareGate)}`);
  }

  // 5. Apply fixture remediation to catalog and re-run golden query.
  const remediated: SemanticSearchIndex = {
    ...index,
    version: index.version + 1,
    updatedAtIso: nowIso,
    entries: [
      ...index.entries,
      {
        entryId: "room-20",
        name: "Exchange Training",
        category: "Training",
        capacity: 20,
        location: "Jersey City",
        amenities: ["display", "video"],
        sourcePageId: "page-training",
        groundedFactIds: ["fact-capacity-20"],
        inaccessible: false,
        priceKnown: true,
        priceLabel: "contact for quote",
        fixtureOnly: true,
      },
    ],
  };
  const after = runSemanticSearch({
    queryId: "q-us045-after",
    rawQuery,
    index: remediated,
    createdAtIso: nowIso,
    factLabels: new Map([
      ["fact-capacity-8", SupportLabel.SUPPORTED],
      ["fact-capacity-20", SupportLabel.SUPPORTED],
    ]),
    bookingHandoffUrl: "https://fixture.worksocial.local/book",
  });
  const afterHit = after.hits[0];
  if (
    after.hits.length === 1 &&
    afterHit?.entryId === "room-20" &&
    after.answerStatus === SearchAnswerStatus.GROUNDED &&
    afterHit.filterTrace.length > 0 &&
    afterHit.citations.some((c) => c.includes("fact-capacity-20")) &&
    after.bookingHandoffUrl?.startsWith("https:")
  ) {
    details.push(
      "Post-remediation golden re-run → GROUNDED room-20 with filterTrace, citations, booking handoff",
    );
  } else {
    passed = false;
    details.push(
      `After search unexpectedly status=${after.answerStatus} hits=${after.hits.map((h) => h.entryId).join(",")}`,
    );
  }

  // 6. Evaluation comparison — before NO_RESULT vs after GROUNDED improvement.
  if (
    before.answerStatus === SearchAnswerStatus.NO_RESULT &&
    after.answerStatus === SearchAnswerStatus.GROUNDED &&
    before.hits.length === 0 &&
    after.hits.length === 1 &&
    before.indexVersion === 1 &&
    after.indexVersion === 2
  ) {
    details.push(
      "Evaluation comparison: before=NO_RESULT (v1) → after=GROUNDED (v2) — golden improved, not silent false match",
    );
  } else {
    passed = false;
    details.push(
      `Evaluation comparison failed before=${before.answerStatus}/v${before.indexVersion} after=${after.answerStatus}/v${after.indexVersion}`,
    );
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-semantic-search-no-result-${randomUUID()}`,
    kind: SoakProofKind.SEMANTIC_SEARCH_NO_RESULT_EVAL_COMPARISON,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-us045-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
