/**
 * Fixture proof for T-X035 — shared ad budget changed externally →
 * proposal invalidated. Re-read before mutation (F16); refuse stale
 * approve/execute. External effects: NONE. Never live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  PaidChangeKind,
  PaidMediaPlatform,
  PaidProposalStatus,
  SoakProofKind,
  attemptPaidMediaExecution,
  createPaidMediaProposal,
  diagnoseDelivery,
  recordPaidMediaDecision,
  reReadPaidProviderBudgetBeforeMutation,
  type PaidProviderBudgetSnapshot,
  type SoakProofRecord,
} from "@worksocial/domain";

function settledDiagnosis() {
  return diagnoseDelivery({
    impressions: 3200,
    clicks: 96,
    eventsPresent: true,
    attributionSettled: true,
    sameDaySpendComplete: true,
  });
}

function boundSnapshot(nowIso: string): PaidProviderBudgetSnapshot {
  return {
    accountId: "acct-fixture-ads",
    campaignId: "camp-shared-fixture",
    sharedBudgetId: "sb-fixture-shared-1",
    entityRevision: "rev-bound-1",
    dailyBudgetMinor: 8000,
    sharedBudgetDailyMinor: 50_000,
    readAtIso: nowIso,
  };
}

/**
 * Complete expected proof set for T-X035 fixture ACCEPTED.
 */
export function proofSharedAdBudgetExternalChangeInvalidates(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const bound = boundSnapshot(nowIso);

  const created = createPaidMediaProposal({
    proposalId: `prop-tx035-${randomUUID().slice(0, 8)}`,
    platform: PaidMediaPlatform.GOOGLE_ADS,
    accountId: bound.accountId,
    campaignId: bound.campaignId,
    changeKind: PaidChangeKind.BUDGET_ADJUST,
    hypothesis: "Raise campaign allocation inside known shared budget",
    exactChange: "campaign daily 80 → 100 USD within shared cap",
    risk: "Sibling campaigns may lose share of shared budget",
    alternative: "Hold until next review window",
    diagnosis: settledDiagnosis(),
    financialDiff: {
      currency: "USD",
      dailyBudgetBeforeMinor: 8000,
      dailyBudgetAfterMinor: 10_000,
      lifetimeImpactMinor: null,
      sharedBudgetAffected: true,
      sharedBudgetImpactKnown: true,
      notes: ["shared budget impact known at bind"],
    },
    boundProviderSnapshot: bound,
    createdAtIso: nowIso,
  });

  if (!created.ok || created.proposal.status !== PaidProposalStatus.READY_FOR_REVIEW) {
    return {
      proofId: `proof-tx035-${randomUUID()}`,
      kind: SoakProofKind.SHARED_AD_BUDGET_EXTERNAL_CHANGE_INVALIDATES,
      passed: false,
      details: [`Failed to create shared-budget proposal: ${JSON.stringify(created)}`],
      applyAttemptCount: 1,
      operationId: `op-tx035-${randomUUID().slice(0, 8)}`,
      createdAtIso: nowIso,
      fixtureOnly: true,
    };
  }
  details.push("Google Ads shared-budget proposal READY_FOR_REVIEW with bound snapshot");

  const match = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: { ...bound, readAtIso: nowIso },
    readAtIso: nowIso,
  });
  if (match.ok && match.code === "PROVIDER_STATE_MATCHES") {
    details.push("Matching re-read → PROVIDER_STATE_MATCHES (positive control)");
  } else {
    passed = false;
    details.push(`Matching re-read unexpectedly ${JSON.stringify(match)}`);
  }

  const drifted = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: {
      ...bound,
      sharedBudgetDailyMinor: 40_000,
      entityRevision: "rev-external-2",
      readAtIso: nowIso,
    },
    readAtIso: nowIso,
  });
  if (
    !drifted.ok &&
    drifted.code === "SHARED_BUDGET_CHANGED_EXTERNALLY" &&
    drifted.proposal.status === PaidProposalStatus.INVALIDATED &&
    drifted.externalEffects === "NONE" &&
    drifted.mutationAttempted === false
  ) {
    details.push(
      "External shared-budget drift → SHARED_BUDGET_CHANGED_EXTERNALLY; proposal INVALIDATED",
    );
  } else {
    passed = false;
    details.push(`Shared-budget drift unexpectedly ${JSON.stringify(drifted)}`);
  }

  if (!drifted.ok) {
    const reDecision = recordPaidMediaDecision({
      decisionId: `dec-tx035-${randomUUID().slice(0, 8)}`,
      proposal: drifted.proposal,
      decision: "approve",
      actorRole: "administrator",
      reason: "stale after external shared budget change",
      recordedAtIso: nowIso,
    });
    if (!reDecision.ok && reDecision.code === "PROPOSAL_INVALIDATED") {
      details.push("Approve on invalidated proposal refused (PROPOSAL_INVALIDATED)");
    } else {
      passed = false;
      details.push(`Decision after invalidate unexpectedly ${JSON.stringify(reDecision)}`);
    }

    const exec = attemptPaidMediaExecution({
      proposal: drifted.proposal,
      preferLive: true,
    });
    if (
      !exec.ok &&
      exec.code === "PROPOSAL_INVALIDATED" &&
      exec.externalEffects === "NONE" &&
      exec.mutationAttempted === false
    ) {
      details.push("Execute refused on invalidated proposal — no mutation; externalEffects=NONE");
    } else {
      passed = false;
      details.push(`Execute after invalidate unexpectedly ${JSON.stringify(exec)}`);
    }
  }

  const revisionOnly = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: {
      ...bound,
      entityRevision: "rev-only-3",
      readAtIso: nowIso,
    },
    readAtIso: nowIso,
  });
  if (
    !revisionOnly.ok &&
    revisionOnly.code === "PROVIDER_REVISION_CHANGED" &&
    revisionOnly.proposal.status === PaidProposalStatus.INVALIDATED
  ) {
    details.push("Provider revision-only drift also invalidates (fail closed)");
  } else {
    passed = false;
    details.push(`Revision-only drift unexpectedly ${JSON.stringify(revisionOnly)}`);
  }

  details.push(
    "Distinct from SHARED_BUDGET_UNKNOWN (create-time block) and A25 review INVALIDATED",
  );
  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-tx035-${randomUUID()}`,
    kind: SoakProofKind.SHARED_AD_BUDGET_EXTERNAL_CHANGE_INVALIDATES,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx035-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
