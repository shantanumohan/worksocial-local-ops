import { describe, expect, it } from "vitest";
import { AnalyticsEnvironment, evaluateChatGptAdsAccess } from "./analytics.js";
import {
  AdsConversionFreshness,
  DeliveryDiagnosisKind,
  PaidChangeKind,
  PaidMediaPlatform,
  PaidMediaWiring,
  PaidProposalStatus,
  RECENT_ADS_CONVERSION_RELATED_CASE_IDS,
  attemptPaidMediaExecution,
  classifyRecentAdsConversion,
  createAnalysisDefinition,
  createAnalysisHypothesis,
  createDecisionBrief,
  createPaidMediaProposal,
  diagnoseDelivery,
  evaluateRecentAdsConversionAttackSuite,
  paidMediaChannelStatus,
  recordPaidMediaDecision,
  reReadPaidProviderBudgetBeforeMutation,
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

  it("invalidates proposal when shared ad budget changes externally (T-X035)", () => {
    const diagnosis = diagnoseDelivery({
      impressions: 2000,
      clicks: 80,
      eventsPresent: true,
      attributionSettled: true,
      sameDaySpendComplete: true,
    });
    const bound = {
      accountId: "acct-fixture",
      campaignId: "camp-shared",
      sharedBudgetId: "sb-shared-1",
      entityRevision: "rev-1",
      dailyBudgetMinor: 5000,
      sharedBudgetDailyMinor: 20_000,
      readAtIso: "2026-11-21T12:00:00.000Z",
    };

    const missingSnap = createPaidMediaProposal({
      proposalId: "p-shared-nosnap",
      platform: PaidMediaPlatform.GOOGLE_ADS,
      accountId: "acct-fixture",
      campaignId: "camp-shared",
      changeKind: PaidChangeKind.BUDGET_ADJUST,
      hypothesis: "Raise campaign share of shared budget",
      exactChange: "campaign daily +$20 within shared cap",
      risk: "Crowds sibling campaigns",
      alternative: "Hold",
      diagnosis,
      financialDiff: {
        currency: "USD",
        dailyBudgetBeforeMinor: 5000,
        dailyBudgetAfterMinor: 7000,
        lifetimeImpactMinor: null,
        sharedBudgetAffected: true,
        sharedBudgetImpactKnown: true,
        notes: ["shared budget known at bind"],
      },
      createdAtIso: "2026-11-21T12:00:00.000Z",
    });
    expect(missingSnap.ok).toBe(false);
    if (!missingSnap.ok) {
      expect(missingSnap.code).toBe("SHARED_BUDGET_SNAPSHOT_REQUIRED");
    }

    const created = createPaidMediaProposal({
      proposalId: "p-shared-ext",
      platform: PaidMediaPlatform.GOOGLE_ADS,
      accountId: "acct-fixture",
      campaignId: "camp-shared",
      changeKind: PaidChangeKind.BUDGET_ADJUST,
      hypothesis: "Raise campaign share of shared budget",
      exactChange: "campaign daily +$20 within shared cap",
      risk: "Crowds sibling campaigns",
      alternative: "Hold",
      diagnosis,
      financialDiff: {
        currency: "USD",
        dailyBudgetBeforeMinor: 5000,
        dailyBudgetAfterMinor: 7000,
        lifetimeImpactMinor: null,
        sharedBudgetAffected: true,
        sharedBudgetImpactKnown: true,
        notes: ["shared budget known at bind"],
      },
      boundProviderSnapshot: bound,
      createdAtIso: "2026-11-21T12:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const match = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: { ...bound, readAtIso: "2026-11-21T12:10:00.000Z" },
      readAtIso: "2026-11-21T12:10:00.000Z",
    });
    expect(match.ok).toBe(true);
    if (match.ok) expect(match.code).toBe("PROVIDER_STATE_MATCHES");

    const stale = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: { ...bound, readAtIso: "2026-11-21T11:00:00.000Z" },
      readAtIso: "2026-11-21T12:10:00.000Z",
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe("STALE_PROVIDER_SNAPSHOT");

    // Offset ISO that is later as an instant than proposal.updatedAtIso (Z).
    const offsetFresh = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: { ...bound, readAtIso: "2026-11-21T08:00:00-05:00" },
      readAtIso: "2026-11-21T13:00:00.000Z",
    });
    expect(offsetFresh.ok).toBe(true);
    if (offsetFresh.ok) expect(offsetFresh.code).toBe("PROVIDER_STATE_MATCHES");

    // Offset ISO that lexically looks later but is earlier as an instant.
    const offsetStale = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: { ...bound, readAtIso: "2026-11-21T13:00:00+02:00" },
      readAtIso: "2026-11-21T13:00:00.000Z",
    });
    expect(offsetStale.ok).toBe(false);
    if (!offsetStale.ok) expect(offsetStale.code).toBe("STALE_PROVIDER_SNAPSHOT");

    const mismatchedSnap = createPaidMediaProposal({
      proposalId: "p-shared-mismatch",
      platform: PaidMediaPlatform.GOOGLE_ADS,
      accountId: "acct-fixture",
      campaignId: "camp-shared",
      changeKind: PaidChangeKind.BUDGET_ADJUST,
      hypothesis: "Raise campaign share of shared budget",
      exactChange: "campaign daily +$20 within shared cap",
      risk: "Crowds sibling campaigns",
      alternative: "Hold",
      diagnosis,
      financialDiff: {
        currency: "USD",
        dailyBudgetBeforeMinor: 5000,
        dailyBudgetAfterMinor: 7000,
        lifetimeImpactMinor: null,
        sharedBudgetAffected: true,
        sharedBudgetImpactKnown: true,
        notes: ["shared budget known at bind"],
      },
      boundProviderSnapshot: { ...bound, dailyBudgetMinor: 8000 },
      createdAtIso: "2026-11-21T12:00:00.000Z",
    });
    expect(mismatchedSnap.ok).toBe(false);
    if (!mismatchedSnap.ok) {
      expect(mismatchedSnap.code).toBe("SNAPSHOT_BUDGET_MISMATCH");
    }

    const drifted = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        sharedBudgetDailyMinor: 15_000,
        entityRevision: "rev-2",
        readAtIso: "2026-11-21T12:15:00.000Z",
      },
      readAtIso: "2026-11-21T12:15:00.000Z",
    });
    expect(drifted.ok).toBe(false);
    if (drifted.ok) return;
    expect(drifted.code).toBe("SHARED_BUDGET_CHANGED_EXTERNALLY");
    expect(drifted.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
    expect(drifted.externalEffects).toBe("NONE");
    expect(drifted.mutationAttempted).toBe(false);

    const reDecision = recordPaidMediaDecision({
      decisionId: "d-stale",
      proposal: drifted.proposal,
      decision: "approve",
      actorRole: "administrator",
      reason: "stale after external shared budget change",
      recordedAtIso: "2026-11-21T12:16:00.000Z",
    });
    expect(reDecision.ok).toBe(false);
    if (!reDecision.ok) expect(reDecision.code).toBe("PROPOSAL_INVALIDATED");

    const exec = attemptPaidMediaExecution({
      proposal: drifted.proposal,
      preferLive: true,
    });
    expect(exec.ok).toBe(false);
    expect(exec.code).toBe("PROPOSAL_INVALIDATED");
    expect(exec.externalEffects).toBe("NONE");
    expect(exec.mutationAttempted).toBe(false);
  });

  it("treats blank recent Ads conversions as PENDING, not false zero (T-X036)", () => {
    const blank = classifyRecentAdsConversion({
      campaignId: "camp-blank",
      conversions: null,
      blank: true,
      attributionSettled: false,
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(blank.freshness).toBe(AdsConversionFreshness.PENDING);
    expect(blank.displayValue).toBeNull();
    expect(blank.conversions.kind).toBe("missing");
    expect(blank.liveProviderWiring).toBe("NOT_WIRED");
    expect(blank.externalEffects).toBe("NONE");
    expect(blank.reasons.join(" ")).toMatch(/PENDING|not false zero/i);

    const unsettled = classifyRecentAdsConversion({
      campaignId: "camp-unsettled",
      conversions: 0,
      blank: false,
      attributionSettled: false,
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(unsettled.freshness).toBe(AdsConversionFreshness.PENDING);
    expect(unsettled.displayValue).toBeNull();

    const settledZero = classifyRecentAdsConversion({
      campaignId: "camp-zero",
      conversions: 0,
      blank: false,
      attributionSettled: true,
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(settledZero.freshness).toBe(AdsConversionFreshness.FIXTURE);
    expect(settledZero.displayValue).toBe(0);
    expect(settledZero.conversions.kind).toBe("measured");

    const notWired = classifyRecentAdsConversion({
      campaignId: "camp-nw",
      conversions: 3,
      blank: false,
      attributionSettled: true,
      environment: AnalyticsEnvironment.NOT_WIRED,
    });
    expect(notWired.freshness).toBe(AdsConversionFreshness.UNAVAILABLE);
    expect(notWired.displayValue).toBeNull();

    // LIVE remains unavailable while Ads transport is NOT_WIRED — no false live claim.
    const liveRefused = classifyRecentAdsConversion({
      campaignId: "camp-live",
      conversions: 4,
      blank: false,
      attributionSettled: true,
      environment: AnalyticsEnvironment.LIVE,
    });
    expect(liveRefused.freshness).toBe(AdsConversionFreshness.UNAVAILABLE);
    expect(liveRefused.displayValue).toBeNull();
    expect(liveRefused.conversions).toEqual({
      kind: "unavailable",
      reason: "unsupported",
    });
    expect(liveRefused.reasons.join(" ")).toMatch(/LIVE|NOT_WIRED/i);

    const sandbox = classifyRecentAdsConversion({
      campaignId: "camp-sandbox",
      conversions: 2,
      blank: false,
      attributionSettled: true,
      environment: AnalyticsEnvironment.SANDBOX,
    });
    expect(sandbox.freshness).toBe(AdsConversionFreshness.SANDBOX);
    expect(sandbox.displayValue).toBe(2);
    expect(sandbox.conversions.kind).toBe("measured");

    const unavailable = classifyRecentAdsConversion({
      campaignId: "camp-unavail",
      conversions: 7,
      blank: false,
      attributionSettled: true,
      environment: AnalyticsEnvironment.UNAVAILABLE,
    });
    expect(unavailable.freshness).toBe(AdsConversionFreshness.UNAVAILABLE);
    expect(unavailable.displayValue).toBeNull();
    expect(unavailable.conversions).toEqual({
      kind: "unavailable",
      reason: "provider_error",
    });

    // Zero-delivery + unsettled attribution still blocks budget adjust.
    const noImpressions = diagnoseDelivery({
      impressions: 0,
      clicks: 0,
      eventsPresent: false,
      attributionSettled: false,
      sameDaySpendComplete: false,
    });
    expect(noImpressions.kind).toBe(DeliveryDiagnosisKind.NO_IMPRESSIONS);
    const blockedZeroDelivery = createPaidMediaProposal({
      proposalId: "p-zero-unsettled",
      platform: PaidMediaPlatform.GOOGLE_ADS,
      accountId: "acct",
      campaignId: "c-zero",
      changeKind: PaidChangeKind.BUDGET_ADJUST,
      hypothesis: "h",
      exactChange: "+5",
      risk: "r",
      alternative: "a",
      diagnosis: noImpressions,
      financialDiff: {
        currency: "USD",
        dailyBudgetBeforeMinor: 1000,
        dailyBudgetAfterMinor: 1500,
        lifetimeImpactMinor: null,
        sharedBudgetAffected: false,
        sharedBudgetImpactKnown: true,
        notes: [],
      },
      createdAtIso: "2026-11-21T12:00:00.000Z",
    });
    expect(blockedZeroDelivery.ok).toBe(false);
    if (!blockedZeroDelivery.ok) {
      expect(blockedZeroDelivery.code).toBe("PARTIAL_SPEND");
    }
  });

  it("recent-Ads-conversion attack suite covers blank/NaN/unsettled with NOT_WIRED", () => {
    const suite = evaluateRecentAdsConversionAttackSuite();
    expect(suite.passed).toBe(true);
    expect(
      suite.details.some((d) => /liveProviderWiring=NOT_WIRED/i.test(d)),
    ).toBe(true);
    expect(
      suite.details.some((d) => /never expose displayValue=0/i.test(d)),
    ).toBe(true);
    expect([...RECENT_ADS_CONVERSION_RELATED_CASE_IDS]).toEqual(["T-X036"]);
    expect(
      suite.classifications.every(
        (c) =>
          c.liveProviderWiring === "NOT_WIRED" && c.externalEffects === "NONE",
      ),
    ).toBe(true);
  });
});
