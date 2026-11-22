/**
 * Fixture proof for T-US-030 — Uncertain post: reconcile before retry.
 * Blind retry refused; reconcile/read-back required; present → no retry;
 * absent → linked retry authorized; false success refused; live NOT_WIRED.
 * Distinct from T-US-048/T-X020 (general unknown-remote resume), T-X017
 * (stop-after-dispatch), T-US-029 (campaign manifest), T-X045 (partial).
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateUncertainPostReconcile,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-030 fixture ACCEPTED.
 */
export function proofUncertainPostReconcileBeforeRetry(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const attempt = {
    postId: "post-acoustic-linkedin",
    destinationId: "dest-linkedin",
    attemptId: "attempt-1",
    correlationId: "corr-post-acoustic-1",
    remoteState: "UNKNOWN_REMOTE" as const,
  };

  const blind = evaluateUncertainPostReconcile({
    attempt,
    reconcile: null,
    requestBlindRetry: true,
    requestRetryAfterReconcile: false,
    claimPostSucceededDespiteUncertainty: false,
    requestLiveProviderWiring: false,
  });
  if (
    !blind.allowed &&
    blind.code === "BLIND_RETRY_REFUSED" &&
    blind.evidence?.currentState === "UNCERTAIN" &&
    blind.evidence.recoveryPath === "RECONCILE_BEFORE_RETRY" &&
    blind.evidence.preservedInputCount > 0
  ) {
    details.push(
      "requestBlindRetry → BLIND_RETRY_REFUSED; preserved inputs + RECONCILE_BEFORE_RETRY",
    );
  } else {
    passed = false;
    details.push(`Blind retry unexpectedly ${JSON.stringify(blind)}`);
  }

  const required = evaluateUncertainPostReconcile({
    attempt,
    reconcile: null,
    requestBlindRetry: false,
    requestRetryAfterReconcile: false,
    claimPostSucceededDespiteUncertainty: false,
    requestLiveProviderWiring: false,
  });
  if (
    !required.allowed &&
    required.code === "RECONCILE_REQUIRED" &&
    required.evidence?.blockingDecision ===
      "UNCERTAIN_POST_REQUIRES_RECONCILE"
  ) {
    details.push(
      "no reconcile → RECONCILE_REQUIRED; blocking decision UNCERTAIN_POST_REQUIRES_RECONCILE",
    );
  } else {
    passed = false;
    details.push(`Reconcile required unexpectedly ${JSON.stringify(required)}`);
  }

  const present = evaluateUncertainPostReconcile({
    attempt,
    reconcile: {
      reconcileId: "recon-present",
      settlement: "VERIFIED_PRESENT",
      remoteReceiptId: "rcpt-remote-1",
    },
    requestBlindRetry: false,
    requestRetryAfterReconcile: false,
    claimPostSucceededDespiteUncertainty: false,
    requestLiveProviderWiring: false,
  });
  if (
    present.allowed &&
    present.code === "RECONCILED_POST_PRESENT_NO_RETRY" &&
    present.blindRetryRefused &&
    present.evidence.retryAuthorized === false &&
    present.evidence.remoteReceiptId === "rcpt-remote-1" &&
    present.liveProviderWiring === "NOT_WIRED" &&
    present.externalEffects === "NONE"
  ) {
    details.push(
      "reconcile VERIFIED_PRESENT → RECONCILED_POST_PRESENT_NO_RETRY; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Present reconcile unexpectedly ${JSON.stringify(present)}`);
  }

  const presentRetry = evaluateUncertainPostReconcile({
    attempt,
    reconcile: {
      reconcileId: "recon-present",
      settlement: "VERIFIED_PRESENT",
      remoteReceiptId: "rcpt-remote-1",
    },
    requestBlindRetry: false,
    requestRetryAfterReconcile: true,
    claimPostSucceededDespiteUncertainty: false,
    requestLiveProviderWiring: false,
  });
  if (
    !presentRetry.allowed &&
    presentRetry.code === "RETRY_REFUSED_POST_PRESENT"
  ) {
    details.push(
      "retry after VERIFIED_PRESENT → RETRY_REFUSED_POST_PRESENT (no double-post)",
    );
  } else {
    passed = false;
    details.push(
      `Present retry unexpectedly ${JSON.stringify(presentRetry)}`,
    );
  }

  const absentRetry = evaluateUncertainPostReconcile({
    attempt,
    reconcile: {
      reconcileId: "recon-absent",
      settlement: "VERIFIED_ABSENT",
      remoteReceiptId: null,
    },
    requestBlindRetry: false,
    requestRetryAfterReconcile: true,
    claimPostSucceededDespiteUncertainty: false,
    requestLiveProviderWiring: false,
  });
  if (
    absentRetry.allowed &&
    absentRetry.code === "RECONCILED_POST_ABSENT_RETRY_AUTHORIZED" &&
    absentRetry.evidence.retryAuthorized === true &&
    absentRetry.blindRetryRefused &&
    absentRetry.externalEffects === "NONE"
  ) {
    details.push(
      "reconcile VERIFIED_ABSENT + linked retry → RECONCILED_POST_ABSENT_RETRY_AUTHORIZED",
    );
  } else {
    passed = false;
    details.push(
      `Absent retry unexpectedly ${JSON.stringify(absentRetry)}`,
    );
  }

  const falseClaim = evaluateUncertainPostReconcile({
    attempt,
    reconcile: null,
    requestBlindRetry: false,
    requestRetryAfterReconcile: false,
    claimPostSucceededDespiteUncertainty: true,
    requestLiveProviderWiring: false,
  });
  if (
    !falseClaim.allowed &&
    falseClaim.code === "FALSE_SUCCESS_CLAIM_REFUSED"
  ) {
    details.push(
      "claimPostSucceededDespiteUncertainty → FALSE_SUCCESS_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(`False claim unexpectedly ${JSON.stringify(falseClaim)}`);
  }

  const live = evaluateUncertainPostReconcile({
    attempt,
    reconcile: {
      reconcileId: "recon-absent",
      settlement: "VERIFIED_ABSENT",
      remoteReceiptId: null,
    },
    requestBlindRetry: false,
    requestRetryAfterReconcile: true,
    claimPostSucceededDespiteUncertainty: false,
    requestLiveProviderWiring: true,
  });
  if (!live.allowed && live.code === "LIVE_PROVIDER_WIRING_NOT_WIRED") {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(live)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-048/T-X020 (general unknown-remote resume), T-X017 (stop-after-dispatch), T-US-029 (campaign manifest), T-X045 (partial destinations)",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: `proof-uncertain-post-${randomUUID()}`,
    kind: SoakProofKind.UNCERTAIN_POST_RECONCILE_BEFORE_RETRY,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-uncertain-post-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
