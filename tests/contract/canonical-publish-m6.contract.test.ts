/**
 * Contract: M6 / NEXT-17 canonical publish — versioned authoring, claim/source
 * QA + A25 binding, CMS+GBP+LinkedIn fixture distribute with per-destination
 * receipts and partial-failure recovery. External effects NONE.
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ArticleStatus,
  DestinationAttemptStatus,
  DistributionRunStatus,
  OperatingMode,
  SupportLabel,
  defaultDestinationRegistry,
} from "@worksocial/domain";
import {
  createDemoContentDistributionGrants,
  createFileContentStore,
} from "@worksocial/persistence";
import { createActionGateway } from "@worksocial/action-gateway";
import { createContentService } from "@worksocial/content";

const dirs: string[] = [];
const now = "2026-11-20T16:00:00.000Z";
const labels = new Map([["fixture-fact-hours", SupportLabel.SUPPORTED]]);

afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

describe("contract: M6 canonical publish", () => {
  it("author → claim QA → A25 bind → approve → distribute → partial recover", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-m6-contract-"));
    dirs.push(dir);
    const store = createFileContentStore(dir);
    store.setDestinations(defaultDestinationRegistry());
    const service = createContentService(store, {
      gateway: createActionGateway(),
    });

    const campaign = service.createCampaign({
      title: "M6 contract campaign",
      topic: "rooms",
      audienceNeed: "book",
      practicalValue: "hours",
      intendedAction: "tour",
      sourceFactIds: ["fixture-fact-hours"],
      destinationIds: ["dest-cms", "dest-gbp", "dest-linkedin"],
      nowIso: now,
    });
    const created = service.createArticle({
      campaignId: campaign.campaignId,
      title: "Contract article",
      body: "Verified hours for training rooms.",
      authorId: "author-a13",
      citedFactIds: ["fixture-fact-hours"],
      nowIso: now,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const claim = service.canonicalPublish.recordClaimSourceQa({
      articleId: created.article.articleId,
      claims: [
        {
          claimId: "c1",
          factId: "fixture-fact-hours",
          sourceRef: "src-hours",
          statement: "Verified hours",
        },
      ],
      factLabels: labels,
      nowIso: now,
    });
    expect(claim.ok).toBe(true);

    const bound = service.canonicalPublish.bindIndependentReview({
      articleId: created.article.articleId,
      nowIso: now,
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    expect(bound.binding.reviewerRoleId).toBe("A25");

    const qa = service.recordQaVerdict({
      articleId: created.article.articleId,
      authorId: "author-a13",
      reviewerId: "reviewer-a25",
      approved: true,
      nowIso: now,
    });
    expect(qa.ok).toBe(true);

    const approved = service.approveArticle({
      articleId: created.article.articleId,
      factLabels: labels,
      nowIso: now,
    });
    expect(approved.ok).toBe(true);
    expect(approved.article?.status).toBe(ArticleStatus.APPROVED);

    const mapping = service.seedAndProveContentMapping(now);
    const grants = createDemoContentDistributionGrants(now, {
      assetId: approved.article!.articleId,
      contentRevision: approved.article!.contentDigest,
    });
    const authority = {
      outboundStopped: false,
      operatingMode: OperatingMode.OPERATE,
      policies: [
        grants.policy,
        grants.gbpPolicy,
        grants.linkedinPolicy,
        grants.facebookPolicy,
      ],
      grants: [
        grants.grant,
        grants.gbpGrant,
        grants.linkedinGrant,
        grants.facebookGrant,
      ],
      actorRole: "administrator",
    };

    const partial = await service.canonicalPublish.runCanonicalDistribution({
      articleId: approved.article!.articleId,
      authority,
      productionMapping: mapping.mapping,
      factLabels: labels,
      forceGbpFailure: true,
      nowIso: now,
    });
    expect(partial.run.status).toBe(DistributionRunStatus.PARTIAL);
    const cms = partial.run.attempts.find(
      (a) => (a as { destinationId: string }).destinationId === "dest-cms",
    ) as { status: string };
    expect(cms.status).toBe(DestinationAttemptStatus.VERIFIED);

    const recovered = await service.canonicalPublish.recoverDistribution({
      runId: partial.run.runId,
      authority,
      productionMapping: mapping.mapping,
      factLabels: labels,
      nowIso: now,
    });
    const cmsAfter = recovered.run!.attempts.find(
      (a) => (a as { destinationId: string }).destinationId === "dest-cms",
    ) as { status: string };
    expect(cmsAfter.status).toBe(DestinationAttemptStatus.VERIFIED);
    expect(
      recovered.details.every((d) => !d.includes("re-apply dest-cms")),
    ).toBe(true);
  });

  it("live wiring stays honest NOT_WIRED", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-m6-wire-"));
    dirs.push(dir);
    const service = createContentService(createFileContentStore(dir));
    const status = service.status();
    expect(status.liveCmsPublishWiring).toBe("NOT_WIRED");
    expect(status.liveGbpWiring).toBe("NOT_WIRED");
    expect(status.liveSocialWiring).toBe("NOT_WIRED");
    expect(status.m6Note).toContain("NOT_WIRED");
  });
});
