/**
 * Unit tests for R1-08 content service — fixture distribution path.
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ArticleStatus,
  CampaignStatus,
  ContentFormat,
  OperatingMode,
  PublicationOutcome,
  SupportLabel,
  VariantStatus,
} from "@worksocial/domain";
import {
  createDemoContentDistributionGrants,
  createFileContentStore,
} from "@worksocial/persistence";
import { createActionGateway } from "@worksocial/action-gateway";
import {
  CONTENT_PILOT_ARTICLE_ID,
  createContentService,
  liveGbpPublishStub,
  liveCmsPublishStub,
} from "./index.js";
import { goldenArticleContentDigest } from "./fixtures.js";

const dirs: string[] = [];
const now = "2026-11-19T19:00:00.000Z";
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
  const dir = mkdtempSync(join(tmpdir(), "ws-content-svc-"));
  dirs.push(dir);
  const store = createFileContentStore(dir);
  const gateway = createActionGateway();
  const service = createContentService(store, { gateway });
  return { service, store, gateway };
}

function demoAuthority(nowIso: string) {
  const grants = createDemoContentDistributionGrants(nowIso, {
    assetId: CONTENT_PILOT_ARTICLE_ID,
    contentRevision: goldenArticleContentDigest(),
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

describe("content service", () => {
  it("seeds fixtures and reports honest NOT_WIRED wiring", () => {
    const { service } = makeService();
    const seed = service.seedFixtures(now);
    expect(seed.campaigns.length).toBeGreaterThan(0);
    expect(seed.articles.some((a) => a.articleId === CONTENT_PILOT_ARTICLE_ID)).toBe(
      true,
    );
    expect(seed.variants.length).toBeGreaterThan(0);
    expect(seed.qaVerdicts.length).toBeGreaterThan(0);
    const status = service.status();
    expect(status.liveCmsPublishWiring).toBe("NOT_WIRED");
    expect(status.liveGbpWiring).toBe("NOT_WIRED");
    expect(status.liveSocialWiring).toBe("NOT_WIRED");
  });

  it("live adapter stubs return NOT_WIRED", () => {
    expect(liveCmsPublishStub().wiring).toBe("NOT_WIRED");
    expect(liveGbpPublishStub().code).toBe("NOT_WIRED");
  });

  it("requires independent QA before approval", () => {
    const { service, store } = makeService();
    service.seedFixtures(now);
    // Clear seeded QA so approval must fail without a verdict.
    store.write({
      ...store.read(),
      qaVerdicts: [],
      updatedAtIso: now,
    });
    const blocked = service.approveArticle({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      factLabels: labels,
      nowIso: now,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.reasons.some((r) => /Independent QA/i.test(r))).toBe(true);

    const recorded = service.recordQaVerdict({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      authorId: "author-a13",
      reviewerId: "reviewer-fixture",
      approved: true,
      nowIso: now,
    });
    expect(recorded.ok).toBe(true);

    const approved = service.approveArticle({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      factLabels: labels,
      nowIso: now,
    });
    expect(approved.ok).toBe(true);
    expect(approved.article?.status).toBe(ArticleStatus.APPROVED);
  });

  it("approves article with SUPPORTED facts then releases via gateway", () => {
    const { service, gateway } = makeService();
    service.seedFixtures(now);
    const approved = service.approveArticle({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      factLabels: labels,
      nowIso: now,
    });
    expect(approved.ok).toBe(true);
    expect(approved.article?.status).toBe(ArticleStatus.APPROVED);

    const { mapping } = service.seedAndProveContentMapping(now);
    const authority = demoAuthority(now);

    const released = service.releaseCanonical({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      authority,
      productionMapping: mapping,
      factLabels: labels,
      nowIso: now,
    });
    expect(released.gatewayDecision?.allowed).toBe(true);
    expect(released.article?.status).toBe(ArticleStatus.RELEASED_PENDING);
    expect(released.receipt?.outcome).toBe(PublicationOutcome.ACCEPTED_PENDING);
    expect(released.acceptanceEqualsVerified).toBe(false);
    expect(released.liveCmsPublishWiring).toBe("NOT_WIRED");

    const verified = service.verifyCanonicalRelease({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      observedFields: {
        title: released.article!.title,
        body: released.article!.body,
        contentDigest: released.article!.contentDigest,
      },
      nowIso: now,
    });
    expect(verified.article?.status).toBe(ArticleStatus.VERIFIED);
    expect(verified.article?.verifiedCanonicalUrl).toBeTruthy();
    expect(verified.outcome?.label).toBe("SUCCESS");
    expect(verified.receipt?.outcome).toBe(PublicationOutcome.PUBLISHED_VERIFIED);
    expect(gateway.getDecision(released.article!.gatewayOperationId!)?.outcome).toBe(
      "VERIFIED",
    );
  });

  it("revokes APPROVED when a later QA reject arrives for the same digest", () => {
    const { service } = makeService();
    service.seedFixtures(now);
    const approved = service.approveArticle({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      factLabels: labels,
      nowIso: now,
    });
    expect(approved.ok).toBe(true);

    const rejected = service.recordQaVerdict({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      authorId: "author-a13",
      reviewerId: "reviewer-late",
      approved: false,
      summary: "Sources incomplete",
      nowIso: now,
    });
    expect(rejected.ok).toBe(true);
    const article = service
      .listArticles()
      .find((a) => a.articleId === CONTENT_PILOT_ARTICLE_ID);
    expect(article?.status).toBe(ArticleStatus.READY_FOR_REVIEW);

    const { mapping } = service.seedAndProveContentMapping(now);
    const blocked = service.releaseCanonical({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      authority: demoAuthority(now),
      productionMapping: mapping,
      factLabels: labels,
      nowIso: now,
    });
    expect(blocked.gatewayDecision).toBeNull();
    expect(blocked.article?.status).toBe(ArticleStatus.READY_FOR_REVIEW);
  });

  it("keeps APPROVED on gateway denial and settles FAILED on bad read-back", () => {
    const { service, gateway } = makeService();
    service.seedFixtures(now);
    service.approveArticle({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      factLabels: labels,
      nowIso: now,
    });
    const { mapping } = service.seedAndProveContentMapping(now);
    const authority = {
      ...demoAuthority(now),
      outboundStopped: true,
    };

    const denied = service.releaseCanonical({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      authority,
      productionMapping: mapping,
      factLabels: labels,
      nowIso: now,
    });
    expect(denied.gatewayDecision?.allowed).toBe(false);
    expect(denied.article?.status).toBe(ArticleStatus.APPROVED);
    expect(denied.receipt?.outcome).toBe(PublicationOutcome.FAILED);

    const okAuthority = demoAuthority(now);
    const released = service.releaseCanonical({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      authority: okAuthority,
      productionMapping: mapping,
      factLabels: labels,
      nowIso: now,
    });
    expect(released.article?.status).toBe(ArticleStatus.RELEASED_PENDING);

    const failed = service.verifyCanonicalRelease({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      observedFields: { title: "wrong", body: "wrong" },
      forceFailure: true,
      nowIso: now,
    });
    expect(failed.article?.status).toBe(ArticleStatus.FAILED);
    expect(
      gateway.getDecision(released.article!.gatewayOperationId!)?.outcome,
    ).toBe("FAILED");
  });

  it("rehydrates gateway decisions after restart for verify", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-content-rehydrate-"));
    dirs.push(dir);
    const store = createFileContentStore(dir);
    const gateway1 = createActionGateway();
    const service1 = createContentService(store, { gateway: gateway1 });
    service1.seedFixtures(now);
    service1.approveArticle({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      factLabels: labels,
      nowIso: now,
    });
    const { mapping } = service1.seedAndProveContentMapping(now);
    const released = service1.releaseCanonical({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      authority: demoAuthority(now),
      productionMapping: mapping,
      factLabels: labels,
      nowIso: now,
    });
    expect(released.article?.status).toBe(ArticleStatus.RELEASED_PENDING);
    const opId = released.article!.gatewayOperationId!;

    // New gateway = process restart (in-memory decisions gone).
    const gateway2 = createActionGateway();
    const service2 = createContentService(store, { gateway: gateway2 });
    expect(gateway2.getDecision(opId)).toBeUndefined();

    const verified = service2.verifyCanonicalRelease({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      observedFields: {
        title: released.article!.title,
        body: released.article!.body,
        contentDigest: released.article!.contentDigest,
      },
      nowIso: now,
    });
    expect(verified.article?.status).toBe(ArticleStatus.VERIFIED);
    expect(gateway2.getDecision(opId)?.outcome).toBe("VERIFIED");
  });

  it("blocks GBP variant until canonical URL is verified", () => {
    const { service } = makeService();
    service.seedFixtures(now);
    service.approveArticle({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      factLabels: labels,
      nowIso: now,
    });
    const { mapping } = service.seedAndProveContentMapping(now);
    const authority = demoAuthority(now);

    const blocked = service.releaseVariant({
      variantId: "golden-var-gbp",
      authority,
      productionMapping: mapping,
      nowIso: now,
    });
    expect(blocked.gatewayDecision).toBeNull();
    expect(blocked.receipt?.outcome).toBe(PublicationOutcome.FAILED);
    expect(blocked.details.some((d) => /canonical URL/i.test(d))).toBe(true);
  });

  it("rejects CMS destination variants and releases GBP/Facebook after canonical verify", () => {
    const { service } = makeService();
    service.seedFixtures(now);
    service.approveArticle({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      factLabels: labels,
      nowIso: now,
    });
    const { mapping } = service.seedAndProveContentMapping(now);
    const authority = demoAuthority(now);

    service.releaseCanonical({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      authority,
      productionMapping: mapping,
      factLabels: labels,
      nowIso: now,
    });
    const article = service
      .listArticles()
      .find((a) => a.articleId === CONTENT_PILOT_ARTICLE_ID)!;
    service.verifyCanonicalRelease({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      observedFields: {
        title: article.title,
        body: article.body,
        contentDigest: article.contentDigest,
      },
      nowIso: now,
    });

    const cmsPrepared = service.prepareVariant({
      variantId: "test-var-cms",
      campaignId: article.campaignId,
      articleId: article.articleId,
      destinationId: "dest-cms",
      format: ContentFormat.FULL_ARTICLE,
      nowIso: now,
    });
    expect(cmsPrepared.ok).toBe(true);
    const cmsBlocked = service.releaseVariant({
      variantId: "test-var-cms",
      authority,
      productionMapping: mapping,
      nowIso: now,
    });
    expect(cmsBlocked.gatewayDecision).toBeNull();
    expect(
      cmsBlocked.details.some((d) => /canonical article release path/i.test(d)),
    ).toBe(true);

    const gbp = service.releaseVariant({
      variantId: "golden-var-gbp",
      authority,
      productionMapping: mapping,
      nowIso: now,
    });
    expect(gbp.gatewayDecision?.allowed).toBe(true);
    expect(gbp.variant?.status).toBe(VariantStatus.RELEASED_PENDING);

    const gbpVerified = service.verifyVariantRelease({
      variantId: "golden-var-gbp",
      observedFields: {
        title: gbp.variant!.title,
        body: gbp.variant!.body,
      },
      nowIso: now,
    });
    expect(gbpVerified.variant?.status).toBe(VariantStatus.VERIFIED);
    expect(gbpVerified.outcome?.label).toBe("SUCCESS");

    const facebook = service.releaseVariant({
      variantId: "golden-var-facebook",
      authority,
      productionMapping: mapping,
      nowIso: now,
    });
    expect(facebook.gatewayDecision?.allowed).toBe(true);
    expect(facebook.variant?.status).toBe(VariantStatus.RELEASED_PENDING);

    const live = service.releaseVariant({
      variantId: "golden-var-linkedin",
      authority,
      productionMapping: mapping,
      preferLive: true,
      nowIso: now,
    });
    expect(live.liveWiring).toBe("NOT_WIRED");
    expect(live.receipt?.outcome).toBe(PublicationOutcome.UNSUPPORTED_ACTION);
    expect(live.details.some((d) => /NOT_WIRED/.test(d))).toBe(true);
  });

  it("preserves progressed campaigns on reseed", () => {
    const { service, store } = makeService();
    service.seedFixtures(now);
    const campaign = store.read().campaigns[0]!;
    store.upsertCampaign({
      ...campaign,
      status: CampaignStatus.DISTRIBUTING,
      updatedAtIso: now,
    });
    const seed = service.seedFixtures(now);
    expect(seed.skippedProgressedCampaignIds).toContain(campaign.campaignId);
    expect(store.read().campaigns.find((c) => c.campaignId === campaign.campaignId)?.status).toBe(
      CampaignStatus.DISTRIBUTING,
    );
  });
});
