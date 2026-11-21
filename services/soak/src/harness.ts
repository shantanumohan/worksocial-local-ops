/**
 * Soak / recovery harness — crash-restart, no duplicate effects,
 * durable job/effect continuity, unknown-remote reconcile.
 * Uses file-backed durable stores so a second process image can resume.
 * External effects: none (fake provider only).
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  SoakProofKind,
  type SoakProofKindValue,
  type SoakProofRecord,
} from "@worksocial/domain";
import {
  createDurableExecutionService,
  createFileDurableStores,
  newJobId,
  type AcceptPendingInput,
  type DurableExecutionService,
} from "@worksocial/persistence";

export type SoakHarnessResult = {
  proofs: SoakProofRecord[];
  allPassed: boolean;
  details: string[];
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
    gateDetails: ["soak_harness"],
  };
}

function jobFields(operationId: string, jobId: string, idem: string) {
  return {
    jobId,
    roleId: "A19",
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

async function proofCrashRestart(
  stateDir: string,
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  const operationId = `soak-restart-${randomUUID()}`;
  const bizKey = `biz-soak-restart-${operationId}`;
  const digest = `digest-${operationId}`;
  const jobId = newJobId();

  const a = openService(stateDir);
  const accepted = await a.acceptPending({
    job: jobFields(operationId, jobId, `soak/restart/${operationId}`),
    operationId,
    payloadDigest: digest,
    businessIdempotencyKey: bizKey,
    decision: decisionFields(operationId, digest, nowIso, "soak crash-restart accept"),
    nowIso,
  });
  details.push(`Accepted ACCEPTED_PENDING applyCount=${accepted.applyAttemptCount}`);

  const b = openService(stateDir);
  const decision = await b.getDecision(operationId);
  if (!decision || decision.outcome !== "ACCEPTED_PENDING") {
    details.push(`After restart decision=${decision?.outcome ?? "missing"}`);
    return failProof(
      SoakProofKind.CRASH_RESTART,
      details,
      accepted.applyAttemptCount,
      operationId,
      nowIso,
    );
  }
  details.push("Rehydrated ACCEPTED_PENDING after restart");

  const verified = await b.verifyIndependent({
    operationId,
    observedDigest: digest,
    nowIso: nowPlus(nowIso, 1000),
  });
  details.push(
    `Verified matched=${verified.matched} applyCount=${verified.applyAttemptCount}`,
  );
  const passed =
    verified.matched &&
    verified.applyAttemptCount === 1 &&
    verified.decision.outcome === "VERIFIED";

  return {
    proofId: `proof-crash-${operationId}`,
    kind: SoakProofKind.CRASH_RESTART,
    passed,
    details,
    applyAttemptCount: verified.applyAttemptCount,
    operationId,
    createdAtIso: nowPlus(nowIso, 1000),
    fixtureOnly: true,
  };
}

async function proofNoDuplicateEffects(
  stateDir: string,
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  const operationId = `soak-nodup-${randomUUID()}`;
  const bizKey = `biz-soak-nodup-${operationId}`;
  const digest = `digest-${operationId}`;
  const jobId = newJobId();
  const idem = `soak/nodup/${operationId}`;

  const svc = openService(stateDir);
  const first = await svc.acceptPending({
    job: jobFields(operationId, jobId, idem),
    operationId,
    payloadDigest: digest,
    businessIdempotencyKey: bizKey,
    decision: decisionFields(operationId, digest, nowIso, "soak no-dup first"),
    nowIso,
  });
  details.push(`First apply created=${first.providerCreated}`);

  const second = await svc.acceptPending({
    job: jobFields(operationId, jobId, idem),
    operationId,
    payloadDigest: digest,
    businessIdempotencyKey: bizKey,
    decision: decisionFields(
      operationId,
      digest,
      nowPlus(nowIso, 500),
      "soak no-dup retry",
    ),
    nowIso: nowPlus(nowIso, 500),
  });
  details.push(
    `Retry providerCreated=${second.providerCreated} applyCount=${second.applyAttemptCount}`,
  );

  const passed =
    first.providerCreated === true &&
    second.providerCreated === false &&
    second.applyAttemptCount === 1;

  return {
    proofId: `proof-nodup-${operationId}`,
    kind: SoakProofKind.NO_DUPLICATE_EFFECTS,
    passed,
    details,
    applyAttemptCount: second.applyAttemptCount,
    operationId,
    createdAtIso: nowPlus(nowIso, 500),
    fixtureOnly: true,
  };
}

async function proofJobContinuity(
  stateDir: string,
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  const operationId = `soak-job-${randomUUID()}`;
  const bizKey = `biz-soak-job-${operationId}`;
  const digest = `digest-${operationId}`;
  const jobId = newJobId();
  const idem = `soak/job/${operationId}`;

  const a = openService(stateDir);
  const accepted = await a.acceptPending({
    job: jobFields(operationId, jobId, idem),
    operationId,
    payloadDigest: digest,
    businessIdempotencyKey: bizKey,
    decision: decisionFields(operationId, digest, nowIso, "soak job continuity"),
    nowIso,
  });
  details.push(`Job ${accepted.job.jobId} recorded`);

  const b = openService(stateDir);
  const again = await b.stores.jobs.insertIdempotent(
    jobFields(operationId, newJobId(), idem),
  );
  details.push(
    `After restart created=${again.created} sameJob=${again.job.jobId === accepted.job.jobId}`,
  );

  const decision = await b.getDecision(operationId);
  const passed =
    again.created === false &&
    again.job.jobId === accepted.job.jobId &&
    decision?.outcome === "ACCEPTED_PENDING";

  return {
    proofId: `proof-job-${operationId}`,
    kind: SoakProofKind.JOB_CONTINUITY,
    passed,
    details,
    applyAttemptCount: accepted.applyAttemptCount,
    operationId,
    createdAtIso: nowPlus(nowIso, 200),
    fixtureOnly: true,
  };
}

async function proofUnknownRemoteReconcile(
  stateDir: string,
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  const operationId = `soak-reconcile-${randomUUID()}`;
  const bizKey = `biz-soak-reconcile-${operationId}`;
  const digest = `digest-${operationId}`;

  const a = openService(stateDir);
  const accepted = await a.acceptPending({
    job: jobFields(operationId, newJobId(), `soak/reconcile/${operationId}`),
    operationId,
    payloadDigest: digest,
    businessIdempotencyKey: bizKey,
    decision: decisionFields(operationId, digest, nowIso, "soak unknown remote"),
    nowIso,
  });
  details.push(
    `Left ACCEPTED_PENDING (unknown until independent read) apply=${accepted.applyAttemptCount}`,
  );

  const b = openService(stateDir);
  const provider = await b.stores.fakeProvider.getByBusinessKey(bizKey);
  if (!provider) {
    details.push("Missing provider effect after restart — cannot reconcile");
    return failProof(
      SoakProofKind.UNKNOWN_REMOTE_RECONCILE,
      details,
      accepted.applyAttemptCount,
      operationId,
      nowIso,
    );
  }
  details.push(`Reconciled remoteRef=${provider.remoteRef} without re-apply`);

  const verified = await b.verifyIndependent({
    operationId,
    observedDigest: digest,
    nowIso: nowPlus(nowIso, 1500),
  });
  details.push(
    `Post-reconcile verified matched=${verified.matched} applyCount=${verified.applyAttemptCount}`,
  );

  const passed =
    verified.matched &&
    verified.applyAttemptCount === 1 &&
    verified.decision.outcome === "VERIFIED";

  return {
    proofId: `proof-reconcile-${operationId}`,
    kind: SoakProofKind.UNKNOWN_REMOTE_RECONCILE,
    passed,
    details,
    applyAttemptCount: verified.applyAttemptCount,
    operationId,
    createdAtIso: nowPlus(nowIso, 1500),
    fixtureOnly: true,
  };
}

function failProof(
  kind: SoakProofKindValue,
  details: string[],
  applyAttemptCount: number | null,
  operationId: string,
  nowIso: string,
): SoakProofRecord {
  return {
    proofId: `proof-fail-${kind}-${randomUUID()}`,
    kind,
    passed: false,
    details,
    applyAttemptCount,
    operationId,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}

/**
 * Run the four soak proofs against a dedicated durable state directory.
 * Safe for CI (seconds) and for a documented local 72h owner soak wrapper.
 */
export async function runSoakRecoveryHarness(input: {
  stateDir: string;
  nowIso?: string;
}): Promise<SoakHarnessResult> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const durableDir = join(input.stateDir, "durable-soak");
  const proofs: SoakProofRecord[] = [];

  proofs.push(await proofCrashRestart(durableDir, nowIso));
  proofs.push(await proofNoDuplicateEffects(durableDir, nowPlus(nowIso, 10_000)));
  proofs.push(await proofJobContinuity(durableDir, nowPlus(nowIso, 20_000)));
  proofs.push(
    await proofUnknownRemoteReconcile(durableDir, nowPlus(nowIso, 30_000)),
  );

  const allPassed = proofs.every((p) => p.passed);
  return {
    proofs,
    allPassed,
    details: [
      allPassed
        ? "All soak recovery proofs passed (fixture / LOCAL_DURABLE)"
        : "One or more soak recovery proofs failed",
      "External effects: NONE — fake provider only",
      "Live CMS/GSC/GA4/Zoho/Temporal remain NOT_WIRED",
    ],
  };
}
