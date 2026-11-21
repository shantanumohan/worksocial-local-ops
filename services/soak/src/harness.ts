/**
 * Soak / recovery harness — crash-restart, no duplicate effects,
 * durable job/effect continuity, unknown-remote reconcile,
 * backup/omit-receipt post-restore reconcile (T-X066),
 * recover/rotate/reconcile/offboard (T-F24 / T-US-047),
 * competing-supervisor / singleton host lease (T-US-002 / T-X002),
 * self-approval rejected / independent A25 (T-X018 / T-US-054),
 * offboard ACTIVE_TOKEN residual incomplete-until-revoked (T-X073),
 * emergency stop at commit (T-US-060),
 * forged browser role ignored (T-X005),
 * cross-workspace reference denied (T-X006),
 * approved payload edit / stale approval invalidated (T-X019 / T-US-036).
 * Uses file-backed durable stores so a second process image can resume.
 * External effects: none (fake provider only).
 */

import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
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
  type FakeProviderEffect,
} from "@worksocial/persistence";
import { proofRecoverRotateReconcile } from "./recover-rotate-proof.js";
import { proofCompetingSupervisorLease } from "./competing-supervisor-proof.js";
import { proofSelfApprovalRejected } from "./self-approval-proof.js";
import { proofOffboardActiveTokenResidual } from "./offboard-active-token-proof.js";
import { proofEmergencyStopAtCommit } from "./emergency-stop-proof.js";
import { proofForgedBrowserRoleIgnored } from "./forged-browser-role-proof.js";
import { proofCrossWorkspaceReferenceDenied } from "./cross-workspace-reference-proof.js";
import { proofApprovedPayloadEditInvalidated } from "./approved-payload-edit-proof.js";

type FileLedgerSnapshot = {
  version: 1;
  jobs: unknown[];
  intents: unknown[];
  attempts: unknown[];
  decisions: unknown[];
  receipts: unknown[];
  providerEffects: FakeProviderEffect[];
};

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

function readLedger(stateDir: string): FileLedgerSnapshot {
  const ledgerPath = join(stateDir, "durable", "ledger.json");
  if (!existsSync(ledgerPath)) {
    throw new Error(`Missing ledger at ${ledgerPath}`);
  }
  return JSON.parse(readFileSync(ledgerPath, "utf8")) as FileLedgerSnapshot;
}

function writeLedger(stateDir: string, snap: FileLedgerSnapshot): void {
  const ledgerPath = join(stateDir, "durable", "ledger.json");
  mkdirSync(join(stateDir, "durable"), { recursive: true });
  writeFileSync(ledgerPath, JSON.stringify(snap, null, 2), "utf8");
}

/**
 * T-X066: backup omits remote receipt → restore → reconcile from remote
 * system-of-record → verify / retry without a second apply.
 * Distinct from NO_DUPLICATE_EFFECTS (retry-only idempotency).
 */
async function proofBackupOmitReceipt(
  stateDir: string,
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  const operationId = `soak-backup-${randomUUID()}`;
  const bizKey = `biz-soak-backup-${operationId}`;
  const digest = `digest-${operationId}`;
  const jobId = newJobId();
  const idem = `soak/backup/${operationId}`;
  const primaryDir = join(stateDir, "backup-primary");
  const restoreDir = join(stateDir, "backup-restore");
  const remotePath = join(stateDir, "remote-provider-effects.json");
  const omitBackupPath = join(stateDir, "omit-receipt-backup.json");

  const primary = openService(primaryDir);
  const accepted = await primary.acceptPending({
    job: jobFields(operationId, jobId, idem),
    operationId,
    payloadDigest: digest,
    businessIdempotencyKey: bizKey,
    decision: decisionFields(
      operationId,
      digest,
      nowIso,
      "soak backup omit-receipt apply",
    ),
    nowIso,
  });
  details.push(
    `Applied ACCEPTED_PENDING applyCount=${accepted.applyAttemptCount} remoteRef=${accepted.provider.remoteRef}`,
  );

  const full = readLedger(primaryDir);
  if (full.providerEffects.length === 0 || full.receipts.length === 0) {
    details.push("Primary ledger missing provider effect or receipt after apply");
    return failProof(
      SoakProofKind.BACKUP_OMIT_RECEIPT,
      details,
      accepted.applyAttemptCount,
      operationId,
      nowIso,
    );
  }

  // Remote system of record still holds the effect (not part of the local backup).
  writeFileSync(
    remotePath,
    JSON.stringify(full.providerEffects, null, 2),
    "utf8",
  );

  // Backup intentionally omits remote receipt + local provider ledger copy.
  const omitBackup: FileLedgerSnapshot = {
    ...full,
    providerEffects: [],
    receipts: [],
  };
  writeFileSync(omitBackupPath, JSON.stringify(omitBackup, null, 2), "utf8");
  details.push(
    "Omit-receipt backup written (providerEffects=[] receipts=[]); remote ledger preserved separately",
  );

  writeLedger(restoreDir, omitBackup);

  const afterRestore = openService(restoreDir);
  const restoredDecision = await afterRestore.getDecision(operationId);
  const omittedLocal = await afterRestore.stores.fakeProvider.getByOperation(
    operationId,
  );
  const omittedReceipts = await afterRestore.stores.receipts.listForOperation(
    operationId,
  );
  details.push(
    `Post-restore decision=${restoredDecision?.outcome ?? "missing"} localProvider=${omittedLocal ? "present" : "omitted"} receipts=${omittedReceipts.length}`,
  );

  if (
    restoredDecision?.outcome !== "ACCEPTED_PENDING" ||
    omittedLocal !== undefined ||
    omittedReceipts.length !== 0
  ) {
    details.push("Restore did not produce ACCEPTED_PENDING with omitted receipt");
    return failProof(
      SoakProofKind.BACKUP_OMIT_RECEIPT,
      details,
      accepted.applyAttemptCount,
      operationId,
      nowIso,
    );
  }

  // Reconcile: rehydrate provider effects from remote SoR without a new apply.
  const remoteEffects = JSON.parse(
    readFileSync(remotePath, "utf8"),
  ) as FakeProviderEffect[];
  const restoredSnap = readLedger(restoreDir);
  writeLedger(restoreDir, {
    ...restoredSnap,
    providerEffects: remoteEffects,
  });
  details.push(
    `Reconciled remoteRef=${remoteEffects[0]?.remoteRef ?? "missing"} from remote SoR without re-apply`,
  );

  const reconciled = openService(restoreDir);
  const applyBeforeVerify =
    await reconciled.stores.effects.countApplyAttempts(operationId);
  const verified = await reconciled.verifyIndependent({
    operationId,
    observedDigest: digest,
    nowIso: nowPlus(nowIso, 2000),
  });
  details.push(
    `Post-reconcile verified matched=${verified.matched} applyCount=${verified.applyAttemptCount}`,
  );

  const retry = await reconciled.acceptPending({
    job: jobFields(operationId, jobId, idem),
    operationId,
    payloadDigest: digest,
    businessIdempotencyKey: bizKey,
    decision: decisionFields(
      operationId,
      digest,
      nowPlus(nowIso, 2500),
      "soak backup post-reconcile retry",
    ),
    nowIso: nowPlus(nowIso, 2500),
  });
  details.push(
    `Post-reconcile retry providerCreated=${retry.providerCreated} applyCount=${retry.applyAttemptCount}`,
  );

  const passed =
    applyBeforeVerify === 1 &&
    verified.matched === true &&
    verified.applyAttemptCount === 1 &&
    verified.decision.outcome === "VERIFIED" &&
    retry.providerCreated === false &&
    retry.applyAttemptCount === 1;

  return {
    proofId: `proof-backup-${operationId}`,
    kind: SoakProofKind.BACKUP_OMIT_RECEIPT,
    passed,
    details,
    applyAttemptCount: verified.applyAttemptCount,
    operationId,
    createdAtIso: nowPlus(nowIso, 2500),
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
 * Run soak proofs (incl. T-X066 backup/omit-receipt, T-F24/T-US-047
 * recover/rotate/reconcile, T-US-002/T-X002 competing-supervisor lease,
 * T-X018/T-US-054 self-approval rejected, T-X073 offboard ACTIVE_TOKEN
 * residual, and T-US-060 emergency stop at commit) against a dedicated
 * durable state directory.
 * Safe for CI and documented 72h owner soak wrappers.
 * Pilot gate still requires the original four recovery proofs; backup proof
 * feeds fixture ACCEPTED for T-X066 only; recover/rotate feeds T-F24/T-US-047;
 * competing-supervisor lease feeds T-US-002/T-X002; self-approval feeds
 * T-X018/T-US-054; offboard ACTIVE_TOKEN residual feeds T-X073; emergency
 * stop feeds T-US-060; forged browser role feeds T-X005; cross-workspace
 * reference feeds T-X006; approved payload edit feeds T-X019/T-US-036.
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
  proofs.push(
    await proofBackupOmitReceipt(durableDir, nowPlus(nowIso, 40_000)),
  );
  proofs.push(
    await proofRecoverRotateReconcile(durableDir, nowPlus(nowIso, 50_000)),
  );
  proofs.push(proofCompetingSupervisorLease(nowPlus(nowIso, 60_000)));
  proofs.push(proofSelfApprovalRejected(nowPlus(nowIso, 70_000)));
  proofs.push(
    await proofOffboardActiveTokenResidual(durableDir, nowPlus(nowIso, 80_000)),
  );
  proofs.push(proofEmergencyStopAtCommit(nowPlus(nowIso, 90_000)));
  proofs.push(proofForgedBrowserRoleIgnored(nowPlus(nowIso, 100_000)));
  proofs.push(proofCrossWorkspaceReferenceDenied(nowPlus(nowIso, 110_000)));
  proofs.push(proofApprovedPayloadEditInvalidated(nowPlus(nowIso, 120_000)));

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
      "T-F24/T-US-047 fixture ACCEPTED via recover_rotate_reconcile only — not live VERIFIED",
      "T-US-002/T-X002 fixture ACCEPTED via competing_supervisor_lease only — not live VERIFIED",
      "T-X018/T-US-054 fixture ACCEPTED via self_approval_rejected only — not live VERIFIED",
      "T-X073 fixture ACCEPTED via offboard_active_token_residual only — incomplete until live revoke; not live VERIFIED",
      "T-US-060 fixture ACCEPTED via emergency_stop_at_commit only — not live VERIFIED",
      "T-X005 fixture ACCEPTED via forged_browser_role_ignored only — not live VERIFIED",
      "T-X006 fixture ACCEPTED via cross_workspace_reference_denied only — not live VERIFIED",
      "T-X019/T-US-036 fixture ACCEPTED via approved_payload_edit_invalidated only — not live VERIFIED",
    ],
  };
}
