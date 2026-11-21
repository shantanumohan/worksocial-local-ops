/**
 * Contract: AA-19 / WP13–14 review analysis + paid-media proposals.
 * Fixture ≠ live. ChatGPT Ads ACCESS_BLOCKED. External effects NONE.
 * Catalog cases remain NOT_RUN — never silently VERIFIED.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PaidMediaPlatform,
  PaidProposalStatus,
  evaluateChatGptAdsAccess,
  AnalyticsEnvironment,
} from "@worksocial/domain";
import { createFilePaidMediaStore } from "@worksocial/persistence";
import { createPaidMediaService } from "@worksocial/paid-media";

describe("contract: AA-19 paid-media proposals + analysis", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-paid-media-contract-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("seeds analysis artifacts and Google proposal; blocks ChatGPT and live execute", () => {
    const service = createPaidMediaService(createFilePaidMediaStore(dir));
    const seeded = service.seedFixtures("2026-11-21T21:30:00.000Z");

    expect(seeded.definition.environment).toBe(AnalyticsEnvironment.FIXTURE);
    expect(seeded.hypothesis.primaryOutcome).toContain("bookings");
    expect(seeded.brief.redacted).toBe(true);

    expect(seeded.googleProposal.platform).toBe(PaidMediaPlatform.GOOGLE_ADS);
    expect(seeded.googleProposal.status).toBe(
      PaidProposalStatus.READY_FOR_REVIEW,
    );
    expect(seeded.googleProposal.financialDiff.sharedBudgetImpactKnown).toBe(
      true,
    );

    expect(seeded.chatgptBlockedProposal.status).toBe(
      PaidProposalStatus.BLOCKED,
    );
    expect(seeded.chatgptBlockedProposal.wiring).toBe("ACCESS_BLOCKED");

    const status = service.status();
    expect(status.chatgptAdsWiring).toBe("ACCESS_BLOCKED");
    expect(status.liveMutationWiring).toBe("NOT_WIRED");
    expect(status.externalEffects).toBe("NONE");
    expect(status.productionActivated).toBe(false);
    expect(status.channels.chatgptAds.access.allowed).toBe(false);
    expect(status.channels.googleAds.writeReady).toBe(false);
    expect(status.relatedCaseIds).toEqual(
      expect.arrayContaining(["T-F07", "T-F16", "T-F19", "T-US-013"]),
    );

    const decided = service.decide({
      proposalId: seeded.googleProposal.proposalId,
      decision: "approve",
      reason: "Fixture decision record only",
      nowIso: "2026-11-21T21:31:00.000Z",
    });
    expect(decided.ok).toBe(true);
    if (!decided.ok) return;
    expect(decided.decision.mutationAttempted).toBe(false);
    expect(decided.decision.externalEffects).toBe("NONE");

    const exec = service.execute({
      proposalId: seeded.googleProposal.proposalId,
      preferLive: true,
    });
    expect(exec.ok).toBe(false);
    expect(exec.code).toBe("LIVE_MUTATION_NOT_WIRED");
    expect(exec.acceptanceEqualsVerified).toBe(false);

    const chatgptDecide = service.decide({
      proposalId: seeded.chatgptBlockedProposal.proposalId,
      decision: "approve",
      reason: "must stay blocked",
    });
    expect(chatgptDecide.ok).toBe(false);
  });

  it("keeps ChatGPT Ads access gate fail-closed without transport/entitlement", () => {
    const access = evaluateChatGptAdsAccess({
      localTransportVerified: false,
      entitlementVerified: true,
      authVerified: true,
      projectEnvironment: AnalyticsEnvironment.FIXTURE,
      requestedEnvironment: AnalyticsEnvironment.FIXTURE,
    });
    expect(access.allowed).toBe(false);
    expect(access.environment).toBe(AnalyticsEnvironment.NOT_WIRED);

    const live = evaluateChatGptAdsAccess({
      localTransportVerified: true,
      entitlementVerified: true,
      authVerified: true,
      projectEnvironment: AnalyticsEnvironment.FIXTURE,
      requestedEnvironment: AnalyticsEnvironment.LIVE,
    });
    expect(live.allowed).toBe(false);
    expect(live.code).toBe("ADS_LIVE_NOT_WIRED");
  });
});
