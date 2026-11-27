import { describe, expect, it } from "vitest";
import { SupportLabel } from "./knowledge.js";
import {
  DestinationAttemptStatus,
  DistributionRunStatus,
  PARTIAL_CAMPAIGN_DESTINATIONS_RELATED_CASE_IDS,
  bindContentIndependentReview,
  createDistributionRun,
  digestContentEvidencePackage,
  editCanonicalArticle,
  evaluateClaimSourceQa,
  evaluatePartialCampaignDestinationsAttackSuite,
  listRecoverableDestinations,
  stableContentOperationKey,
  upsertDestinationAttempt,
  validateContentReviewAgainstArticle,
} from "./canonical-publish.js";
import {
  ArticleStatus,
  createCanonicalArticle,
} from "./content.js";
import type { EffectProposal } from "./role-runtime.js";

const now = "2026-11-20T14:00:00.000Z";
const labels = new Map([
  ["fixture-fact-hours", SupportLabel.SUPPORTED],
  ["fixture-fact-hypothesis", SupportLabel.HYPOTHESIS],
]);

function article(overrides: Partial<Parameters<typeof createCanonicalArticle>[0]> = {}) {
  return createCanonicalArticle({
    articleId: "art-m6",
    campaignId: "camp-m6",
    authorId: "author-a13",
    title: "Training rooms",
    body: "Plan your next training day.",
    citedFactIds: ["fixture-fact-hours"],
    fixtureOnly: true,
    createdAtIso: now,
    ...overrides,
  });
}

describe("canonical-publish — versioned draft edit", () => {
  it("bumps version and digest on body edit; returns to draft", () => {
    const base = { ...article(), status: ArticleStatus.APPROVED, version: 2 };
    const edited = editCanonicalArticle({
      article: base,
      body: "Plan your next training day with verified capacity.",
      nowIso: now,
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.digestChanged).toBe(true);
    expect(edited.evidenceChanged).toBe(false);
    expect(edited.article.version).toBe(3);
    expect(edited.article.status).toBe(ArticleStatus.DRAFT);
    expect(edited.article.contentDigest).not.toBe(base.contentDigest);
  });

  it("invalidates evidence when cited facts change without body edit", () => {
    const base = { ...article(), status: ArticleStatus.APPROVED, version: 1 };
    const edited = editCanonicalArticle({
      article: base,
      citedFactIds: ["fixture-fact-hours", "fixture-fact-extra"],
      nowIso: now,
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.digestChanged).toBe(false);
    expect(edited.evidenceChanged).toBe(true);
    expect(edited.article.version).toBe(2);
    expect(edited.article.status).toBe(ArticleStatus.READY_FOR_REVIEW);
  });

  it("invalidates evidence when cited facts are removed without body edit (T-X008)", () => {
    const base = {
      ...article({
        citedFactIds: ["fixture-fact-hours", "fixture-fact-capacity"],
      }),
      status: ArticleStatus.APPROVED,
      version: 2,
    };
    const edited = editCanonicalArticle({
      article: base,
      citedFactIds: ["fixture-fact-hours"],
      nowIso: now,
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.digestChanged).toBe(false);
    expect(edited.evidenceChanged).toBe(true);
    expect(edited.article.status).toBe(ArticleStatus.READY_FOR_REVIEW);
    expect(edited.article.citedFactIds).toEqual(["fixture-fact-hours"]);
  });

  it("invalidates evidence when hypothesisFactIds change without body edit (T-X008)", () => {
    const base = {
      ...article({ hypothesisFactIds: [] }),
      status: ArticleStatus.APPROVED,
      version: 2,
    };
    const edited = editCanonicalArticle({
      article: base,
      hypothesisFactIds: ["fixture-fact-hypothesis"],
      nowIso: now,
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.digestChanged).toBe(false);
    expect(edited.evidenceChanged).toBe(true);
    expect(edited.article.status).toBe(ArticleStatus.READY_FOR_REVIEW);
  });

  it("treats cited-fact reorder as evidence-stable (T-X008)", () => {
    const base = {
      ...article({
        citedFactIds: ["fixture-fact-hours", "fixture-fact-capacity"],
      }),
      status: ArticleStatus.APPROVED,
      version: 2,
    };
    const edited = editCanonicalArticle({
      article: base,
      citedFactIds: ["fixture-fact-capacity", "fixture-fact-hours"],
      nowIso: now,
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.evidenceChanged).toBe(false);
    expect(edited.digestChanged).toBe(false);
    expect(edited.article.status).toBe(ArticleStatus.APPROVED);
    expect(edited.article.version).toBe(2);
  });

  it("invalidates evidence when citedFactIds are cleared (T-X008)", () => {
    const base = {
      ...article(),
      status: ArticleStatus.APPROVED,
      version: 2,
    };
    const edited = editCanonicalArticle({
      article: base,
      citedFactIds: [],
      nowIso: now,
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.evidenceChanged).toBe(true);
    expect(edited.digestChanged).toBe(false);
    expect(edited.article.status).toBe(ArticleStatus.READY_FOR_REVIEW);
    expect(edited.article.citedFactIds).toEqual([]);
  });

  it("returns DRAFT on title-only digest edit without evidence change (T-X008 contrast)", () => {
    const base = {
      ...article(),
      status: ArticleStatus.APPROVED,
      version: 2,
    };
    const edited = editCanonicalArticle({
      article: base,
      title: "Training rooms — revised",
      nowIso: now,
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.digestChanged).toBe(true);
    expect(edited.evidenceChanged).toBe(false);
    expect(edited.article.status).toBe(ArticleStatus.DRAFT);
  });

  it("invalidates evidence when hypothesisFactIds are cleared (T-X008)", () => {
    const base = {
      ...article({ hypothesisFactIds: ["fixture-fact-hypothesis"] }),
      status: ArticleStatus.APPROVED,
      version: 2,
    };
    const edited = editCanonicalArticle({
      article: base,
      hypothesisFactIds: [],
      nowIso: now,
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.evidenceChanged).toBe(true);
    expect(edited.digestChanged).toBe(false);
    expect(edited.article.status).toBe(ArticleStatus.READY_FOR_REVIEW);
  });

  it("changes evidence package digest when claimIds alone change (T-X008)", () => {
    const a = digestContentEvidencePackage({
      articleId: "art-m6",
      contentDigest: "digest-a",
      version: 2,
      citedFactIds: ["fixture-fact-hours"],
      claimIds: ["claim-hours"],
    });
    const b = digestContentEvidencePackage({
      articleId: "art-m6",
      contentDigest: "digest-a",
      version: 2,
      citedFactIds: ["fixture-fact-hours"],
      claimIds: ["claim-hours", "claim-extra"],
    });
    expect(a).not.toBe(b);
  });

  it("refuses edit of RELEASED_PENDING / VERIFIED articles", () => {
    const released = {
      ...article(),
      status: ArticleStatus.RELEASED_PENDING,
    };
    const result = editCanonicalArticle({
      article: released,
      title: "Nope",
      nowIso: now,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("ARTICLE_NOT_EDITABLE");
  });
});

describe("canonical-publish — claim/source QA", () => {
  it("rejects claims citing HYPOTHESIS or missing sources", () => {
    const art = article({
      citedFactIds: ["fixture-fact-hours", "fixture-fact-hypothesis"],
    });
    const qa = evaluateClaimSourceQa({
      article: art,
      claims: [
        {
          claimId: "c1",
          factId: "fixture-fact-hours",
          sourceRef: "",
          statement: "Open weekdays",
        },
        {
          claimId: "c2",
          factId: "fixture-fact-hypothesis",
          sourceRef: "src-1",
          statement: "Maybe popular",
        },
      ],
      factLabels: labels,
    });
    expect(qa.allowed).toBe(false);
    expect(qa.missingSourceClaimIds).toContain("c1");
    expect(qa.unsupportedFactIds).toContain("fixture-fact-hypothesis");
  });

  it("passes when every citation has a SUPPORTED claim+source", () => {
    const art = article();
    const qa = evaluateClaimSourceQa({
      article: art,
      claims: [
        {
          claimId: "c1",
          factId: "fixture-fact-hours",
          sourceRef: "src-hours",
          statement: "Open weekdays 9–5",
        },
      ],
      factLabels: labels,
    });
    expect(qa.allowed).toBe(true);
  });
});

describe("canonical-publish — A25 review binding", () => {
  it("binds to exact revision and invalidates after edit", () => {
    const art = article();
    const evidence = digestContentEvidencePackage({
      articleId: art.articleId,
      contentDigest: art.contentDigest,
      version: art.version,
      citedFactIds: art.citedFactIds,
      claimIds: ["c1"],
    });
    const proposal: EffectProposal = {
      proposalId: "prop-1",
      authorRoleId: "A13",
      actionClass: "ROUTINE_PUBLISH",
      operation: "publish_article",
      assetId: art.articleId,
      channelId: "owned-site",
      payloadDigest: art.contentDigest,
      evidenceArtifactIds: ["ev-1"],
    };
    const bound = bindContentIndependentReview({
      bindingId: "bind-1",
      proposal,
      snapshot: {
        articleId: art.articleId,
        version: art.version,
        contentDigest: art.contentDigest,
        evidencePackageDigest: evidence,
        citedFactIds: art.citedFactIds,
      },
      createdAtIso: now,
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;

    const edited = editCanonicalArticle({
      article: art,
      body: "Changed body",
      nowIso: now,
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;

    const check = validateContentReviewAgainstArticle({
      binding: bound.binding,
      article: edited.article,
      evidencePackageDigest: evidence,
    });
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.code).toBe("BINDING_INVALIDATED");
  });

  // T-X008 F13: repeated publish gate stays denied after binding invalidated (no apply).
  it("denies publish eligibility on fourth probe after body stale (F13)", () => {
    const art = article({ status: ArticleStatus.APPROVED, version: 1 });
    const evidence = digestContentEvidencePackage({
      citedFactIds: art.citedFactIds,
      claimIds: [],
      hypothesisFactIds: [],
    });
    const proposal: EffectProposal = {
      proposalId: "prop-f13",
      authorRoleId: "A13",
      actionClass: "ROUTINE_PUBLISH",
      operation: "publish_article",
      assetId: art.articleId,
      channelId: "owned-site",
      payloadDigest: art.contentDigest,
      evidenceArtifactIds: ["ev-f13"],
    };
    const bound = bindContentIndependentReview({
      bindingId: "bind-f13",
      proposal,
      snapshot: {
        articleId: art.articleId,
        version: art.version,
        contentDigest: art.contentDigest,
        evidencePackageDigest: evidence,
        citedFactIds: art.citedFactIds,
      },
      createdAtIso: now,
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;

    const edited = editCanonicalArticle({
      article: art,
      body: "Changed body",
      nowIso: now,
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;

    const staleEvidence = digestContentEvidencePackage({
      citedFactIds: edited.article.citedFactIds,
      claimIds: [],
      hypothesisFactIds: [],
    });
    const stillStale = () =>
      validateContentReviewAgainstArticle({
        binding: bound.binding,
        article: edited.article,
        evidencePackageDigest: staleEvidence,
      });
    expect(stillStale().ok).toBe(false);
    expect(stillStale().ok).toBe(false);
    expect(stillStale().ok).toBe(false);
    expect(stillStale().ok).toBe(false);
    expect(stillStale().ok).toBe(false);
    expect(stillStale().ok).toBe(false);
    if (!stillStale().ok) {
      expect(stillStale().code).toBe("BINDING_INVALIDATED");
    }
  });

  // T-X008 F16: sixth stale validation probe still BINDING_INVALIDATED.
  it("stays BINDING_INVALIDATED on sixth stale review probe (F16)", () => {
    const art = article({ status: ArticleStatus.APPROVED, version: 1 });
    const evidence = digestContentEvidencePackage({
      citedFactIds: art.citedFactIds,
      claimIds: [],
      hypothesisFactIds: [],
    });
    const proposal: EffectProposal = {
      proposalId: "prop-f16",
      authorRoleId: "A13",
      actionClass: "ROUTINE_PUBLISH",
      operation: "publish_article",
      assetId: art.articleId,
      channelId: "owned-site",
      payloadDigest: art.contentDigest,
      evidenceArtifactIds: ["ev-f16"],
    };
    const bound = bindContentIndependentReview({
      bindingId: "bind-f16",
      proposal,
      snapshot: {
        articleId: art.articleId,
        version: art.version,
        contentDigest: art.contentDigest,
        evidencePackageDigest: evidence,
        citedFactIds: art.citedFactIds,
      },
      createdAtIso: now,
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;

    const edited = editCanonicalArticle({
      article: art,
      body: "Changed body for F16",
      nowIso: now,
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;

    const staleEvidence = digestContentEvidencePackage({
      citedFactIds: edited.article.citedFactIds,
      claimIds: [],
      hypothesisFactIds: [],
    });
    for (let i = 0; i < 6; i++) {
      const check = validateContentReviewAgainstArticle({
        binding: bound.binding,
        article: edited.article,
        evidencePackageDigest: staleEvidence,
      });
      expect(check.ok).toBe(false);
      if (!check.ok) {
        expect(check.code).toBe("BINDING_INVALIDATED");
      }
    }
  });

  // T-X008 F17: seventh stale validation probe still BINDING_INVALIDATED.
  it("stays BINDING_INVALIDATED on seventh stale review probe (F17)", () => {
    const art = article({ status: ArticleStatus.APPROVED, version: 1 });
    const evidence = digestContentEvidencePackage({
      citedFactIds: art.citedFactIds,
      claimIds: [],
      hypothesisFactIds: [],
    });
    const proposal: EffectProposal = {
      proposalId: "prop-f17",
      authorRoleId: "A13",
      actionClass: "ROUTINE_PUBLISH",
      operation: "publish_article",
      assetId: art.articleId,
      channelId: "owned-site",
      payloadDigest: art.contentDigest,
      evidenceArtifactIds: ["ev-f17"],
    };
    const bound = bindContentIndependentReview({
      bindingId: "bind-f17",
      proposal,
      snapshot: {
        articleId: art.articleId,
        version: art.version,
        contentDigest: art.contentDigest,
        evidencePackageDigest: evidence,
        citedFactIds: art.citedFactIds,
      },
      createdAtIso: now,
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;

    const edited = editCanonicalArticle({
      article: art,
      body: "Changed body for F17",
      nowIso: now,
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;

    const staleEvidence = digestContentEvidencePackage({
      citedFactIds: edited.article.citedFactIds,
      claimIds: [],
      hypothesisFactIds: [],
    });
    for (let i = 0; i < 7; i++) {
      const check = validateContentReviewAgainstArticle({
        binding: bound.binding,
        article: edited.article,
        evidencePackageDigest: staleEvidence,
      });
      expect(check.ok).toBe(false);
      if (!check.ok) {
        expect(check.code).toBe("BINDING_INVALIDATED");
      }
    }
  });

  // T-X008 F18: eighth stale validation probe still BINDING_INVALIDATED.
  it("stays BINDING_INVALIDATED on eighth stale review probe (F18)", () => {
    const art = article({ status: ArticleStatus.APPROVED, version: 1 });
    const evidence = digestContentEvidencePackage({
      citedFactIds: art.citedFactIds,
      claimIds: [],
      hypothesisFactIds: [],
    });
    const proposal: EffectProposal = {
      proposalId: "prop-f18",
      authorRoleId: "A13",
      actionClass: "ROUTINE_PUBLISH",
      operation: "publish_article",
      assetId: art.articleId,
      channelId: "owned-site",
      payloadDigest: art.contentDigest,
      evidenceArtifactIds: ["ev-f18"],
    };
    const bound = bindContentIndependentReview({
      bindingId: "bind-f18",
      proposal,
      snapshot: {
        articleId: art.articleId,
        version: art.version,
        contentDigest: art.contentDigest,
        evidencePackageDigest: evidence,
        citedFactIds: art.citedFactIds,
      },
      createdAtIso: now,
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;

    const edited = editCanonicalArticle({
      article: art,
      body: "Changed body for F18",
      nowIso: now,
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;

    const staleEvidence = digestContentEvidencePackage({
      citedFactIds: edited.article.citedFactIds,
      claimIds: [],
      hypothesisFactIds: [],
    });
    for (let i = 0; i < 8; i++) {
      const check = validateContentReviewAgainstArticle({
        binding: bound.binding,
        article: edited.article,
        evidencePackageDigest: staleEvidence,
      });
      expect(check.ok).toBe(false);
      if (!check.ok) {
        expect(check.code).toBe("BINDING_INVALIDATED");
      }
    }
  });
});

describe("canonical-publish — stable keys + partial recovery", () => {
  it("builds deterministic business keys including destination set", () => {
    const a = stableContentOperationKey({
      kind: "canonical",
      campaignId: "camp-m6",
      articleId: "art-m6",
      contentDigest: "abcdef0123456789ffff",
      version: 1,
    });
    const b = stableContentOperationKey({
      kind: "canonical",
      campaignId: "camp-m6",
      articleId: "art-m6",
      contentDigest: "abcdef0123456789ffff",
      version: 1,
    });
    expect(a).toBe(b);
    expect(a).toContain("biz-content:canonical:camp-m6:art-m6");
    const d1 = stableContentOperationKey({
      kind: "distribution",
      campaignId: "camp-m6",
      articleId: "art-m6",
      destinationIds: ["dest-cms"],
      contentDigest: "abcdef0123456789ffff",
      version: 1,
    });
    const d2 = stableContentOperationKey({
      kind: "distribution",
      campaignId: "camp-m6",
      articleId: "art-m6",
      destinationIds: ["dest-cms", "dest-gbp"],
      contentDigest: "abcdef0123456789ffff",
      version: 1,
    });
    expect(d1).not.toBe(d2);
  });

  it("marks partial failure and lists only recoverable destinations", () => {
    let run = createDistributionRun({
      runId: "run-1",
      campaignId: "camp-m6",
      articleId: "art-m6",
      destinationIds: ["dest-cms", "dest-gbp", "dest-linkedin"],
      businessIdempotencyKey: "biz-key",
      fixtureOnly: true,
      createdAtIso: now,
    });
    expect(run.liveProviderWiring).toBe("NOT_WIRED");
    expect(run.externalEffects).toBe("NONE");
    run = upsertDestinationAttempt(run, {
      attemptId: "a1",
      destinationId: "dest-cms",
      kind: "cms",
      variantId: null,
      articleId: "art-m6",
      status: DestinationAttemptStatus.VERIFIED,
      operationKey: "k1",
      durableOperationId: "d1",
      gatewayOperationId: "g1",
      receiptId: "r1",
      outcome: "PUBLISHED_VERIFIED",
      summary: "ok",
      updatedAtIso: now,
    });
    run = upsertDestinationAttempt(run, {
      attemptId: "a2",
      destinationId: "dest-gbp",
      kind: "gbp",
      variantId: "var-gbp",
      articleId: "art-m6",
      status: DestinationAttemptStatus.FAILED,
      operationKey: "k2",
      durableOperationId: null,
      gatewayOperationId: "g2",
      receiptId: "r2",
      outcome: "FAILED",
      summary: "gbp fail",
      updatedAtIso: now,
    });
    expect(run.status).toBe(DistributionRunStatus.PARTIAL);
    expect(run.liveProviderWiring).toBe("NOT_WIRED");
    expect(run.externalEffects).toBe("NONE");
    const recoverable = listRecoverableDestinations(run);
    expect(recoverable.map((r) => r.destinationId)).toEqual(["dest-gbp"]);
  });

  it("partial-destination attack suite covers mixed/pending/failed/blocked with NOT_WIRED", () => {
    const suite = evaluatePartialCampaignDestinationsAttackSuite({
      nowIso: now,
    });
    expect(suite.passed).toBe(true);
    expect(
      suite.details.some((d) => /liveProviderWiring=NOT_WIRED/i.test(d)),
    ).toBe(true);
    expect([...PARTIAL_CAMPAIGN_DESTINATIONS_RELATED_CASE_IDS]).toEqual([
      "T-X045",
    ]);
    expect(
      suite.runs.every(
        (r) =>
          r.liveProviderWiring === "NOT_WIRED" && r.externalEffects === "NONE",
      ),
    ).toBe(true);
  });
});
