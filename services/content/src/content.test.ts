/**
 * Unit tests for R1-08 content service — fixture distribution path.
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ArticleStatus,
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

describe("content service", () => {
  it("seeds fixtures and reports honest NOT_WIRED wiring", () => {
    const { service } = makeService();
    const seed = service.seedFixtures(now);
    expect(seed.campaigns.length).toBeGreaterThan(0);
    expect(seed.articles.some((a) => a.articleId === CONTENT_PILOT_ARTICLE_ID)).toBe(
      true,
    );
    expect(seed.variants.length).toBeGreaterThan(0);
    const status = service.status();
    expect(status.liveCmsPublishWiring).toBe("NOT_WIRED");
    expect(status.liveGbpWiring).toBe("NOT_WIRED");
    expect(status.liveSocialWiring).toBe("NOT_WIRED");
  });

  it("live adapter stubs return NOT_WIRED", () => {
    expect(liveCmsPublishStub().wiring).toBe("NOT_WIRED");
    expect(liveGbpPublishStub().code).toBe("NOT_WIRED");
  });

  it("approves article with SUPPORTED facts then releases via gateway", () => {
    const { service } = makeService();
    service.seedFixtures(now);
    const approved = service.approveArticle({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      factLabels: labels,
      nowIso: now,
    });
    expect(approved.ok).toBe(true);
    expect(approved.article?.status).toBe(ArticleStatus.APPROVED);

    const { mapping } = service.seedAndProveContentMapping(now);
    const { policy, grant, gbpPolicy, gbpGrant, linkedinPolicy, linkedinGrant } =
      createDemoContentDistributionGrants(now);

    const released = service.releaseCanonical({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      authority: {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        policies: [policy, gbpPolicy, linkedinPolicy],
        grants: [grant, gbpGrant, linkedinGrant],
      },
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
    const grants = createDemoContentDistributionGrants(now);

    const blocked = service.releaseVariant({
      variantId: "golden-var-gbp",
      authority: {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        policies: [grants.policy, grants.gbpPolicy, grants.linkedinPolicy],
        grants: [grants.grant, grants.gbpGrant, grants.linkedinGrant],
      },
      productionMapping: mapping,
      nowIso: now,
    });
    expect(blocked.gatewayDecision).toBeNull();
    expect(blocked.receipt?.outcome).toBe(PublicationOutcome.FAILED);
    expect(blocked.details.some((d) => /canonical URL/i.test(d))).toBe(true);
  });

  it("releases GBP/social variants after canonical verify; live path stays NOT_WIRED", () => {
    const { service } = makeService();
    service.seedFixtures(now);
    service.approveArticle({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      factLabels: labels,
      nowIso: now,
    });
    const { mapping } = service.seedAndProveContentMapping(now);
    const grants = createDemoContentDistributionGrants(now);
    const authority = {
      outboundStopped: false,
      operatingMode: OperatingMode.OPERATE,
      policies: [grants.policy, grants.gbpPolicy, grants.linkedinPolicy],
      grants: [grants.grant, grants.gbpGrant, grants.linkedinGrant],
    };

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
});
