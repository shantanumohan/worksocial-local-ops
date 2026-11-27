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

  // 8. Numeric groundingUsed with SUPPORTED citations → still NO_GROUNDING.
  const numericGround = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-num-ground",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: 1,
  });
  if (
    numericGround.verdict === EvalCaseVerdict.NO_GROUNDING &&
    numericGround.groundingUsed === false
  ) {
    details.push(
      "Numeric groundingUsed=1 with SUPPORTED cites → NO_GROUNDING (no truthy invent)",
    );
  } else {
    passed = false;
    details.push(
      `Numeric groundingUsed unexpectedly verdict=${numericGround.verdict}`,
    );
  }

  // 9. Claimed PASS on HYPOTHESIS-only → FALSE_GROUNDED_PASS_REFUSED.
  const claimedHypo = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-claim-hypo",
      prompt: "Claim",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hypothesis"],
    factLabels: labels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    claimedHypo.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedHypo.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      "Claimed PASS on HYPOTHESIS-only → FALSE_GROUNDED_PASS_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Claimed HYPOTHESIS PASS refuse unexpectedly reasons=${claimedHypo.reasons.join("|")}`,
    );
  }

  // 10. String alias "TRUE" groundingUsed → NO_GROUNDING despite SUPPORTED cites.
  const aliasGround = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-alias-ground",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "TRUE",
  });
  if (
    aliasGround.verdict === EvalCaseVerdict.NO_GROUNDING &&
    aliasGround.groundingUsed === false
  ) {
    details.push(
      'String groundingUsed="TRUE" with SUPPORTED cites → NO_GROUNDING (no case fold)',
    );
  } else {
    passed = false;
    details.push(`Alias TRUE grounding unexpectedly verdict=${aliasGround.verdict}`);
  }

  // 11. Claimed PASS with empty citations → FALSE_GROUNDED_PASS_REFUSED.
  const claimedEmpty = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-claim-empty",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: [],
    factLabels: labels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    claimedEmpty.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedEmpty.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      "Claimed PASS with empty citations → FALSE_GROUNDED_PASS_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Claimed empty PASS refuse unexpectedly reasons=${claimedEmpty.reasons.join("|")}`,
    );
  }

  // 12. Null / padded literal groundingUsed never invent use (T-X038 N3).
  const nullGround = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-null-ground",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: null,
  });
  const paddedGround = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-padded-ground",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: " true ",
  });
  if (
    nullGround.verdict === EvalCaseVerdict.NO_GROUNDING &&
    nullGround.groundingUsed === false &&
    paddedGround.verdict === EvalCaseVerdict.NO_GROUNDING &&
    paddedGround.groundingUsed === false
  ) {
    details.push(
      'groundingUsed null and padded " true " → NO_GROUNDING (no trim invent)',
    );
  } else {
    passed = false;
    details.push("Null/padded groundingUsed unexpectedly passed normalize");
  }

  // 13. Claimed PASS on UNKNOWN-only → FALSE_GROUNDED_PASS_REFUSED.
  const claimedUnknown = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-claim-unk",
      prompt: "Claim",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-unknown"],
    factLabels: labels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    claimedUnknown.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedUnknown.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      "Claimed PASS on UNKNOWN-only → FALSE_GROUNDED_PASS_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Claimed UNKNOWN PASS refuse unexpectedly reasons=${claimedUnknown.reasons.join("|")}`,
    );
  }

  // 14. "yes" alias groundingUsed → NO_GROUNDING (T-X038 N4).
  const yesAlias = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-yes-ground",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "yes",
  });
  if (
    yesAlias.verdict === EvalCaseVerdict.NO_GROUNDING &&
    yesAlias.groundingUsed === false
  ) {
    details.push(
      'groundingUsed="yes" with SUPPORTED cites → NO_GROUNDING (no synonym invent)',
    );
  } else {
    passed = false;
    details.push(`Yes-alias grounding unexpectedly verdict=${yesAlias.verdict}`);
  }

  labels.set("fixture-fact-missing", SupportLabel.SUPPORTED);

  // 15. Claimed PASS with missing expected SUPPORTED → FAIL (no upgrade).
  const claimedMissingExpected = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-missing-expected",
      prompt: "Full answer",
      expectedFactIds: ["fixture-fact-hours", "fixture-fact-missing"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    claimedMissingExpected.verdict === EvalCaseVerdict.FAIL &&
    claimedMissingExpected.groundingUsed === true &&
    claimedMissingExpected.reasons.some((r) =>
      /Missing expected SUPPORTED/.test(r),
    )
  ) {
    details.push(
      "Claimed PASS with missing expected SUPPORTED → FAIL (no grounded pass invent)",
    );
  } else {
    passed = false;
    details.push(
      `Missing-expected claimed PASS unexpectedly verdict=${claimedMissingExpected.verdict}`,
    );
  }

  // 16. Numeric zero and Titlecase "True" never invent groundingUsed (N5).
  const zeroGround = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-zero-ground",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: 0,
  });
  const titleTrue = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-title-true",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "True",
  });
  if (
    zeroGround.verdict === EvalCaseVerdict.NO_GROUNDING &&
    zeroGround.groundingUsed === false &&
    titleTrue.verdict === EvalCaseVerdict.NO_GROUNDING &&
    titleTrue.groundingUsed === false
  ) {
    details.push(
      'groundingUsed=0 and "True" Titlecase → NO_GROUNDING (literal-only)',
    );
  } else {
    passed = false;
    details.push("Zero/Titlecase groundingUsed unexpectedly accepted");
  }

  // 17. undefined / empty-string groundingUsed → NO_GROUNDING (N6).
  const undefinedGround = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-undef-ground",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: undefined,
  });
  const emptyString = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-empty-str-ground",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "",
  });
  if (
    undefinedGround.verdict === EvalCaseVerdict.NO_GROUNDING &&
    emptyString.verdict === EvalCaseVerdict.NO_GROUNDING &&
    emptyString.groundingUsed === false
  ) {
    details.push(
      "groundingUsed undefined and empty string → NO_GROUNDING",
    );
  } else {
    passed = false;
    details.push("Undefined/empty-string groundingUsed unexpectedly accepted");
  }

  // 18. String "false" is not literal true; mixed SUPPORTED+HYPOTHESIS can PASS (N7).
  const stringFalse = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-str-false",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "false",
  });
  const mixedPass = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-mixed-pass",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours", "fixture-fact-hypothesis"],
    factLabels: labels,
    groundingUsed: true,
  });
  if (
    stringFalse.verdict === EvalCaseVerdict.NO_GROUNDING &&
    stringFalse.groundingUsed === false &&
    mixedPass.verdict === EvalCaseVerdict.PASS &&
    mixedPass.supportedCitedFactIds.includes("fixture-fact-hours")
  ) {
    details.push(
      'groundingUsed="false" → NO_GROUNDING; SUPPORTED+HYPOTHESIS mixed → PASS when expected met',
    );
  } else {
    passed = false;
    details.push(
      `N7 string-false/mixed-pass unexpectedly false=${stringFalse.verdict} mixed=${mixedPass.verdict}`,
    );
  }

  // 19. Claimed PASS on missing expected → FAIL (no FALSE_GROUNDED on FAIL path) N8.
  const claimedFail = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-claim-fail",
      prompt: "Full answer",
      expectedFactIds: ["fixture-fact-hours", "fixture-fact-missing"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    claimedFail.verdict === EvalCaseVerdict.FAIL &&
    claimedFail.reasons.some((r) => /Missing expected SUPPORTED/.test(r)) &&
    !claimedFail.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      "Claimed PASS on missing expected → FAIL (distinct from NO_GROUNDING refuse)",
    );
  } else {
    passed = false;
    details.push(`Claimed FAIL-path honesty unexpected verdict=${claimedFail.verdict}`);
  }

  // 20. String "1" alias + unlabeled fact id → NO_GROUNDING (N9 wipe15).
  const stringOne = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-str-one",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "1",
  });
  const missingLabel = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-missing-label",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-unlabeled"],
    factLabels: labels,
    groundingUsed: true,
  });
  if (
    stringOne.verdict === EvalCaseVerdict.NO_GROUNDING &&
    missingLabel.verdict === EvalCaseVerdict.NO_GROUNDING &&
    missingLabel.supportedCitedFactIds.length === 0
  ) {
    details.push(
      'groundingUsed="1" string and unlabeled cite → NO_GROUNDING',
    );
  } else {
    passed = false;
    details.push("N9 string-one/unlabeled unexpectedly passed");
  }

  // 21. Boolean false grounding + duplicate SUPPORTED cites (N10 post-#240).
  const boolFalse = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-bool-false",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: false,
  });
  const dupCites = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-dup-cites",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours", "fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: true,
  });
  if (
    boolFalse.verdict === EvalCaseVerdict.NO_GROUNDING &&
    dupCites.verdict === EvalCaseVerdict.PASS
  ) {
    details.push(
      "boolean groundingUsed=false → NO_GROUNDING; duplicate SUPPORTED cites → PASS",
    );
  } else {
    passed = false;
    details.push(
      `N10 bool-false/dup-cites unexpectedly false=${boolFalse.verdict} dup=${dupCites.verdict}`,
    );
  }

  // 22. Padded TRUE alias + empty expectedFactIds with SUPPORTED (N11 post-#241).
  const paddedTrue = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-padded-true",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "TRUE ",
  });
  const noExpected = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-no-expected",
      prompt: "Optional detail",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: true,
  });
  if (
    paddedTrue.verdict === EvalCaseVerdict.NO_GROUNDING &&
    noExpected.verdict === EvalCaseVerdict.PASS
  ) {
    details.push(
      'groundingUsed="TRUE " padded → NO_GROUNDING; empty expectedFactIds + SUPPORTED → PASS',
    );
  } else {
    passed = false;
    details.push(
      `N11 padded-true/no-expected unexpectedly padded=${paddedTrue.verdict} empty=${noExpected.verdict}`,
    );
  }

  // 23. "on" alias + claimed PASS on FAIL path stays FAIL without FALSE_GROUNDED (N12).
  const onAlias = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-on-alias",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "on",
  });
  labels.set("fixture-fact-missing", SupportLabel.SUPPORTED);
  const claimedStillFail = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-claimed-still-fail",
      prompt: "Full",
      expectedFactIds: ["fixture-fact-hours", "fixture-fact-missing"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    onAlias.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedStillFail.verdict === EvalCaseVerdict.FAIL &&
    !claimedStillFail.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="on" → NO_GROUNDING; claimed PASS on FAIL path → FAIL (no FALSE_GROUNDED)',
    );
  } else {
    passed = false;
    details.push("N12 on-alias/claimed-still-fail unexpectedly passed");
  }

  // 24. Titlecase "False" alias + claimed PASS on HYPOTHESIS+UNKNOWN mix (N13).
  const titleFalse = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-title-false",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "False",
  });
  const claimedMixedWeak = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-claim-mixed-weak",
      prompt: "Claim",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hypothesis", "fixture-fact-unknown"],
    factLabels: labels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    titleFalse.verdict === EvalCaseVerdict.NO_GROUNDING &&
    titleFalse.groundingUsed === false &&
    claimedMixedWeak.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedMixedWeak.supportedCitedFactIds.length === 0 &&
    claimedMixedWeak.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="False" → NO_GROUNDING; claimed PASS on HYPOTHESIS+UNKNOWN → FALSE_GROUNDED',
    );
  } else {
    passed = false;
    details.push("N13 Titlecase-False/mixed-weak-claim unexpectedly failed");
  }

  // 25. "off" alias + claimed PASS on duplicate HYPOTHESIS-only cites (N14).
  const offAlias = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-off-alias",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "off",
  });
  labels.set("fixture-fact-hypothesis-b", SupportLabel.HYPOTHESIS);
  const claimedDupHypo = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-dup-hypo-claim",
      prompt: "Guess",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hypothesis", "fixture-fact-hypothesis-b"],
    factLabels: labels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    offAlias.verdict === EvalCaseVerdict.NO_GROUNDING &&
    offAlias.groundingUsed === false &&
    claimedDupHypo.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedDupHypo.supportedCitedFactIds.length === 0 &&
    claimedDupHypo.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="off" → NO_GROUNDING; claimed PASS on duplicate HYPOTHESIS → FALSE_GROUNDED',
    );
  } else {
    passed = false;
    details.push("N14 off-alias/dup-hypo-claim unexpectedly failed");
  }

  // 26. "ENABLED" alias + claimed PASS on duplicate UNKNOWN-only cites (N15).
  const enabledAlias = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-enabled-alias",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "ENABLED",
  });
  labels.set("fixture-fact-unknown-b", SupportLabel.UNKNOWN);
  const claimedDupUnknown = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-dup-unk-claim",
      prompt: "Guess",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-unknown", "fixture-fact-unknown-b"],
    factLabels: labels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    enabledAlias.verdict === EvalCaseVerdict.NO_GROUNDING &&
    enabledAlias.groundingUsed === false &&
    claimedDupUnknown.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedDupUnknown.supportedCitedFactIds.length === 0 &&
    claimedDupUnknown.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="ENABLED" → NO_GROUNDING; claimed PASS on duplicate UNKNOWN → FALSE_GROUNDED',
    );
  } else {
    passed = false;
    details.push("N15 ENABLED-alias/dup-unknown-claim unexpectedly failed");
  }

  // 27. "DISABLED" alias + string "2" groundingUsed (N16).
  const disabledAlias = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-disabled-alias",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "DISABLED",
  });
  const stringTwo = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-str-two",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "2",
  });
  if (
    disabledAlias.verdict === EvalCaseVerdict.NO_GROUNDING &&
    disabledAlias.groundingUsed === false &&
    stringTwo.verdict === EvalCaseVerdict.NO_GROUNDING &&
    stringTwo.groundingUsed === false &&
    normalizeGroundingUsed("2") === false
  ) {
    details.push(
      'groundingUsed="DISABLED" / "2" → NO_GROUNDING (no truthy string invent)',
    );
  } else {
    passed = false;
    details.push("N16 DISABLED/string-two unexpectedly failed");
  }

  // 28. Lowercase enabled/disabled + wrong SUPPORTED cite claimed PASS → FAIL (N17).
  const lowerEnabled = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-lower-enabled",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "enabled",
  });
  const lowerDisabled = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-lower-disabled",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "disabled",
  });
  labels.set("fixture-fact-alt", SupportLabel.SUPPORTED);
  const wrongSupported = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-wrong-supported",
      prompt: "Need alt fact",
      expectedFactIds: ["fixture-fact-alt"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    lowerEnabled.verdict === EvalCaseVerdict.NO_GROUNDING &&
    lowerDisabled.verdict === EvalCaseVerdict.NO_GROUNDING &&
    wrongSupported.verdict === EvalCaseVerdict.FAIL &&
    !wrongSupported.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="enabled"/"disabled" → NO_GROUNDING; wrong SUPPORTED cite claimed PASS → FAIL',
    );
  } else {
    passed = false;
    details.push("N17 lower-alias/wrong-supported unexpectedly failed");
  }

  // 29. "ON" alias + "null" string + claimed PASS unlabeled cite (N18).
  const onUpper = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-on-upper",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "ON",
  });
  const stringNull = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-str-null",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "null",
  });
  const claimedUnlabeled = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-claim-unlabeled",
      prompt: "Hours?",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-no-label"],
    factLabels: labels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    onUpper.verdict === EvalCaseVerdict.NO_GROUNDING &&
    stringNull.verdict === EvalCaseVerdict.NO_GROUNDING &&
    stringNull.groundingUsed === false &&
    claimedUnlabeled.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedUnlabeled.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="ON"/"null" → NO_GROUNDING; claimed PASS on unlabeled cite → FALSE_GROUNDED',
    );
  } else {
    passed = false;
    details.push("N18 ON-null/unlabeled-claim unexpectedly failed");
  }

  // 30. "OFF"/"undefined" + claimed PASS hypo+unlabeled (N19).
  const offUpper = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-off-upper",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "OFF",
  });
  const stringUndef = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-str-undefined",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "undefined",
  });
  const claimedHypoUnlabeled = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-hypo-unlabeled",
      prompt: "Guess",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hypothesis", "fixture-fact-no-label"],
    factLabels: labels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    offUpper.verdict === EvalCaseVerdict.NO_GROUNDING &&
    stringUndef.groundingUsed === false &&
    claimedHypoUnlabeled.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedHypoUnlabeled.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="OFF"/"undefined" → NO_GROUNDING; claimed PASS hypo+unlabeled → FALSE_GROUNDED',
    );
  } else {
    passed = false;
    details.push("N19 OFF-undefined/hypo-unlabeled unexpectedly failed");
  }

  // 31. "YES"/"NO" aliases + triplicate SUPPORTED cite PASS (N20).
  const yesUpperAlias = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-yes-alias",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "YES",
  });
  const noUpperAlias = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-no-alias",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "NO",
  });
  const triplicate = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-triplicate",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: [
      "fixture-fact-hours",
      "fixture-fact-hours",
      "fixture-fact-hours",
    ],
    factLabels: labels,
    groundingUsed: true,
  });
  if (
    yesUpperAlias.verdict === EvalCaseVerdict.NO_GROUNDING &&
    noUpperAlias.verdict === EvalCaseVerdict.NO_GROUNDING &&
    triplicate.verdict === EvalCaseVerdict.PASS &&
    triplicate.supportedCitedFactIds.length === 3
  ) {
    details.push(
      'groundingUsed="YES"/"NO" → NO_GROUNDING; triplicate SUPPORTED cites → PASS',
    );
  } else {
    passed = false;
    details.push("N20 YES-NO/triplicate unexpectedly failed");
  }

  // 32. Padded "false " + claimed PASS triple HYPOTHESIS (N21).
  const paddedFalse = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-padded-false",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "false ",
  });
  labels.set("fixture-fact-hypothesis-b", SupportLabel.HYPOTHESIS);
  labels.set("fixture-fact-hypothesis-c", SupportLabel.HYPOTHESIS);
  const claimedTripleHypo = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-triple-hypo",
      prompt: "Guess",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: [
      "fixture-fact-hypothesis",
      "fixture-fact-hypothesis-b",
      "fixture-fact-hypothesis-c",
    ],
    factLabels: labels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    paddedFalse.verdict === EvalCaseVerdict.NO_GROUNDING &&
    paddedFalse.groundingUsed === false &&
    claimedTripleHypo.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedTripleHypo.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="false " padded → NO_GROUNDING; claimed PASS triple HYPOTHESIS → FALSE_GROUNDED',
    );
  } else {
    passed = false;
    details.push("N21 padded-false/triple-hypo unexpectedly failed");
  }

  // 33. "1.0" decimal alias + SUPPORTED+UNKNOWN expected-met PASS (N22).
  const decimalAlias = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-decimal-ground",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "1.0",
  });
  const supportedPlusUnknown = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-sup-unk-pass",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours", "fixture-fact-unknown"],
    factLabels: labels,
    groundingUsed: true,
  });
  if (
    decimalAlias.verdict === EvalCaseVerdict.NO_GROUNDING &&
    decimalAlias.groundingUsed === false &&
    supportedPlusUnknown.verdict === EvalCaseVerdict.PASS &&
    supportedPlusUnknown.supportedCitedFactIds.length === 1
  ) {
    details.push(
      'groundingUsed="1.0" → NO_GROUNDING; SUPPORTED+UNKNOWN extra cite expected-met → PASS',
    );
  } else {
    passed = false;
    details.push("N22 decimal/sup-unk-pass unexpectedly failed");
  }

  // 34. "-1"/"0.0"/leading-space " true" aliases (N23).
  const negOne = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-neg-one",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "-1",
  });
  const zeroDecimal = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-zero-decimal",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "0.0",
  });
  const leadSpaceTrue = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-lead-true",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: " true",
  });
  if (
    negOne.verdict === EvalCaseVerdict.NO_GROUNDING &&
    zeroDecimal.verdict === EvalCaseVerdict.NO_GROUNDING &&
    leadSpaceTrue.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed(" true") === false &&
    evalLiveWiringStatus() === "NOT_WIRED"
  ) {
    details.push(
      'groundingUsed="-1"/"0.0"/" true" → NO_GROUNDING; NOT_WIRED unchanged',
    );
  } else {
    passed = false;
    details.push("N23 neg-zero-leadtrue unexpectedly failed");
  }

  // 35. "FALSE" alias + claimed PASS triple UNKNOWN (N24 wipe15).
  const falseUpper = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-false-upper",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "FALSE",
  });
  labels.set("fixture-fact-unknown-b", SupportLabel.UNKNOWN);
  labels.set("fixture-fact-unknown-c", SupportLabel.UNKNOWN);
  const claimedTripleUnknown = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-triple-unk",
      prompt: "Guess",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: [
      "fixture-fact-unknown",
      "fixture-fact-unknown-b",
      "fixture-fact-unknown-c",
    ],
    factLabels: labels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    falseUpper.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedTripleUnknown.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedTripleUnknown.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="FALSE" → NO_GROUNDING; claimed PASS triple UNKNOWN → FALSE_GROUNDED',
    );
  } else {
    passed = false;
    details.push("N24 FALSE/triple-unknown unexpectedly failed");
  }

  // 36. "true " padded + "T" char + quad HYPOTHESIS claim (N25 wipe15).
  const paddedTrueTrailing = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-true-trail",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "true ",
  });
  const singleCharT = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-char-t",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "T",
  });
  const quadHypoLabels = new Map([
    ["h1", SupportLabel.HYPOTHESIS],
    ["h2", SupportLabel.HYPOTHESIS],
    ["h3", SupportLabel.HYPOTHESIS],
    ["h4", SupportLabel.HYPOTHESIS],
  ]);
  const claimedQuadHypo = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-quad-hypo",
      prompt: "Guess",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["h1", "h2", "h3", "h4"],
    factLabels: quadHypoLabels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    paddedTrueTrailing.verdict === EvalCaseVerdict.NO_GROUNDING &&
    singleCharT.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("T") === false &&
    claimedQuadHypo.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedQuadHypo.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="true "/"T" → NO_GROUNDING; claimed PASS quad HYPOTHESIS → FALSE_GROUNDED',
    );
  } else {
    passed = false;
    details.push("N25 padded-true/quad-hypo unexpectedly failed");
  }

  // 37. "f" char alias + claimed PASS on HYPOTHESIS-mislabeled hours id (N26).
  const charF = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-char-f",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "f",
  });
  const misTaggedLabels = new Map([
    ["fixture-fact-hours", SupportLabel.HYPOTHESIS],
  ]);
  const claimedMisTagged = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-mis-tagged",
      prompt: "What are hours?",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: misTaggedLabels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    charF.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedMisTagged.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedMisTagged.supportedCitedFactIds.length === 0 &&
    claimedMisTagged.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="f" → NO_GROUNDING; claimed PASS on mis-tagged cite → FALSE_GROUNDED',
    );
  } else {
    passed = false;
    details.push("N26 char-f/mis-tagged unexpectedly failed");
  }

  // 38. y/n char aliases + claimed PASS on wrong SUPPORTED cite id (N27).
  const charY = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-char-y",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "y",
  });
  const charN = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-char-n",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "n",
  });
  const swapLabels = new Map([
    ["fixture-fact-hours", SupportLabel.SUPPORTED],
    ["fixture-fact-missing", SupportLabel.SUPPORTED],
  ]);
  const claimedWrongSupported = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-wrong-supported",
      prompt: "Which fact?",
      expectedFactIds: ["fixture-fact-missing"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: swapLabels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    charY.verdict === EvalCaseVerdict.NO_GROUNDING &&
    charN.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedWrongSupported.verdict === EvalCaseVerdict.FAIL &&
    !claimedWrongSupported.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="y"/"n" → NO_GROUNDING; claimed PASS wrong SUPPORTED cite → FAIL',
    );
  } else {
    passed = false;
    details.push("N27 y/n/wrong-supported unexpectedly failed");
  }

  // 39. lowercase "t" alias + claimed PASS on dual UNKNOWN cites (N28 wipe15).
  const lowerT = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-char-t-lower",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "t",
  });
  const dualUnknownLabels = new Map([
    ["u1", SupportLabel.UNKNOWN],
    ["u2", SupportLabel.UNKNOWN],
  ]);
  const claimedDualUnknown = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-dual-unknown",
      prompt: "Guess",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["u1", "u2"],
    factLabels: dualUnknownLabels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    lowerT.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("t") === false &&
    claimedDualUnknown.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedDualUnknown.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="t" → NO_GROUNDING; claimed PASS dual UNKNOWN → FALSE_GROUNDED',
    );
  } else {
    passed = false;
    details.push("N28 lower-t/dual-unknown unexpectedly failed");
  }

  // 40. "F" char alias + claimed PASS citing HYPOTHESIS-labeled id (N29 post-#252).
  const charFUpper = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-char-f-upper",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "F",
  });
  const hypoExpectedLabels = new Map([
    ["fixture-fact-missing", SupportLabel.HYPOTHESIS],
  ]);
  const claimedHypoExpected = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-hypo-expected-id",
      prompt: "Which?",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-missing"],
    factLabels: hypoExpectedLabels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    charFUpper.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedHypoExpected.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedHypoExpected.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="F" → NO_GROUNDING; claimed PASS hypo-labeled cite → FALSE_GROUNDED',
    );
  } else {
    passed = false;
    details.push("N29 F-upper/hypo-expected unexpectedly failed");
  }

  // 41. padded "n " alias + claimed PASS hypo+UNKNOWN pair (N30 post-#253).
  const paddedN = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-n-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "n ",
  });
  const hypoUnknownLabels = new Map([
    ["h1", SupportLabel.HYPOTHESIS],
    ["u1", SupportLabel.UNKNOWN],
  ]);
  const claimedHypoUnknown = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-hypo-unknown-pair",
      prompt: "Mixed",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["h1", "u1"],
    factLabels: hypoUnknownLabels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    paddedN.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("n ") === false &&
    claimedHypoUnknown.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedHypoUnknown.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="n " → NO_GROUNDING; claimed PASS hypo+UNKNOWN pair → FALSE_GROUNDED',
    );
  } else {
    passed = false;
    details.push("N30 padded-n/hypo-unknown unexpectedly failed");
  }

  // 42. Y / padded y aliases + duplicate SUPPORTED positive (N31 wipe15).
  const charYUpper = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-char-y-upper",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "Y",
  });
  const paddedY = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-y-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: " y ",
  });
  const dupSupportedN31 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-dup-supported-n31",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours", "fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: true,
  });
  if (
    charYUpper.verdict === EvalCaseVerdict.NO_GROUNDING &&
    paddedY.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed(" y ") === false &&
    dupSupportedN31.verdict === EvalCaseVerdict.PASS &&
    dupSupportedN31.supportedCitedFactIds.length === 2
  ) {
    details.push(
      'groundingUsed="Y"/" y " → NO_GROUNDING; duplicate SUPPORTED cites → PASS',
    );
  } else {
    passed = false;
    details.push("N31 Y-pad/dup-supported unexpectedly failed");
  }

  // 43. "o" char alias + claimed PASS hypo-only vs expected hours (N32 post-#254).
  const charO = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-char-o",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "o",
  });
  const claimedHypoOnly = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-hypo-only-expected-hours",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hypothesis"],
    factLabels: labels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    charO.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedHypoOnly.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedHypoOnly.supportedCitedFactIds.length === 0 &&
    claimedHypoOnly.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="o" → NO_GROUNDING; claimed PASS hypo-only vs expected → FALSE_GROUNDED',
    );
  } else {
    passed = false;
    details.push("N32 o/hypo-only-expected unexpectedly failed");
  }

  // 44. padded "0 " alias + claimed PASS quad UNKNOWN (N33 post-#255).
  const paddedZero = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-zero-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "0 ",
  });
  const quadUnknownLabels = new Map([
    ["u1", SupportLabel.UNKNOWN],
    ["u2", SupportLabel.UNKNOWN],
    ["u3", SupportLabel.UNKNOWN],
    ["u4", SupportLabel.UNKNOWN],
  ]);
  const claimedQuadUnknown = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-quad-unknown",
      prompt: "Guess",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["u1", "u2", "u3", "u4"],
    factLabels: quadUnknownLabels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    paddedZero.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("0 ") === false &&
    claimedQuadUnknown.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedQuadUnknown.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="0 " → NO_GROUNDING; claimed PASS quad UNKNOWN → FALSE_GROUNDED',
    );
  } else {
    passed = false;
    details.push("N33 zero-pad/quad-unknown unexpectedly failed");
  }

  // 45. padded "NO " alias + claimed PASS pent UNKNOWN (N34 wipe15 retrain).
  const paddedNo = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-no-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "NO ",
  });
  const pentUnknownLabels = new Map([
    ["u1", SupportLabel.UNKNOWN],
    ["u2", SupportLabel.UNKNOWN],
    ["u3", SupportLabel.UNKNOWN],
    ["u4", SupportLabel.UNKNOWN],
    ["u5", SupportLabel.UNKNOWN],
  ]);
  const claimedPentUnknown = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-pent-unknown",
      prompt: "Guess",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["u1", "u2", "u3", "u4", "u5"],
    factLabels: pentUnknownLabels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    paddedNo.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("NO ") === false &&
    claimedPentUnknown.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedPentUnknown.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="NO " → NO_GROUNDING; claimed PASS pent UNKNOWN → FALSE_GROUNDED',
    );
  } else {
    passed = false;
    details.push("N34 NO-pad/pent-unknown unexpectedly failed");
  }

  // 46. "enabled " alias + triplicate SUPPORTED pass (N35 post-#256).
  const enabledPad = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-enabled-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "enabled ",
  });
  const triplicateSupportedN35 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-triplicate-supported-n35",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours", "fixture-fact-hours", "fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: true,
  });
  if (
    enabledPad.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("enabled ") === false &&
    triplicateSupportedN35.verdict === EvalCaseVerdict.PASS &&
    triplicateSupportedN35.supportedCitedFactIds.length === 3
  ) {
    details.push(
      'groundingUsed="enabled " → NO_GROUNDING; triplicate SUPPORTED cites → PASS',
    );
  } else {
    passed = false;
    details.push("N35 enabled-pad/triplicate-supported unexpectedly failed");
  }

  // 47. "off " alias + claimed PASS missing hours in cites (N36 post-#257).
  const offPad = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-off-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "off ",
  });
  const bothSupportedN36 = new Map([
    ["fixture-fact-hours", SupportLabel.SUPPORTED],
    ["fixture-fact-missing", SupportLabel.SUPPORTED],
  ]);
  const claimedMissingHours = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-missing-hours-cite",
      prompt: "Full",
      expectedFactIds: ["fixture-fact-hours", "fixture-fact-missing"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-missing"],
    factLabels: bothSupportedN36,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    offPad.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("off ") === false &&
    claimedMissingHours.verdict === EvalCaseVerdict.FAIL &&
    !claimedMissingHours.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="off " → NO_GROUNDING; claimed PASS missing hours cite → FAIL',
    );
  } else {
    passed = false;
    details.push("N36 off-pad/missing-hours unexpectedly failed");
  }

  // 48. "on " alias + SUPPORTED+UNKNOWN pass (N37 wipe15 retrain).
  const onPad = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-on-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "on ",
  });
  const hoursUnknownN37 = new Map([
    ["fixture-fact-hours", SupportLabel.SUPPORTED],
    ["fixture-fact-unknown", SupportLabel.UNKNOWN],
  ]);
  const supportedPlusUnknownN37 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-sup-unk-n37",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours", "fixture-fact-unknown"],
    factLabels: hoursUnknownN37,
    groundingUsed: true,
  });
  if (
    onPad.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("on ") === false &&
    supportedPlusUnknownN37.verdict === EvalCaseVerdict.PASS &&
    supportedPlusUnknownN37.supportedCitedFactIds.length === 1
  ) {
    details.push(
      'groundingUsed="on " → NO_GROUNDING; SUPPORTED+UNKNOWN extra cite → PASS',
    );
  } else {
    passed = false;
    details.push("N37 on-pad/sup-unk unexpectedly failed");
  }

  // 49. "FALSE " alias + claimed PASS pent HYPOTHESIS (N38 post-#258).
  const falsePad = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-false-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "FALSE ",
  });
  const pentHypoLabels = new Map([
    ["h1", SupportLabel.HYPOTHESIS],
    ["h2", SupportLabel.HYPOTHESIS],
    ["h3", SupportLabel.HYPOTHESIS],
    ["h4", SupportLabel.HYPOTHESIS],
    ["h5", SupportLabel.HYPOTHESIS],
  ]);
  const claimedPentHypo = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-pent-hypo",
      prompt: "Guess",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["h1", "h2", "h3", "h4", "h5"],
    factLabels: pentHypoLabels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    falsePad.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("FALSE ") === false &&
    claimedPentHypo.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedPentHypo.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="FALSE " → NO_GROUNDING; claimed PASS pent HYPOTHESIS → FALSE_GROUNDED',
    );
  } else {
    passed = false;
    details.push("N38 FALSE-pad/pent-hypo unexpectedly failed");
  }

  // 50. "yes " alias + claimed PASS duplicate HYPOTHESIS (N39 wipe15 retrain).
  const yesPad = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-yes-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "yes ",
  });
  const dupHypoLabels = new Map([
    ["h1", SupportLabel.HYPOTHESIS],
    ["h2", SupportLabel.HYPOTHESIS],
  ]);
  const claimedDupHypoN39 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-dup-hypo-n39",
      prompt: "Guess",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["h1", "h2"],
    factLabels: dupHypoLabels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    yesPad.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("yes ") === false &&
    claimedDupHypoN39.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedDupHypoN39.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="yes " → NO_GROUNDING; claimed PASS dup HYPOTHESIS → FALSE_GROUNDED',
    );
  } else {
    passed = false;
    details.push("N39 yes-pad/dup-hypo unexpectedly failed");
  }

  // 51. "disabled " alias + claimed PASS triple UNKNOWN (N40 post-#259).
  const disabledPad = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-disabled-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "disabled ",
  });
  const tripleUnknownN40 = new Map([
    ["u1", SupportLabel.UNKNOWN],
    ["u2", SupportLabel.UNKNOWN],
    ["u3", SupportLabel.UNKNOWN],
  ]);
  const claimedTripleUnknownN40 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-triple-unk-n40",
      prompt: "Guess",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["u1", "u2", "u3"],
    factLabels: tripleUnknownN40,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    disabledPad.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("disabled ") === false &&
    claimedTripleUnknownN40.verdict === EvalCaseVerdict.NO_GROUNDING &&
    claimedTripleUnknownN40.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))
  ) {
    details.push(
      'groundingUsed="disabled " → NO_GROUNDING; claimed PASS triple UNKNOWN → FALSE_GROUNDED',
    );
  } else {
    passed = false;
    details.push("N40 disabled-pad/triple-unk unexpectedly failed");
  }

  // 52. "1 " alias + empty-expected SUPPORTED pass (N41 wipe15 train).
  const onePad = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-one-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "1 ",
  });
  const emptyExpectedPassN41 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-empty-expected-pass-n41",
      prompt: "What are hours?",
      expectedFactIds: [],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: true,
  });
  if (
    onePad.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("1 ") === false &&
    emptyExpectedPassN41.verdict === EvalCaseVerdict.PASS &&
    emptyExpectedPassN41.groundingUsed === true
  ) {
    details.push(
      'groundingUsed="1 " → NO_GROUNDING; empty expected + SUPPORTED cite → PASS',
    );
  } else {
    passed = false;
    details.push("N41 one-pad/empty-expected-pass unexpectedly failed");
  }

  // 53. "2.0 " alias + claimed PASS full expected SUPPORTED set (N42 post-#260).
  const decimalPad = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-decimal-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "2.0 ",
  });
  const extendedN42 = new Map([
    ["fixture-fact-hours", SupportLabel.SUPPORTED],
    ["fixture-fact-missing", SupportLabel.SUPPORTED],
  ]);
  const claimedFullExpectedN42 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-full-expected-claim",
      prompt: "Full",
      expectedFactIds: ["fixture-fact-hours", "fixture-fact-missing"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours", "fixture-fact-missing"],
    factLabels: extendedN42,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    decimalPad.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("2.0 ") === false &&
    claimedFullExpectedN42.verdict === EvalCaseVerdict.PASS &&
    claimedFullExpectedN42.groundingUsed === true
  ) {
    details.push(
      'groundingUsed="2.0 " → NO_GROUNDING; claimed PASS full expected SUPPORTED → PASS',
    );
  } else {
    passed = false;
    details.push("N42 decimal-pad/full-expected unexpectedly failed");
  }

  // 54. "3.0 " alias + claimed PASS with missing expected cite (N43 wipe15 deepen).
  const triDecimalPad = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-tri-decimal-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "3.0 ",
  });
  const extendedN43 = new Map([
    ["fixture-fact-hours", SupportLabel.SUPPORTED],
    ["fixture-fact-missing", SupportLabel.SUPPORTED],
  ]);
  const claimedPartialExpectedN43 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-partial-expected-claim",
      prompt: "Partial",
      expectedFactIds: ["fixture-fact-hours", "fixture-fact-missing"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: extendedN43,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    triDecimalPad.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("3.0 ") === false &&
    claimedPartialExpectedN43.verdict === EvalCaseVerdict.FAIL
  ) {
    details.push(
      'groundingUsed="3.0 " → NO_GROUNDING; claimed PASS missing expected cite → FAIL',
    );
  } else {
    passed = false;
    details.push("N43 tri-decimal/partial-expected unexpectedly failed");
  }

  // 55. "4.0 " alias + claimed PASS triplicate SUPPORTED (N44 post-#261).
  const quadDecimalPad = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-quad-decimal-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "4.0 ",
  });
  const claimedTripleSupportedN44 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-triple-supported-pass",
      prompt: "Hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: [
      "fixture-fact-hours",
      "fixture-fact-hours",
      "fixture-fact-hours",
    ],
    factLabels: labels,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    quadDecimalPad.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("4.0 ") === false &&
    claimedTripleSupportedN44.verdict === EvalCaseVerdict.PASS &&
    claimedTripleSupportedN44.groundingUsed === true
  ) {
    details.push(
      'groundingUsed="4.0 " → NO_GROUNDING; claimed PASS triplicate SUPPORTED → PASS',
    );
  } else {
    passed = false;
    details.push("N44 quad-decimal/triple-supported unexpectedly failed");
  }

  // 56. greenfield I62 BIND @ f63907cf — "5.0 " alias + claimed PASS quad UNKNOWN.
  const pentaDecimalPadI62 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-penta-decimal-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "5.0 ",
  });
  const quadUnknownLabelsI62 = new Map([
    ["fixture-fact-a", SupportLabel.UNKNOWN],
    ["fixture-fact-b", SupportLabel.UNKNOWN],
    ["fixture-fact-c", SupportLabel.UNKNOWN],
    ["fixture-fact-d", SupportLabel.UNKNOWN],
  ]);
  const claimedQuadUnknownI62 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-quad-unknown-claim",
      prompt: "Unknown mix",
      expectedFactIds: ["fixture-fact-a"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: [
      "fixture-fact-a",
      "fixture-fact-b",
      "fixture-fact-c",
      "fixture-fact-d",
    ],
    factLabels: quadUnknownLabelsI62,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    pentaDecimalPadI62.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("5.0 ") === false &&
    claimedQuadUnknownI62.verdict === EvalCaseVerdict.NO_GROUNDING
  ) {
    details.push(
      'greenfield I62 BIND: groundingUsed="5.0 " → NO_GROUNDING; claimed PASS quad UNKNOWN → NO_GROUNDING (exclusive #280 Slot N)',
    );
  } else {
    passed = false;
    details.push("I62 penta-decimal/quad-unknown unexpectedly failed");
  }

  // 57. wipe15 I63 post-#280 — "6.0 " alias + claimed PASS penta HYPOTHESIS.
  const hexaDecimalPadI63 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-hexa-decimal-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "6.0 ",
  });
  const pentaHypothesisLabelsI63 = new Map([
    ["fixture-fact-h1", SupportLabel.HYPOTHESIS],
    ["fixture-fact-h2", SupportLabel.HYPOTHESIS],
    ["fixture-fact-h3", SupportLabel.HYPOTHESIS],
    ["fixture-fact-h4", SupportLabel.HYPOTHESIS],
    ["fixture-fact-h5", SupportLabel.HYPOTHESIS],
  ]);
  const claimedPentaHypothesisI63 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-penta-hypothesis-claim",
      prompt: "Hypothesis mix",
      expectedFactIds: ["fixture-fact-h1"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: [
      "fixture-fact-h1",
      "fixture-fact-h2",
      "fixture-fact-h3",
      "fixture-fact-h4",
      "fixture-fact-h5",
    ],
    factLabels: pentaHypothesisLabelsI63,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    hexaDecimalPadI63.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("6.0 ") === false &&
    claimedPentaHypothesisI63.verdict === EvalCaseVerdict.NO_GROUNDING
  ) {
    details.push(
      'wipe15 I63 tip-moved-280: groundingUsed="6.0 " → NO_GROUNDING; claimed PASS penta HYPOTHESIS → NO_GROUNDING (distinct from #280 T-X014)',
    );
  } else {
    passed = false;
    details.push("I63 hexa-decimal/penta-hypothesis unexpectedly failed");
  }

  // 58. wipe15 I64 post-#281 — "7.0 " alias + claimed PASS mixed hypo+unknown.
  const septDecimalPadI64 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-sept-decimal-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "7.0 ",
  });
  const mixedHypoUnknownI64 = new Map([
    ["fixture-fact-m1", SupportLabel.HYPOTHESIS],
    ["fixture-fact-m2", SupportLabel.HYPOTHESIS],
    ["fixture-fact-m3", SupportLabel.UNKNOWN],
    ["fixture-fact-m4", SupportLabel.UNKNOWN],
  ]);
  const claimedMixedI64 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-mixed-hypo-unknown-claim",
      prompt: "Mixed labels",
      expectedFactIds: ["fixture-fact-m1"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: [
      "fixture-fact-m1",
      "fixture-fact-m2",
      "fixture-fact-m3",
      "fixture-fact-m4",
    ],
    factLabels: mixedHypoUnknownI64,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    septDecimalPadI64.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("7.0 ") === false &&
    claimedMixedI64.verdict === EvalCaseVerdict.NO_GROUNDING
  ) {
    details.push(
      'wipe15 I64 tip-moved-281: groundingUsed="7.0 " → NO_GROUNDING; claimed PASS mixed hypo+unknown → NO_GROUNDING (distinct from #281 T-X070)',
    );
  } else {
    passed = false;
    details.push("I64 sept-decimal/mixed-labels unexpectedly failed");
  }

  // 59. wipe15 I65 TIMER ON_TIP 66a4ef90 — "8.0 " + claimed PASS lone SUPPORTED in unknown sea.
  const octDecimalPadI65 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-oct-decimal-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "8.0 ",
  });
  const loneSupportedSeaI65 = new Map([
    ["fixture-fact-s1", SupportLabel.SUPPORTED],
    ["fixture-fact-u1", SupportLabel.UNKNOWN],
    ["fixture-fact-u2", SupportLabel.UNKNOWN],
    ["fixture-fact-u3", SupportLabel.UNKNOWN],
  ]);
  const claimedLoneSupportedI65 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-lone-supported-sea",
      prompt: "One supported",
      expectedFactIds: ["fixture-fact-s1", "fixture-fact-u1"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: [
      "fixture-fact-s1",
      "fixture-fact-u1",
      "fixture-fact-u2",
      "fixture-fact-u3",
    ],
    factLabels: loneSupportedSeaI65,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    octDecimalPadI65.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("8.0 ") === false &&
    claimedLoneSupportedI65.verdict === EvalCaseVerdict.FAIL
  ) {
    details.push(
      'wipe15 I65 TIMER ON_TIP: groundingUsed="8.0 " → NO_GROUNDING; claimed PASS lone SUPPORTED missing expected → FAIL (exclusive #282 not Slot I)',
    );
  } else {
    passed = false;
    details.push("I65 oct-decimal/lone-supported unexpectedly failed");
  }

  // 60. wipe15 I66 post-#282 — "9.0 " alias + quad SUPPORTED pass control.
  const nonaDecimalPadI66 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-nona-decimal-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "9.0 ",
  });
  const quadSupportedLabelsI66 = new Map([
    ["fixture-fact-q1", SupportLabel.SUPPORTED],
    ["fixture-fact-q2", SupportLabel.SUPPORTED],
    ["fixture-fact-q3", SupportLabel.SUPPORTED],
    ["fixture-fact-q4", SupportLabel.SUPPORTED],
  ]);
  const quadSupportedPassI66 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-quad-supported-pass",
      prompt: "All supported",
      expectedFactIds: ["fixture-fact-q1", "fixture-fact-q2"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: [
      "fixture-fact-q1",
      "fixture-fact-q2",
      "fixture-fact-q3",
      "fixture-fact-q4",
    ],
    factLabels: quadSupportedLabelsI66,
    groundingUsed: true,
  });
  if (
    nonaDecimalPadI66.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("9.0 ") === false &&
    quadSupportedPassI66.verdict === EvalCaseVerdict.PASS &&
    quadSupportedPassI66.groundingUsed === true
  ) {
    details.push(
      'wipe15 I66 tip-moved-282: groundingUsed="9.0 " → NO_GROUNDING; quad SUPPORTED full expected → PASS (distinct from #282 T-X031)',
    );
  } else {
    passed = false;
    details.push("I66 nona-decimal/quad-supported unexpectedly failed");
  }

  // 61. wipe15 I67 post-#283 — "10.0 " alias + hypo+supported PASS when expected SUPPORTED cited.
  const decaDecimalPadI67 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-deca-decimal-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "10.0 ",
  });
  const hypoSupportedMixI67 = new Map([
    ["fixture-fact-hs1", SupportLabel.HYPOTHESIS],
    ["fixture-fact-hs2", SupportLabel.SUPPORTED],
  ]);
  const claimedHypoSupportedI67 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-hypo-supported-claim",
      prompt: "Mixed hypo supported",
      expectedFactIds: ["fixture-fact-hs2"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hs1", "fixture-fact-hs2"],
    factLabels: hypoSupportedMixI67,
    groundingUsed: true,
    claimedVerdict: EvalCaseVerdict.PASS,
  });
  if (
    decaDecimalPadI67.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("10.0 ") === false &&
    claimedHypoSupportedI67.verdict === EvalCaseVerdict.PASS &&
    claimedHypoSupportedI67.groundingUsed === true
  ) {
    details.push(
      'wipe15 I67 tip-moved-283: groundingUsed="10.0 " → NO_GROUNDING; hypo+supported with expected SUPPORTED cited → PASS (distinct from #283 T-X028)',
    );
  } else {
    passed = false;
    details.push("I67 deca-decimal/hypo-supported unexpectedly failed");
  }

  // 62. wipe15 I68 TIMER ON_TIP c9b7bd66 — "11.0 " + requiresGrounding=false PASS.
  const undecaDecimalPadI68 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-undeca-decimal-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "11.0 ",
  });
  const noGroundRequiredI68 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-no-ground-required",
      prompt: "Open",
      expectedFactIds: [],
      requiresGrounding: false,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: [],
    factLabels: labels,
    groundingUsed: false,
  });
  if (
    undecaDecimalPadI68.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("11.0 ") === false &&
    noGroundRequiredI68.verdict === EvalCaseVerdict.PASS
  ) {
    details.push(
      'wipe15 I68 TIMER: groundingUsed="11.0 " → NO_GROUNDING; requiresGrounding=false → PASS (exclusive #292 Slot S)',
    );
  } else {
    passed = false;
    details.push("I68 undeca-decimal/no-ground-required unexpectedly failed");
  }

  // 63. wipe15 I69 TIMER ON_TIP 578b1a08 — "12.0 " + claimed PASS with grounding false.
  const dodecaDecimalPadI69 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-dodeca-decimal-pad",
      prompt: "What are hours?",
      expectedFactIds: ["fixture-fact-hours"],
      requiresGrounding: true,
      acceptanceCaseId: "T-X038",
    },
    citedFactIds: ["fixture-fact-hours"],
    factLabels: labels,
    groundingUsed: "12.0 ",
  });
  const falseGroundClaimedI69 = adjudicateGroundedEvalCase({
    caseDef: {
      caseId: "c-false-ground-claim",
      prompt: "Need ground",
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
    dodecaDecimalPadI69.verdict === EvalCaseVerdict.NO_GROUNDING &&
    normalizeGroundingUsed("12.0 ") === false &&
    falseGroundClaimedI69.verdict === EvalCaseVerdict.NO_GROUNDING
  ) {
    details.push(
      'wipe15 I69 TIMER: groundingUsed="12.0 " → NO_GROUNDING; false ground + claimed PASS → NO_GROUNDING (exclusive #293 Slot J)',
    );
  } else {
    passed = false;
    details.push("I69 dodeca-decimal/false-ground unexpectedly failed");
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
