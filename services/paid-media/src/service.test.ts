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
});
