import { describe, expect, it } from "vitest";
import { SupportLabel } from "./knowledge.js";
import { OutcomeEvidenceSource } from "./production-mapping.js";
import {
  AdapterLiveStatus,
  ArticleStatus,
  ContentFormat,
  ContentReleaseDecision,
  DestinationKind,
  PublicationOutcome,
  VariantStatus,
  applyCanonicalReleaseVerification,
  applyVariantReleaseVerification,
  createCanonicalArticle,
  createContentBrief,
  createContentCampaign,
  createDestinationVariant,
  defaultDestinationRegistry,
  digestArticleContent,
  emptyContentState,
  createArticleQaVerdict,
  evaluateArticleApprovalGate,
  evaluateArticleGate,
  evaluateContentReadBack,
  evaluateVariantReleaseGate,
} from "./content.js";

const now = "2026-11-19T18:00:00.000Z";
const labels = new Map([
  ["fixture-fact-hours", SupportLabel.SUPPORTED],
  ["fixture-fact-hypothesis", SupportLabel.HYPOTHESIS],
]);

describe("content domain — article gate", () => {
  it("rejects HYPOTHESIS citations as published truth", () => {
    const article = createCanonicalArticle({
      articleId: "art-1",
      campaignId: "camp-1",
      authorId: "author-test",
      title: "Training rooms",
      body: "Plan your next training day.",
      citedFactIds: ["fixture-fact-hypothesis"],
      fixtureOnly: true,
      createdAtIso: now,
    });
    const gate = evaluateArticleGate({ article, factLabels: labels });
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe("ARTICLE_GATE_FAILED");
  });

  it("passes when citations are SUPPORTED", () => {
    const article = createCanonicalArticle({
      articleId: "art-2",
      campaignId: "camp-1",
      authorId: "author-test",
      title: "Training rooms",
      body: "Plan your next training day with verified capacity.",
      citedFactIds: ["fixture-fact-hours"],
      hypothesisFactIds: ["fixture-fact-hypothesis"],
      fixtureOnly: true,
      createdAtIso: now,
    });
    const gate = evaluateArticleGate({ article, factLabels: labels });
    expect(gate.allowed).toBe(true);
  });

  it("invalidates creatable status when client asks for verified", () => {
    const article = createCanonicalArticle({
      articleId: "art-3",
      campaignId: "camp-1",
      authorId: "author-test",
      title: "T",
      body: "B",
      fixtureOnly: true,
      createdAtIso: now,
      status: ArticleStatus.VERIFIED,
    });
    expect(article.status).toBe(ArticleStatus.DRAFT);
  });
});

describe("content domain — destination variants", () => {
  const registry = defaultDestinationRegistry();
  const cms = registry.find((d) => d.destinationId === "dest-cms")!;
  const gbp = registry.find((d) => d.destinationId === "dest-gbp")!;
  const article = createCanonicalArticle({
    articleId: "art-v",
    campaignId: "camp-v",
    authorId: "author-test",
    title: "A better brief for your next training day",
    body: "A".repeat(2000),
    citedFactIds: ["fixture-fact-hours"],
    fixtureOnly: true,
    createdAtIso: now,
  });

  it("rejects full-blog format on GBP", () => {
    const result = createDestinationVariant({
      variantId: "var-1",
      campaignId: "camp-v",
      article,
      destination: gbp,
      format: ContentFormat.FULL_ARTICLE,
      fixtureOnly: true,
      createdAtIso: now,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VARIANT_FORMAT_REJECTED");
  });

  it("truncates short updates to destination maxBodyChars", () => {
    const result = createDestinationVariant({
      variantId: "var-2",
      campaignId: "camp-v",
      article,
      destination: gbp,
      format: ContentFormat.SHORT_UPDATE,
      fixtureOnly: true,
      createdAtIso: now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.variant.body.length).toBeLessThanOrEqual(1500);
      expect(result.variant.kind).toBe(DestinationKind.GBP);
    }
  });

  it("allows full article on CMS", () => {
    const result = createDestinationVariant({
      variantId: "var-3",
      campaignId: "camp-v",
      article,
      destination: cms,
      format: ContentFormat.FULL_ARTICLE,
      fixtureOnly: true,
      createdAtIso: now,
    });
    expect(result.ok).toBe(true);
  });
});

describe("content domain — canonical-first distribution", () => {
  const registry = defaultDestinationRegistry();
  const gbp = registry.find((d) => d.destinationId === "dest-gbp")!;

  it("blocks dependent destinations until canonical URL is verified", () => {
    const article = createCanonicalArticle({
      articleId: "art-dep",
      campaignId: "camp-dep",
      authorId: "author-test",
      title: "Title",
      body: "Body with supported facts.",
      citedFactIds: ["fixture-fact-hours"],
      fixtureOnly: true,
      createdAtIso: now,
      status: ArticleStatus.APPROVED,
    });
    const created = createDestinationVariant({
      variantId: "var-dep",
      campaignId: "camp-dep",
      article,
      destination: gbp,
      format: ContentFormat.SHORT_UPDATE,
      fixtureOnly: true,
      createdAtIso: now,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const gate = evaluateVariantReleaseGate({
      variant: { ...created.variant, status: VariantStatus.READY },
      article,
      destination: gbp,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reasons.some((r) => /canonical URL/i.test(r))).toBe(true);
  });

  it("allows GBP after verified canonical URL", () => {
    const article = {
      ...createCanonicalArticle({
        articleId: "art-ok",
        campaignId: "camp-ok",
        authorId: "author-test",
        title: "Title",
        body: "Body",
        citedFactIds: ["fixture-fact-hours"],
        fixtureOnly: true,
        createdAtIso: now,
      }),
      verifiedCanonicalUrl: "https://fixture.worksocial.local/articles/art-ok",
      status: ArticleStatus.VERIFIED,
    };
    const created = createDestinationVariant({
      variantId: "var-ok",
      campaignId: "camp-ok",
      article,
      destination: gbp,
      format: ContentFormat.SHORT_UPDATE,
      fixtureOnly: true,
      createdAtIso: now,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const gate = evaluateVariantReleaseGate({
      variant: { ...created.variant, status: VariantStatus.READY },
      article,
      destination: gbp,
    });
    expect(gate.allowed).toBe(true);
  });

  it("invalidates variant when article digest changes", () => {
    const article = {
      ...createCanonicalArticle({
        articleId: "art-chg",
        campaignId: "camp-chg",
        authorId: "author-test",
        title: "Title",
        body: "Body",
        fixtureOnly: true,
        createdAtIso: now,
      }),
      verifiedCanonicalUrl: "https://fixture.worksocial.local/articles/art-chg",
    };
    const created = createDestinationVariant({
      variantId: "var-chg",
      campaignId: "camp-chg",
      article,
      destination: gbp,
      format: ContentFormat.SHORT_UPDATE,
      fixtureOnly: true,
      createdAtIso: now,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const edited = {
      ...article,
      body: "Edited body",
      contentDigest: digestArticleContent("Title", "Edited body"),
    };
    const gate = evaluateVariantReleaseGate({
      variant: { ...created.variant, status: VariantStatus.READY },
      article: edited,
      destination: gbp,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reasons.some((r) => /invalidated/i.test(r))).toBe(true);
  });

  it("honestly reports NOT_WIRED when preferLive is set", () => {
    const article = {
      ...createCanonicalArticle({
        articleId: "art-live",
        campaignId: "camp-live",
        authorId: "author-test",
        title: "Title",
        body: "Body",
        fixtureOnly: true,
        createdAtIso: now,
      }),
      verifiedCanonicalUrl: "https://fixture.worksocial.local/articles/art-live",
    };
    const created = createDestinationVariant({
      variantId: "var-live",
      campaignId: "camp-live",
      article,
      destination: gbp,
      format: ContentFormat.SHORT_UPDATE,
      fixtureOnly: true,
      createdAtIso: now,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const gate = evaluateVariantReleaseGate({
      variant: { ...created.variant, status: VariantStatus.READY },
      article,
      destination: gbp,
      preferLive: true,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reasons.some((r) => /NOT_WIRED/.test(r))).toBe(true);
  });
});

describe("content domain — receipts and learning", () => {
  it("records PUBLISHED_VERIFIED receipt and SUCCESS learning outcome", () => {
    const campaign = createContentCampaign({
      campaignId: "camp-r",
      title: "Campaign",
      topic: "training",
      brief: createContentBrief({
        briefId: "brief-r",
        audienceNeed: "training rooms",
        practicalValue: "useful planning",
        intendedAction: "inquire",
        createdAtIso: now,
      }),
      fixtureOnly: true,
      createdAtIso: now,
    });
    const article = createCanonicalArticle({
      articleId: "art-r",
      campaignId: campaign.campaignId,
      authorId: "author-test",
      title: "Title",
      body: "Body",
      citedFactIds: ["fixture-fact-hours"],
      fixtureOnly: true,
      createdAtIso: now,
      status: ArticleStatus.RELEASED_PENDING,
    });
    let state = emptyContentState(now);
    state = {
      ...state,
      destinations: defaultDestinationRegistry(),
      campaigns: [campaign],
      articles: [article],
    };
    const applied = applyCanonicalReleaseVerification(state, {
      articleId: article.articleId,
      decision: ContentReleaseDecision.SUCCESS,
      source: OutcomeEvidenceSource.FIXTURE,
      fixtureOnly: true,
      summary: "Fixture CMS verified",
      outcomeId: "out-1",
      operationId: "op-1",
      writePathId: "wp-content-cms",
      nowIso: now,
    });
    expect(applied.article?.status).toBe(ArticleStatus.VERIFIED);
    expect(applied.article?.verifiedCanonicalUrl).toBeTruthy();
    expect(applied.receipt?.outcome).toBe(PublicationOutcome.PUBLISHED_VERIFIED);
    expect(applied.outcome?.label).toBe("SUCCESS");
    expect(applied.outcome?.fixtureOnly).toBe(true);
  });

  it("read-back mismatch fails verification", () => {
    const result = evaluateContentReadBack({
      expected: { title: "A", body: "B" },
      observed: { title: "A", body: "wrong" },
    });
    expect(result.matched).toBe(false);
  });

  it("variant verification emits destination receipt", () => {
    const article = {
      ...createCanonicalArticle({
        articleId: "art-vr",
        campaignId: "camp-vr",
        authorId: "author-test",
        title: "Title",
        body: "Body",
        fixtureOnly: true,
        createdAtIso: now,
      }),
      verifiedCanonicalUrl: "https://fixture.worksocial.local/articles/art-vr",
      status: ArticleStatus.VERIFIED,
    };
    const gbp = defaultDestinationRegistry().find(
      (d) => d.destinationId === "dest-gbp",
    )!;
    const created = createDestinationVariant({
      variantId: "var-vr",
      campaignId: "camp-vr",
      article,
      destination: gbp,
      format: ContentFormat.SHORT_UPDATE,
      fixtureOnly: true,
      createdAtIso: now,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    let state = emptyContentState(now);
    state = {
      ...state,
      destinations: defaultDestinationRegistry(),
      articles: [article],
      variants: [
        { ...created.variant, status: VariantStatus.RELEASED_PENDING },
      ],
    };
    const applied = applyVariantReleaseVerification(state, {
      variantId: "var-vr",
      decision: ContentReleaseDecision.SUCCESS,
      source: OutcomeEvidenceSource.FIXTURE,
      fixtureOnly: true,
      summary: "Fixture GBP verified",
      outcomeId: "out-v1",
      operationId: "op-v1",
      writePathId: "wp-content-gbp",
      nowIso: now,
    });
    expect(applied.variant?.status).toBe(VariantStatus.VERIFIED);
    expect(applied.receipt?.kind).toBe(DestinationKind.GBP);
    expect(applied.receipt?.liveWiring).toBe(AdapterLiveStatus.NOT_WIRED);
  });
});

describe("content domain — independent QA + CMS path", () => {
  it("forbids self-review QA verdicts", () => {
    const created = createArticleQaVerdict({
      verdictId: "qa-1",
      articleId: "art-qa",
      authorId: "same",
      reviewerId: "same",
      approved: true,
      contentDigest: "dig",
      summary: "nope",
      decidedAtIso: now,
    });
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.code).toBe("QA_SELF_REVIEW_FORBIDDEN");
  });

  it("requires matching independent QA before approval", () => {
    const article = createCanonicalArticle({
      articleId: "art-qa-2",
      campaignId: "camp-qa",
      authorId: "author-test",
      title: "Title",
      body: "Body",
      citedFactIds: ["fixture-fact-hours"],
      fixtureOnly: true,
      createdAtIso: now,
    });
    const missing = evaluateArticleApprovalGate({
      article,
      factLabels: labels,
      qaVerdict: null,
    });
    expect(missing.allowed).toBe(false);
    expect(missing.code).toBe("INDEPENDENT_QA_REQUIRED");

    const qa = createArticleQaVerdict({
      verdictId: "qa-2",
      articleId: article.articleId,
      authorId: article.authorId,
      reviewerId: "reviewer",
      approved: true,
      contentDigest: article.contentDigest,
      summary: "ok",
      decidedAtIso: now,
    });
    expect(qa.ok).toBe(true);
    if (!qa.ok) return;
    const ok = evaluateArticleApprovalGate({
      article,
      factLabels: labels,
      qaVerdict: qa.verdict,
    });
    expect(ok.allowed).toBe(true);
  });

  it("rejects CMS variants on the destination release path", () => {
    const cms = defaultDestinationRegistry().find(
      (d) => d.destinationId === "dest-cms",
    )!;
    const article = {
      ...createCanonicalArticle({
        articleId: "art-cms",
        campaignId: "camp-cms",
        authorId: "author-test",
        title: "Title",
        body: "Body",
        fixtureOnly: true,
        createdAtIso: now,
      }),
      status: ArticleStatus.APPROVED,
      verifiedCanonicalUrl: "https://fixture.example/art-cms",
    };
    const created = createDestinationVariant({
      variantId: "var-cms",
      campaignId: "camp-cms",
      article,
      destination: cms,
      format: ContentFormat.FULL_ARTICLE,
      fixtureOnly: true,
      createdAtIso: now,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const gate = evaluateVariantReleaseGate({
      variant: { ...created.variant, status: VariantStatus.READY },
      article,
      destination: cms,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reasons.some((r) => /canonical article release path/i.test(r))).toBe(
      true,
    );
  });
});
