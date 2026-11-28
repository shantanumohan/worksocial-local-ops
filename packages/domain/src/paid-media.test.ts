import { describe, expect, it } from "vitest";
import { AnalyticsEnvironment, evaluateChatGptAdsAccess } from "./analytics.js";
import {
  AdsConversionFreshness,
  DeliveryDiagnosisKind,
  PaidChangeKind,
  PaidMediaPlatform,
  PaidMediaWiring,
  PaidProposalStatus,
  attemptPaidMediaExecution,
  classifyRecentAdsConversion,
  createAnalysisDefinition,
  createAnalysisHypothesis,
  createDecisionBrief,
  createPaidMediaProposal,
  diagnoseDelivery,
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
    expect(match.liveProviderWiring).toBe("NOT_WIRED");
    expect(match.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(match.externalEffects).toBe("NONE");
    expect(match.mutationAttempted).toBe(false);

    const stale = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: { ...bound, readAtIso: "2026-11-21T11:00:00.000Z" },
      readAtIso: "2026-11-21T12:10:00.000Z",
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.code).toBe("STALE_PROVIDER_SNAPSHOT");
      expect(stale.liveProviderWiring).toBe("NOT_WIRED");
      expect(stale.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    }

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
    expect(drifted.liveProviderWiring).toBe("NOT_WIRED");
    expect(drifted.chatgptAdsAccess).toBe("ACCESS_BLOCKED");

    const campaignOnly = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        dailyBudgetMinor: 4500,
        readAtIso: "2026-11-21T12:14:00.000Z",
      },
      readAtIso: "2026-11-21T12:14:00.000Z",
    });
    expect(campaignOnly.ok).toBe(false);
    if (!campaignOnly.ok) {
      expect(campaignOnly.code).toBe("CAMPAIGN_BUDGET_CHANGED_EXTERNALLY");
      expect(campaignOnly.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
      expect(campaignOnly.liveProviderWiring).toBe("NOT_WIRED");
      expect(campaignOnly.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
      expect(campaignOnly.externalEffects).toBe("NONE");
    }

    const identityDrift = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        sharedBudgetId: "sb-different-external",
        readAtIso: "2026-11-21T12:14:30.000Z",
      },
      readAtIso: "2026-11-21T12:14:30.000Z",
    });
    expect(identityDrift.ok).toBe(false);
    if (!identityDrift.ok) {
      expect(identityDrift.code).toBe("ACCOUNT_MISMATCH");
      expect(identityDrift.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
      expect(identityDrift.liveProviderWiring).toBe("NOT_WIRED");
      expect(identityDrift.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    }

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

    // Partial ledger: blank revision / non-finite shared budget → never MATCHES.
    const partialCurrent = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        entityRevision: "   ",
        sharedBudgetDailyMinor: Number.NaN,
        readAtIso: "2026-11-21T12:20:00.000Z",
      },
      readAtIso: "2026-11-21T12:20:00.000Z",
    });
    expect(partialCurrent.ok).toBe(false);
    if (!partialCurrent.ok) {
      expect(partialCurrent.code).toBe("PARTIAL_PROVIDER_LEDGER");
      expect(partialCurrent.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
      expect(partialCurrent.liveProviderWiring).toBe("NOT_WIRED");
      expect(partialCurrent.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
      expect(partialCurrent.externalEffects).toBe("NONE");
      expect(partialCurrent.mutationAttempted).toBe(false);
    }

    const partialCreate = createPaidMediaProposal({
      proposalId: "p-shared-partial",
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
      boundProviderSnapshot: { ...bound, sharedBudgetId: "" },
      createdAtIso: "2026-11-21T12:00:00.000Z",
    });
    expect(partialCreate.ok).toBe(false);
    if (!partialCreate.ok) {
      expect(partialCreate.code).toBe("PARTIAL_PROVIDER_LEDGER");
    }

    // G12: equal-instant boundary → MATCHES (not stale).
    const equalInstant = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: { ...bound, readAtIso: created.proposal.updatedAtIso },
      readAtIso: created.proposal.updatedAtIso,
    });
    expect(equalInstant.ok).toBe(true);
    if (equalInstant.ok) expect(equalInstant.code).toBe("PROVIDER_STATE_MATCHES");

    // G12: shared budget collapsed to zero → external change.
    const zeroShared = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        sharedBudgetDailyMinor: 0,
        entityRevision: "rev-zero",
        readAtIso: "2026-11-21T12:25:00.000Z",
      },
      readAtIso: "2026-11-21T12:25:00.000Z",
    });
    expect(zeroShared.ok).toBe(false);
    if (!zeroShared.ok) {
      expect(zeroShared.code).toBe("SHARED_BUDGET_CHANGED_EXTERNALLY");
      expect(zeroShared.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
    }

    // G12: re-read on already-INVALIDATED never invents MATCHES.
    const alreadyInvalid = reReadPaidProviderBudgetBeforeMutation({
      proposal: drifted.proposal,
      current: { ...bound, readAtIso: "2026-11-21T12:30:00.000Z" },
      readAtIso: "2026-11-21T12:30:00.000Z",
    });
    expect(alreadyInvalid.ok).toBe(false);
    if (!alreadyInvalid.ok) {
      expect(alreadyInvalid.code).toBe("PROPOSAL_ALREADY_INVALIDATED");
      expect(alreadyInvalid.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
      expect(alreadyInvalid.liveProviderWiring).toBe("NOT_WIRED");
      expect(alreadyInvalid.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
      expect(alreadyInvalid.externalEffects).toBe("NONE");
      expect(alreadyInvalid.mutationAttempted).toBe(false);
    }

    // G12: negative shared budget → partial ledger at create.
    const negativeCreate = createPaidMediaProposal({
      proposalId: "p-shared-neg",
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
      boundProviderSnapshot: { ...bound, sharedBudgetDailyMinor: -1 },
      createdAtIso: "2026-11-21T12:00:00.000Z",
    });
    expect(negativeCreate.ok).toBe(false);
    if (!negativeCreate.ok) {
      expect(negativeCreate.code).toBe("PARTIAL_PROVIDER_LEDGER");
    }

    // G14: whitespace-padded entityRevision → PARTIAL_PROVIDER_LEDGER.
    const paddedRevision = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        entityRevision: "  rev-1  ",
        readAtIso: "2026-11-21T12:35:00.000Z",
      },
      readAtIso: "2026-11-21T12:35:00.000Z",
    });
    expect(paddedRevision.ok).toBe(false);
    if (!paddedRevision.ok) {
      expect(paddedRevision.code).toBe("PARTIAL_PROVIDER_LEDGER");
      expect(paddedRevision.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
      expect(paddedRevision.externalEffects).toBe("NONE");
      expect(paddedRevision.mutationAttempted).toBe(false);
    }

    // G14: campaign dailyBudgetMinor null ↔ number → CAMPAIGN_BUDGET_CHANGED.
    const nullBoundCreate = createPaidMediaProposal({
      proposalId: "p-shared-null-daily",
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
        dailyBudgetBeforeMinor: null,
        dailyBudgetAfterMinor: 7000,
        lifetimeImpactMinor: null,
        sharedBudgetAffected: true,
        sharedBudgetImpactKnown: true,
        notes: ["shared budget known at bind"],
      },
      boundProviderSnapshot: { ...bound, dailyBudgetMinor: null },
      createdAtIso: "2026-11-21T12:00:00.000Z",
    });
    expect(nullBoundCreate.ok).toBe(true);
    if (!nullBoundCreate.ok) return;
    const nullToNumber = reReadPaidProviderBudgetBeforeMutation({
      proposal: nullBoundCreate.proposal,
      current: {
        ...bound,
        dailyBudgetMinor: 5000,
        readAtIso: "2026-11-21T12:40:00.000Z",
      },
      readAtIso: "2026-11-21T12:40:00.000Z",
    });
    expect(nullToNumber.ok).toBe(false);
    if (!nullToNumber.ok) {
      expect(nullToNumber.code).toBe("CAMPAIGN_BUDGET_CHANGED_EXTERNALLY");
      expect(nullToNumber.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
      expect(nullToNumber.liveProviderWiring).toBe("NOT_WIRED");
      expect(nullToNumber.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    }

    // G16: campaign dailyBudgetMinor number → null → CAMPAIGN_BUDGET_CHANGED.
    const numberToNull = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        dailyBudgetMinor: null,
        readAtIso: "2026-11-21T12:45:00.000Z",
      },
      readAtIso: "2026-11-21T12:45:00.000Z",
    });
    expect(numberToNull.ok).toBe(false);
    if (!numberToNull.ok) {
      expect(numberToNull.code).toBe("CAMPAIGN_BUDGET_CHANGED_EXTERNALLY");
      expect(numberToNull.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
      expect(numberToNull.externalEffects).toBe("NONE");
      expect(numberToNull.mutationAttempted).toBe(false);
    }

    // G16: whitespace-padded sharedBudgetId → PARTIAL_PROVIDER_LEDGER.
    const paddedSharedId = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        sharedBudgetId: "  shared-budget-1  ",
        readAtIso: "2026-11-21T12:50:00.000Z",
      },
      readAtIso: "2026-11-21T12:50:00.000Z",
    });
    expect(paddedSharedId.ok).toBe(false);
    if (!paddedSharedId.ok) {
      expect(paddedSharedId.code).toBe("PARTIAL_PROVIDER_LEDGER");
      expect(paddedSharedId.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
      expect(paddedSharedId.liveProviderWiring).toBe("NOT_WIRED");
    }

    // G16: unparseable readAtIso → PARTIAL_PROVIDER_LEDGER.
    const badReadAt = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        readAtIso: "not-an-instant",
      },
      readAtIso: "2026-11-21T12:55:00.000Z",
    });
    expect(badReadAt.ok).toBe(false);
    if (!badReadAt.ok) {
      expect(badReadAt.code).toBe("PARTIAL_PROVIDER_LEDGER");
      expect(badReadAt.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
      expect(badReadAt.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
      expect(badReadAt.mutationAttempted).toBe(false);
    }

    // G17: whitespace-padded accountId → PARTIAL_PROVIDER_LEDGER.
    const paddedAccount = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        accountId: "  acct-fixture  ",
        readAtIso: "2026-11-21T13:00:00.000Z",
      },
      readAtIso: "2026-11-21T13:00:00.000Z",
    });
    expect(paddedAccount.ok).toBe(false);
    if (!paddedAccount.ok) {
      expect(paddedAccount.code).toBe("PARTIAL_PROVIDER_LEDGER");
      expect(paddedAccount.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
      expect(paddedAccount.externalEffects).toBe("NONE");
      expect(paddedAccount.mutationAttempted).toBe(false);
    }

    // G17: non-finite sharedBudgetDailyMinor (NaN) → PARTIAL_PROVIDER_LEDGER.
    const nanShared = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        sharedBudgetDailyMinor: Number.NaN,
        readAtIso: "2026-11-21T13:05:00.000Z",
      },
      readAtIso: "2026-11-21T13:05:00.000Z",
    });
    expect(nanShared.ok).toBe(false);
    if (!nanShared.ok) {
      expect(nanShared.code).toBe("PARTIAL_PROVIDER_LEDGER");
      expect(nanShared.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
      expect(nanShared.liveProviderWiring).toBe("NOT_WIRED");
    }

    // G17: stale provider snapshot (current older than proposal) → STALE.
    const staleOlder = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        readAtIso: "2026-11-21T11:00:00.000Z",
      },
      readAtIso: "2026-11-21T13:10:00.000Z",
    });
    expect(staleOlder.ok).toBe(false);
    if (!staleOlder.ok) {
      expect(staleOlder.code).toBe("STALE_PROVIDER_SNAPSHOT");
      expect(staleOlder.proposal.status).toBe(PaidProposalStatus.READY_FOR_REVIEW);
      expect(staleOlder.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
      expect(staleOlder.mutationAttempted).toBe(false);
      expect(staleOlder.externalEffects).toBe("NONE");
    }

    // G18: whitespace-padded campaignId → PARTIAL_PROVIDER_LEDGER.
    const paddedCampaign = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        campaignId: "  camp-shared  ",
        readAtIso: "2026-11-21T13:15:00.000Z",
      },
      readAtIso: "2026-11-21T13:15:00.000Z",
    });
    expect(paddedCampaign.ok).toBe(false);
    if (!paddedCampaign.ok) {
      expect(paddedCampaign.code).toBe("PARTIAL_PROVIDER_LEDGER");
      expect(paddedCampaign.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
      expect(paddedCampaign.externalEffects).toBe("NONE");
      expect(paddedCampaign.mutationAttempted).toBe(false);
    }

    // G18: Infinity sharedBudgetDailyMinor → PARTIAL_PROVIDER_LEDGER.
    const infShared = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        sharedBudgetDailyMinor: Number.POSITIVE_INFINITY,
        readAtIso: "2026-11-21T13:20:00.000Z",
      },
      readAtIso: "2026-11-21T13:20:00.000Z",
    });
    expect(infShared.ok).toBe(false);
    if (!infShared.ok) {
      expect(infShared.code).toBe("PARTIAL_PROVIDER_LEDGER");
      expect(infShared.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
      expect(infShared.liveProviderWiring).toBe("NOT_WIRED");
    }

    // G18: negative campaign dailyBudgetMinor → PARTIAL_PROVIDER_LEDGER.
    const negDaily = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        dailyBudgetMinor: -1,
        readAtIso: "2026-11-21T13:25:00.000Z",
      },
      readAtIso: "2026-11-21T13:25:00.000Z",
    });
    expect(negDaily.ok).toBe(false);
    if (!negDaily.ok) {
      expect(negDaily.code).toBe("PARTIAL_PROVIDER_LEDGER");
      expect(negDaily.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
      expect(negDaily.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
      expect(negDaily.mutationAttempted).toBe(false);
    }

    // G19: blank campaignId → PARTIAL_PROVIDER_LEDGER.
    const blankCampaign = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        campaignId: "   ",
        readAtIso: "2026-11-21T13:30:00.000Z",
      },
      readAtIso: "2026-11-21T13:30:00.000Z",
    });
    expect(blankCampaign.ok).toBe(false);
    if (!blankCampaign.ok) {
      expect(blankCampaign.code).toBe("PARTIAL_PROVIDER_LEDGER");
      expect(blankCampaign.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
      expect(blankCampaign.externalEffects).toBe("NONE");
      expect(blankCampaign.mutationAttempted).toBe(false);
    }

    // G19: -Infinity sharedBudgetDailyMinor → PARTIAL_PROVIDER_LEDGER.
    const negInfShared = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        sharedBudgetDailyMinor: Number.NEGATIVE_INFINITY,
        readAtIso: "2026-11-21T13:35:00.000Z",
      },
      readAtIso: "2026-11-21T13:35:00.000Z",
    });
    expect(negInfShared.ok).toBe(false);
    if (!negInfShared.ok) {
      expect(negInfShared.code).toBe("PARTIAL_PROVIDER_LEDGER");
      expect(negInfShared.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
      expect(negInfShared.liveProviderWiring).toBe("NOT_WIRED");
    }

    // G19: NaN campaign dailyBudgetMinor → PARTIAL_PROVIDER_LEDGER.
    const nanDaily = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        dailyBudgetMinor: Number.NaN,
        readAtIso: "2026-11-21T13:40:00.000Z",
      },
      readAtIso: "2026-11-21T13:40:00.000Z",
    });
    expect(nanDaily.ok).toBe(false);
    if (!nanDaily.ok) {
      expect(nanDaily.code).toBe("PARTIAL_PROVIDER_LEDGER");
      expect(nanDaily.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
      expect(nanDaily.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
      expect(nanDaily.mutationAttempted).toBe(false);
    }

    // G20: blank accountId → PARTIAL_PROVIDER_LEDGER.
    const blankAccount = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        accountId: "",
        readAtIso: "2026-11-21T13:45:00.000Z",
      },
      readAtIso: "2026-11-21T13:45:00.000Z",
    });
    expect(blankAccount.ok).toBe(false);
    if (!blankAccount.ok) {
      expect(blankAccount.code).toBe("PARTIAL_PROVIDER_LEDGER");
      expect(blankAccount.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
      expect(blankAccount.externalEffects).toBe("NONE");
      expect(blankAccount.mutationAttempted).toBe(false);
    }

    // G20: blank entityRevision → PARTIAL_PROVIDER_LEDGER.
    const blankRevision = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        entityRevision: "   ",
        readAtIso: "2026-11-21T13:50:00.000Z",
      },
      readAtIso: "2026-11-21T13:50:00.000Z",
    });
    expect(blankRevision.ok).toBe(false);
    if (!blankRevision.ok) {
      expect(blankRevision.code).toBe("PARTIAL_PROVIDER_LEDGER");
      expect(blankRevision.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
      expect(blankRevision.liveProviderWiring).toBe("NOT_WIRED");
    }

    // G20: Infinity campaign dailyBudgetMinor → PARTIAL_PROVIDER_LEDGER.
    const infDaily = reReadPaidProviderBudgetBeforeMutation({
      proposal: created.proposal,
      current: {
        ...bound,
        dailyBudgetMinor: Number.POSITIVE_INFINITY,
        readAtIso: "2026-11-21T13:55:00.000Z",
      },
      readAtIso: "2026-11-21T13:55:00.000Z",
    });
    expect(infDaily.ok).toBe(false);
    if (!infDaily.ok) {
      expect(infDaily.code).toBe("PARTIAL_PROVIDER_LEDGER");
      expect(infDaily.proposal.status).toBe(PaidProposalStatus.INVALIDATED);
      expect(infDaily.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
      expect(infDaily.mutationAttempted).toBe(false);
    }
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
});
