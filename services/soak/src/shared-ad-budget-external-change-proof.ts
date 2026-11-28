/**
 * Fixture proof for T-X035 — shared ad budget changed externally →
 * proposal invalidated. Re-read before mutation (F16); refuse stale
 * approve/execute. Honesty fields on every path. External effects: NONE.
 * Never live VERIFIED. Soft-skip ChatGPT Ads connect (ACCESS_BLOCKED).
 * Hillclimb: campaign-only drift, sharedBudgetId identity drift, honesty.
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
  type ReReadPaidProviderBudgetResult,
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

function honestyOk(result: ReReadPaidProviderBudgetResult): boolean {
  return (
    result.liveProviderWiring === "NOT_WIRED" &&
    result.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    result.externalEffects === "NONE" &&
    result.mutationAttempted === false
  );
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
  if (match.ok && match.code === "PROVIDER_STATE_MATCHES" && honestyOk(match)) {
    details.push(
      "Matching re-read → PROVIDER_STATE_MATCHES (positive control); liveProviderWiring=NOT_WIRED",
    );
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
    honestyOk(drifted)
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

  const campaignOnly = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: {
      ...bound,
      dailyBudgetMinor: 7000,
      readAtIso: nowIso,
    },
    readAtIso: nowIso,
  });
  if (
    !campaignOnly.ok &&
    campaignOnly.code === "CAMPAIGN_BUDGET_CHANGED_EXTERNALLY" &&
    campaignOnly.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(campaignOnly)
  ) {
    details.push(
      "Campaign-only budget drift → CAMPAIGN_BUDGET_CHANGED_EXTERNALLY; INVALIDATED with honesty fields",
    );
  } else {
    passed = false;
    details.push(`Campaign-only drift unexpectedly ${JSON.stringify(campaignOnly)}`);
  }

  const identityDrift = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: {
      ...bound,
      sharedBudgetId: "sb-external-other",
      readAtIso: nowIso,
    },
    readAtIso: nowIso,
  });
  if (
    !identityDrift.ok &&
    identityDrift.code === "ACCOUNT_MISMATCH" &&
    identityDrift.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(identityDrift)
  ) {
    details.push(
      "sharedBudgetId identity drift → ACCOUNT_MISMATCH; INVALIDATED with honesty fields",
    );
  } else {
    passed = false;
    details.push(`Identity drift unexpectedly ${JSON.stringify(identityDrift)}`);
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
    revisionOnly.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(revisionOnly)
  ) {
    details.push("Provider revision-only drift also invalidates (fail closed)");
  } else {
    passed = false;
    details.push(`Revision-only drift unexpectedly ${JSON.stringify(revisionOnly)}`);
  }

  // Partial ledger: blank revision / non-finite shared budget → INVALIDATE (G10).
  const partialLedger = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: {
      ...bound,
      entityRevision: "   ",
      sharedBudgetDailyMinor: Number.NaN,
      readAtIso: nowIso,
    },
    readAtIso: nowIso,
  });
  if (
    !partialLedger.ok &&
    partialLedger.code === "PARTIAL_PROVIDER_LEDGER" &&
    partialLedger.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(partialLedger) &&
    partialLedger.mutationAttempted === false
  ) {
    details.push(
      "Partial provider ledger (blank revision / non-finite shared budget) → PARTIAL_PROVIDER_LEDGER; INVALIDATED; never invent MATCHES",
    );
  } else {
    passed = false;
    details.push(`Partial ledger unexpectedly ${JSON.stringify(partialLedger)}`);
  }

  const partialCreate = createPaidMediaProposal({
    proposalId: `prop-tx035-partial-${randomUUID().slice(0, 8)}`,
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
    boundProviderSnapshot: { ...bound, sharedBudgetId: "" },
    createdAtIso: nowIso,
  });
  if (!partialCreate.ok && partialCreate.code === "PARTIAL_PROVIDER_LEDGER") {
    details.push(
      "Create with blank sharedBudgetId → PARTIAL_PROVIDER_LEDGER (fail closed at bind)",
    );
  } else {
    passed = false;
    details.push(`Partial create unexpectedly ${JSON.stringify(partialCreate)}`);
  }

  // G12: equal-instant boundary → MATCHES.
  const equalInstant = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: { ...bound, readAtIso: created.proposal.updatedAtIso },
    readAtIso: created.proposal.updatedAtIso,
  });
  if (equalInstant.ok && equalInstant.code === "PROVIDER_STATE_MATCHES" && honestyOk(equalInstant)) {
    details.push(
      "Equal-instant re-read (readAtIso === updatedAtIso) → PROVIDER_STATE_MATCHES",
    );
  } else {
    passed = false;
    details.push(`Equal-instant unexpectedly ${JSON.stringify(equalInstant)}`);
  }

  // G12: shared budget → 0 invalidates.
  const zeroShared = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: {
      ...bound,
      sharedBudgetDailyMinor: 0,
      entityRevision: "rev-zero",
      readAtIso: nowIso,
    },
    readAtIso: nowIso,
  });
  if (
    !zeroShared.ok &&
    zeroShared.code === "SHARED_BUDGET_CHANGED_EXTERNALLY" &&
    zeroShared.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(zeroShared)
  ) {
    details.push(
      "Shared budget collapsed to 0 → SHARED_BUDGET_CHANGED_EXTERNALLY; INVALIDATED",
    );
  } else {
    passed = false;
    details.push(`Zero shared unexpectedly ${JSON.stringify(zeroShared)}`);
  }

  // G12/G13: already-INVALIDATED re-read never invents MATCHES.
  const alreadyInvalid = !drifted.ok
    ? reReadPaidProviderBudgetBeforeMutation({
        proposal: drifted.proposal,
        current: { ...bound, readAtIso: nowIso },
        readAtIso: nowIso,
      })
    : null;
  if (
    alreadyInvalid &&
    !alreadyInvalid.ok &&
    alreadyInvalid.code === "PROPOSAL_ALREADY_INVALIDATED" &&
    alreadyInvalid.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(alreadyInvalid) &&
    alreadyInvalid.mutationAttempted === false
  ) {
    details.push(
      "Re-read on already-INVALIDATED → PROPOSAL_ALREADY_INVALIDATED; never invent MATCHES",
    );
  } else {
    passed = false;
    details.push(
      `Already-invalidated unexpectedly ${JSON.stringify(alreadyInvalid)}`,
    );
  }

  // G12: negative shared budget at create → PARTIAL_PROVIDER_LEDGER.
  const negativeCreate = createPaidMediaProposal({
    proposalId: `prop-tx035-neg-${randomUUID().slice(0, 8)}`,
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
    boundProviderSnapshot: { ...bound, sharedBudgetDailyMinor: -50 },
    createdAtIso: nowIso,
  });
  if (!negativeCreate.ok && negativeCreate.code === "PARTIAL_PROVIDER_LEDGER") {
    details.push(
      "Create with negative sharedBudgetDailyMinor → PARTIAL_PROVIDER_LEDGER",
    );
  } else {
    passed = false;
    details.push(`Negative create unexpectedly ${JSON.stringify(negativeCreate)}`);
  }

  // G14: whitespace-padded entityRevision → PARTIAL_PROVIDER_LEDGER.
  const paddedRevision = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: {
      ...bound,
      entityRevision: "  rev-bound-1  ",
      readAtIso: nowIso,
    },
    readAtIso: nowIso,
  });
  if (
    !paddedRevision.ok &&
    paddedRevision.code === "PARTIAL_PROVIDER_LEDGER" &&
    paddedRevision.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(paddedRevision)
  ) {
    details.push(
      "Whitespace-padded entityRevision → PARTIAL_PROVIDER_LEDGER; INVALIDATED; never invent MATCHES",
    );
  } else {
    passed = false;
    details.push(`Padded revision unexpectedly ${JSON.stringify(paddedRevision)}`);
  }

  // G14: campaign dailyBudgetMinor null → number drift.
  const nullBound = createPaidMediaProposal({
    proposalId: `prop-tx035-null-${randomUUID().slice(0, 8)}`,
    platform: PaidMediaPlatform.GOOGLE_ADS,
    accountId: bound.accountId,
    campaignId: bound.campaignId,
    changeKind: PaidChangeKind.BUDGET_ADJUST,
    hypothesis: "Raise campaign allocation inside known shared budget",
    exactChange: "campaign daily unset → 100 USD within shared cap",
    risk: "Sibling campaigns may lose share of shared budget",
    alternative: "Hold until next review window",
    diagnosis: settledDiagnosis(),
    financialDiff: {
      currency: "USD",
      dailyBudgetBeforeMinor: null,
      dailyBudgetAfterMinor: 10_000,
      lifetimeImpactMinor: null,
      sharedBudgetAffected: true,
      sharedBudgetImpactKnown: true,
      notes: ["shared budget impact known at bind"],
    },
    boundProviderSnapshot: { ...bound, dailyBudgetMinor: null },
    createdAtIso: nowIso,
  });
  if (!nullBound.ok) {
    passed = false;
    details.push(`Null-bound create unexpectedly ${JSON.stringify(nullBound)}`);
  } else {
    const nullToNumber = reReadPaidProviderBudgetBeforeMutation({
      proposal: nullBound.proposal,
      current: { ...bound, dailyBudgetMinor: 8000, readAtIso: nowIso },
      readAtIso: nowIso,
    });
    if (
      !nullToNumber.ok &&
      nullToNumber.code === "CAMPAIGN_BUDGET_CHANGED_EXTERNALLY" &&
      nullToNumber.proposal.status === PaidProposalStatus.INVALIDATED &&
      honestyOk(nullToNumber)
    ) {
      details.push(
        "Campaign dailyBudgetMinor null→number → CAMPAIGN_BUDGET_CHANGED_EXTERNALLY; INVALIDATED",
      );
    } else {
      passed = false;
      details.push(`Null→number unexpectedly ${JSON.stringify(nullToNumber)}`);
    }
  }

  // G16: campaign dailyBudgetMinor number → null drift.
  const numberToNull = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: { ...bound, dailyBudgetMinor: null, readAtIso: nowIso },
    readAtIso: nowIso,
  });
  if (
    !numberToNull.ok &&
    numberToNull.code === "CAMPAIGN_BUDGET_CHANGED_EXTERNALLY" &&
    numberToNull.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(numberToNull)
  ) {
    details.push(
      "Campaign dailyBudgetMinor number→null → CAMPAIGN_BUDGET_CHANGED_EXTERNALLY; INVALIDATED",
    );
  } else {
    passed = false;
    details.push(`Number→null unexpectedly ${JSON.stringify(numberToNull)}`);
  }

  // G16: whitespace-padded sharedBudgetId → PARTIAL_PROVIDER_LEDGER.
  const paddedSharedId = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: {
      ...bound,
      sharedBudgetId: "  shared-budget-fixture-1  ",
      readAtIso: nowIso,
    },
    readAtIso: nowIso,
  });
  if (
    !paddedSharedId.ok &&
    paddedSharedId.code === "PARTIAL_PROVIDER_LEDGER" &&
    paddedSharedId.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(paddedSharedId)
  ) {
    details.push(
      "Whitespace-padded sharedBudgetId → PARTIAL_PROVIDER_LEDGER; INVALIDATED; never invent MATCHES",
    );
  } else {
    passed = false;
    details.push(`Padded sharedBudgetId unexpectedly ${JSON.stringify(paddedSharedId)}`);
  }

  // G16: unparseable readAtIso → PARTIAL_PROVIDER_LEDGER.
  const badReadAt = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: { ...bound, readAtIso: "not-an-instant" },
    readAtIso: nowIso,
  });
  if (
    !badReadAt.ok &&
    badReadAt.code === "PARTIAL_PROVIDER_LEDGER" &&
    badReadAt.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(badReadAt)
  ) {
    details.push(
      "Unparseable readAtIso → PARTIAL_PROVIDER_LEDGER; INVALIDATED; never invent MATCHES",
    );
  } else {
    passed = false;
    details.push(`Bad readAt unexpectedly ${JSON.stringify(badReadAt)}`);
  }

  // G17: whitespace-padded accountId → PARTIAL_PROVIDER_LEDGER.
  const paddedAccount = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: {
      ...bound,
      accountId: "  acct-fixture-1  ",
      readAtIso: nowIso,
    },
    readAtIso: nowIso,
  });
  if (
    !paddedAccount.ok &&
    paddedAccount.code === "PARTIAL_PROVIDER_LEDGER" &&
    paddedAccount.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(paddedAccount)
  ) {
    details.push(
      "Whitespace-padded accountId → PARTIAL_PROVIDER_LEDGER; INVALIDATED; never invent MATCHES",
    );
  } else {
    passed = false;
    details.push(`Padded accountId unexpectedly ${JSON.stringify(paddedAccount)}`);
  }

  // G17: non-finite sharedBudgetDailyMinor (NaN) → PARTIAL_PROVIDER_LEDGER.
  const nanShared = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: {
      ...bound,
      sharedBudgetDailyMinor: Number.NaN,
      readAtIso: nowIso,
    },
    readAtIso: nowIso,
  });
  if (
    !nanShared.ok &&
    nanShared.code === "PARTIAL_PROVIDER_LEDGER" &&
    nanShared.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(nanShared)
  ) {
    details.push(
      "Non-finite sharedBudgetDailyMinor (NaN) → PARTIAL_PROVIDER_LEDGER; INVALIDATED; never invent MATCHES",
    );
  } else {
    passed = false;
    details.push(`NaN shared budget unexpectedly ${JSON.stringify(nanShared)}`);
  }

  // G17: stale snapshot (current older than proposal.updatedAtIso) → STALE.
  const staleOlder = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: {
      ...bound,
      readAtIso: "2020-01-01T00:00:00.000Z",
    },
    readAtIso: nowIso,
  });
  if (
    !staleOlder.ok &&
    staleOlder.code === "STALE_PROVIDER_SNAPSHOT" &&
    staleOlder.proposal.status === PaidProposalStatus.READY_FOR_REVIEW &&
    honestyOk(staleOlder)
  ) {
    details.push(
      "Stale provider snapshot (readAt < proposal.updatedAt) → STALE_PROVIDER_SNAPSHOT; never invent MATCHES",
    );
  } else {
    passed = false;
    details.push(`Stale snapshot unexpectedly ${JSON.stringify(staleOlder)}`);
  }

  // G18: whitespace-padded campaignId → PARTIAL_PROVIDER_LEDGER.
  const paddedCampaign = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: {
      ...bound,
      campaignId: "  camp-shared-1  ",
      readAtIso: nowIso,
    },
    readAtIso: nowIso,
  });
  if (
    !paddedCampaign.ok &&
    paddedCampaign.code === "PARTIAL_PROVIDER_LEDGER" &&
    paddedCampaign.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(paddedCampaign)
  ) {
    details.push(
      "Whitespace-padded campaignId → PARTIAL_PROVIDER_LEDGER; INVALIDATED; never invent MATCHES",
    );
  } else {
    passed = false;
    details.push(`Padded campaignId unexpectedly ${JSON.stringify(paddedCampaign)}`);
  }

  // G18: Infinity sharedBudgetDailyMinor → PARTIAL_PROVIDER_LEDGER.
  const infShared = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: {
      ...bound,
      sharedBudgetDailyMinor: Number.POSITIVE_INFINITY,
      readAtIso: nowIso,
    },
    readAtIso: nowIso,
  });
  if (
    !infShared.ok &&
    infShared.code === "PARTIAL_PROVIDER_LEDGER" &&
    infShared.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(infShared)
  ) {
    details.push(
      "Infinity sharedBudgetDailyMinor → PARTIAL_PROVIDER_LEDGER; INVALIDATED; never invent MATCHES",
    );
  } else {
    passed = false;
    details.push(`Infinity shared unexpectedly ${JSON.stringify(infShared)}`);
  }

  // G18: negative campaign dailyBudgetMinor → PARTIAL_PROVIDER_LEDGER.
  const negDaily = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: {
      ...bound,
      dailyBudgetMinor: -1,
      readAtIso: nowIso,
    },
    readAtIso: nowIso,
  });
  if (
    !negDaily.ok &&
    negDaily.code === "PARTIAL_PROVIDER_LEDGER" &&
    negDaily.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(negDaily)
  ) {
    details.push(
      "Negative campaign dailyBudgetMinor → PARTIAL_PROVIDER_LEDGER; INVALIDATED; never invent MATCHES",
    );
  } else {
    passed = false;
    details.push(`Negative daily unexpectedly ${JSON.stringify(negDaily)}`);
  }

  // G19: blank campaignId → PARTIAL_PROVIDER_LEDGER.
  const blankCampaign = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: {
      ...bound,
      campaignId: "   ",
      readAtIso: nowIso,
    },
    readAtIso: nowIso,
  });
  if (
    !blankCampaign.ok &&
    blankCampaign.code === "PARTIAL_PROVIDER_LEDGER" &&
    blankCampaign.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(blankCampaign)
  ) {
    details.push(
      "Blank campaignId → PARTIAL_PROVIDER_LEDGER; INVALIDATED; never invent MATCHES",
    );
  } else {
    passed = false;
    details.push(`Blank campaignId unexpectedly ${JSON.stringify(blankCampaign)}`);
  }

  // G19: -Infinity sharedBudgetDailyMinor → PARTIAL_PROVIDER_LEDGER.
  const negInfShared = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: {
      ...bound,
      sharedBudgetDailyMinor: Number.NEGATIVE_INFINITY,
      readAtIso: nowIso,
    },
    readAtIso: nowIso,
  });
  if (
    !negInfShared.ok &&
    negInfShared.code === "PARTIAL_PROVIDER_LEDGER" &&
    negInfShared.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(negInfShared)
  ) {
    details.push(
      "-Infinity sharedBudgetDailyMinor → PARTIAL_PROVIDER_LEDGER; INVALIDATED; never invent MATCHES",
    );
  } else {
    passed = false;
    details.push(`-Infinity shared unexpectedly ${JSON.stringify(negInfShared)}`);
  }

  // G19: NaN campaign dailyBudgetMinor → PARTIAL_PROVIDER_LEDGER.
  const nanDaily = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: {
      ...bound,
      dailyBudgetMinor: Number.NaN,
      readAtIso: nowIso,
    },
    readAtIso: nowIso,
  });
  if (
    !nanDaily.ok &&
    nanDaily.code === "PARTIAL_PROVIDER_LEDGER" &&
    nanDaily.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(nanDaily)
  ) {
    details.push(
      "NaN campaign dailyBudgetMinor → PARTIAL_PROVIDER_LEDGER; INVALIDATED; never invent MATCHES",
    );
  } else {
    passed = false;
    details.push(`NaN daily unexpectedly ${JSON.stringify(nanDaily)}`);
  }

  // G20: blank accountId → PARTIAL_PROVIDER_LEDGER.
  const blankAccount = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: {
      ...bound,
      accountId: "",
      readAtIso: nowIso,
    },
    readAtIso: nowIso,
  });
  if (
    !blankAccount.ok &&
    blankAccount.code === "PARTIAL_PROVIDER_LEDGER" &&
    blankAccount.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(blankAccount)
  ) {
    details.push(
      "Blank accountId → PARTIAL_PROVIDER_LEDGER; INVALIDATED; never invent MATCHES",
    );
  } else {
    passed = false;
    details.push(`Blank accountId unexpectedly ${JSON.stringify(blankAccount)}`);
  }

  // G20: blank entityRevision → PARTIAL_PROVIDER_LEDGER.
  const blankRevision = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: {
      ...bound,
      entityRevision: "   ",
      readAtIso: nowIso,
    },
    readAtIso: nowIso,
  });
  if (
    !blankRevision.ok &&
    blankRevision.code === "PARTIAL_PROVIDER_LEDGER" &&
    blankRevision.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(blankRevision)
  ) {
    details.push(
      "Blank entityRevision → PARTIAL_PROVIDER_LEDGER; INVALIDATED; never invent MATCHES",
    );
  } else {
    passed = false;
    details.push(`Blank entityRevision unexpectedly ${JSON.stringify(blankRevision)}`);
  }

  // G20: Infinity campaign dailyBudgetMinor → PARTIAL_PROVIDER_LEDGER.
  const infDaily = reReadPaidProviderBudgetBeforeMutation({
    proposal: created.proposal,
    current: {
      ...bound,
      dailyBudgetMinor: Number.POSITIVE_INFINITY,
      readAtIso: nowIso,
    },
    readAtIso: nowIso,
  });
  if (
    !infDaily.ok &&
    infDaily.code === "PARTIAL_PROVIDER_LEDGER" &&
    infDaily.proposal.status === PaidProposalStatus.INVALIDATED &&
    honestyOk(infDaily)
  ) {
    details.push(
      "Infinity campaign dailyBudgetMinor → PARTIAL_PROVIDER_LEDGER; INVALIDATED; never invent MATCHES",
    );
  } else {
    passed = false;
    details.push(`Infinity daily unexpectedly ${JSON.stringify(infDaily)}`);
  }

  details.push(
    "Distinct from SHARED_BUDGET_UNKNOWN (create-time block) and A25 review INVALIDATED",
  );
  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE deepen=G20",
  );

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
