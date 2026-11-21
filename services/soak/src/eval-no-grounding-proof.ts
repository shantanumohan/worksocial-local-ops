/**
 * Fixture proof for T-X038 — grounded eval without grounding fails closed.
 *
 * adjudicateGroundedEvalCase returns NO_GROUNDING when grounding is required
 * but unused, or when only HYPOTHESIS citations are present. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  EvalCaseVerdict,
  SoakProofKind,
  SupportLabel,
  adjudicateGroundedEvalCase,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X038 fixture ACCEPTED.
 */
export function proofEvalNoGroundingFailClosed(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const labels = new Map([
    ["fixture-fact-hours", SupportLabel.SUPPORTED],
    ["fixture-fact-hypothesis", SupportLabel.HYPOTHESIS],
  ]);

  // 1. Requires grounding but groundingUsed=false → NO_GROUNDING.
  const unused = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-no-ground",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: false,
  });
  if (unused.verdict === EvalCaseVerdict.NO_GROUNDING) {
    details.push("Grounding required but unused → NO_GROUNDING");
  } else {
    passed = false;
    details.push(`Unused grounding verdict unexpectedly ${unused.verdict}`);
  }

  // 2. HYPOTHESIS-only citations → NO_GROUNDING.
  const hypo = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-hypo",
      prompt: "Claim",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hypothesis"],
    factLabels: labels,
    groundingUsed: true,
  });
  if (
    hypo.verdict === EvalCaseVerdict.NO_GROUNDING &&
    hypo.supportedCitedFactIds.length === 0
  ) {
    details.push("HYPOTHESIS-only citations → NO_GROUNDING");
  } else {
    passed = false;
    details.push(`Hypothesis-only verdict unexpectedly ${hypo.verdict}`);
  }

  // 3. Positive control: SUPPORTED + groundingUsed → PASS.
  const ok = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-pass",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: true,
  });
  if (ok.verdict === EvalCaseVerdict.PASS) {
    details.push("SUPPORTED citations with grounding → PASS");
  } else {
    passed = false;
    details.push(`Positive control verdict unexpectedly ${ok.verdict}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-no-ground-${randomUUID()}`,
    kind: SoakProofKind.EVAL_NO_GROUNDING_FAIL_CLOSED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-x038-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
