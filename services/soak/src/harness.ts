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
 * approved payload edit / stale approval invalidated (T-X019 / T-US-036),
 * cross-workspace resource substitution (T-US-057),
 * agent cannot widen grant (T-US-024),
 * repair weaken test rejected (T-US-042 / T-X057),
 * takeover cancels unsent replies (T-US-044 / T-X053),
 * EVAL_ONLY operational tool forbidden (T-US-018 / T-X037),
 * repair attempt limit escalated (T-X058),
 * imported doc quarantined as data (T-X069),
 * eval no-grounding fail closed (T-X038),
 * metric denominators honest (T-X039 / T-US-058),
 * hard search constraints no invention (T-US-046 / T-X048),
 * GSC omitted rows unknown not zero (T-US-010 / T-X033),
 * GA4 debug not delivered conversion (T-US-008 / T-X032),
 * GA4 wrong property kind refused (T-X031),
 * thank-you without CRM fails delivery (T-US-040 / T-X049),
 * stop after provider dispatch reconcile (T-X017),
 * old fence after reassignment (T-X024),
 * output bomb bounded/quarantined (T-X011),
 * symlink escape after root verification (T-X003),
 * public synthetic flag requires server grant (T-X050),
 * malicious prompt no shell injection (T-X010).
 * DST recurring schedule no duplicates (T-X015).
 * wrong CMS environment no production op (T-X007).
 * stop before dispatch claim — no adapter mutation (T-X016),
 * idempotency key payload mismatch (T-X022).
 * worker browser auth state OS deny (T-X065).
 * external human edit during staging conflict retained (T-X025).
 * validated payload not collected separate failure states (T-X070).
 * unbound write path fail closed (T-US-006).
 * rate-limit bounded backoff preserves deadline (T-X030).
 * low-sample trend spike insufficient evidence (T-X040).
 * Google Ads test vs production access separated (T-US-012).
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
import { proofExternalHumanEditConflictRetained } from "./external-human-edit-staging-proof.js";
import { proofOptimizationBreaksCtaJourneyFails } from "./optimization-breaks-cta-proof.js";
import { proofConcurrentFinalBudgetReservationCap } from "./concurrent-final-budget-reservation-proof.js";
import { proofSyntheticConversionContaminationExcluded } from "./synthetic-conversion-contamination-proof.js";
import { proofReplySentCrmReconcilesNoResend } from "./reply-sent-crm-reconcile-proof.js";
import { proofUnknownPolicyQuestionEscalatesWithoutPromise } from "./unknown-policy-question-proof.js";
import { proofAutomatedResponseLoopBoundedHandoff } from "./automated-response-loop-proof.js";
import { proofDuplicatePlatformAttributionOneBooking } from "./duplicate-platform-attribution-proof.js";
import { proofCurrencyTimezoneMismatchNoSilentSum } from "./currency-timezone-mismatch-proof.js";
import { proofValidatedPayloadNotCollectedSeparateStates } from "./validated-payload-not-collected-proof.js";
import { proofUnboundWritePathFailClosed } from "./unbound-write-path-proof.js";
import { proofEventualConsistencyFalseNotFound } from "./eventual-consistency-false-not-found-proof.js";
import { proofMockedConnectorNotProductionReady } from "./mocked-connector-not-production-ready-proof.js";
import { proofRateLimitBoundedBackoffPreservesDeadline } from "./rate-limit-deadline-proof.js";
import { proofLowSampleTrendSpikeInsufficientEvidence } from "./low-sample-trend-spike-proof.js";
import { proofGoogleAdsTestProductionAccessSeparated } from "./google-ads-test-production-access-proof.js";
import { runExplicitAccountRebindProof } from "@worksocial/credential-rotation";
import { proofCrossWorkspaceResourceSubstitution } from "./cross-workspace-substitution-proof.js";
import { proofAgentCannotWidenGrant } from "./agent-cannot-widen-grant-proof.js";
import { proofRepairWeakenTestRejected } from "./repair-weaken-test-proof.js";
import { proofTakeoverCancelsUnsentReplies } from "./takeover-cancel-unsent-proof.js";
import { proofEvalOnlyOperationalToolForbidden } from "./eval-only-operational-tool-proof.js";
import { proofRepairAttemptLimitEscalated } from "./repair-attempt-limit-proof.js";
import { proofImportedDocQuarantinedAsData } from "./imported-doc-quarantine-proof.js";
import { proofEvalNoGroundingFailClosed } from "./eval-no-grounding-proof.js";
import { proofMetricDenominatorsHonest } from "./metric-denominators-proof.js";
import { proofHardSearchConstraintsNoInvention } from "./hard-search-constraints-proof.js";
import { proofGscOmittedRowsUnknownNotZero } from "./gsc-omitted-rows-proof.js";
import { proofGa4DebugNotDeliveredConversion } from "./ga4-debug-not-delivered-proof.js";
import { proofGa4WrongPropertyKindRefused } from "./ga4-wrong-property-kind-proof.js";
import { proofThankYouWithoutCrmFailsDelivery } from "./thank-you-without-crm-proof.js";
import { proofStopAfterDispatchReconcile } from "./stop-after-dispatch-proof.js";
import { proofOldFenceAfterReassignment } from "./old-fence-after-reassignment-proof.js";
import { proofOutputBombBoundedQuarantined } from "./output-bomb-proof.js";
import { proofSymlinkEscapeAfterRootVerification } from "./symlink-escape-proof.js";
import { proofPublicSyntheticFlagRequiresServerGrant } from "./public-synthetic-flag-proof.js";
import { proofMaliciousPromptNoShellInjection } from "./malicious-prompt-interpolation-proof.js";
import { proofCliErrorDespiteExitZero } from "./cli-error-despite-exit-zero-proof.js";
import { proofDstRecurringScheduleNoDuplicates } from "./dst-recurring-schedule-proof.js";
import { proofHostSleepMonitoringCoverageGap } from "./host-sleep-monitoring-proof.js";
import { proofConcurrentIdempotentRelease } from "./concurrent-idempotent-release-proof.js";
import { proofFactChangesAfterReviewStale } from "./fact-changes-after-review-proof.js";
import { proofOrphanWorkerDeadlineTreeStopped } from "./orphan-worker-deadline-proof.js";
import { proofWrongCmsEnvironmentNoProductionOp } from "./wrong-cms-environment-proof.js";
import { proofStopBeforeDispatchClaim } from "./stop-before-dispatch-proof.js";
import { proofIndirectPromptInjectionExfilDenied } from "./indirect-prompt-injection-exfil-proof.js";
import { proofUnlicensedVenueMediaPublishBlocked } from "./unlicensed-venue-media-proof.js";
import { proofPartialCampaignDestinationsPerState } from "./partial-campaign-destinations-proof.js";
import { proofIdempotencyKeyPayloadMismatch } from "./idempotency-key-payload-mismatch-proof.js";
import { proofWorkerBrowserAuthStateOsDenied } from "./browser-auth-state-proof.js";
import { proofUnknownUsageCancelHoldsResidual } from "./unknown-usage-cancel-proof.js";
import { proofActualCostExceedsEstimateOverrunVisible } from "./actual-cost-exceeds-estimate-proof.js";
import { proofReplayHistoricalNoRepeatIo } from "./replay-historical-workflow-proof.js";
import { proofDiskFullEvidenceNoPartialCompleted } from "./disk-full-evidence-proof.js";

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
 * reference feeds T-X006; approved payload edit feeds T-X019/T-US-036; explicit rebind feeds T-X029;
 * cross-workspace substitution feeds T-US-057; agent cannot widen grant feeds T-US-024;
 * repair weaken test feeds T-US-042/T-X057; takeover cancel feeds T-US-044/T-X053;
 * EVAL_ONLY operational tool forbid feeds T-US-018/T-X037;
 * repair attempt limit feeds T-X058;
 * imported-doc quarantine feeds T-X069; eval no-grounding feeds T-X038;
 * metric denominators honest feeds T-X039/T-US-058;
 * hard search constraints feeds T-US-046/T-X048;
 * GSC omitted rows feeds T-US-010/T-X033;
 * GA4 debug not delivered feeds T-US-008/T-X032;
 * GA4 wrong property kind feeds T-X031;
 * thank-you without CRM feeds T-US-040/T-X049.
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
  proofs.push(
    await runExplicitAccountRebindProof({
      stateDir: join(input.stateDir, `credential-rebind-${randomUUID().slice(0, 8)}`),
      nowIso: nowPlus(nowIso, 130_000),
    }),
  );
  proofs.push(proofCrossWorkspaceResourceSubstitution(nowPlus(nowIso, 140_000)));
  proofs.push(proofAgentCannotWidenGrant(nowPlus(nowIso, 150_000)));
  proofs.push(proofRepairWeakenTestRejected(nowPlus(nowIso, 160_000)));
  proofs.push(proofTakeoverCancelsUnsentReplies(nowPlus(nowIso, 170_000)));
  proofs.push(proofEvalOnlyOperationalToolForbidden(nowPlus(nowIso, 180_000)));
  proofs.push(proofRepairAttemptLimitEscalated(nowPlus(nowIso, 190_000)));
  proofs.push(proofImportedDocQuarantinedAsData(nowPlus(nowIso, 200_000)));
  proofs.push(proofEvalNoGroundingFailClosed(nowPlus(nowIso, 210_000)));
  proofs.push(proofMetricDenominatorsHonest(nowPlus(nowIso, 220_000)));
  proofs.push(proofHardSearchConstraintsNoInvention(nowPlus(nowIso, 230_000)));
  proofs.push(proofGscOmittedRowsUnknownNotZero(nowPlus(nowIso, 240_000)));
  proofs.push(proofGa4DebugNotDeliveredConversion(nowPlus(nowIso, 250_000)));
  proofs.push(proofGa4WrongPropertyKindRefused(nowPlus(nowIso, 260_000)));
  proofs.push(proofThankYouWithoutCrmFailsDelivery(nowPlus(nowIso, 270_000)));
  proofs.push(proofStopAfterDispatchReconcile(nowPlus(nowIso, 280_000)));
  proofs.push(await proofOldFenceAfterReassignment(nowPlus(nowIso, 290_000)));
  proofs.push(
    await proofOutputBombBoundedQuarantined(nowPlus(nowIso, 300_000)),
  );
  proofs.push(
    await proofPublicSyntheticFlagRequiresServerGrant(nowPlus(nowIso, 320_000)),
  );
  proofs.push(proofMaliciousPromptNoShellInjection(nowPlus(nowIso, 330_000)));
  proofs.push(proofSymlinkEscapeAfterRootVerification(nowPlus(nowIso, 310_000)));
  proofs.push(proofCliErrorDespiteExitZero(nowPlus(nowIso, 340_000)));
  proofs.push(
    await proofDstRecurringScheduleNoDuplicates(
      join(input.stateDir, `dst-schedule-${randomUUID().slice(0, 8)}`),
      nowPlus(nowIso, 350_000),
    ),
  );
  proofs.push(proofHostSleepMonitoringCoverageGap(nowPlus(nowIso, 360_000)));
  proofs.push(
    await proofConcurrentIdempotentRelease(nowPlus(nowIso, 370_000)),
  );
  proofs.push(proofFactChangesAfterReviewStale(nowPlus(nowIso, 380_000)));
  proofs.push(
    await proofOrphanWorkerDeadlineTreeStopped(nowPlus(nowIso, 390_000)),
  );
  proofs.push(proofWrongCmsEnvironmentNoProductionOp(nowPlus(nowIso, 400_000)));
  proofs.push(await proofStopBeforeDispatchClaim(nowPlus(nowIso, 410_000)));
  proofs.push(
    await proofIdempotencyKeyPayloadMismatch(
      durableDir,
      nowPlus(nowIso, 420_000),
    ),
  );
  proofs.push(proofWorkerBrowserAuthStateOsDenied(nowPlus(nowIso, 430_000)));
  proofs.push(proofUnknownUsageCancelHoldsResidual(nowPlus(nowIso, 460_000)));
  proofs.push(
    proofIndirectPromptInjectionExfilDenied(nowPlus(nowIso, 440_000)),
  );
  proofs.push(
    await proofReplayHistoricalNoRepeatIo(
      durableDir,
      nowPlus(nowIso, 430_000),
    ),
  );
  proofs.push(
    proofDiskFullEvidenceNoPartialCompleted(nowPlus(nowIso, 460_000)),
  );
  proofs.push(
    proofExternalHumanEditConflictRetained(nowPlus(nowIso, 490_000)),
  );
  proofs.push(
    proofOptimizationBreaksCtaJourneyFails(nowPlus(nowIso, 480_000)),
  );
  proofs.push(
    await proofConcurrentFinalBudgetReservationCap(nowPlus(nowIso, 510_000)),
  );
  proofs.push(
    proofSyntheticConversionContaminationExcluded(nowPlus(nowIso, 520_000)),
  );
  proofs.push(
    proofReplySentCrmReconcilesNoResend(nowPlus(nowIso, 530_000)),
  );
  proofs.push(
    proofUnknownPolicyQuestionEscalatesWithoutPromise(
      nowPlus(nowIso, 540_000),
    ),
  );
  proofs.push(
    proofAutomatedResponseLoopBoundedHandoff(nowPlus(nowIso, 550_000)),
  );
  proofs.push(
    proofDuplicatePlatformAttributionOneBooking(nowPlus(nowIso, 560_000)),
  );
  proofs.push(
    proofCurrencyTimezoneMismatchNoSilentSum(nowPlus(nowIso, 570_000)),
  );
  proofs.push(
    proofValidatedPayloadNotCollectedSeparateStates(nowPlus(nowIso, 580_000)),
  );
  proofs.push(
    proofActualCostExceedsEstimateOverrunVisible(nowPlus(nowIso, 560_000)),
  );
  proofs.push(
    proofUnlicensedVenueMediaPublishBlocked(nowPlus(nowIso, 600_000)),
  );
  proofs.push(
    proofPartialCampaignDestinationsPerState(nowPlus(nowIso, 610_000)),
  );
  proofs.push(proofUnboundWritePathFailClosed(nowPlus(nowIso, 610_000)));
  proofs.push(
    proofEventualConsistencyFalseNotFound(nowPlus(nowIso, 630_000)),
  );
  proofs.push(
    proofMockedConnectorNotProductionReady(nowPlus(nowIso, 640_000)),
  );
  proofs.push(
    proofRateLimitBoundedBackoffPreservesDeadline(nowPlus(nowIso, 650_000)),
  );
  proofs.push(
    proofLowSampleTrendSpikeInsufficientEvidence(nowPlus(nowIso, 660_000)),
  );
  proofs.push(
    proofGoogleAdsTestProductionAccessSeparated(nowPlus(nowIso, 670_000)),
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
      "T-X015 fixture ACCEPTED via dst_recurring_schedule_no_duplicates only — not live VERIFIED",
      "T-X025 fixture ACCEPTED via external_human_edit_conflict_retained only — not live VERIFIED",
      "T-X026 fixture ACCEPTED via concurrent_final_budget_reservation_cap only — not live VERIFIED",
      "Live CMS/GSC/GA4/Zoho/Temporal remain NOT_WIRED",
      "T-F24/T-US-047 fixture ACCEPTED via recover_rotate_reconcile only — not live VERIFIED",
      "T-US-002/T-X002 fixture ACCEPTED via competing_supervisor_lease only — not live VERIFIED",
      "T-X018/T-US-054 fixture ACCEPTED via self_approval_rejected only — not live VERIFIED",
      "T-X073 fixture ACCEPTED via offboard_active_token_residual only — incomplete until live revoke; not live VERIFIED",
      "T-US-060 fixture ACCEPTED via emergency_stop_at_commit only — not live VERIFIED",
      "T-X005 fixture ACCEPTED via forged_browser_role_ignored only — not live VERIFIED",
      "T-X006 fixture ACCEPTED via cross_workspace_reference_denied only — not live VERIFIED",
      "T-X019/T-US-036 fixture ACCEPTED via approved_payload_edit_invalidated only — not live VERIFIED",
      "T-US-057 fixture ACCEPTED via cross_workspace_resource_substitution only — not live VERIFIED",
      "T-US-024 fixture ACCEPTED via agent_cannot_widen_grant only — not live VERIFIED",
      "T-US-042/T-X057 fixture ACCEPTED via repair_weaken_test_rejected only — not live VERIFIED",
      "T-US-044/T-X053 fixture ACCEPTED via takeover_cancels_unsent_replies only — not live VERIFIED",
      "T-US-018/T-X037 fixture ACCEPTED via eval_only_operational_tool_forbidden only — not live VERIFIED",
      "T-X058 fixture ACCEPTED via repair_attempt_limit_escalated only — not live VERIFIED",
      "T-X069 fixture ACCEPTED via imported_doc_quarantined_as_data only — not live VERIFIED",
      "T-X038 fixture ACCEPTED via eval_no_grounding_fail_closed only — not live VERIFIED",
      "T-X039/T-US-058 fixture ACCEPTED via metric_denominators_honest only — not live VERIFIED",
      "T-US-046/T-X048 fixture ACCEPTED via hard_search_constraints_no_invention only — not live VERIFIED",
      "T-US-010/T-X033 fixture ACCEPTED via gsc_omitted_rows_unknown_not_zero only — not live VERIFIED",
      "T-US-008/T-X032 fixture ACCEPTED via ga4_debug_not_delivered_conversion only — not live VERIFIED",
      "T-X031 fixture ACCEPTED via ga4_wrong_property_kind_refused only — not live VERIFIED",
      "T-US-040/T-X049 fixture ACCEPTED via thank_you_without_crm_fails_delivery only — not live VERIFIED",
      "T-X017 fixture ACCEPTED via stop_after_dispatch_reconcile only — not live VERIFIED",
      "T-X024 fixture ACCEPTED via old_fence_after_reassignment only — not live VERIFIED",
      "T-X011 fixture ACCEPTED via output_bomb_bounded_quarantined only — not live VERIFIED",
      "T-X003 fixture ACCEPTED via symlink_escape_after_root_verification only — not live VERIFIED",
      "T-X050 fixture ACCEPTED via public_synthetic_flag_requires_server_grant only — not live VERIFIED",
      "T-X010 fixture ACCEPTED via malicious_prompt_no_shell_injection only — not live VERIFIED",
      "T-X009 fixture ACCEPTED via cli_error_despite_exit_zero only — not live VERIFIED",
      "T-X001 fixture ACCEPTED via host_sleep_monitoring_coverage_gap only — not live VERIFIED",
      "T-X021 fixture ACCEPTED via concurrent_idempotent_release only — not live VERIFIED",
      "T-X008 fixture ACCEPTED via fact_changes_after_review_stale only — not live VERIFIED",
      "T-X012 fixture ACCEPTED via orphan_worker_deadline_tree_stopped only — not live VERIFIED",
      "T-X007 fixture ACCEPTED via wrong_cms_environment_no_production_op only — not live VERIFIED",
      "T-X016 fixture ACCEPTED via stop_before_dispatch_no_mutation only — not live VERIFIED",
      "T-X022 fixture ACCEPTED via idempotency_key_payload_mismatch only — not live VERIFIED",
      "T-X065 fixture ACCEPTED via worker_browser_auth_state_os_denied only — not live VERIFIED",
      "T-X063 fixture ACCEPTED via indirect_prompt_injection_exfil_denied only — not live VERIFIED",
      "T-X013 fixture ACCEPTED via replay_historical_no_repeat_io only — not live VERIFIED",
      "T-X027 fixture ACCEPTED via unknown_usage_cancel_holds_residual only — not live VERIFIED",
      "T-X004 fixture ACCEPTED via disk_full_evidence_no_partial_completed only — not live VERIFIED",
      "T-X043 fixture ACCEPTED via optimization_breaks_cta_journey_fails only — not live VERIFIED",
      "T-X052 fixture ACCEPTED via synthetic_conversion_contamination_excluded only — not live VERIFIED",
      "T-X054 fixture ACCEPTED via reply_sent_crm_reconciles_no_resend only — not live VERIFIED",
      "T-X055 fixture ACCEPTED via unknown_policy_question_escalates_without_promise only — not live VERIFIED",
      "T-X056 fixture ACCEPTED via automated_response_loop_bounded_handoff only — not live VERIFIED",
      "T-X059/T-US-038 fixture ACCEPTED via duplicate_platform_attribution_one_booking only — not live VERIFIED",
      "T-X060 fixture ACCEPTED via currency_timezone_mismatch_no_silent_sum only — not live VERIFIED",
      "T-X070 fixture ACCEPTED via validated_payload_not_collected_separate_states only — not live VERIFIED",
      "T-X028 fixture ACCEPTED via actual_cost_exceeds_estimate_overrun_visible only — not live VERIFIED",
      "T-X044 fixture ACCEPTED via unlicensed_venue_media_publish_blocked only — not live VERIFIED",
      "T-X045 fixture ACCEPTED via partial_campaign_destinations_per_state only — not live VERIFIED",
      "T-US-006 fixture ACCEPTED via unbound_write_path_fail_closed only — not live VERIFIED",
      "T-X023 fixture ACCEPTED via eventual_consistency_false_not_found only — not live VERIFIED",
      "T-US-052 fixture ACCEPTED via mocked_connector_not_production_ready only — not live VERIFIED",
      "T-X030 fixture ACCEPTED via rate_limit_bounded_backoff_preserves_deadline only — not live VERIFIED",
      "T-X040 fixture ACCEPTED via low_sample_trend_spike_insufficient_evidence only — not live VERIFIED",
      "T-US-012 fixture ACCEPTED via google_ads_test_production_access_separated only — not live VERIFIED",
    ],
  };
}
