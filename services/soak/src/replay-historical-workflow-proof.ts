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
 *
 * Distinct from mid-flight NO_DUPLICATE_EFFECTS (ACCEPTED_PENDING retry) and
 * from CRASH_RESTART (resume then verify once). Also distinct from merely
 * re-calling acceptPending on a VERIFIED decision — that is not history replay.
 * External effects: NONE. Never invents live catalog VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
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

type ActivityName = "enqueue" | "claimAndAccept" | "verify";

type ActivityResult =
  | { activity: "enqueue"; workflowId: string; phase: "queued" }
  | {
      activity: "claimAndAccept";
      phase: "effect_pending";
      outcome: "ACCEPTED_PENDING";
      applyAttemptCount: number;
      providerCreated: boolean;
      operationId: string;
    }
  | {
      activity: "verify";
      phase: "succeeded";
      outcome: "VERIFIED";
      applyAttemptCount: number;
      matched: boolean;
      operationId: string;
    };

type WorkflowHistory = {
  events: ActivityResult[];
  terminal: {
    outcome: "VERIFIED";
    applyAttemptCount: number;
    operationId: string;
  };
};

type ReplayHooks = {
  onScheduleActivity: (
    name: ActivityName,
    recorded: ActivityResult,
  ) => ActivityResult;
  onForbiddenLiveIo: (label: string) => void;
};

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

function runMissionWorkflowControlFlow(hooks: {
  enqueue: () => ActivityResult;
  claimAndAccept: () => ActivityResult;
  verify: () => ActivityResult;
}): {
  outcome: "VERIFIED" | "FAILED";
  applyAttemptCount: number;
  operationId: string;
} {
  const enq = hooks.enqueue();
  if (enq.activity !== "enqueue" || enq.phase !== "queued") {
    return { outcome: "FAILED", applyAttemptCount: 0, operationId: "unknown" };
  }
  const accepted = hooks.claimAndAccept();
  if (accepted.activity !== "claimAndAccept") {
    return { outcome: "FAILED", applyAttemptCount: 0, operationId: "unknown" };
  }
  const verified = hooks.verify();
  if (verified.activity !== "verify") {
    return {
      outcome: "FAILED",
      applyAttemptCount: accepted.applyAttemptCount,
      operationId: accepted.operationId,
    };
  }
  if (verified.outcome !== "VERIFIED" || !verified.matched) {
    return {
      outcome: "FAILED",
      applyAttemptCount: accepted.applyAttemptCount,
      operationId: accepted.operationId,
    };
  }
  return {
    outcome: "VERIFIED",
    applyAttemptCount: verified.applyAttemptCount,
    operationId: verified.operationId,
  };
}

function replayMissionWorkflowHistory(
  history: WorkflowHistory,
  hooks: ReplayHooks,
): {
  outcome: "VERIFIED" | "FAILED";
  applyAttemptCount: number;
  operationId: string;
} {
  let cursor = 0;
  const take = (expected: ActivityName): ActivityResult => {
    const recorded = history.events[cursor];
    cursor += 1;
    if (!recorded || recorded.activity !== expected) {
      hooks.onForbiddenLiveIo(
        `history_mismatch expected=${expected} got=${recorded?.activity ?? "eof"}`,
      );
      return {
        activity: "verify",
        phase: "succeeded",
        outcome: "VERIFIED",
        applyAttemptCount: -1,
        matched: false,
        operationId: "mismatch",
      };
    }
    return hooks.onScheduleActivity(expected, recorded);
  };

  const result = runMissionWorkflowControlFlow({
    enqueue: () => take("enqueue"),
    claimAndAccept: () => take("claimAndAccept"),
    verify: () => take("verify"),
  });

  if (cursor !== history.events.length) {
    hooks.onForbiddenLiveIo(
      `history_unread_tail remaining=${history.events.length - cursor}`,
    );
    return { ...result, outcome: "FAILED" };
  }
  return result;
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
  const historyEvents: ActivityResult[] = [];

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

  const history: WorkflowHistory = {
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

  let forbiddenLiveIo = 0;
  let scheduledFromHistory = 0;
  const liveIoLabels: string[] = [];

  const forbiddenLiveHooks: ReplayHooks = {
    onScheduleActivity: (name, recorded) => {
      if (recorded.activity !== name) {
        forbiddenLiveIo += 1;
        liveIoLabels.push(`schedule_mismatch:${name}`);
        throw new Error(`Replay scheduled ${name} with mismatched history`);
      }
      scheduledFromHistory += 1;
      return recorded;
    },
    onForbiddenLiveIo: (label) => {
      forbiddenLiveIo += 1;
      liveIoLabels.push(label);
    },
  };

  const replayed = replayMissionWorkflowHistory(history, forbiddenLiveHooks);
  details.push(
    `History replay outcome=${replayed.outcome} applyCount=${replayed.applyAttemptCount} scheduledFromHistory=${scheduledFromHistory}`,
  );

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
  if (forbiddenLiveIo > 0) {
    details.push(
      `Forbidden live I/O during replay count=${forbiddenLiveIo} labels=${liveIoLabels.join(",")}`,
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
    scheduledFromHistory === 3 &&
    forbiddenLiveIo === 0 &&
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
