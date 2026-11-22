/**
 * Fixture proof for T-X045 — partial campaign destinations / per-destination states.
 *
 * Exercises offline canonical-publish distribution helpers: mixed
 * VERIFIED / FAILED / UNKNOWN_REMOTE / ACCEPTED_PENDING destinations yield
 * PARTIAL run status; only unfinished destinations are recoverable; verified
 * destinations are never re-listed for apply. External effects: NONE.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  DestinationAttemptStatus,
  DestinationKind,
  DistributionRunStatus,
  SoakProofKind,
  createDistributionRun,
  listRecoverableDestinations,
  upsertDestinationAttempt,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X045 fixture ACCEPTED.
 */
export function proofPartialCampaignDestinationsPerState(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const operationId = `op-x045-${randomUUID().slice(0, 8)}`;
  const campaignId = `camp-partial-${operationId.slice(-8)}`;
  const articleId = `art-partial-${operationId.slice(-8)}`;
  const destinationIds = ["dest-cms", "dest-gbp", "dest-linkedin"] as const;

  let run = createDistributionRun({
    runId: `run-${operationId}`,
    campaignId,
    articleId,
    destinationIds: [...destinationIds],
    businessIdempotencyKey: `biz-partial-${operationId}`,
    fixtureOnly: true,
    createdAtIso: nowIso,
  });

  if (run.status !== DistributionRunStatus.PLANNING || run.attempts.length !== 0) {
    passed = false;
    details.push(
      `Initial run unexpected status=${run.status} attempts=${run.attempts.length}`,
    );
  } else {
    details.push("Distribution run starts PLANNING with zero attempts");
  }

  run = upsertDestinationAttempt(run, {
    attemptId: "a-cms",
    destinationId: "dest-cms",
    kind: DestinationKind.CMS,
    variantId: null,
    articleId,
    status: DestinationAttemptStatus.VERIFIED,
    operationKey: `${operationId}:cms`,
    durableOperationId: `dur-cms-${operationId.slice(-6)}`,
    gatewayOperationId: `gw-cms-${operationId.slice(-6)}`,
    receiptId: `rcpt-cms-${operationId.slice(-6)}`,
    outcome: "PUBLISHED_VERIFIED",
    summary: "owned-site fixture verified",
    updatedAtIso: nowIso,
  });

  run = upsertDestinationAttempt(run, {
    attemptId: "a-gbp",
    destinationId: "dest-gbp",
    kind: DestinationKind.GBP,
    variantId: "var-gbp",
    articleId,
    status: DestinationAttemptStatus.FAILED,
    operationKey: `${operationId}:gbp`,
    durableOperationId: null,
    gatewayOperationId: `gw-gbp-${operationId.slice(-6)}`,
    receiptId: `rcpt-gbp-${operationId.slice(-6)}`,
    outcome: "FAILED",
    summary: "gbp fixture failed",
    updatedAtIso: nowIso,
  });

  run = upsertDestinationAttempt(run, {
    attemptId: "a-li",
    destinationId: "dest-linkedin",
    kind: DestinationKind.LINKEDIN,
    variantId: "var-li",
    articleId,
    status: DestinationAttemptStatus.UNKNOWN_REMOTE,
    operationKey: `${operationId}:linkedin`,
    durableOperationId: `dur-li-${operationId.slice(-6)}`,
    gatewayOperationId: `gw-li-${operationId.slice(-6)}`,
    receiptId: null,
    outcome: "UNKNOWN_REMOTE_OUTCOME",
    summary: "linkedin unknown remote",
    updatedAtIso: nowIso,
  });

  if (run.status === DistributionRunStatus.PARTIAL) {
    details.push(
      "Mixed VERIFIED+FAILED+UNKNOWN_REMOTE → DistributionRunStatus.PARTIAL",
    );
  } else {
    passed = false;
    details.push(`Expected PARTIAL after mixed outcomes, got ${run.status}`);
  }

  const byDest = new Map(run.attempts.map((a) => [a.destinationId, a]));
  const cms = byDest.get("dest-cms");
  const gbp = byDest.get("dest-gbp");
  const linkedin = byDest.get("dest-linkedin");
  if (
    cms?.status === DestinationAttemptStatus.VERIFIED &&
    cms.outcome === "PUBLISHED_VERIFIED" &&
    gbp?.status === DestinationAttemptStatus.FAILED &&
    gbp.outcome === "FAILED" &&
    linkedin?.status === DestinationAttemptStatus.UNKNOWN_REMOTE &&
    linkedin.outcome === "UNKNOWN_REMOTE_OUTCOME"
  ) {
    details.push(
      "Per-destination states retained independently (cms=VERIFIED, gbp=FAILED, linkedin=UNKNOWN_REMOTE)",
    );
  } else {
    passed = false;
    details.push("Per-destination attempt states corrupted or collapsed");
  }

  const recoverable = listRecoverableDestinations(run).map((a) => a.destinationId);
  if (
    recoverable.length === 2 &&
    recoverable.includes("dest-gbp") &&
    recoverable.includes("dest-linkedin") &&
    !recoverable.includes("dest-cms")
  ) {
    details.push(
      "Recoverable destinations = unfinished only (gbp, linkedin); verified cms not re-applied",
    );
  } else {
    passed = false;
    details.push(`Recoverable destinations unexpected: ${recoverable.join(",")}`);
  }

  // Contrast: ACCEPTED_PENDING is not VERIFIED; with a verified peer → PARTIAL/in-progress honesty.
  let pendingPeer = createDistributionRun({
    runId: `run-pending-${operationId}`,
    campaignId,
    articleId,
    destinationIds: ["dest-cms", "dest-gbp"],
    businessIdempotencyKey: `biz-pending-${operationId}`,
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  pendingPeer = upsertDestinationAttempt(pendingPeer, {
    attemptId: "p-cms",
    destinationId: "dest-cms",
    kind: DestinationKind.CMS,
    variantId: null,
    articleId,
    status: DestinationAttemptStatus.VERIFIED,
    operationKey: `${operationId}:cms2`,
    durableOperationId: `dur-cms2-${operationId.slice(-6)}`,
    gatewayOperationId: `gw-cms2-${operationId.slice(-6)}`,
    receiptId: `rcpt-cms2-${operationId.slice(-6)}`,
    outcome: "PUBLISHED_VERIFIED",
    summary: "cms verified",
    updatedAtIso: nowIso,
  });
  pendingPeer = upsertDestinationAttempt(pendingPeer, {
    attemptId: "p-gbp",
    destinationId: "dest-gbp",
    kind: DestinationKind.GBP,
    variantId: "var-gbp2",
    articleId,
    status: DestinationAttemptStatus.ACCEPTED_PENDING,
    operationKey: `${operationId}:gbp2`,
    durableOperationId: null,
    gatewayOperationId: `gw-gbp2-${operationId.slice(-6)}`,
    receiptId: `rcpt-gbp2-${operationId.slice(-6)}`,
    outcome: "ACCEPTED_PENDING",
    summary: "gbp accepted pending ≠ verified",
    updatedAtIso: nowIso,
  });
  const pendingAttempt = pendingPeer.attempts.find(
    (a) => a.destinationId === "dest-gbp",
  );
  if (
    pendingAttempt?.status === DestinationAttemptStatus.ACCEPTED_PENDING &&
    pendingAttempt.outcome === "ACCEPTED_PENDING" &&
    pendingPeer.status === DistributionRunStatus.IN_PROGRESS
  ) {
    details.push(
      "ACCEPTED_PENDING destination kept distinct from VERIFIED; run stays IN_PROGRESS (not COMPLETE)",
    );
  } else {
    passed = false;
    details.push(
      `ACCEPTED_PENDING honesty unexpected status=${pendingPeer.status} gbp=${pendingAttempt?.status}`,
    );
  }

  // Contrast: all failed → FAILED (not falsely PARTIAL/COMPLETE).
  let allFailed = createDistributionRun({
    runId: `run-failed-${operationId}`,
    campaignId,
    articleId,
    destinationIds: ["dest-cms", "dest-gbp"],
    businessIdempotencyKey: `biz-failed-${operationId}`,
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  for (const destId of ["dest-cms", "dest-gbp"] as const) {
    allFailed = upsertDestinationAttempt(allFailed, {
      attemptId: `f-${destId}`,
      destinationId: destId,
      kind: destId === "dest-cms" ? DestinationKind.CMS : DestinationKind.GBP,
      variantId: null,
      articleId,
      status: DestinationAttemptStatus.FAILED,
      operationKey: `${operationId}:fail:${destId}`,
      durableOperationId: null,
      gatewayOperationId: null,
      receiptId: null,
      outcome: "FAILED",
      summary: "failed",
      updatedAtIso: nowIso,
    });
  }
  if (allFailed.status === DistributionRunStatus.FAILED) {
    details.push("All-destination FAILED → DistributionRunStatus.FAILED (honest)");
  } else {
    passed = false;
    details.push(`All-failed unexpected status=${allFailed.status}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false externalEffects=NONE catalogClaim=ACCEPTED≠VERIFIED",
  );

  return {
    proofId: `proof-partial-campaign-dest-${randomUUID()}`,
    kind: SoakProofKind.PARTIAL_CAMPAIGN_DESTINATIONS_PER_STATE,
    passed,
    details,
    applyAttemptCount: 1,
    operationId,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
