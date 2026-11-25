/**
 * Fixture proof for T-X038 — grounded eval without grounding fails closed.
 *
 * adjudicateGroundedEvalCase returns NO_GROUNDING when grounding is required
 * but unused, or when only HYPOTHESIS/UNKNOWN/empty citations are present.
 * Claimed PASS while unmet is refused. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  EvalCaseVerdict,
  SoakProofKind,
  SupportLabel,
  adjudicateGroundedEvalCase,
  evalLiveWiringStatus,
  normalizeGroundingUsed,
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
    ["fixture-fact-unknown", SupportLabel.UNKNOWN],
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

  // 4. Empty citations → NO_GROUNDING (cannot invent grounding).
  const empty = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-empty",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: [],
    factLabels: labels,
    groundingUsed: true,
  });
  if (empty.verdict === EvalCaseVerdict.NO_GROUNDING) {
    details.push("Empty citations → NO_GROUNDING");
  } else {
    passed = false;
    details.push(`Empty citations verdict unexpectedly ${empty.verdict}`);
  }

  // 5. UNKNOWN-only citations → NO_GROUNDING.
  const unk = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-unk",
      prompt: "Claim",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-unknown"],
    factLabels: labels,
    groundingUsed: true,
  });
  if (unk.verdict === EvalCaseVerdict.NO_GROUNDING) {
    details.push("UNKNOWN-only citations → NO_GROUNDING");
  } else {
    passed = false;
    details.push(`UNKNOWN-only verdict unexpectedly ${unk.verdict}`);
  }

  // 6. Claimed PASS while grounding unused → still NO_GROUNDING.
  const claimed = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-claim",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: false,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    claimed.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimed.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push("Claimed PASS while unused → FALSE_GROUNDED_PASS_REFUSED");
  } else {
    passed = false;
    details.push(
      `Claimed PASS refuse unexpectedly verdict=${claimed.verdict} reasons=${claimed.reasons.join("|")}`,
    );
  }

  // 7. Truthy / non-literal aliases never invent groundingUsed.
  if (
    normalizeGroundingUsed(1) === false &&
    normalizeGroundingUsed("yes") === false &&
    normalizeGroundingUsed("TRUE") === false &&
    normalizeGroundingUsed(" true ") === false &&
    normalizeGroundingUsed("true") === true &&
    normalizeGroundingUsed(true) === true &&
    evalLiveWiringStatus() === "NOT_WIRED"
  ) {
    details.push(
      "normalizeGroundingUsed literal-only fail-closed; evalLiveWiringStatus=NOT_WIRED",
    );
  } else {
    passed = false;
    details.push("Expected fail-closed groundingUsed normalize + NOT_WIRED");
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
