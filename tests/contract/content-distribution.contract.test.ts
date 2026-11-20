/**
 * Contract: R1-08 content and distribution — article gates reject HYPOTHESIS
 * as truth; destination format contracts; canonical-first order; gateway
 * release with per-destination receipts; acceptance ≠ verified; live adapters
 * honestly NOT_WIRED.
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ArticleStatus,
  ContentFormat,
  OperatingMode,
  PublicationOutcome,
  SupportLabel,
  VariantStatus,
  createCanonicalArticle,
  createDestinationVariant,
  defaultDestinationRegistry,
  evaluateArticleGate,
  evaluateVariantReleaseGate,
} from "@worksocial/domain";
import {
  createDemoContentDistributionGrants,
  createFileContentStore,
} from "@worksocial/persistence";
import { createActionGateway } from "@worksocial/action-gateway";
import {
  CONTENT_PILOT_ARTICLE_ID,
  createContentService,
  goldenArticleContentDigest,
  liveGbpPublishStub,
  liveSocialPublishStub,
} from "@worksocial/content";

const dirs: string[] = [];
const now = "2026-11-19T20:00:00.000Z";
const labels = new Map([
  ["fixture-fact-hours", SupportLabel.SUPPORTED],
  ["fixture-fact-hypothesis", SupportLabel.HYPOTHESIS],
]);

afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

describe("contract: content article and destination gates", () => {
  it("never treats HYPOTHESIS facts as published truth", () => {
    const article = createCanonicalArticle({
      articleId: "c-art",
      campaignId: "c-camp",
      authorId: "author-test",
      title: "Title",
      body: "Body",
      citedFactIds: ["fixture-fact-hypothesis"],
      fixtureOnly: true,
      createdAtIso: now,
    });
    const gate = evaluateArticleGate({ article, factLabels: labels });
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe("ARTICLE_GATE_FAILED");
  });

  it("rejects full-blog distribution to GBP", () => {
    const gbp = defaultDestinationRegistry().find(
      (d) => d.destinationId === "dest-gbp",
    )!;
    const article = createCanonicalArticle({
      articleId: "c-art-2",
      campaignId: "c-camp",
      authorId: "author-test",
      title: "Title",
      body: "Long body",
      fixtureOnly: true,
      createdAtIso: now,
    });
    const created = createDestinationVariant({
      variantId: "c-var",
      campaignId: "c-camp",
      article,
      destination: gbp,
      format: ContentFormat.FULL_ARTICLE,
      fixtureOnly: true,
      createdAtIso: now,
    });
    expect(created.ok).toBe(false);
  });
});

describe("contract: gateway content distribution", () => {
  it("canonical release is ACCEPTED_PENDING until read-back; GBP waits for URL", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-content-contract-"));
    dirs.push(dir);
    const store = createFileContentStore(dir);
    const gateway = createActionGateway();
    const service = createContentService(store, { gateway });
    service.seedFixtures(now);

    const approved = service.approveArticle({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      factLabels: labels,
      nowIso: now,
    });
    expect(approved.ok).toBe(true);

    const { mapping } = service.seedAndProveContentMapping(now);
    const grants = createDemoContentDistributionGrants(now, {
      assetId: CONTENT_PILOT_ARTICLE_ID,
      contentRevision: goldenArticleContentDigest(),
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
    };

    const blockedGbp = service.releaseVariant({
      variantId: "golden-var-gbp",
      authority,
      productionMapping: mapping,
      nowIso: now,
    });
    expect(blockedGbp.receipt?.outcome).toBe(PublicationOutcome.FAILED);
    expect(blockedGbp.details.some((d) => /canonical URL/i.test(d))).toBe(true);

    const released = service.releaseCanonical({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      authority,
      productionMapping: mapping,
      factLabels: labels,
      nowIso: now,
    });
    expect(released.gatewayDecision?.allowed).toBe(true);
    expect(released.article?.status).toBe(ArticleStatus.RELEASED_PENDING);
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
    expect(verified.outcome?.label).toBe("SUCCESS");
    expect(verified.receipt?.outcome).toBe(PublicationOutcome.PUBLISHED_VERIFIED);

    const gbp = service.releaseVariant({
      variantId: "golden-var-gbp",
      authority,
      productionMapping: mapping,
      nowIso: now,
    });
    expect(gbp.gatewayDecision?.allowed).toBe(true);
    expect(gbp.variant?.status).toBe(VariantStatus.RELEASED_PENDING);

    const gbpOk = service.verifyVariantRelease({
      variantId: "golden-var-gbp",
      observedFields: {
        title: gbp.variant!.title,
        body: gbp.variant!.body,
      },
      nowIso: now,
    });
    expect(gbpOk.variant?.status).toBe(VariantStatus.VERIFIED);
    expect(gbpOk.receipt?.kind).toBe("gbp");

    const live = service.releaseVariant({
      variantId: "golden-var-linkedin",
      authority,
      productionMapping: mapping,
      preferLive: true,
      nowIso: now,
    });
    expect(live.liveWiring).toBe("NOT_WIRED");
    expect(live.receipt?.outcome).toBe(PublicationOutcome.UNSUPPORTED_ACTION);

    expect(liveGbpPublishStub().wiring).toBe("NOT_WIRED");
    expect(liveSocialPublishStub("linkedin").code).toBe("NOT_WIRED");

    const article = verified.article!;
    const dest = defaultDestinationRegistry().find(
      (d) => d.destinationId === "dest-gbp",
    )!;
    const staleGate = evaluateVariantReleaseGate({
      variant: {
        ...gbp.variant!,
        articleContentDigest: "stale",
        status: VariantStatus.READY,
      },
      article,
      destination: dest,
    });
    expect(staleGate.allowed).toBe(false);
  });
});
