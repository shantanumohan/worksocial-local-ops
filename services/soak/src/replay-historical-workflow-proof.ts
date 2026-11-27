/**
 * Fixture proof for T-X013 — replay historical workflow.
 *
 * Models Temporal-style history replay offline (no Temporal test server):
 * 1) Run the durable mission steps once and record a workflow history of
 *    completed activity results (enqueue → claim/accept → verify).
 * 2) Replay the same workflow control flow against that history, returning
 *    recorded activity results only — never re-invoking acceptPending,
 *    verifyIndependent, or fakeProvider.applyOnce.
 * 3) Assert applyAttemptCount stays 1 and the provider ledger does not grow.
 * 4) Second replay + empty/partial-history fail-closed keep honesty (T-X013).
 * 5) Codex harden: terminal bind + claim/verify/terminal opId cross-bind;
 *    whitespace terminal tokens and unread tails refuse without inventing I/O.
 *
 * Distinct from mid-flight NO_DUPLICATE_EFFECTS (ACCEPTED_PENDING retry) and
 * from CRASH_RESTART (resume then verify once). Also distinct from merely
 * re-calling acceptPending on a VERIFIED decision — that is not history replay.
 * External effects: NONE. Never invents live catalog VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  createHistoryOnlyReplayHooks,
  replayEmptyHistoryFailsClosed,
  replayMissionWorkflowHistory,
  replayPartialHistoryFailsClosed,
  replayTwoEventHistoryFailsClosed,
  type ReplayActivityResult,
  type ReplayWorkflowHistory,
  type SoakProofRecord,
} from "@worksocial/domain";
import {
  createDurableExecutionService,
  createFileDurableStores,
  newJobId,
  type AcceptPendingInput,
  type AcceptPendingResult,
  type DurableExecutionService,
  type VerifyIndependentResult,
} from "@worksocial/persistence";

function openService(stateDir: string): DurableExecutionService {
  return createDurableExecutionService(createFileDurableStores(stateDir));
}

function nowPlus(baseIso: string, ms: number): string {
  return new Date(Date.parse(baseIso) + ms).toISOString();
}

function decisionFields(
  operationId: string,
  payloadDigest: string,
  nowIso: string,
  reason: string,
): AcceptPendingInput["decision"] {
  return {
    decisionId: `dec-${operationId}`,
    operationId,
    payloadDigest,
    allowed: true,
    code: null,
    reason,
    grantId: "grant-soak",
    policyId: "pol-soak",
    decidedAtIso: nowIso,
    writePathId: "wp-soak",
    gateDetails: ["soak_harness", "t_x013_history_replay"],
  };
}

function jobFields(operationId: string, jobId: string, idem: string) {
  return {
    jobId,
    roleId: "A19" as const,
    workflowId: `wf-${operationId}`,
    siteId: "site-soak",
    assetId: "asset-soak",
    trigger: "soak_harness",
    policyVersion: "m9",
    inputArtifactIds: [] as string[],
    capabilityGrantId: "grant-soak",
    sourceRevision: "rev-soak",
    maxAttempts: 2,
    deadlineSeconds: 600,
    idempotencyKey: idem,
    expectedOutcome: "verified_publish",
  };
}

/**
 * Complete expected proof set for T-X013 fixture ACCEPTED.
 */
export async function proofReplayHistoricalNoRepeatIo(
  stateDir: string,
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  const operationId = `soak-replay-hist-${randomUUID().slice(0, 8)}`;
  const bizKey = `biz-soak-replay-hist-${operationId}`;
  const digest = `digest-${operationId}`;
  const jobId = newJobId();
  const idem = `soak/replay-hist/${operationId}`;
  const workflowId = `wf-${operationId}`;

  const liveSvc = openService(stateDir);
  const historyEvents: ReplayActivityResult[] = [];

  historyEvents.push({
    activity: "enqueue",
    workflowId,
    phase: "queued",
  });
  details.push(`Recorded enqueue history for ${workflowId}`);

  const accepted: AcceptPendingResult = await liveSvc.acceptPending({
    job: jobFields(operationId, jobId, idem),
    operationId,
    payloadDigest: digest,
    businessIdempotencyKey: bizKey,
    decision: decisionFields(
      operationId,
      digest,
      nowIso,
      "soak historical first apply",
    ),
    nowIso,
  });
  historyEvents.push({
    activity: "claimAndAccept",
    phase: "effect_pending",
    outcome: "ACCEPTED_PENDING",
    applyAttemptCount: accepted.applyAttemptCount,
    providerCreated: accepted.providerCreated,
    operationId,
  });
  details.push(
    `Recorded claimAndAccept providerCreated=${accepted.providerCreated} applyCount=${accepted.applyAttemptCount}`,
  );

  const verified: VerifyIndependentResult = await liveSvc.verifyIndependent({
    operationId,
    observedDigest: digest,
    nowIso: nowPlus(nowIso, 1_000),
  });
  historyEvents.push({
    activity: "verify",
    phase: "succeeded",
    outcome: "VERIFIED",
    applyAttemptCount: verified.applyAttemptCount,
    matched: verified.matched,
    operationId,
  });
  details.push(
    `Recorded verify outcome=${verified.decision.outcome} matched=${verified.matched} applyCount=${verified.applyAttemptCount}`,
  );

  const history: ReplayWorkflowHistory = {
    events: historyEvents,
    terminal: {
      outcome: "VERIFIED",
      applyAttemptCount: verified.applyAttemptCount,
      operationId,
    },
  };

  const providersBeforeReplay = await liveSvc.stores.fakeProvider.list();
  const applyBeforeReplay = await liveSvc.stores.effects.countApplyAttempts(
    operationId,
  );
  const thisOpBefore = providersBeforeReplay.filter(
    (p) => p.operationId === operationId,
  ).length;

  const firstHooks = createHistoryOnlyReplayHooks();
  const replayed = replayMissionWorkflowHistory(history, firstHooks.hooks);
  const firstSummary = firstHooks.summary();
  details.push(
    `History replay outcome=${replayed.outcome} applyCount=${replayed.applyAttemptCount} scheduledFromHistory=${firstSummary.scheduledFromHistory}`,
  );

  // Second replay — still history-only; ledger must not grow.
  const secondHooks = createHistoryOnlyReplayHooks();
  const secondReplay = replayMissionWorkflowHistory(history, secondHooks.hooks);
  const secondSummary = secondHooks.summary();
  if (
    secondReplay.outcome === "VERIFIED" &&
    secondSummary.scheduledFromHistory === 3 &&
    secondSummary.forbiddenLiveIo === 0 &&
    secondSummary.externalEffects === "NONE"
  ) {
    details.push(
      "Second history replay → VERIFIED scheduledFromHistory=3 forbiddenLiveIo=0 (honesty NOT_WIRED/NONE)",
    );
  } else {
    details.push(
      `Second replay unexpectedly ${JSON.stringify({ secondReplay, secondSummary })}`,
    );
  }

  const emptyFail = replayEmptyHistoryFailsClosed();
  if (
    emptyFail.outcome.outcome === "FAILED" &&
    emptyFail.summary.forbiddenLiveIo > 0 &&
    emptyFail.summary.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "Empty history fail-closed → FAILED without inventing live I/O success",
    );
  } else {
    details.push(
      `Empty history unexpectedly ${JSON.stringify(emptyFail)}`,
    );
  }

  const partialFail = replayPartialHistoryFailsClosed();
  if (
    partialFail.outcome.outcome === "FAILED" &&
    partialFail.summary.forbiddenLiveIo > 0 &&
    partialFail.summary.liveIoLabels.some((l) => l.includes("history_mismatch"))
  ) {
    details.push(
      "Partial history fail-closed → FAILED (terminal alone cannot invent VERIFIED)",
    );
  } else {
    details.push(
      `Partial history unexpectedly ${JSON.stringify(partialFail)}`,
    );
  }

  const twoEventFail = replayTwoEventHistoryFailsClosed();
  if (
    twoEventFail.outcome.outcome === "FAILED" &&
    twoEventFail.summary.forbiddenLiveIo > 0 &&
    twoEventFail.summary.liveIoLabels.some((l) => l.includes("history_mismatch"))
  ) {
    details.push(
      "Two-event truncation fail-closed → FAILED (missing verify not invented)",
    );
  } else {
    details.push(
      `Two-event truncation unexpectedly ${JSON.stringify(twoEventFail)}`,
    );
  }

  // Codex harden — missing terminal / claim-op drift refuse after full events.
  const missingTerminalHooks = createHistoryOnlyReplayHooks();
  const missingTerminal = replayMissionWorkflowHistory(
    { events: history.events, terminal: undefined } as unknown as ReplayWorkflowHistory,
    missingTerminalHooks.hooks,
  );
  const missingSummary = missingTerminalHooks.summary();
  if (
    missingTerminal.outcome === "FAILED" &&
    missingSummary.liveIoLabels.some((l) =>
      l.includes("history_terminal_missing_or_incomplete"),
    )
  ) {
    details.push("Missing terminal after complete events → FAILED (Codex harden)");
  } else {
    details.push("Missing terminal unexpectedly passed");
  }

  const driftHistory: ReplayWorkflowHistory = {
    events: history.events.map((e) =>
      e.activity === "claimAndAccept"
        ? { ...e, operationId: `${operationId}-drift` }
        : e,
    ),
    terminal: { ...history.terminal },
  };
  const driftHooks = createHistoryOnlyReplayHooks();
  const driftReplay = replayMissionWorkflowHistory(driftHistory, driftHooks.hooks);
  const driftSummary = driftHooks.summary();
  if (
    driftReplay.outcome === "FAILED" &&
    driftSummary.liveIoLabels.some(
      (l) =>
        l.includes("history_claim_verify_op_mismatch") ||
        l.includes("history_activity_terminal_op_mismatch"),
    )
  ) {
    details.push(
      "Claim/terminal opId cross-bind mismatch → FAILED (Codex harden)",
    );
  } else {
    details.push("Claim/terminal cross-bind unexpectedly passed");
  }

  // Edge — claim applyAttemptCount drift + negative terminal apply refuse.
  const applyDriftHistory: ReplayWorkflowHistory = {
    events: history.events.map((e) =>
      e.activity === "claimAndAccept"
        ? { ...e, applyAttemptCount: e.applyAttemptCount + 5 }
        : e,
    ),
    terminal: { ...history.terminal },
  };
  const applyDriftHooks = createHistoryOnlyReplayHooks();
  const applyDriftReplay = replayMissionWorkflowHistory(
    applyDriftHistory,
    applyDriftHooks.hooks,
  );
  const applyDriftSummary = applyDriftHooks.summary();
  if (
    applyDriftReplay.outcome === "FAILED" &&
    applyDriftSummary.liveIoLabels.some(
      (l) =>
        l.includes("history_claim_verify_apply_mismatch") ||
        l.includes("history_activity_terminal_op_mismatch"),
    )
  ) {
    details.push(
      "Claim applyAttemptCount drift → FAILED (edge apply cross-bind)",
    );
  } else {
    details.push("Claim applyAttemptCount drift unexpectedly passed");
  }

  const negTerminalHooks = createHistoryOnlyReplayHooks();
  const negTerminal = replayMissionWorkflowHistory(
    {
      events: history.events,
      terminal: {
        outcome: "VERIFIED",
        applyAttemptCount: -1,
        operationId,
      },
    },
    negTerminalHooks.hooks,
  );
  const negSummary = negTerminalHooks.summary();
  if (
    negTerminal.outcome === "FAILED" &&
    negSummary.liveIoLabels.some((l) =>
      l.includes("history_terminal_missing_or_incomplete"),
    )
  ) {
    details.push("Negative terminal applyAttemptCount → FAILED (edge)");
  } else {
    details.push("Negative terminal apply unexpectedly passed");
  }

  // Edge deepen — blank enqueue workflowId; padded terminal trim; Infinity apply;
  // verify matched=false.
  const blankWfHistory: ReplayWorkflowHistory = {
    events: history.events.map((e) =>
      e.activity === "enqueue" ? { ...e, workflowId: "   " } : e,
    ),
    terminal: { ...history.terminal },
  };
  const blankWfHooks = createHistoryOnlyReplayHooks();
  const blankWfReplay = replayMissionWorkflowHistory(
    blankWfHistory,
    blankWfHooks.hooks,
  );
  const blankWfSummary = blankWfHooks.summary();
  if (
    blankWfReplay.outcome === "FAILED" &&
    blankWfSummary.liveIoLabels.some((l) =>
      l.includes("history_enqueue_workflowId_blank"),
    )
  ) {
    details.push("Blank enqueue workflowId → FAILED (edge)");
  } else {
    details.push("Blank enqueue workflowId unexpectedly passed");
  }

  const paddedTerminalHooks = createHistoryOnlyReplayHooks();
  const paddedTerminal = replayMissionWorkflowHistory(
    {
      events: history.events,
      terminal: {
        outcome: "VERIFIED",
        applyAttemptCount: history.terminal.applyAttemptCount,
        operationId: `  ${operationId}  `,
      },
    },
    paddedTerminalHooks.hooks,
  );
  if (
    paddedTerminal.outcome === "VERIFIED" &&
    paddedTerminalHooks.summary().forbiddenLiveIo === 0
  ) {
    details.push("Whitespace-padded terminal opId trims → VERIFIED (edge)");
  } else {
    details.push("Padded terminal opId unexpectedly failed");
  }

  const infTerminalHooks = createHistoryOnlyReplayHooks();
  const infTerminal = replayMissionWorkflowHistory(
    {
      events: history.events,
      terminal: {
        outcome: "VERIFIED",
        applyAttemptCount: Number.POSITIVE_INFINITY,
        operationId,
      },
    },
    infTerminalHooks.hooks,
  );
  if (
    infTerminal.outcome === "FAILED" &&
    infTerminalHooks.summary().liveIoLabels.some((l) =>
      l.includes("history_terminal_missing_or_incomplete"),
    )
  ) {
    details.push("Non-finite terminal applyAttemptCount → FAILED (edge)");
  } else {
    details.push("Non-finite terminal apply unexpectedly passed");
  }

  const unmatchedHistory: ReplayWorkflowHistory = {
    events: history.events.map((e) =>
      e.activity === "verify" ? { ...e, matched: false } : e,
    ),
    terminal: { ...history.terminal },
  };
  const unmatchedHooks = createHistoryOnlyReplayHooks();
  const unmatchedReplay = replayMissionWorkflowHistory(
    unmatchedHistory,
    unmatchedHooks.hooks,
  );
  if (unmatchedReplay.outcome === "FAILED") {
    details.push("Verify matched=false → FAILED (edge)");
  } else {
    details.push("Verify matched=false unexpectedly passed");
  }

  // Edge deepen — blank claim/verify opId refuse; padded claim/verify trim;
  // non-integer terminal apply refuse.
  const blankClaimHistory: ReplayWorkflowHistory = {
    events: history.events.map((e) =>
      e.activity === "claimAndAccept" ? { ...e, operationId: "   " } : e,
    ),
    terminal: { ...history.terminal },
  };
  const blankClaimHooks = createHistoryOnlyReplayHooks();
  const blankClaimReplay = replayMissionWorkflowHistory(
    blankClaimHistory,
    blankClaimHooks.hooks,
  );
  if (
    blankClaimReplay.outcome === "FAILED" &&
    blankClaimHooks.summary().liveIoLabels.some((l) =>
      l.includes("history_activity_operationId_blank"),
    )
  ) {
    details.push("Blank claim operationId → FAILED (edge)");
  } else {
    details.push("Blank claim operationId unexpectedly passed");
  }

  const blankVerifyHistory: ReplayWorkflowHistory = {
    events: history.events.map((e) =>
      e.activity === "verify" ? { ...e, operationId: "" } : e,
    ),
    terminal: { ...history.terminal },
  };
  const blankVerifyHooks = createHistoryOnlyReplayHooks();
  const blankVerifyReplay = replayMissionWorkflowHistory(
    blankVerifyHistory,
    blankVerifyHooks.hooks,
  );
  if (
    blankVerifyReplay.outcome === "FAILED" &&
    blankVerifyHooks.summary().liveIoLabels.some((l) =>
      l.includes("history_activity_operationId_blank"),
    )
  ) {
    details.push("Blank verify operationId → FAILED (edge)");
  } else {
    details.push("Blank verify operationId unexpectedly passed");
  }

  const paddedActsHooks = createHistoryOnlyReplayHooks();
  const paddedActsReplay = replayMissionWorkflowHistory(
    {
      events: history.events.map((e) => {
        if (e.activity === "claimAndAccept" || e.activity === "verify") {
          return { ...e, operationId: `  ${e.operationId}  ` };
        }
        return e;
      }),
      terminal: { ...history.terminal },
    },
    paddedActsHooks.hooks,
  );
  if (
    paddedActsReplay.outcome === "VERIFIED" &&
    paddedActsHooks.summary().forbiddenLiveIo === 0
  ) {
    details.push("Whitespace-padded claim/verify opIds trim → VERIFIED (edge)");
  } else {
    details.push("Padded claim/verify opIds unexpectedly failed");
  }

  const floatTerminalHooks = createHistoryOnlyReplayHooks();
  const floatTerminal = replayMissionWorkflowHistory(
    {
      events: history.events,
      terminal: {
        outcome: "VERIFIED",
        applyAttemptCount: 1.5,
        operationId,
      },
    },
    floatTerminalHooks.hooks,
  );
  if (
    floatTerminal.outcome === "FAILED" &&
    floatTerminalHooks.summary().liveIoLabels.some((l) =>
      l.includes("history_terminal_missing_or_incomplete"),
    )
  ) {
    details.push("Non-integer terminal applyAttemptCount → FAILED (edge)");
  } else {
    details.push("Non-integer terminal apply unexpectedly passed");
  }

  // Edge deepen — claim/verify activity shape fences; padded enqueue wfId.
  const badClaimPhaseHistory: ReplayWorkflowHistory = {
    events: history.events.map((e) => {
      if (e.activity === "claimAndAccept") {
        return {
          ...e,
          phase: "queued" as "effect_pending",
        };
      }
      return e;
    }),
    terminal: { ...history.terminal },
  };
  const badClaimHooks = createHistoryOnlyReplayHooks();
  const badClaimReplay = replayMissionWorkflowHistory(
    badClaimPhaseHistory,
    badClaimHooks.hooks,
  );
  if (
    badClaimReplay.outcome === "FAILED" &&
    badClaimHooks.summary().liveIoLabels.some((l) =>
      l.includes("history_claim_shape_invalid"),
    )
  ) {
    details.push("Invalid claim phase shape → FAILED (edge)");
  } else {
    details.push("Invalid claim phase unexpectedly passed");
  }

  const badClaimApplyHistory: ReplayWorkflowHistory = {
    events: history.events.map((e) =>
      e.activity === "claimAndAccept"
        ? { ...e, applyAttemptCount: 1.25 }
        : e,
    ),
    terminal: { ...history.terminal },
  };
  const badClaimApplyHooks = createHistoryOnlyReplayHooks();
  const badClaimApplyReplay = replayMissionWorkflowHistory(
    badClaimApplyHistory,
    badClaimApplyHooks.hooks,
  );
  if (
    badClaimApplyReplay.outcome === "FAILED" &&
    badClaimApplyHooks.summary().liveIoLabels.some((l) =>
      l.includes("history_claim_shape_invalid"),
    )
  ) {
    details.push("Non-integer claim applyAttemptCount → FAILED (edge)");
  } else {
    details.push("Non-integer claim apply unexpectedly passed");
  }

  const badVerifyOutcomeHistory: ReplayWorkflowHistory = {
    events: history.events.map((e) => {
      if (e.activity === "verify") {
        return {
          ...e,
          outcome: "FAILED" as "VERIFIED",
        };
      }
      return e;
    }),
    terminal: { ...history.terminal },
  };
  const badVerifyHooks = createHistoryOnlyReplayHooks();
  const badVerifyReplay = replayMissionWorkflowHistory(
    badVerifyOutcomeHistory,
    badVerifyHooks.hooks,
  );
  if (
    badVerifyReplay.outcome === "FAILED" &&
    badVerifyHooks.summary().liveIoLabels.some((l) =>
      l.includes("history_verify_shape_invalid"),
    )
  ) {
    details.push("Invalid verify outcome shape → FAILED (edge)");
  } else {
    details.push("Invalid verify outcome unexpectedly passed");
  }

  const paddedWfHooks = createHistoryOnlyReplayHooks();
  const paddedWfReplay = replayMissionWorkflowHistory(
    {
      events: history.events.map((e) =>
        e.activity === "enqueue"
          ? { ...e, workflowId: `  ${e.workflowId}  ` }
          : e,
      ),
      terminal: { ...history.terminal },
    },
    paddedWfHooks.hooks,
  );
  if (
    paddedWfReplay.outcome === "VERIFIED" &&
    paddedWfHooks.summary().forbiddenLiveIo === 0
  ) {
    details.push("Whitespace-padded enqueue workflowId trims → VERIFIED (edge)");
  } else {
    details.push("Padded enqueue workflowId unexpectedly failed");
  }

  // Edge deepen — enqueue phase; providerCreated=false; zero terminal apply.
  const badEnqPhaseHistory: ReplayWorkflowHistory = {
    events: history.events.map((e) => {
      if (e.activity === "enqueue") {
        return { ...e, phase: "succeeded" as "queued" };
      }
      return e;
    }),
    terminal: { ...history.terminal },
  };
  const badEnqHooks = createHistoryOnlyReplayHooks();
  const badEnqReplay = replayMissionWorkflowHistory(
    badEnqPhaseHistory,
    badEnqHooks.hooks,
  );
  if (
    badEnqReplay.outcome === "FAILED" &&
    badEnqHooks.summary().liveIoLabels.some((l) =>
      l.includes("history_enqueue_phase_invalid"),
    )
  ) {
    details.push("Invalid enqueue phase → FAILED (edge)");
  } else {
    details.push("Invalid enqueue phase unexpectedly passed");
  }

  const noProviderHistory: ReplayWorkflowHistory = {
    events: history.events.map((e) =>
      e.activity === "claimAndAccept"
        ? { ...e, providerCreated: false }
        : e,
    ),
    terminal: { ...history.terminal },
  };
  const noProviderHooks = createHistoryOnlyReplayHooks();
  const noProviderReplay = replayMissionWorkflowHistory(
    noProviderHistory,
    noProviderHooks.hooks,
  );
  if (
    noProviderReplay.outcome === "FAILED" &&
    noProviderHooks.summary().liveIoLabels.some((l) =>
      l.includes("history_claim_shape_invalid"),
    )
  ) {
    details.push("Claim providerCreated=false → FAILED (edge)");
  } else {
    details.push("Claim providerCreated=false unexpectedly passed");
  }

  const zeroApplyHistory: ReplayWorkflowHistory = {
    events: history.events.map((e) => {
      if (
        e.activity === "claimAndAccept" ||
        e.activity === "verify"
      ) {
        return { ...e, applyAttemptCount: 0 };
      }
      return e;
    }),
    terminal: {
      outcome: "VERIFIED",
      applyAttemptCount: 0,
      operationId,
    },
  };
  const zeroApplyHooks = createHistoryOnlyReplayHooks();
  const zeroApplyReplay = replayMissionWorkflowHistory(
    zeroApplyHistory,
    zeroApplyHooks.hooks,
  );
  if (
    zeroApplyReplay.outcome === "FAILED" &&
    zeroApplyHooks.summary().liveIoLabels.some((l) =>
      l.includes("history_claim_shape_invalid"),
    )
  ) {
    details.push("Zero claim/terminal applyAttemptCount → FAILED (edge)");
  } else {
    details.push("Zero claim/terminal apply unexpectedly passed");
  }

  // Edge deepen — zero verify apply; Infinity claim apply; wrong claim outcome.
  const zeroVerifyHistory: ReplayWorkflowHistory = {
    events: history.events.map((e) =>
      e.activity === "verify" ? { ...e, applyAttemptCount: 0 } : e,
    ),
    terminal: { ...history.terminal },
  };
  const zeroVerifyHooks = createHistoryOnlyReplayHooks();
  const zeroVerifyReplay = replayMissionWorkflowHistory(
    zeroVerifyHistory,
    zeroVerifyHooks.hooks,
  );
  if (
    zeroVerifyReplay.outcome === "FAILED" &&
    zeroVerifyHooks.summary().liveIoLabels.some((l) =>
      l.includes("history_verify_shape_invalid"),
    )
  ) {
    details.push("Zero verify applyAttemptCount → FAILED (edge)");
  } else {
    details.push("Zero verify apply unexpectedly passed");
  }

  const infClaimHistory: ReplayWorkflowHistory = {
    events: history.events.map((e) =>
      e.activity === "claimAndAccept"
        ? { ...e, applyAttemptCount: Number.POSITIVE_INFINITY }
        : e,
    ),
    terminal: { ...history.terminal },
  };
  const infClaimHooks = createHistoryOnlyReplayHooks();
  const infClaimReplay = replayMissionWorkflowHistory(
    infClaimHistory,
    infClaimHooks.hooks,
  );
  if (
    infClaimReplay.outcome === "FAILED" &&
    infClaimHooks.summary().liveIoLabels.some((l) =>
      l.includes("history_claim_shape_invalid"),
    )
  ) {
    details.push("Infinity claim applyAttemptCount → FAILED (edge)");
  } else {
    details.push("Infinity claim apply unexpectedly passed");
  }

  const wrongClaimOutcomeHistory: ReplayWorkflowHistory = {
    events: history.events.map((e) => {
      if (e.activity === "claimAndAccept") {
        return { ...e, outcome: "VERIFIED" as "ACCEPTED_PENDING" };
      }
      return e;
    }),
    terminal: { ...history.terminal },
  };
  const wrongClaimHooks = createHistoryOnlyReplayHooks();
  const wrongClaimReplay = replayMissionWorkflowHistory(
    wrongClaimOutcomeHistory,
    wrongClaimHooks.hooks,
  );
  if (
    wrongClaimReplay.outcome === "FAILED" &&
    wrongClaimHooks.summary().liveIoLabels.some((l) =>
      l.includes("history_claim_shape_invalid"),
    )
  ) {
    details.push("Wrong claim outcome → FAILED (edge)");
  } else {
    details.push("Wrong claim outcome unexpectedly passed");
  }

  // Edge deepen — non-number claim apply; NaN verify apply; bad verify phase;
  // terminal outcome not VERIFIED.
  const stringApplyHistory: ReplayWorkflowHistory = {
    events: history.events.map((e) => {
      if (e.activity === "claimAndAccept") {
        return {
          ...e,
          applyAttemptCount: "1" as unknown as number,
        };
      }
      return e;
    }),
    terminal: { ...history.terminal },
  };
  const stringApplyHooks = createHistoryOnlyReplayHooks();
  const stringApplyReplay = replayMissionWorkflowHistory(
    stringApplyHistory,
    stringApplyHooks.hooks,
  );
  if (
    stringApplyReplay.outcome === "FAILED" &&
    stringApplyHooks.summary().liveIoLabels.some((l) =>
      l.includes("history_claim_shape_invalid"),
    )
  ) {
    details.push("Non-number claim applyAttemptCount → FAILED (edge)");
  } else {
    details.push("Non-number claim apply unexpectedly passed");
  }

  const nanVerifyHistory: ReplayWorkflowHistory = {
    events: history.events.map((e) =>
      e.activity === "verify"
        ? { ...e, applyAttemptCount: Number.NaN }
        : e,
    ),
    terminal: { ...history.terminal },
  };
  const nanVerifyHooks = createHistoryOnlyReplayHooks();
  const nanVerifyReplay = replayMissionWorkflowHistory(
    nanVerifyHistory,
    nanVerifyHooks.hooks,
  );
  if (
    nanVerifyReplay.outcome === "FAILED" &&
    nanVerifyHooks.summary().liveIoLabels.some((l) =>
      l.includes("history_verify_shape_invalid"),
    )
  ) {
    details.push("NaN verify applyAttemptCount → FAILED (edge)");
  } else {
    details.push("NaN verify apply unexpectedly passed");
  }

  const badVerifyPhaseHistory: ReplayWorkflowHistory = {
    events: history.events.map((e) => {
      if (e.activity === "verify") {
        return { ...e, phase: "effect_pending" as "succeeded" };
      }
      return e;
    }),
    terminal: { ...history.terminal },
  };
  const badVerifyPhaseHooks = createHistoryOnlyReplayHooks();
  const badVerifyPhaseReplay = replayMissionWorkflowHistory(
    badVerifyPhaseHistory,
    badVerifyPhaseHooks.hooks,
  );
  if (
    badVerifyPhaseReplay.outcome === "FAILED" &&
    badVerifyPhaseHooks.summary().liveIoLabels.some((l) =>
      l.includes("history_verify_shape_invalid"),
    )
  ) {
    details.push("Invalid verify phase → FAILED (edge)");
  } else {
    details.push("Invalid verify phase unexpectedly passed");
  }

  const badTerminalOutcomeHooks = createHistoryOnlyReplayHooks();
  const badTerminalOutcomeReplay = replayMissionWorkflowHistory(
    {
      events: history.events,
      terminal: {
        outcome: "FAILED" as "VERIFIED",
        applyAttemptCount: history.terminal.applyAttemptCount,
        operationId,
      },
    },
    badTerminalOutcomeHooks.hooks,
  );
  if (
    badTerminalOutcomeReplay.outcome === "FAILED" &&
    badTerminalOutcomeHooks.summary().liveIoLabels.some((l) =>
      l.includes("history_terminal_missing_or_incomplete"),
    )
  ) {
    details.push("Terminal outcome not VERIFIED → FAILED (edge)");
  } else {
    details.push("Terminal outcome not VERIFIED unexpectedly passed");
  }

  // B19 — verify apply drift; claim/verify opId disagree.
  const verifyApplyDriftHistory: ReplayWorkflowHistory = {
    events: history.events.map((e) =>
      e.activity === "verify" ? { ...e, applyAttemptCount: 2 } : e,
    ),
    terminal: { ...history.terminal },
  };
  const verifyApplyDriftHooks = createHistoryOnlyReplayHooks();
  const verifyApplyDriftReplay = replayMissionWorkflowHistory(
    verifyApplyDriftHistory,
    verifyApplyDriftHooks.hooks,
  );
  if (
    verifyApplyDriftReplay.outcome === "FAILED" &&
    verifyApplyDriftHooks.summary().liveIoLabels.some((l) =>
      l.includes("history_claim_verify_apply_mismatch"),
    )
  ) {
    details.push(
      "Verify applyAttemptCount drift vs claim/terminal → FAILED (B19)",
    );
  } else {
    details.push("Verify apply drift unexpectedly passed");
  }

  const claimVerifyOpSplitHistory: ReplayWorkflowHistory = {
    events: history.events.map((e) => {
      if (e.activity === "claimAndAccept") {
        return { ...e, operationId: `${operationId}-claim` };
      }
      if (e.activity === "verify") {
        return { ...e, operationId: `${operationId}-verify` };
      }
      return e;
    }),
    terminal: {
      outcome: "VERIFIED",
      applyAttemptCount: history.terminal.applyAttemptCount,
      operationId: `${operationId}-claim`,
    },
  };
  const claimVerifyOpSplitHooks = createHistoryOnlyReplayHooks();
  const claimVerifyOpSplitReplay = replayMissionWorkflowHistory(
    claimVerifyOpSplitHistory,
    claimVerifyOpSplitHooks.hooks,
  );
  if (
    claimVerifyOpSplitReplay.outcome === "FAILED" &&
    claimVerifyOpSplitHooks.summary().liveIoLabels.some((l) =>
      l.includes("history_claim_verify_op_mismatch"),
    )
  ) {
    details.push("Claim/verify operationId disagree → FAILED (B19)");
  } else {
    details.push("Claim/verify opId split unexpectedly passed");
  }

  const rehydrateSvc = openService(stateDir);
  const decisionAfter = await rehydrateSvc.getDecision(operationId);
  const providersAfterReplay = await rehydrateSvc.stores.fakeProvider.list();
  const applyAfterReplay = await rehydrateSvc.stores.effects.countApplyAttempts(
    operationId,
  );
  const thisOpAfter = providersAfterReplay.filter(
    (p) => p.operationId === operationId,
  ).length;
  details.push(
    `Post-replay durable outcome=${decisionAfter?.outcome ?? "missing"} applyCount=${applyAfterReplay} opProviders=${thisOpAfter} ledgerDelta=${providersAfterReplay.length - providersBeforeReplay.length}`,
  );
  if (firstSummary.forbiddenLiveIo > 0) {
    details.push(
      `Forbidden live I/O during replay count=${firstSummary.forbiddenLiveIo} labels=${firstSummary.liveIoLabels.join(",")}`,
    );
  } else {
    details.push(
      "Replay used recorded activity history only — no acceptPending/applyOnce during replay",
    );
  }

  const passed =
    accepted.providerCreated === true &&
    accepted.applyAttemptCount === 1 &&
    verified.matched === true &&
    verified.decision.outcome === "VERIFIED" &&
    verified.applyAttemptCount === 1 &&
    history.events.length === 3 &&
    history.terminal.outcome === "VERIFIED" &&
    replayed.outcome === "VERIFIED" &&
    replayed.applyAttemptCount === 1 &&
    replayed.operationId === operationId &&
    firstSummary.scheduledFromHistory === 3 &&
    firstSummary.forbiddenLiveIo === 0 &&
    firstSummary.externalEffects === "NONE" &&
    firstSummary.liveProviderWiring === "NOT_WIRED" &&
    secondReplay.outcome === "VERIFIED" &&
    secondSummary.scheduledFromHistory === 3 &&
    secondSummary.forbiddenLiveIo === 0 &&
    emptyFail.outcome.outcome === "FAILED" &&
    emptyFail.summary.forbiddenLiveIo > 0 &&
    partialFail.outcome.outcome === "FAILED" &&
    partialFail.summary.forbiddenLiveIo > 0 &&
    twoEventFail.outcome.outcome === "FAILED" &&
    twoEventFail.summary.forbiddenLiveIo > 0 &&
    missingTerminal.outcome === "FAILED" &&
    driftReplay.outcome === "FAILED" &&
    applyDriftReplay.outcome === "FAILED" &&
    negTerminal.outcome === "FAILED" &&
    blankWfReplay.outcome === "FAILED" &&
    paddedTerminal.outcome === "VERIFIED" &&
    infTerminal.outcome === "FAILED" &&
    unmatchedReplay.outcome === "FAILED" &&
    blankClaimReplay.outcome === "FAILED" &&
    blankVerifyReplay.outcome === "FAILED" &&
    paddedActsReplay.outcome === "VERIFIED" &&
    floatTerminal.outcome === "FAILED" &&
    badClaimReplay.outcome === "FAILED" &&
    badClaimApplyReplay.outcome === "FAILED" &&
    badVerifyReplay.outcome === "FAILED" &&
    paddedWfReplay.outcome === "VERIFIED" &&
    badEnqReplay.outcome === "FAILED" &&
    noProviderReplay.outcome === "FAILED" &&
    zeroApplyReplay.outcome === "FAILED" &&
    zeroVerifyReplay.outcome === "FAILED" &&
    infClaimReplay.outcome === "FAILED" &&
    wrongClaimReplay.outcome === "FAILED" &&
    stringApplyReplay.outcome === "FAILED" &&
    nanVerifyReplay.outcome === "FAILED" &&
    badVerifyPhaseReplay.outcome === "FAILED" &&
    badTerminalOutcomeReplay.outcome === "FAILED" &&
    verifyApplyDriftReplay.outcome === "FAILED" &&
    claimVerifyOpSplitReplay.outcome === "FAILED" &&
    applyBeforeReplay === 1 &&
    applyAfterReplay === 1 &&
    thisOpBefore === 1 &&
    thisOpAfter === 1 &&
    providersAfterReplay.length === providersBeforeReplay.length &&
    decisionAfter?.outcome === "VERIFIED";

  if (passed) {
    details.push(
      "Historical workflow replay: no repeated external I/O (externalEffects=NONE)",
    );
  } else {
    details.push("Historical workflow replay failed honesty checks");
  }
  details.push(
    "liveProviderSuccessClaimed=false catalogClaim=ACCEPTED≠VERIFIED",
  );

  return {
    proofId: `proof-replay-hist-${operationId}`,
    kind: SoakProofKind.REPLAY_HISTORICAL_NO_REPEAT_IO,
    passed,
    details,
    applyAttemptCount: applyAfterReplay,
    operationId,
    createdAtIso: nowPlus(nowIso, 3_000),
    fixtureOnly: true,
  };
}
