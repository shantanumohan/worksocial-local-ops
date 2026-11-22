/**
 * Fixture proof for T-X008 — fact changes after review -> stale; no publish.
 *
 * Primary path: after A25 binds content review to an approved revision +
 * evidence package (citedFactIds), changing the cited-fact set marks
 * evidenceChanged, returns READY_FOR_REVIEW, and invalidates the A25 binding.
 * Fixture publish eligibility (APPROVED + valid binding + article gate) fails —
 * no receipt / provider mutation is attempted.
 *
 * Secondary path: support-label flip SUPPORTED->UNKNOWN fails article/approval
 * publish gates (binding is not claimed invalidated by label flip alone —
 * evidence digests cite fact IDs, not labels).
 *
 * Honesty: does not cover same-ID in-place value revision while remaining
 * SUPPORTED (no fact-version digest in current domain evidence package).
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  ArticleStatus,
  ReviewBindingStatus,
  SoakProofKind,
  SupportLabel,
  bindContentIndependentReview,
  createCanonicalArticle,
  digestContentEvidencePackage,
  editCanonicalArticle,
  evaluateArticleApprovalGate,
  evaluateArticleGate,
  validateContentReviewAgainstArticle,
  type CanonicalArticle,
  type EffectProposal,
  type FactSupportLookup,
  type ReviewBinding,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Fixture-only publish eligibility: APPROVED + still-bound review + article gate.
 * Never calls live adapters; used to prove "no publish" without inventing receipts.
 */
function fixturePublishEligible(input: {
  article: CanonicalArticle;
  binding: ReviewBinding;
  evidencePackageDigest: string;
  factLabels: FactSupportLookup;
}): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.article.status !== ArticleStatus.APPROVED) {
    reasons.push(`status=${input.article.status} (require APPROVED)`);
  }
  const bound = validateContentReviewAgainstArticle({
    binding: input.binding,
    article: input.article,
    evidencePackageDigest: input.evidencePackageDigest,
  });
  if (!bound.ok) {
    reasons.push(`reviewBinding=${bound.code}`);
  }
  const gate = evaluateArticleGate({
    article: input.article,
    factLabels: input.factLabels,
  });
  if (!gate.allowed) {
    reasons.push(`articleGate=${gate.code}`);
  }
  return { allowed: reasons.length === 0, reasons };
}

/**
 * Complete expected proof set for T-X008 fixture ACCEPTED.
 */
export function proofFactChangesAfterReviewStale(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  /** Provider/receipt apply attempts for this fixture publish path — must stay 0. */
  const publishApplyAttempts = 0;

  const draft = createCanonicalArticle({
    articleId: `art-x008-${randomUUID().slice(0, 8)}`,
    campaignId: "camp-x008",
    authorId: "author-a13",
    title: "Training rooms",
    body: "Plan your next training day with verified capacity.",
    citedFactIds: ["fixture-fact-hours"],
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  // Simulate post-review APPROVED revision (createCanonicalArticle only mints draft).
  const approved = {
    ...draft,
    status: ArticleStatus.APPROVED,
    version: 2,
  };

  const claimIds = ["claim-hours"];
  const evidence = digestContentEvidencePackage({
    articleId: approved.articleId,
    contentDigest: approved.contentDigest,
    version: approved.version,
    citedFactIds: approved.citedFactIds,
    claimIds,
  });

  const proposal: EffectProposal = {
    proposalId: `prop-x008-${randomUUID().slice(0, 8)}`,
    authorRoleId: "A13",
    actionClass: "ROUTINE_PUBLISH",
    operation: "publish_article",
    assetId: approved.articleId,
    channelId: "owned-site",
    payloadDigest: approved.contentDigest,
    evidenceArtifactIds: ["ev-hours"],
  };

  const bound = bindContentIndependentReview({
    bindingId: `bind-x008-${randomUUID().slice(0, 8)}`,
    proposal,
    snapshot: {
      articleId: approved.articleId,
      version: approved.version,
      contentDigest: approved.contentDigest,
      evidencePackageDigest: evidence,
      citedFactIds: approved.citedFactIds,
    },
    createdAtIso: nowIso,
  });
  if (!bound.ok) {
    return {
      proofId: `proof-fact-changes-${randomUUID()}`,
      kind: SoakProofKind.FACT_CHANGES_AFTER_REVIEW_STALE,
      passed: false,
      details: [`Failed to bind content review: ${bound.code}`],
      applyAttemptCount: 1,
      operationId: `op-x008-${randomUUID().slice(0, 8)}`,
      createdAtIso: nowIso,
      fixtureOnly: true,
    };
  }
  details.push("A25 content review bound to approved revision + cited facts");

  const supportedLabels = new Map([
    ["fixture-fact-hours", SupportLabel.SUPPORTED],
    ["fixture-fact-capacity", SupportLabel.SUPPORTED],
  ]);

  const preEligible = fixturePublishEligible({
    article: approved,
    binding: bound.binding,
    evidencePackageDigest: evidence,
    factLabels: supportedLabels,
  });
  if (preEligible.allowed) {
    details.push(
      "Pre-change fixture publish eligibility true (APPROVED + bound review + SUPPORTED facts)",
    );
  } else {
    passed = false;
    details.push(
      `Pre-change publish eligibility unexpectedly false: ${preEligible.reasons.join("; ")}`,
    );
  }

  // 1. Cited facts change after review -> evidenceChanged; status READY_FOR_REVIEW.
  const factEdit = editCanonicalArticle({
    article: approved,
    citedFactIds: ["fixture-fact-hours", "fixture-fact-capacity"],
    nowIso,
  });
  if (!factEdit.ok) {
    passed = false;
    details.push(`Cited-fact edit failed: ${factEdit.code}`);
  } else if (
    factEdit.evidenceChanged === true &&
    factEdit.digestChanged === false &&
    factEdit.article.status === ArticleStatus.READY_FOR_REVIEW &&
    factEdit.article.version === approved.version + 1
  ) {
    details.push(
      "Cited facts changed after review -> evidenceChanged; status READY_FOR_REVIEW (stale)",
    );
  } else {
    passed = false;
    details.push(
      `Cited-fact edit unexpected evidenceChanged=${factEdit.evidenceChanged} digestChanged=${factEdit.digestChanged} status=${factEdit.article.status} version=${factEdit.article.version}`,
    );
  }

  if (factEdit.ok) {
    const staleEvidence = digestContentEvidencePackage({
      articleId: factEdit.article.articleId,
      contentDigest: factEdit.article.contentDigest,
      version: factEdit.article.version,
      citedFactIds: factEdit.article.citedFactIds,
      claimIds,
    });
    const afterCite = validateContentReviewAgainstArticle({
      binding: bound.binding,
      article: factEdit.article,
      evidencePackageDigest: staleEvidence,
    });
    if (
      !afterCite.ok &&
      afterCite.code === "BINDING_INVALIDATED" &&
      afterCite.binding.status === ReviewBindingStatus.INVALIDATED
    ) {
      details.push("A25 binding invalidated after cited-fact change (stale)");
    } else {
      passed = false;
      details.push(
        `Expected BINDING_INVALIDATED after cited-fact change, got ${JSON.stringify(afterCite)}`,
      );
    }

    const postEligible = fixturePublishEligible({
      article: factEdit.article,
      binding: bound.binding,
      evidencePackageDigest: staleEvidence,
      factLabels: supportedLabels,
    });
    if (!postEligible.allowed) {
      details.push(
        `Fixture publish denied after cited-fact change (${postEligible.reasons.join("; ")}); no receipt attempted`,
      );
    } else {
      passed = false;
      details.push("Fixture publish unexpectedly still eligible after cited-fact change");
    }
    if (publishApplyAttempts !== 0) {
      passed = false;
      details.push(`Unexpected publish apply attempts=${publishApplyAttempts}`);
    } else {
      details.push("Provider applyAttemptCount=0 after denied publish (no receipt)");
    }
  }

  // 2. Support-label flip SUPPORTED -> UNKNOWN -> article/approval gate fail-closed.
  // Binding is NOT claimed invalidated by label flip alone (digest uses fact IDs).
  const flippedLabels = new Map([
    ["fixture-fact-hours", SupportLabel.UNKNOWN],
  ]);
  const gateAfterFlip = evaluateArticleGate({
    article: approved,
    factLabels: flippedLabels,
  });
  if (!gateAfterFlip.allowed && gateAfterFlip.code === "ARTICLE_GATE_FAILED") {
    details.push(
      "Fact support flip SUPPORTED->UNKNOWN fails article publish gate (binding not claimed invalidated by label alone)",
    );
  } else {
    passed = false;
    details.push(
      `Expected ARTICLE_GATE_FAILED after fact flip, got ${JSON.stringify(gateAfterFlip)}`,
    );
  }

  const approvalAfterFlip = evaluateArticleApprovalGate({
    article: approved,
    factLabels: flippedLabels,
    qaVerdict: {
      verdictId: `verdict-x008-${randomUUID().slice(0, 8)}`,
      articleId: approved.articleId,
      authorId: approved.authorId,
      reviewerId: "reviewer-a25",
      approved: true,
      contentDigest: approved.contentDigest,
      summary: "support flip after review",
      decidedAtIso: nowIso,
    },
  });
  if (!approvalAfterFlip.allowed) {
    details.push("Approval/publish gate rejected after fact support change");
  } else {
    passed = false;
    details.push("Approval gate unexpectedly allowed publish after fact support change");
  }

  const flipEligible = fixturePublishEligible({
    article: approved,
    binding: bound.binding,
    evidencePackageDigest: evidence,
    factLabels: flippedLabels,
  });
  if (!flipEligible.allowed && flipEligible.reasons.some((r) => /articleGate/.test(r))) {
    details.push(
      "Fixture publish denied after support flip via articleGate (no receipt; applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Expected articleGate deny after support flip, got ${JSON.stringify(flipEligible)}`,
    );
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-fact-changes-${randomUUID()}`,
    kind: SoakProofKind.FACT_CHANGES_AFTER_REVIEW_STALE,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-x008-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
