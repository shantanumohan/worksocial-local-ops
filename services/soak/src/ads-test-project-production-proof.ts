/**
 * Fixture proof for T-X034 — test-only Ads project vs production blocked.
 * Exercises the guarded production-bind boundary with an instrumented fake
 * provider (call count must stay 0). External effects: NONE.
 * Distinct from T-US-012 (Google Ads TEST vs PRODUCTION).
 * Soft-skip T-F07 / T-US-013 / T-US-014 remain ACCESS_BLOCKED on connect.
 */

import { randomUUID } from "node:crypto";
import {
  AnalyticsEnvironment,
  PaidChangeKind,
  PaidMediaPlatform,
  PaidProposalStatus,
  SoakProofKind,
  attemptGuardedChatGptAdsProductionBind,
  attemptPaidMediaExecution,
  createPaidMediaProposal,
  diagnoseDelivery,
  evaluateChatGptAdsAccess,
  isAdsTestProjectProductionMismatch,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X034 fixture ACCEPTED.
 */
export function proofAdsTestProjectProductionBlocked(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  /** Instrumented fake production Ads binder — must never run for T-X034. */
  let productionBindCallCount = 0;
  const productionBind = (_projectId: string) => {
    productionBindCallCount += 1;
  };

  const testProjectAccess = {
    localTransportVerified: true,
    entitlementVerified: true,
    authVerified: true,
    projectEnvironment: AnalyticsEnvironment.SANDBOX,
    requestedEnvironment: AnalyticsEnvironment.LIVE,
  } as const;

  // 1. Guarded bind boundary: SANDBOX→LIVE must refuse before binder.
  const guarded = attemptGuardedChatGptAdsProductionBind({
    access: testProjectAccess,
    projectId: "ads-test-project-sandbox",
    productionBind,
  });
  if (
    !guarded.bound &&
    guarded.decision.code === "ADS_TEST_PROJECT_MISMATCH" &&
    guarded.productionBindCallCount === 0 &&
    productionBindCallCount === 0 &&
    guarded.liveProviderWiring === "NOT_WIRED" &&
    guarded.externalEffects === "NONE" &&
    guarded.decision.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "Guarded bind: SANDBOX→LIVE → ADS_TEST_PROJECT_MISMATCH; productionBindCallCount=0; honesty NOT_WIRED/NONE",
    );
  } else {
    passed = false;
    details.push(
      `Guarded bind unexpectedly ${JSON.stringify({
        bound: guarded.bound,
        code: guarded.decision.code,
        productionBindCallCount: guarded.productionBindCallCount,
        observed: productionBindCallCount,
      })}`,
    );
  }

  // 2. Blank projectId + repeated mismatch — binder still unused.
  const blankGuarded = attemptGuardedChatGptAdsProductionBind({
    access: testProjectAccess,
    projectId: "   ",
    productionBind,
  });
  if (
    !blankGuarded.bound &&
    blankGuarded.decision.code === "ADS_TEST_PROJECT_MISMATCH" &&
    blankGuarded.productionBindCallCount === 0 &&
    productionBindCallCount === 0
  ) {
    details.push(
      "Repeated SANDBOX→LIVE (blank projectId) → ADS_TEST_PROJECT_MISMATCH; bind count still 0",
    );
  } else {
    passed = false;
    details.push(
      `Blank/repeat guarded unexpectedly ${JSON.stringify(blankGuarded)} bindCount=${productionBindCallCount}`,
    );
  }

  // 3. Predicate alone still reports mismatch (honesty / before adapter).
  const mismatch = evaluateChatGptAdsAccess(testProjectAccess);
  if (
    !mismatch.allowed &&
    mismatch.code === "ADS_TEST_PROJECT_MISMATCH" &&
    mismatch.externalEffects === "NONE" &&
    isAdsTestProjectProductionMismatch(
      AnalyticsEnvironment.SANDBOX,
      AnalyticsEnvironment.LIVE,
    )
  ) {
    details.push(
      "evaluateChatGptAdsAccess → ADS_TEST_PROJECT_MISMATCH (T-X034); helper confirms mismatch",
    );
  } else {
    passed = false;
    details.push(`Predicate unexpectedly ${JSON.stringify(mismatch)}`);
  }

  // 4. SANDBOX→FIXTURE is not T-X034 mismatch (connect soft-skip stays ACCESS_BLOCKED).
  const sandboxFixture = evaluateChatGptAdsAccess({
    localTransportVerified: true,
    entitlementVerified: true,
    authVerified: true,
    projectEnvironment: AnalyticsEnvironment.SANDBOX,
    requestedEnvironment: AnalyticsEnvironment.FIXTURE,
  });
  if (
    !sandboxFixture.allowed &&
    sandboxFixture.code === "ADS_ACCESS_BLOCKED" &&
    !isAdsTestProjectProductionMismatch(
      AnalyticsEnvironment.SANDBOX,
      AnalyticsEnvironment.FIXTURE,
    )
  ) {
    details.push(
      "SANDBOX→FIXTURE → ADS_ACCESS_BLOCKED (not T-X034 mismatch; soft-skip connect distinct)",
    );
  } else {
    passed = false;
    details.push(
      `SANDBOX→FIXTURE unexpectedly ${JSON.stringify(sandboxFixture)}`,
    );
  }

  // 5. Paid-media create path with mismatch access — blocked; no production call.
  const diagnosis = diagnoseDelivery({
    impressions: 100,
    clicks: 5,
    eventsPresent: true,
    attributionSettled: true,
    sameDaySpendComplete: true,
  });
  const created = createPaidMediaProposal({
    proposalId: `p-tx034-${randomUUID().slice(0, 8)}`,
    platform: PaidMediaPlatform.CHATGPT_ADS,
    accountId: "ads-test-sandbox",
    campaignId: "camp-test",
    changeKind: PaidChangeKind.BID_ADJUST,
    hypothesis: "Fixture bid adjust",
    exactChange: "-5%",
    risk: "Volume drop",
    alternative: "Hold",
    diagnosis,
    financialDiff: {
      currency: "USD",
      dailyBudgetBeforeMinor: 1000,
      dailyBudgetAfterMinor: 1000,
      lifetimeImpactMinor: 0,
      sharedBudgetAffected: false,
      sharedBudgetImpactKnown: true,
      notes: [],
    },
    chatgptAdsAccess: mismatch,
    createdAtIso: nowIso,
  });
  if (
    !created.ok &&
    created.code === "CHATGPT_ADS_BLOCKED" &&
    created.proposal?.status === PaidProposalStatus.BLOCKED &&
    productionBindCallCount === 0
  ) {
    details.push(
      "createPaidMediaProposal CHATGPT_ADS with mismatch → CHATGPT_ADS_BLOCKED; bind count still 0",
    );
  } else {
    passed = false;
    details.push(
      `Create unexpectedly ok=${created.ok} code=${"code" in created ? created.code : "n/a"} bindCount=${productionBindCallCount}`,
    );
  }

  // 6. Execute path on blocked proposal — refused; binder still unused.
  if (created.proposal) {
    const executed = attemptPaidMediaExecution({
      proposal: created.proposal,
      preferLive: true,
    });
    if (
      !executed.ok &&
      executed.externalEffects === "NONE" &&
      executed.liveMutationWiring === "NOT_WIRED" &&
      productionBindCallCount === 0
    ) {
      details.push(
        `attemptPaidMediaExecution refused code=${executed.code}; productionBindCallCount=0`,
      );
    } else {
      passed = false;
      details.push(
        `Execute unexpectedly ${JSON.stringify(executed)} bindCount=${productionBindCallCount}`,
      );
    }
  } else {
    passed = false;
    details.push("Blocked proposal missing — cannot assert execute refuse");
  }

  // 7. LIVE→LIVE is distinct NOT_WIRED (not T-X034 mismatch); still no bind.
  const liveGuarded = attemptGuardedChatGptAdsProductionBind({
    access: {
      localTransportVerified: true,
      entitlementVerified: true,
      authVerified: true,
      projectEnvironment: AnalyticsEnvironment.LIVE,
      requestedEnvironment: AnalyticsEnvironment.LIVE,
    },
    projectId: "ads-live-project",
    productionBind,
  });
  if (
    !liveGuarded.bound &&
    liveGuarded.decision.code === "ADS_LIVE_NOT_WIRED" &&
    liveGuarded.productionBindCallCount === 0 &&
    productionBindCallCount === 0
  ) {
    details.push(
      "LIVE→LIVE guarded refuse ADS_LIVE_NOT_WIRED (distinct from T-X034); bind count=0",
    );
  } else {
    passed = false;
    details.push(`LIVE→LIVE unexpectedly ${JSON.stringify(liveGuarded)}`);
  }

  details.push(
    `instrumentedProductionBindCalls=${productionBindCallCount} liveProviderSuccessClaimed=false externalEffects=NONE`,
  );
  details.push(
    "Distinct from T-US-012 (Google Ads TEST vs PRODUCTION) and soft-skip T-F07/T-US-013/T-US-014",
  );

  return {
    proofId: `proof-ads-test-prod-${randomUUID()}`,
    kind: SoakProofKind.ADS_TEST_PROJECT_PRODUCTION_BLOCKED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-ads-test-prod-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
