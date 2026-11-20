/**
 * M6 / NEXT-17 service tests — authoring, claim QA, distribute, partial recovery.
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ArticleStatus,
  DistributionRunStatus,
  DestinationAttemptStatus,
  OperatingMode,
  SupportLabel,
} from "@worksocial/domain";
import {
  createDemoContentDistributionGrants,
  createDurableExecutionService,
  createFileContentStore,
  createMemoryDurableStores,
} from "@worksocial/persistence";
import { createActionGateway } from "@worksocial/action-gateway";
import { createContentService } from "./service.js";
import { defaultDestinationRegistry } from "@worksocial/domain";

const dirs: string[] = [];
const now = "2026-11-20T15:00:00.000Z";
const labels = new Map([
  ["fixture-fact-hours", SupportLabel.SUPPORTED],
  ["fixture-fact-hypothesis", SupportLabel.HYPOTHESIS],
]);

afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

function makeService() {
  const dir = mkdtempSync(join(tmpdir(), "ws-m6-"));
  dirs.push(dir);
  const store = createFileContentStore(dir);
  store.setDestinations(defaultDestinationRegistry());
  const gateway = createActionGateway();
  const durable = createDurableExecutionService(createMemoryDurableStores());
  const service = createContentService(store, { gateway, durable });
  return { service, store, gateway, durable };
}

function demoAuthority(nowIso: string, assetId: string, digest: string) {
  const grants = createDemoContentDistributionGrants(nowIso, {
    assetId,
    contentRevision: digest,
  });
  return {
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
  };
}

describe("M6 canonical publish ops", () => {
  it("creates and edits a versioned draft; digest change invalidates binding", () => {
    const { service } = makeService();
    const campaign = service.createCampaign({
      title: "Guide",
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
      title: "Book a room",
      body: "Verified hours.",
      authorId: "author-a13",
      citedFactIds: ["fixture-fact-hours"],
      nowIso: now,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const qa = service.canonicalPublish.recordClaimSourceQa({
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
    expect(qa.ok).toBe(true);

    const bound = service.canonicalPublish.bindIndependentReview({
      articleId: created.article.articleId,
      nowIso: now,
    });
    expect(bound.ok).toBe(true);

    // Cited-fact-only edits must invalidate even when body digest is stable.
    const factEdit = service.canonicalPublish.editArticle({
      articleId: created.article.articleId,
      citedFactIds: ["fixture-fact-hours", "fixture-fact-hypothesis"],
      nowIso: now,
    });
    expect(factEdit.ok).toBe(true);
    if (!factEdit.ok) return;
    expect(factEdit.evidenceChanged).toBe(true);
    expect(factEdit.digestChanged).toBe(false);
    expect(factEdit.article.version).toBe(2);
    expect(
      service.canonicalPublish
        .listReviewBindings()
        .filter((b) => b.status === "bound"),
    ).toHaveLength(0);

    const edited = service.canonicalPublish.editArticle({
      articleId: factEdit.article.articleId,
      body: "Verified hours and capacity.",
      nowIso: now,
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.digestChanged).toBe(true);
    expect(edited.article.version).toBe(3);
    expect(edited.article.status).toBe(ArticleStatus.DRAFT);

    const bindings = service.canonicalPublish.listReviewBindings();
    expect(bindings.some((b) => b.status === "invalidated")).toBe(true);
  });

  it("blocks distribute without A25 binding for current revision", async () => {
    const { service } = makeService();
    service.seedFixtures(now);
    const mapping = service.seedAndProveContentMapping(now);
    const article = service.listArticles()[0]!;
    service.canonicalPublish.recordClaimSourceQa({
      articleId: article.articleId,
      claims: [
        {
          claimId: "c-hours",
          factId: "fixture-fact-hours",
          sourceRef: "src-hours",
          statement: "Open with verified hours",
        },
      ],
      factLabels: labels,
      nowIso: now,
    });
    service.recordQaVerdict({
      articleId: article.articleId,
      authorId: article.authorId,
      reviewerId: "reviewer-a25",
      approved: true,
      nowIso: now,
    });
    const approved = service.approveArticle({
      articleId: article.articleId,
      factLabels: labels,
      nowIso: now,
    });
    expect(approved.ok).toBe(true);
    const authority = demoAuthority(
      now,
      approved.article!.articleId,
      approved.article!.contentDigest,
    );
    const blocked = await service.canonicalPublish.runCanonicalDistribution({
      articleId: approved.article!.articleId,
      authority: { ...authority, actorRole: "administrator" },
      productionMapping: mapping.mapping,
      factLabels: labels,
      nowIso: now,
    });
    expect(
      blocked.details.some((d) => d.includes("A25 review binding required")),
    ).toBe(true);
    expect(blocked.run.attempts).toHaveLength(0);
  });

  it("distributes CMS+GBP+LinkedIn with durable verify; partial GBP failure recovers without re-applying CMS", async () => {
    const { service } = makeService();
    service.seedFixtures(now);
    const mapping = service.seedAndProveContentMapping(now);
    const article = service
      .listArticles()
      .find((a) => a.status === ArticleStatus.READY_FOR_REVIEW || a.status === ArticleStatus.DRAFT)
      ?? service.listArticles()[0]!;

    // Ensure claim QA + binding + independent QA + approve for golden article.
    const claim = service.canonicalPublish.recordClaimSourceQa({
      articleId: article.articleId,
      claims: [
        {
          claimId: "c-hours",
          factId: "fixture-fact-hours",
          sourceRef: "src-hours",
          statement: "Open with verified hours",
        },
      ],
      factLabels: labels,
      nowIso: now,
    });
    expect(claim.ok).toBe(true);

    service.canonicalPublish.bindIndependentReview({
      articleId: article.articleId,
      nowIso: now,
    });

    const qa = service.recordQaVerdict({
      articleId: article.articleId,
      authorId: article.authorId,
      reviewerId: "reviewer-a25",
      approved: true,
      nowIso: now,
    });
    expect(qa.ok).toBe(true);

    const approved = service.approveArticle({
      articleId: article.articleId,
      factLabels: labels,
      nowIso: now,
    });
    expect(approved.ok).toBe(true);
    expect(approved.article?.status).toBe(ArticleStatus.APPROVED);

    const authority = demoAuthority(
      now,
      approved.article!.articleId,
      approved.article!.contentDigest,
    );

    const failed = await service.canonicalPublish.runCanonicalDistribution({
      articleId: approved.article!.articleId,
      authority: { ...authority, actorRole: "administrator" },
      productionMapping: mapping.mapping,
      factLabels: labels,
      forceGbpFailure: true,
      nowIso: now,
    });
    expect(failed.run.status).toBe(DistributionRunStatus.PARTIAL);
    expect(
      service.readState().campaigns.find(
        (c) => c.campaignId === approved.article!.campaignId,
      )?.status,
    ).toBe("blocked");
    expect(service.readState().receipts.length).toBeGreaterThan(0);
    const cmsAttempt = failed.run.attempts.find(
      (a) => (a as { destinationId?: string }).destinationId === "dest-cms",
    ) as { status?: string } | undefined;
    expect(cmsAttempt?.status).toBe(DestinationAttemptStatus.VERIFIED);
    const gbpAttempt = failed.run.attempts.find(
      (a) => (a as { destinationId?: string }).destinationId === "dest-gbp",
    ) as { status?: string } | undefined;
    expect(gbpAttempt?.status).toBe(DestinationAttemptStatus.FAILED);

    const recovered = await service.canonicalPublish.recoverDistribution({
      runId: failed.run.runId,
      authority: { ...authority, actorRole: "administrator" },
      productionMapping: mapping.mapping,
      factLabels: labels,
      nowIso: now,
    });
    expect(recovered.run).not.toBeNull();
    const cmsAfter = recovered.run!.attempts.find(
      (a) => (a as { destinationId?: string }).destinationId === "dest-cms",
    ) as { status?: string } | undefined;
    expect(cmsAfter?.status).toBe(DestinationAttemptStatus.VERIFIED);
    expect(recovered.details.some((d) => d.includes("verified") || d.includes("Recover"))).toBe(
      true,
    );
  });

  it("refuses duplicate distribute when run already COMPLETE for business key", async () => {
    const { service } = makeService();
    service.seedFixtures(now);
    const mapping = service.seedAndProveContentMapping(now);
    const article = service.listArticles()[0]!;

    service.canonicalPublish.recordClaimSourceQa({
      articleId: article.articleId,
      claims: [
        {
          claimId: "c-hours",
          factId: "fixture-fact-hours",
          sourceRef: "src-hours",
          statement: "Open with verified hours",
        },
      ],
      factLabels: labels,
      nowIso: now,
    });
    service.canonicalPublish.bindIndependentReview({
      articleId: article.articleId,
      nowIso: now,
    });
    service.recordQaVerdict({
      articleId: article.articleId,
      authorId: article.authorId,
      reviewerId: "reviewer-a25",
      approved: true,
      nowIso: now,
    });
    const approved = service.approveArticle({
      articleId: article.articleId,
      factLabels: labels,
      nowIso: now,
    });
    expect(approved.ok).toBe(true);
    const authority = demoAuthority(
      now,
      approved.article!.articleId,
      approved.article!.contentDigest,
    );

    const first = await service.canonicalPublish.runCanonicalDistribution({
      articleId: approved.article!.articleId,
      authority: { ...authority, actorRole: "administrator" },
      productionMapping: mapping.mapping,
      factLabels: labels,
      nowIso: now,
    });
    expect(first.run.status).toBe(DistributionRunStatus.COMPLETE);

    const second = await service.canonicalPublish.runCanonicalDistribution({
      articleId: approved.article!.articleId,
      authority: { ...authority, actorRole: "administrator" },
      productionMapping: mapping.mapping,
      factLabels: labels,
      nowIso: now,
    });
    expect(second.details.some((d) => d.includes("refusing duplicate"))).toBe(
      true,
    );
    expect(second.run.runId).toBe(first.run.runId);
  });
});
