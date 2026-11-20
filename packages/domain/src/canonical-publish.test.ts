import { describe, expect, it } from "vitest";
import { SupportLabel } from "./knowledge.js";
import {
  DestinationAttemptStatus,
  DistributionRunStatus,
  bindContentIndependentReview,
  createDistributionRun,
  digestContentEvidencePackage,
  editCanonicalArticle,
  evaluateClaimSourceQa,
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
    expect(edited.article.version).toBe(3);
    expect(edited.article.status).toBe(ArticleStatus.DRAFT);
    expect(edited.article.contentDigest).not.toBe(base.contentDigest);
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
});

describe("canonical-publish — stable keys + partial recovery", () => {
  it("builds deterministic business keys", () => {
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
    const recoverable = listRecoverableDestinations(run);
    expect(recoverable.map((r) => r.destinationId)).toEqual(["dest-gbp"]);
  });
});
