/**
 * Fixture proof for T-X055 — Unknown policy question escalates without promise.
 *
 * Concierge may only auto-answer `policy.allowedQuestionIds`. An unknown policy
 * question refuses the draft, creates a handoff with empty verifiedAnswers
 * (no invented promise), and blocks further agent send. External effects: NONE.
 * Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  SupportLabel,
  ConversationStatus,
  InboxChannel,
  createConversation,
  createHandoff,
  defaultResponsePolicy,
  evaluateUnknownPolicyQuestion,
  evaluateUnknownPolicyQuestionAttackSuite,
  prepareConciergeReply,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X055 fixture ACCEPTED.
 */
export function proofUnknownPolicyQuestionEscalatesWithoutPromise(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const policy = defaultResponsePolicy(nowIso);
  const conversation = createConversation({
    conversationId: `c-unknown-policy-${randomUUID().slice(0, 8)}`,
    providerThreadId: `thr-${randomUUID().slice(0, 8)}`,
    channel: InboxChannel.FIXTURE,
    customerDisplayName: "Fixture Guest",
    customerEmail: "guest@fixture.worksocial.local",
    nowIso,
  });

  // 1. Allowed policy question positive control (honesty fields).
  const allowedGate = evaluateUnknownPolicyQuestion({
    questionId: "documented_policies",
    policy,
  });
  if (
    allowedGate.allowed &&
    !allowedGate.escalateWithoutPromise &&
    allowedGate.liveProviderWiring === "NOT_WIRED" &&
    allowedGate.externalEffects === "NONE"
  ) {
    details.push(
      "allowed question documented_policies → allowed (no escalate) NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(
      `allowed question unexpectedly ${JSON.stringify(allowedGate)}`,
    );
  }

  const allowedDraft = prepareConciergeReply({
    draftId: `d-allowed-${randomUUID().slice(0, 8)}`,
    conversation,
    inboundBody: "What documented policies apply to room bookings?",
    citedFactIds: ["fact-hours"],
    factLabels: new Map([["fact-hours", SupportLabel.SUPPORTED]]),
    policy,
    bookingEvidence: [],
    questionId: "documented_policies",
    nowIso,
  });
  if (allowedDraft.ok) {
    details.push("prepareConciergeReply allows documented_policies questionId");
  } else {
    passed = false;
    details.push(
      `allowed draft unexpectedly refused: ${JSON.stringify(allowedDraft)}`,
    );
  }

  // 2. Unknown policy question → escalate without promise.
  const unknownId = "undocumented_cancellation_guarantee";
  const unknownGate = evaluateUnknownPolicyQuestion({
    questionId: unknownId,
    policy,
  });
  if (
    !unknownGate.allowed &&
    unknownGate.code === "UNKNOWN_POLICY_QUESTION" &&
    unknownGate.escalateWithoutPromise &&
    unknownGate.liveProviderWiring === "NOT_WIRED" &&
    unknownGate.externalEffects === "NONE"
  ) {
    details.push(
      `unknown question ${unknownId} → UNKNOWN_POLICY_QUESTION escalateWithoutPromise NOT_WIRED`,
    );
  } else {
    passed = false;
    details.push(
      `unknown gate unexpectedly ${JSON.stringify(unknownGate)}`,
    );
  }

  // 3. Draft refused — no automated answer / promise body.
  const refused = prepareConciergeReply({
    draftId: `d-unknown-${randomUUID().slice(0, 8)}`,
    conversation,
    inboundBody:
      "Can you guarantee a full refund if I cancel anytime for any reason?",
    citedFactIds: ["fact-hours"],
    factLabels: new Map([["fact-hours", SupportLabel.SUPPORTED]]),
    policy,
    bookingEvidence: [],
    questionId: unknownId,
    nowIso,
  });
  if (!refused.ok && refused.code === "UNKNOWN_POLICY_QUESTION") {
    details.push(
      "prepareConciergeReply refuses unknown policy question (no promise draft)",
    );
  } else {
    passed = false;
    details.push(
      `unknown draft unexpectedly ${JSON.stringify(refused)}`,
    );
  }

  // 4. Handoff escalates with empty verifiedAnswers (no invented promise).
  const { handoff, conversation: handed } = createHandoff({
    handoffId: `ho-unknown-${randomUUID().slice(0, 8)}`,
    conversation,
    reason: "Unknown policy question — escalate without promise",
    nextOwner: policy.escalationOwner,
    customerQuestions: [
      "Can you guarantee a full refund if I cancel anytime for any reason?",
    ],
    verifiedAnswers: [],
    requestedAction:
      "Owner answers undocumented policy; do not invent coverage or promise",
    nowIso,
  });
  if (
    handoff.verifiedAnswers.length === 0 &&
    handoff.nextOwner === policy.escalationOwner &&
    handed.humanOwned &&
    !handed.agentSendAllowed &&
    handed.status === ConversationStatus.HANDED_OFF
  ) {
    details.push(
      "createHandoff escalates with verifiedAnswers=[] humanOwned agentSendAllowed=false",
    );
  } else {
    passed = false;
    details.push(
      `handoff unexpectedly answers=${JSON.stringify(handoff.verifiedAnswers)} status=${handed.status} humanOwned=${handed.humanOwned} agentSend=${handed.agentSendAllowed}`,
    );
  }

  // 5. Counterfactual: inventing a verified answer would be a promise — proof forbids it.
  if (
    !handoff.verifiedAnswers.some((a) =>
      /guarantee|promise|full refund/i.test(a),
    )
  ) {
    details.push(
      "no invented guarantee/promise in verifiedAnswers (escalate without promise)",
    );
  } else {
    passed = false;
    details.push("verifiedAnswers unexpectedly contained a promise-like answer");
  }

  // 6. Hillclimb attack suite: allowed + unknown/empty with NOT_WIRED honesty;
  //    empty/whitespace also routed through prepareConciergeReply (no truthy bypass).
  const suite = evaluateUnknownPolicyQuestionAttackSuite({
    policy,
    draftProbe: {
      conversation,
      nowIso,
      citedFactIds: ["fact-hours"],
      factLabels: new Map([["fact-hours", SupportLabel.SUPPORTED]]),
    },
  });
  if (suite.passed) {
    details.push(...suite.details);
  } else {
    passed = false;
    details.push(`Attack suite failed: ${suite.details.join(" | ")}`);
  }

  const zwspDraft = prepareConciergeReply({
    draftId: "d-zwsp-suite",
    conversation,
    inboundBody: "Promise me a lifetime discount?",
    citedFactIds: ["fact-hours"],
    factLabels: new Map([["fact-hours", SupportLabel.SUPPORTED]]),
    policy,
    bookingEvidence: [],
    questionId: "\u200b",
    nowIso,
  });
  if (!zwspDraft.ok && zwspDraft.code === "UNKNOWN_POLICY_QUESTION") {
    details.push(
      "prepareConciergeReply ZWSP-only questionId → UNKNOWN_POLICY_QUESTION",
    );
  } else {
    passed = false;
    details.push(`ZWSP draft unexpectedly ${JSON.stringify(zwspDraft)}`);
  }

  const allowedId = policy.allowedQuestionIds[0]!;
  const zwspWrapId = `\u200b${allowedId}\u200b`;
  const wrapGate = evaluateUnknownPolicyQuestion({
    questionId: zwspWrapId,
    policy,
  });
  if (
    !wrapGate.allowed &&
    wrapGate.code === "UNKNOWN_POLICY_QUESTION" &&
    wrapGate.escalateWithoutPromise
  ) {
    details.push(
      `ZWSP-wrapped allowedId ${allowedId} → UNKNOWN_POLICY_QUESTION (no invisible bypass)`,
    );
  } else {
    passed = false;
    details.push(`ZWSP-wrap gate unexpectedly ${JSON.stringify(wrapGate)}`);
  }

  const bomPrefixedId = `\ufeff${allowedId}`;
  const bomGate = evaluateUnknownPolicyQuestion({
    questionId: bomPrefixedId,
    policy,
  });
  if (
    !bomGate.allowed &&
    bomGate.code === "UNKNOWN_POLICY_QUESTION" &&
    bomGate.escalateWithoutPromise
  ) {
    details.push(
      `BOM-prefixed allowedId ${allowedId} → UNKNOWN_POLICY_QUESTION (exact match only)`,
    );
  } else {
    passed = false;
    details.push(`BOM-prefix gate unexpectedly ${JSON.stringify(bomGate)}`);
  }

  const ltrMarkId = `\u200e${allowedId}`;
  const ltrGate = evaluateUnknownPolicyQuestion({
    questionId: ltrMarkId,
    policy,
  });
  if (
    !ltrGate.allowed &&
    ltrGate.code === "UNKNOWN_POLICY_QUESTION" &&
    ltrGate.escalateWithoutPromise
  ) {
    details.push(
      `LTR-mark-prefixed allowedId ${allowedId} → UNKNOWN_POLICY_QUESTION`,
    );
  } else {
    passed = false;
    details.push(`LTR-mark gate unexpectedly ${JSON.stringify(ltrGate)}`);
  }

  const nulSuffixId = `${allowedId}\u0000`;
  const nulGate = evaluateUnknownPolicyQuestion({
    questionId: nulSuffixId,
    policy,
  });
  if (
    !nulGate.allowed &&
    nulGate.code === "UNKNOWN_POLICY_QUESTION" &&
    nulGate.escalateWithoutPromise
  ) {
    details.push(
      `NUL-suffixed allowedId ${allowedId} → UNKNOWN_POLICY_QUESTION (exact match only)`,
    );
  } else {
    passed = false;
    details.push(`NUL-suffix gate unexpectedly ${JSON.stringify(nulGate)}`);
  }

  const partialId = allowedId.slice(0, Math.max(3, allowedId.length - 3));
  const partialGate = evaluateUnknownPolicyQuestion({
    questionId: partialId,
    policy,
  });
  if (
    !partialGate.allowed &&
    partialGate.code === "UNKNOWN_POLICY_QUESTION" &&
    partialGate.escalateWithoutPromise
  ) {
    details.push(
      `partial-prefix questionId ${partialId} → UNKNOWN_POLICY_QUESTION (no prefix allow)`,
    );
  } else {
    passed = false;
    details.push(`partial-prefix gate unexpectedly ${JSON.stringify(partialGate)}`);
  }

  const suffixExtendedId = `${allowedId}_extra`;
  const suffixGate = evaluateUnknownPolicyQuestion({
    questionId: suffixExtendedId,
    policy,
  });
  if (
    !suffixGate.allowed &&
    suffixGate.code === "UNKNOWN_POLICY_QUESTION" &&
    suffixGate.escalateWithoutPromise
  ) {
    details.push(
      `suffix-extended questionId ${suffixExtendedId} → UNKNOWN_POLICY_QUESTION`,
    );
  } else {
    passed = false;
    details.push(`suffix-extended gate unexpectedly ${JSON.stringify(suffixGate)}`);
  }

  const suffixDraft = prepareConciergeReply({
    draftId: "d-suffix-suite",
    conversation,
    inboundBody: "Guarantee my rate forever?",
    citedFactIds: ["fact-hours"],
    factLabels: new Map([["fact-hours", SupportLabel.SUPPORTED]]),
    policy,
    bookingEvidence: [],
    questionId: suffixExtendedId,
    nowIso,
  });
  if (!suffixDraft.ok && suffixDraft.code === "UNKNOWN_POLICY_QUESTION") {
    details.push(
      "prepareConciergeReply suffix-extended allowedId → UNKNOWN_POLICY_QUESTION",
    );
  } else {
    passed = false;
    details.push(`suffix draft unexpectedly ${JSON.stringify(suffixDraft)}`);
  }

  const typoId = allowedId.replace(/ies$/, "y").replace(/s$/, "");
  if (typoId !== allowedId) {
    const typoGate = evaluateUnknownPolicyQuestion({
      questionId: typoId,
      policy,
    });
    if (
      !typoGate.allowed &&
      typoGate.code === "UNKNOWN_POLICY_QUESTION" &&
      typoGate.escalateWithoutPromise
    ) {
      details.push(
        `lookalike typo questionId ${typoId} → UNKNOWN_POLICY_QUESTION (no fuzzy allow)`,
      );
    } else {
      passed = false;
      details.push(`typo gate unexpectedly ${JSON.stringify(typoGate)}`);
    }
  }

  const secondAllowed = policy.allowedQuestionIds[1];
  if (secondAllowed) {
    const compositeId = `${allowedId},${secondAllowed}`;
    const compositeGate = evaluateUnknownPolicyQuestion({
      questionId: compositeId,
      policy,
    });
    if (
      !compositeGate.allowed &&
      compositeGate.code === "UNKNOWN_POLICY_QUESTION" &&
      compositeGate.escalateWithoutPromise
    ) {
      details.push(
        `composite questionId ${compositeId} → UNKNOWN_POLICY_QUESTION (no multi-allow)`,
      );
    } else {
      passed = false;
      details.push(
        `composite gate unexpectedly ${JSON.stringify(compositeGate)}`,
      );
    }
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-unknown-policy-${randomUUID()}`,
    kind: SoakProofKind.UNKNOWN_POLICY_QUESTION_ESCALATES_WITHOUT_PROMISE,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-unknown-policy-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
