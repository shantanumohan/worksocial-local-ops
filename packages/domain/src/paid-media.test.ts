import { describe, expect, it } from "vitest";
import { AnalyticsEnvironment, evaluateChatGptAdsAccess } from "./analytics.js";
import {
  DeliveryDiagnosisKind,
  PaidChangeKind,
  PaidMediaPlatform,
  PaidMediaWiring,
  PaidProposalStatus,
  attemptPaidMediaExecution,
  createAnalysisDefinition,
  createAnalysisHypothesis,
  createDecisionBrief,
  createPaidMediaProposal,
  diagnoseDelivery,
  paidMediaChannelStatus,
  recordPaidMediaDecision,
} from "./paid-media.js";

describe("paid-media — analysis / F19", () => {
  it("creates fixture analysis definitions and refuses LIVE", () => {
    const def = createAnalysisDefinition({
      definitionId: "def-1",
      siteId: "site-fixture",
      periodStartIso: "2026-11-01T00:00:00.000Z",
      periodEndIso: "2026-11-14T00:00:00.000Z",
      comparisonLabel: "prior_14d",
      reportingTimezone: "America/New_York",
      createdAtIso: "2026-11-21T12:00:00.000Z",
    });
    expect(def.environment).toBe(AnalyticsEnvironment.FIXTURE);

    expect(() =>
      createAnalysisDefinition({
        definitionId: "def-live",
        siteId: "site",
        periodStartIso: "2026-11-01T00:00:00.000Z",
        periodEndIso: "2026-11-14T00:00:00.000Z",
        comparisonLabel: "prior",
        reportingTimezone: "UTC",
        environment: AnalyticsEnvironment.LIVE,
        createdAtIso: "2026-11-21T12:00:00.000Z",
      }),
    ).toThrow(/NOT_WIRED/);
  });

  it("requires complete hypothesis fields", () => {
    const incomplete = createAnalysisHypothesis({
      hypothesisId: "h1",
      definitionId: "def-1",
      statement: "",
      primaryOutcome: "bookings",
      baseline: "2/week",
      comparison: "4/week",
      observationWindowDays: 14,
      createdAtIso: "2026-11-21T12:00:00.000Z",
    });
    expect(incomplete.ok).toBe(false);

    const ok = createAnalysisHypothesis({
      hypothesisId: "h1",
      definitionId: "def-1",
      statement: "Better CTA lifts bookings",
      primaryOutcome: "CRM-verified bookings",
      baseline: "2/week",
      comparison: "4/week",
      observationWindowDays: 14,
      createdAtIso: "2026-11-21T12:00:00.000Z",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.hypothesis.environment).toBe(AnalyticsEnvironment.FIXTURE);
    }

    const brief = createDecisionBrief({
      briefId: "b1",
      definitionId: "def-1",
      hypothesisId: "h1",
      title: "Fixture brief",
      summary: "Supported by fixture GSC only",
      sourceCaveats: ["FIXTURE ≠ LIVE"],
      proposedActions: ["Hold live spend"],
      createdAtIso: "2026-11-21T12:00:00.000Z",
    });
    expect(brief.redacted).toBe(true);
  });
});

describe("paid-media — delivery diagnosis + proposals / F16", () => {
  it("separates delivery failures and blocks partial spend budget recs", () => {
    expect(
      diagnoseDelivery({
        impressions: 0,
        clicks: 0,
        eventsPresent: false,
        attributionSettled: false,
        sameDaySpendComplete: false,
      }).kind,
    ).toBe(DeliveryDiagnosisKind.NO_IMPRESSIONS);

    expect(
      diagnoseDelivery({
        impressions: 100,
        clicks: 0,
        eventsPresent: false,
        attributionSettled: false,
        sameDaySpendComplete: true,
      }).kind,
    ).toBe(DeliveryDiagnosisKind.LOW_CLICKS);

    const delayed = diagnoseDelivery({
      impressions: 1000,
      clicks: 40,
      eventsPresent: true,
      attributionSettled: false,
      sameDaySpendComplete: false,
    });
    expect(delayed.kind).toBe(DeliveryDiagnosisKind.DELAYED_ATTRIBUTION);

    const blocked = createPaidMediaProposal({
      proposalId: "p-partial",
      platform: PaidMediaPlatform.GOOGLE_ADS,
      accountId: "acct-fixture",
      campaignId: "camp-1",
      changeKind: PaidChangeKind.BUDGET_ADJUST,
      hypothesis: "Raise budget",
      exactChange: "+$10/day",
      risk: "Overspend",
      alternative: "Hold",
      diagnosis: delayed,
      financialDiff: {
        currency: "USD",
        dailyBudgetBeforeMinor: 5000,
        dailyBudgetAfterMinor: 6000,
        lifetimeImpactMinor: null,
        sharedBudgetAffected: false,
        sharedBudgetImpactKnown: true,
        notes: [],
      },
      createdAtIso: "2026-11-21T12:00:00.000Z",
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("PARTIAL_SPEND");
  });

  it("blocks shared-budget-unknown and ChatGPT Ads without transport", () => {
    const diagnosis = diagnoseDelivery({
      impressions: 2000,
      clicks: 80,
      eventsPresent: true,
      attributionSettled: true,
      sameDaySpendComplete: true,
    });

    const shared = createPaidMediaProposal({
      proposalId: "p-shared",
      platform: PaidMediaPlatform.GOOGLE_ADS,
      accountId: "acct",
      campaignId: "c1",
      changeKind: PaidChangeKind.BUDGET_ADJUST,
      hypothesis: "h",
      exactChange: "+5",
      risk: "r",
      alternative: "a",
      diagnosis,
      financialDiff: {
        currency: "USD",
        dailyBudgetBeforeMinor: 1000,
        dailyBudgetAfterMinor: 1500,
        lifetimeImpactMinor: null,
        sharedBudgetAffected: true,
        sharedBudgetImpactKnown: false,
        notes: ["shared impact unknown"],
      },
      createdAtIso: "2026-11-21T12:00:00.000Z",
    });
    expect(shared.ok).toBe(false);
    if (!shared.ok) expect(shared.code).toBe("SHARED_BUDGET_UNKNOWN");

    const access = evaluateChatGptAdsAccess({
      localTransportVerified: false,
      entitlementVerified: false,
      authVerified: false,
      projectEnvironment: AnalyticsEnvironment.FIXTURE,
      requestedEnvironment: AnalyticsEnvironment.FIXTURE,
    });
    const chatgpt = createPaidMediaProposal({
      proposalId: "p-chatgpt",
      platform: PaidMediaPlatform.CHATGPT_ADS,
      accountId: "ads-mgr",
      campaignId: "c-chatgpt",
      changeKind: PaidChangeKind.BID_ADJUST,
      hypothesis: "Lower CPC",
      exactChange: "-10%",
      risk: "Volume drop",
      alternative: "Hold",
      diagnosis,
      financialDiff: {
        currency: "USD",
        dailyBudgetBeforeMinor: 2000,
        dailyBudgetAfterMinor: 2000,
        lifetimeImpactMinor: 0,
        sharedBudgetAffected: false,
        sharedBudgetImpactKnown: true,
        notes: [],
      },
      chatgptAdsAccess: access,
      createdAtIso: "2026-11-21T12:00:00.000Z",
    });
    expect(chatgpt.ok).toBe(false);
    if (!chatgpt.ok) {
      expect(chatgpt.code).toBe("CHATGPT_ADS_BLOCKED");
      expect(chatgpt.proposal?.wiring).toBe(PaidMediaWiring.ACCESS_BLOCKED);
      expect(chatgpt.proposal?.status).toBe(PaidProposalStatus.BLOCKED);
    }
  });

  it("records fixture Google Ads decision without live mutation", () => {
    const diagnosis = diagnoseDelivery({
      impressions: 2000,
      clicks: 80,
      eventsPresent: true,
      attributionSettled: true,
      sameDaySpendComplete: true,
    });
    const created = createPaidMediaProposal({
      proposalId: "p-google",
      platform: PaidMediaPlatform.GOOGLE_ADS,
      accountId: "acct-fixture",
      campaignId: "camp-1",
      changeKind: PaidChangeKind.PAUSE_CAMPAIGN,
      hypothesis: "Pause underperforming fixture campaign",
      exactChange: "status: ENABLED → PAUSED",
      risk: "Lost learning",
      alternative: "Tighten keywords",
      diagnosis,
      financialDiff: {
        currency: "USD",
        dailyBudgetBeforeMinor: 5000,
        dailyBudgetAfterMinor: 0,
        lifetimeImpactMinor: 0,
        sharedBudgetAffected: false,
        sharedBudgetImpactKnown: true,
        notes: ["fixture financial diff"],
      },
      createdAtIso: "2026-11-21T12:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const decided = recordPaidMediaDecision({
      decisionId: "d1",
      proposal: created.proposal,
      decision: "approve",
      actorRole: "administrator",
      reason: "Fixture review only",
      recordedAtIso: "2026-11-21T12:05:00.000Z",
    });
    expect(decided.ok).toBe(true);
    if (!decided.ok) return;
    expect(decided.decision.mutationAttempted).toBe(false);
    expect(decided.decision.externalEffects).toBe("NONE");

    const exec = attemptPaidMediaExecution({
      proposal: decided.proposal,
      preferLive: true,
    });
    expect(exec.ok).toBe(false);
    expect(exec.code).toBe("LIVE_MUTATION_NOT_WIRED");
    expect(exec.externalEffects).toBe("NONE");
    expect(exec.acceptanceEqualsVerified).toBe(false);
  });

  it("exposes honest channel status", () => {
    const status = paidMediaChannelStatus();
    expect(status.googleAds.writeReady).toBe(false);
    expect(status.chatgptAds.wiring).toBe(PaidMediaWiring.ACCESS_BLOCKED);
    expect(status.chatgptAds.access.allowed).toBe(false);
    expect(status.liveMutationWiring).toBe("NOT_WIRED");
    expect(status.externalEffects).toBe("NONE");
  });
});
