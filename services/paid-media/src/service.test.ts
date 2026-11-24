import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PaidChangeKind,
  PaidMediaPlatform,
  PaidProposalStatus,
} from "@worksocial/domain";
import { createFilePaidMediaStore } from "@worksocial/persistence";
import { createPaidMediaService } from "./service.js";

describe("paid-media service", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-paid-media-svc-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("seeds fixtures, records Google decision, blocks ChatGPT + live execute", () => {
    const service = createPaidMediaService(createFilePaidMediaStore(dir));
    const seeded = service.seedFixtures("2026-11-21T21:00:00.000Z");
    expect(seeded.googleProposal.status).toBe(
      PaidProposalStatus.READY_FOR_REVIEW,
    );
    expect(seeded.chatgptBlockedProposal.status).toBe(
      PaidProposalStatus.BLOCKED,
    );

    const status = service.status();
    expect(status.chatgptAdsWiring).toBe("ACCESS_BLOCKED");
    expect(status.channels.chatgptAds.access.allowed).toBe(false);
    expect(status.liveMutationWiring).toBe("NOT_WIRED");
    expect(status.relatedCaseIds).toContain("T-F16");
    expect(status.relatedCaseIds).toContain("T-F19");

    const decided = service.decide({
      proposalId: seeded.googleProposal.proposalId,
      decision: "approve",
      reason: "Fixture review — Analyze only",
      nowIso: "2026-11-21T21:05:00.000Z",
    });
    expect(decided.ok).toBe(true);
    if (!decided.ok) return;
    expect(decided.decision.externalEffects).toBe("NONE");
    expect(decided.decision.mutationAttempted).toBe(false);

    const exec = service.execute({
      proposalId: seeded.googleProposal.proposalId,
      preferLive: true,
    });
    expect(exec.ok).toBe(false);
    expect(exec.code).toBe("LIVE_MUTATION_NOT_WIRED");
    expect(exec.externalEffects).toBe("NONE");

    const chatgptDecide = service.decide({
      proposalId: seeded.chatgptBlockedProposal.proposalId,
      decision: "approve",
      reason: "should fail",
    });
    expect(chatgptDecide.ok).toBe(false);
  });

  it("blocks ChatGPT Ads recommendation at request time", () => {
    const service = createPaidMediaService(createFilePaidMediaStore(dir));
    const result = service.requestRecommendation({
      platform: PaidMediaPlatform.CHATGPT_ADS,
      accountId: "acct",
      campaignId: "c1",
      changeKind: PaidChangeKind.BID_ADJUST,
      hypothesis: "Lower bid",
      exactChange: "-5%",
      risk: "Volume",
      alternative: "Hold",
      impressions: 1000,
      clicks: 50,
      eventsPresent: true,
      attributionSettled: true,
      sameDaySpendComplete: true,
      financialDiff: {
        currency: "USD",
        dailyBudgetBeforeMinor: 1000,
        dailyBudgetAfterMinor: 1000,
        lifetimeImpactMinor: 0,
        sharedBudgetAffected: false,
        sharedBudgetImpactKnown: true,
        notes: [],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CHATGPT_ADS_BLOCKED");
  });

  it("threads boundProviderSnapshot for shared-budget recommendations (T-X035)", () => {
    const service = createPaidMediaService(createFilePaidMediaStore(dir));
    const missing = service.requestRecommendation({
      platform: PaidMediaPlatform.GOOGLE_ADS,
      accountId: "acct-fixture",
      campaignId: "camp-shared",
      changeKind: PaidChangeKind.BUDGET_ADJUST,
      hypothesis: "Raise share",
      exactChange: "+20",
      risk: "Sibling crowding",
      alternative: "Hold",
      impressions: 2000,
      clicks: 80,
      eventsPresent: true,
      attributionSettled: true,
      sameDaySpendComplete: true,
      financialDiff: {
        currency: "USD",
        dailyBudgetBeforeMinor: 5000,
        dailyBudgetAfterMinor: 7000,
        lifetimeImpactMinor: null,
        sharedBudgetAffected: true,
        sharedBudgetImpactKnown: true,
        notes: [],
      },
      nowIso: "2026-11-21T12:00:00.000Z",
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("SHARED_BUDGET_SNAPSHOT_REQUIRED");

    const ok = service.requestRecommendation({
      platform: PaidMediaPlatform.GOOGLE_ADS,
      accountId: "acct-fixture",
      campaignId: "camp-shared",
      changeKind: PaidChangeKind.BUDGET_ADJUST,
      hypothesis: "Raise share",
      exactChange: "+20",
      risk: "Sibling crowding",
      alternative: "Hold",
      impressions: 2000,
      clicks: 80,
      eventsPresent: true,
      attributionSettled: true,
      sameDaySpendComplete: true,
      financialDiff: {
        currency: "USD",
        dailyBudgetBeforeMinor: 5000,
        dailyBudgetAfterMinor: 7000,
        lifetimeImpactMinor: null,
        sharedBudgetAffected: true,
        sharedBudgetImpactKnown: true,
        notes: [],
      },
      boundProviderSnapshot: {
        accountId: "acct-fixture",
        campaignId: "camp-shared",
        sharedBudgetId: "sb-1",
        entityRevision: "rev-1",
        dailyBudgetMinor: 5000,
        sharedBudgetDailyMinor: 20_000,
        readAtIso: "2026-11-21T12:00:00.000Z",
      },
      nowIso: "2026-11-21T12:00:00.000Z",
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.proposal.status).toBe(PaidProposalStatus.READY_FOR_REVIEW);
    expect(ok.proposal.boundProviderSnapshot?.sharedBudgetId).toBe("sb-1");
  });
});
