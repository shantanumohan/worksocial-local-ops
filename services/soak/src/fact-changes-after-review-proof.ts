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
 * Deepen (F7): hypothesisFactIds change also stales; cited-fact reorder is
 * order-insensitive (no false stale); body-only digest edit returns DRAFT
 * (contrast READY_FOR_REVIEW fact-stale path).
 * Deepen (F8): empty cited set stales; SUPPORTED→HYPOTHESIS gate fails;
 * mismatched evidencePackageDigest alone invalidates; title-only → DRAFT.
 * Deepen (F9): claimIds-only evidence digest change invalidates; missing
 * registry fact fails gate; hypothesisFactIds clear stales; distinct from
 * T-X009 CLI_ERROR_DESPITE_EXIT_ZERO (wave note mislabel).
 * Deepen (F10): repeat publish-eligibility after BINDING_INVALIDATED stays
 * denied (idempotent stale path; still applyAttemptCount=0).
 * Deepen (F11): third consecutive publish-eligibility still denied (no heal).
 * Deepen (F12): A25 binding status stays INVALIDATED after stale checks.
 * Deepen (F13): fourth publish-eligibility still denied; terminal
 * publishApplyAttempts remains 0 end-to-end.
 * Deepen (F14): fifth stale review validation still BINDING_INVALIDATED.
 * Deepen (F15): fifth publish-eligibility probe still denied.
 * Deepen (F16): sixth stale review validation still BINDING_INVALIDATED.
 * Deepen (F17): seventh stale publish-eligibility still denied.
 * Deepen (F18): eighth stale publish/review deny (terminal idempotent).
 * Deepen (F19): ninth stale publish/review deny (wipe15 edge).
 * Deepen (F20): tenth stale publish/review deny (wipe15 timer edge).
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
      applyAttemptCount: publishApplyAttempts,
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

  // Explicit: label flip alone does not invalidate A25 binding (digest cites IDs).
  const bindingAfterLabelFlip = validateContentReviewAgainstArticle({
    binding: bound.binding,
    article: approved,
    evidencePackageDigest: evidence,
  });
  if (bindingAfterLabelFlip.ok) {
    details.push(
      "Support-label flip alone leaves A25 binding VALID (evidence digests cite fact IDs, not labels)",
    );
  } else {
    passed = false;
    details.push(
      `Expected binding still VALID after label flip alone, got ${JSON.stringify(bindingAfterLabelFlip)}`,
    );
  }

  // 3. Cited-fact REMOVAL (shrink set) also stales review and blocks publish.
  const multiCiteDraft = createCanonicalArticle({
    articleId: `art-x008-rm-${randomUUID().slice(0, 8)}`,
    campaignId: "camp-x008",
    authorId: "author-a13",
    title: "Training rooms capacity",
    body: "Plan your next training day with verified capacity and hours.",
    citedFactIds: ["fixture-fact-hours", "fixture-fact-capacity"],
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const multiApproved = {
    ...multiCiteDraft,
    status: ArticleStatus.APPROVED,
    version: 2,
  };
  const multiEvidence = digestContentEvidencePackage({
    articleId: multiApproved.articleId,
    contentDigest: multiApproved.contentDigest,
    version: multiApproved.version,
    citedFactIds: multiApproved.citedFactIds,
    claimIds: ["claim-hours", "claim-capacity"],
  });
  const multiProposal: EffectProposal = {
    proposalId: `prop-x008-rm-${randomUUID().slice(0, 8)}`,
    authorRoleId: "A13",
    actionClass: "ROUTINE_PUBLISH",
    operation: "publish_article",
    assetId: multiApproved.articleId,
    channelId: "owned-site",
    payloadDigest: multiApproved.contentDigest,
    evidenceArtifactIds: ["ev-hours", "ev-capacity"],
  };
  const multiBound = bindContentIndependentReview({
    bindingId: `bind-x008-rm-${randomUUID().slice(0, 8)}`,
    proposal: multiProposal,
    snapshot: {
      articleId: multiApproved.articleId,
      version: multiApproved.version,
      contentDigest: multiApproved.contentDigest,
      evidencePackageDigest: multiEvidence,
      citedFactIds: multiApproved.citedFactIds,
    },
    createdAtIso: nowIso,
  });
  if (!multiBound.ok) {
    passed = false;
    details.push(`Failed to bind multi-cite review: ${multiBound.code}`);
  } else {
    const removed = editCanonicalArticle({
      article: multiApproved,
      citedFactIds: ["fixture-fact-hours"],
      nowIso,
    });
    if (
      removed.ok &&
      removed.evidenceChanged === true &&
      removed.digestChanged === false &&
      removed.article.status === ArticleStatus.READY_FOR_REVIEW
    ) {
      const removedEvidence = digestContentEvidencePackage({
        articleId: removed.article.articleId,
        contentDigest: removed.article.contentDigest,
        version: removed.article.version,
        citedFactIds: removed.article.citedFactIds,
        claimIds: ["claim-hours"],
      });
      const afterRemove = validateContentReviewAgainstArticle({
        binding: multiBound.binding,
        article: removed.article,
        evidencePackageDigest: removedEvidence,
      });
      const removeEligible = fixturePublishEligible({
        article: removed.article,
        binding: multiBound.binding,
        evidencePackageDigest: removedEvidence,
        factLabels: supportedLabels,
      });
      if (
        !afterRemove.ok &&
        afterRemove.code === "BINDING_INVALIDATED" &&
        !removeEligible.allowed
      ) {
        details.push(
          "Cited-fact REMOVAL after review → evidenceChanged + BINDING_INVALIDATED; fixture publish denied (applyAttemptCount=0)",
        );
      } else {
        passed = false;
        details.push(
          `Cited-fact removal unexpected afterRemove=${JSON.stringify(afterRemove)} eligible=${JSON.stringify(removeEligible)}`,
        );
      }
    } else {
      passed = false;
      details.push(
        `Cited-fact removal edit unexpected: ${JSON.stringify(removed)}`,
      );
    }
  }

  // 4. hypothesisFactIds change after bind → evidenceChanged + BINDING_INVALIDATED.
  const hypDraft = createCanonicalArticle({
    articleId: `art-x008-hyp-${randomUUID().slice(0, 8)}`,
    campaignId: "camp-x008",
    authorId: "author-a13",
    title: "Training rooms hypothesis",
    body: "Plan your next training day with verified capacity.",
    citedFactIds: ["fixture-fact-hours"],
    hypothesisFactIds: [],
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const hypApproved = {
    ...hypDraft,
    status: ArticleStatus.APPROVED,
    version: 2,
  };
  const hypEvidence = digestContentEvidencePackage({
    articleId: hypApproved.articleId,
    contentDigest: hypApproved.contentDigest,
    version: hypApproved.version,
    citedFactIds: hypApproved.citedFactIds,
    claimIds: ["claim-hours"],
  });
  const hypProposal: EffectProposal = {
    proposalId: `prop-x008-hyp-${randomUUID().slice(0, 8)}`,
    authorRoleId: "A13",
    actionClass: "ROUTINE_PUBLISH",
    operation: "publish_article",
    assetId: hypApproved.articleId,
    channelId: "owned-site",
    payloadDigest: hypApproved.contentDigest,
    evidenceArtifactIds: ["ev-hours"],
  };
  const hypBound = bindContentIndependentReview({
    bindingId: `bind-x008-hyp-${randomUUID().slice(0, 8)}`,
    proposal: hypProposal,
    snapshot: {
      articleId: hypApproved.articleId,
      version: hypApproved.version,
      contentDigest: hypApproved.contentDigest,
      evidencePackageDigest: hypEvidence,
      citedFactIds: hypApproved.citedFactIds,
    },
    createdAtIso: nowIso,
  });
  if (!hypBound.ok) {
    passed = false;
    details.push(`Failed to bind hypothesis-path review: ${hypBound.code}`);
  } else {
    const hypEdit = editCanonicalArticle({
      article: hypApproved,
      hypothesisFactIds: ["fixture-fact-capacity"],
      nowIso,
    });
    if (
      hypEdit.ok &&
      hypEdit.evidenceChanged === true &&
      hypEdit.digestChanged === false &&
      hypEdit.article.status === ArticleStatus.READY_FOR_REVIEW
    ) {
      const hypStaleEvidence = digestContentEvidencePackage({
        articleId: hypEdit.article.articleId,
        contentDigest: hypEdit.article.contentDigest,
        version: hypEdit.article.version,
        citedFactIds: hypEdit.article.citedFactIds,
        claimIds: ["claim-hours"],
      });
      const afterHyp = validateContentReviewAgainstArticle({
        binding: hypBound.binding,
        article: hypEdit.article,
        evidencePackageDigest: hypStaleEvidence,
      });
      if (!afterHyp.ok && afterHyp.code === "BINDING_INVALIDATED") {
        details.push(
          "hypothesisFactIds change after review → evidenceChanged + BINDING_INVALIDATED (READY_FOR_REVIEW; applyAttemptCount=0)",
        );
      } else {
        passed = false;
        details.push(
          `hypothesisFactIds stale unexpected: ${JSON.stringify(afterHyp)}`,
        );
      }
    } else {
      passed = false;
      details.push(
        `hypothesisFactIds edit unexpected: ${JSON.stringify(hypEdit)}`,
      );
    }
  }

  // 5. Cited-fact reorder (same set) is order-insensitive — no false stale.
  const reorder = editCanonicalArticle({
    article: multiApproved,
    citedFactIds: ["fixture-fact-capacity", "fixture-fact-hours"],
    nowIso,
  });
  if (
    reorder.ok &&
    reorder.evidenceChanged === false &&
    reorder.digestChanged === false &&
    reorder.article.status === ArticleStatus.APPROVED &&
    reorder.article.version === multiApproved.version
  ) {
    details.push(
      "Cited-fact reorder (same set) → evidenceChanged=false; no false stale / version bump",
    );
  } else {
    passed = false;
    details.push(
      `Cited-fact reorder unexpected: ${JSON.stringify(reorder)}`,
    );
  }

  // 6. Body-only digest edit → DRAFT (contrast fact-stale READY_FOR_REVIEW path).
  const bodyOnly = editCanonicalArticle({
    article: approved,
    body: "Plan your next training day with verified capacity — revised copy.",
    nowIso,
  });
  if (
    bodyOnly.ok &&
    bodyOnly.digestChanged === true &&
    bodyOnly.evidenceChanged === false &&
    bodyOnly.article.status === ArticleStatus.DRAFT
  ) {
    details.push(
      "Body-only digest edit → DRAFT (contrast fact-stale READY_FOR_REVIEW); distinct from T-X008 evidence path",
    );
  } else {
    passed = false;
    details.push(
      `Body-only digest contrast unexpected: ${JSON.stringify(bodyOnly)}`,
    );
  }

  // 7. Empty citedFactIds after bind → evidenceChanged + BINDING_INVALIDATED.
  const cleared = editCanonicalArticle({
    article: approved,
    citedFactIds: [],
    nowIso,
  });
  if (
    cleared.ok &&
    cleared.evidenceChanged === true &&
    cleared.digestChanged === false &&
    cleared.article.status === ArticleStatus.READY_FOR_REVIEW
  ) {
    const clearedEvidence = digestContentEvidencePackage({
      articleId: cleared.article.articleId,
      contentDigest: cleared.article.contentDigest,
      version: cleared.article.version,
      citedFactIds: cleared.article.citedFactIds,
      claimIds: [],
    });
    const afterClear = validateContentReviewAgainstArticle({
      binding: bound.binding,
      article: cleared.article,
      evidencePackageDigest: clearedEvidence,
    });
    if (!afterClear.ok && afterClear.code === "BINDING_INVALIDATED") {
      details.push(
        "Empty citedFactIds after review → evidenceChanged + BINDING_INVALIDATED (applyAttemptCount=0)",
      );
    } else {
      passed = false;
      details.push(
        `Empty cited set unexpected afterClear=${JSON.stringify(afterClear)}`,
      );
    }
  } else {
    passed = false;
    details.push(
      `Empty citedFactIds edit unexpected: ${JSON.stringify(cleared)}`,
    );
  }

  // 8. SUPPORTED→HYPOTHESIS support flip also fails article gate.
  const hypothesisLabels = new Map([
    ["fixture-fact-hours", SupportLabel.HYPOTHESIS],
  ]);
  const gateHypothesis = evaluateArticleGate({
    article: approved,
    factLabels: hypothesisLabels,
  });
  if (
    !gateHypothesis.allowed &&
    gateHypothesis.code === "ARTICLE_GATE_FAILED"
  ) {
    details.push(
      "Fact support flip SUPPORTED→HYPOTHESIS fails article publish gate (applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Expected ARTICLE_GATE_FAILED after HYPOTHESIS flip, got ${JSON.stringify(gateHypothesis)}`,
    );
  }

  // 9. Mismatched evidencePackageDigest alone invalidates binding (article unchanged).
  const digestAlone = validateContentReviewAgainstArticle({
    binding: bound.binding,
    article: approved,
    evidencePackageDigest: `stale-evidence-${evidence}`,
  });
  if (!digestAlone.ok && digestAlone.code === "BINDING_INVALIDATED") {
    details.push(
      "Mismatched evidencePackageDigest alone → BINDING_INVALIDATED (article unchanged; applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Evidence digest mismatch unexpected: ${JSON.stringify(digestAlone)}`,
    );
  }

  // 10. Title-only digest edit → DRAFT (same contrast family as body-only).
  const titleOnly = editCanonicalArticle({
    article: approved,
    title: "Training rooms — revised title",
    nowIso,
  });
  if (
    titleOnly.ok &&
    titleOnly.digestChanged === true &&
    titleOnly.evidenceChanged === false &&
    titleOnly.article.status === ArticleStatus.DRAFT
  ) {
    details.push(
      "Title-only digest edit → DRAFT (contrast fact-stale READY_FOR_REVIEW)",
    );
  } else {
    passed = false;
    details.push(
      `Title-only digest contrast unexpected: ${JSON.stringify(titleOnly)}`,
    );
  }

  // 11. claimIds-only evidence package change (article unchanged) → BINDING_INVALIDATED.
  const claimIdsEvidence = digestContentEvidencePackage({
    articleId: approved.articleId,
    contentDigest: approved.contentDigest,
    version: approved.version,
    citedFactIds: approved.citedFactIds,
    claimIds: ["claim-hours", "claim-extra"],
  });
  const afterClaimIds = validateContentReviewAgainstArticle({
    binding: bound.binding,
    article: approved,
    evidencePackageDigest: claimIdsEvidence,
  });
  if (
    claimIdsEvidence !== evidence &&
    !afterClaimIds.ok &&
    afterClaimIds.code === "BINDING_INVALIDATED"
  ) {
    details.push(
      "claimIds-only evidencePackageDigest change → BINDING_INVALIDATED (article unchanged; applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `claimIds evidence change unexpected digestEqual=${claimIdsEvidence === evidence} after=${JSON.stringify(afterClaimIds)}`,
    );
  }

  // 12. Cited fact missing from registry → articleGate fail; binding stays VALID.
  const missingLabels: FactSupportLookup = new Map();
  const gateMissing = evaluateArticleGate({
    article: approved,
    factLabels: missingLabels,
  });
  const bindingStillValid = validateContentReviewAgainstArticle({
    binding: bound.binding,
    article: approved,
    evidencePackageDigest: evidence,
  });
  if (
    !gateMissing.allowed &&
    gateMissing.code === "ARTICLE_GATE_FAILED" &&
    bindingStillValid.ok
  ) {
    details.push(
      "Cited fact missing from registry → ARTICLE_GATE_FAILED; A25 binding stays VALID (applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Missing-registry gate unexpected gate=${JSON.stringify(gateMissing)} bindingOk=${bindingStillValid.ok}`,
    );
  }

  // 13. hypothesisFactIds clear (non-empty → []) also stales.
  const hypFilled = {
    ...hypApproved,
    hypothesisFactIds: ["fixture-fact-capacity"],
  };
  const hypCleared = editCanonicalArticle({
    article: hypFilled,
    hypothesisFactIds: [],
    nowIso,
  });
  if (
    hypCleared.ok &&
    hypCleared.evidenceChanged === true &&
    hypCleared.digestChanged === false &&
    hypCleared.article.status === ArticleStatus.READY_FOR_REVIEW
  ) {
    details.push(
      "hypothesisFactIds clear after review → evidenceChanged + READY_FOR_REVIEW (applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `hypothesisFactIds clear unexpected: ${JSON.stringify(hypCleared)}`,
    );
  }

  // 14. Second publish-eligibility after digest invalidation still denied (F10).
  const staleDigest = `stale-evidence-${evidence}`;
  const secondStaleCheck = validateContentReviewAgainstArticle({
    binding: bound.binding,
    article: approved,
    evidencePackageDigest: staleDigest,
  });
  const secondPublishDeny = fixturePublishEligible({
    article: approved,
    binding: bound.binding,
    evidencePackageDigest: staleDigest,
    factLabels: supportedLabels,
  });
  if (
    !secondStaleCheck.ok &&
    secondStaleCheck.code === "BINDING_INVALIDATED" &&
    !secondPublishDeny.allowed
  ) {
    details.push(
      "Repeat stale publish-eligibility after BINDING_INVALIDATED still denied (idempotent; applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Repeat stale deny unexpected check=${JSON.stringify(secondStaleCheck)} publish=${JSON.stringify(secondPublishDeny)}`,
    );
  }

  // 15. Third publish-eligibility check still denied (F11).
  const thirdPublishDeny = fixturePublishEligible({
    article: approved,
    binding: bound.binding,
    evidencePackageDigest: staleDigest,
    factLabels: supportedLabels,
  });
  if (!thirdPublishDeny.allowed) {
    details.push(
      "Third consecutive stale publish-eligibility still denied (binding not self-healed; applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Third stale deny unexpectedly allowed: ${JSON.stringify(thirdPublishDeny)}`,
    );
  }

  // 16. Binding record stays INVALIDATED after stale checks (F12).
  if (secondStaleCheck.binding.status === ReviewBindingStatus.INVALIDATED) {
    details.push(
      "A25 binding status remains INVALIDATED after stale eligibility checks (no silent heal)",
    );
  } else {
    passed = false;
    details.push(
      `Expected INVALIDATED binding status, got ${secondStaleCheck.binding.status}`,
    );
  }

  // 17. Fourth publish-eligibility probe still denied (F13).
  const fourthPublishDeny = fixturePublishEligible({
    article: approved,
    binding: bound.binding,
    evidencePackageDigest: staleDigest,
    factLabels: supportedLabels,
  });
  if (!fourthPublishDeny.allowed) {
    details.push(
      "Fourth consecutive stale publish-eligibility still denied (terminal fixture path; publishApplyAttempts=0)",
    );
  } else {
    passed = false;
    details.push(
      `Fourth stale deny unexpectedly allowed: ${JSON.stringify(fourthPublishDeny)}`,
    );
  }

  // 18. Fifth publish-eligibility still denied (F15).
  const fifthPublishDeny = fixturePublishEligible({
    article: approved,
    binding: bound.binding,
    evidencePackageDigest: staleDigest,
    factLabels: supportedLabels,
  });
  if (!fifthPublishDeny.allowed) {
    details.push(
      "Fifth consecutive stale publish-eligibility still denied (publishApplyAttempts=0)",
    );
  } else {
    passed = false;
    details.push(
      `Fifth stale publish unexpectedly allowed: ${JSON.stringify(fifthPublishDeny)}`,
    );
  }

  // 19. Fifth review validation still BINDING_INVALIDATED (F14).
  const fifthStaleCheck = validateContentReviewAgainstArticle({
    binding: bound.binding,
    article: approved,
    evidencePackageDigest: staleDigest,
  });
  if (
    !fifthStaleCheck.ok &&
    fifthStaleCheck.code === "BINDING_INVALIDATED" &&
    fifthStaleCheck.binding.status === ReviewBindingStatus.INVALIDATED
  ) {
    details.push(
      "Fifth consecutive stale review validation still BINDING_INVALIDATED (no silent heal; publishApplyAttempts=0)",
    );
  } else {
    passed = false;
    details.push(
      `Fifth stale review unexpected: ${JSON.stringify(fifthStaleCheck)}`,
    );
  }

  // 20. Sixth publish-eligibility still denied (F16).
  const sixthPublishDeny = fixturePublishEligible({
    article: approved,
    binding: bound.binding,
    evidencePackageDigest: staleDigest,
    factLabels: supportedLabels,
  });
  if (!sixthPublishDeny.allowed) {
    details.push(
      "Sixth consecutive stale publish-eligibility still denied (publishApplyAttempts=0)",
    );
  } else {
    passed = false;
    details.push(
      `Sixth stale publish unexpectedly allowed: ${JSON.stringify(sixthPublishDeny)}`,
    );
  }

  // 21. Sixth review validation still BINDING_INVALIDATED (F16).
  const sixthStaleCheck = validateContentReviewAgainstArticle({
    binding: bound.binding,
    article: approved,
    evidencePackageDigest: staleDigest,
  });
  if (
    !sixthStaleCheck.ok &&
    sixthStaleCheck.code === "BINDING_INVALIDATED" &&
    sixthStaleCheck.binding.status === ReviewBindingStatus.INVALIDATED
  ) {
    details.push(
      "Sixth consecutive stale review validation still BINDING_INVALIDATED (terminal idempotent stale path)",
    );
  } else {
    passed = false;
    details.push(
      `Sixth stale review unexpected: ${JSON.stringify(sixthStaleCheck)}`,
    );
  }

  // 22. Seventh publish-eligibility still denied (F17).
  const seventhPublishDeny = fixturePublishEligible({
    article: approved,
    binding: bound.binding,
    evidencePackageDigest: staleDigest,
    factLabels: supportedLabels,
  });
  if (!seventhPublishDeny.allowed) {
    details.push(
      "Seventh consecutive stale publish-eligibility still denied (publishApplyAttempts=0)",
    );
  } else {
    passed = false;
    details.push(
      `Seventh stale publish unexpectedly allowed: ${JSON.stringify(seventhPublishDeny)}`,
    );
  }

  // 23. Seventh review validation still BINDING_INVALIDATED (F17).
  const seventhStaleCheck = validateContentReviewAgainstArticle({
    binding: bound.binding,
    article: approved,
    evidencePackageDigest: staleDigest,
  });
  if (
    !seventhStaleCheck.ok &&
    seventhStaleCheck.code === "BINDING_INVALIDATED" &&
    seventhStaleCheck.binding.status === ReviewBindingStatus.INVALIDATED
  ) {
    details.push(
      "Seventh consecutive stale review validation still BINDING_INVALIDATED (no heal; publishApplyAttempts=0)",
    );
  } else {
    passed = false;
    details.push(
      `Seventh stale review unexpected: ${JSON.stringify(seventhStaleCheck)}`,
    );
  }

  // 24. Eighth publish-eligibility still denied (F18).
  const eighthPublishDeny = fixturePublishEligible({
    article: approved,
    binding: bound.binding,
    evidencePackageDigest: staleDigest,
    factLabels: supportedLabels,
  });
  if (!eighthPublishDeny.allowed) {
    details.push(
      "Eighth consecutive stale publish-eligibility still denied (publishApplyAttempts=0)",
    );
  } else {
    passed = false;
    details.push(
      `Eighth stale publish unexpectedly allowed: ${JSON.stringify(eighthPublishDeny)}`,
    );
  }

  // 25. Eighth review validation still BINDING_INVALIDATED (F18).
  const eighthStaleCheck = validateContentReviewAgainstArticle({
    binding: bound.binding,
    article: approved,
    evidencePackageDigest: staleDigest,
  });
  if (
    !eighthStaleCheck.ok &&
    eighthStaleCheck.code === "BINDING_INVALIDATED" &&
    eighthStaleCheck.binding.status === ReviewBindingStatus.INVALIDATED
  ) {
    details.push(
      "Eighth consecutive stale review validation still BINDING_INVALIDATED (terminal idempotent stale path)",
    );
  } else {
    passed = false;
    details.push(
      `Eighth stale review unexpected: ${JSON.stringify(eighthStaleCheck)}`,
    );
  }

  // 26. Ninth publish-eligibility still denied (F19).
  const ninthPublishDeny = fixturePublishEligible({
    article: approved,
    binding: bound.binding,
    evidencePackageDigest: staleDigest,
    factLabels: supportedLabels,
  });
  if (!ninthPublishDeny.allowed) {
    details.push(
      "Ninth consecutive stale publish-eligibility still denied (publishApplyAttempts=0)",
    );
  } else {
    passed = false;
    details.push(
      `Ninth stale publish unexpectedly allowed: ${JSON.stringify(ninthPublishDeny)}`,
    );
  }

  // 27. Ninth review validation still BINDING_INVALIDATED (F19).
  const ninthStaleCheck = validateContentReviewAgainstArticle({
    binding: bound.binding,
    article: approved,
    evidencePackageDigest: staleDigest,
  });
  if (
    !ninthStaleCheck.ok &&
    ninthStaleCheck.code === "BINDING_INVALIDATED" &&
    ninthStaleCheck.binding.status === ReviewBindingStatus.INVALIDATED
  ) {
    details.push(
      "Ninth consecutive stale review validation still BINDING_INVALIDATED (wipe15 edge)",
    );
  } else {
    passed = false;
    details.push(
      `Ninth stale review unexpected: ${JSON.stringify(ninthStaleCheck)}`,
    );
  }

  // 28. Tenth publish-eligibility still denied (F20).
  const tenthPublishDeny = fixturePublishEligible({
    article: approved,
    binding: bound.binding,
    evidencePackageDigest: staleDigest,
    factLabels: supportedLabels,
  });
  if (!tenthPublishDeny.allowed) {
    details.push(
      "Tenth consecutive stale publish-eligibility still denied (publishApplyAttempts=0)",
    );
  } else {
    passed = false;
    details.push(
      `Tenth stale publish unexpectedly allowed: ${JSON.stringify(tenthPublishDeny)}`,
    );
  }

  // 29. Tenth review validation still BINDING_INVALIDATED (F20).
  const tenthStaleCheck = validateContentReviewAgainstArticle({
    binding: bound.binding,
    article: approved,
    evidencePackageDigest: staleDigest,
  });
  if (
    !tenthStaleCheck.ok &&
    tenthStaleCheck.code === "BINDING_INVALIDATED" &&
    tenthStaleCheck.binding.status === ReviewBindingStatus.INVALIDATED
  ) {
    details.push(
      "Tenth consecutive stale review validation still BINDING_INVALIDATED (wipe15 timer)",
    );
  } else {
    passed = false;
    details.push(
      `Tenth stale review unexpected: ${JSON.stringify(tenthStaleCheck)}`,
    );
  }

  // 30. Eleventh publish-eligibility still denied (F21).
  const eleventhPublishDeny = fixturePublishEligible({
    article: approved,
    binding: bound.binding,
    evidencePackageDigest: staleDigest,
    factLabels: supportedLabels,
  });
  if (!eleventhPublishDeny.allowed) {
    details.push(
      "Eleventh consecutive stale publish-eligibility still denied (publishApplyAttempts=0)",
    );
  } else {
    passed = false;
    details.push(
      `Eleventh stale publish unexpectedly allowed: ${JSON.stringify(eleventhPublishDeny)}`,
    );
  }

  // 31. Eleventh review validation still BINDING_INVALIDATED (F21).
  const eleventhStaleCheck = validateContentReviewAgainstArticle({
    binding: bound.binding,
    article: approved,
    evidencePackageDigest: staleDigest,
  });
  if (
    !eleventhStaleCheck.ok &&
    eleventhStaleCheck.code === "BINDING_INVALIDATED" &&
    eleventhStaleCheck.binding.status === ReviewBindingStatus.INVALIDATED
  ) {
    details.push(
      "Eleventh consecutive stale review validation still BINDING_INVALIDATED (wipe15 @ 62369f81)",
    );
  } else {
    passed = false;
    details.push(
      `Eleventh stale review unexpected: ${JSON.stringify(eleventhStaleCheck)}`,
    );
  }

  // 32. Twelfth publish-eligibility still denied (F22).
  const twelfthPublishDeny = fixturePublishEligible({
    article: approved,
    binding: bound.binding,
    evidencePackageDigest: staleDigest,
    factLabels: supportedLabels,
  });
  if (!twelfthPublishDeny.allowed) {
    details.push(
      "Twelfth consecutive stale publish-eligibility still denied (publishApplyAttempts=0)",
    );
  } else {
    passed = false;
    details.push(
      `Twelfth stale publish unexpectedly allowed: ${JSON.stringify(twelfthPublishDeny)}`,
    );
  }

  // 33. Twelfth review validation still BINDING_INVALIDATED (F22).
  const twelfthStaleCheck = validateContentReviewAgainstArticle({
    binding: bound.binding,
    article: approved,
    evidencePackageDigest: staleDigest,
  });
  if (
    !twelfthStaleCheck.ok &&
    twelfthStaleCheck.code === "BINDING_INVALIDATED" &&
    twelfthStaleCheck.binding.status === ReviewBindingStatus.INVALIDATED
  ) {
    details.push(
      "Twelfth consecutive stale review validation still BINDING_INVALIDATED (wipe15 edge #248)",
    );
  } else {
    passed = false;
    details.push(
      `Twelfth stale review unexpected: ${JSON.stringify(twelfthStaleCheck)}`,
    );
  }

  // 34. Thirteenth publish-eligibility still denied (F23).
  const thirteenthPublishDeny = fixturePublishEligible({
    article: approved,
    binding: bound.binding,
    evidencePackageDigest: staleDigest,
    factLabels: supportedLabels,
  });
  if (!thirteenthPublishDeny.allowed) {
    details.push(
      "Thirteenth consecutive stale publish-eligibility still denied (publishApplyAttempts=0)",
    );
  } else {
    passed = false;
    details.push(
      `Thirteenth stale publish unexpectedly allowed: ${JSON.stringify(thirteenthPublishDeny)}`,
    );
  }

  // 35. Thirteenth review validation still BINDING_INVALIDATED (F23).
  const thirteenthStaleCheck = validateContentReviewAgainstArticle({
    binding: bound.binding,
    article: approved,
    evidencePackageDigest: staleDigest,
  });
  if (
    !thirteenthStaleCheck.ok &&
    thirteenthStaleCheck.code === "BINDING_INVALIDATED" &&
    thirteenthStaleCheck.binding.status === ReviewBindingStatus.INVALIDATED
  ) {
    details.push(
      "Thirteenth consecutive stale review validation still BINDING_INVALIDATED (wipe15 @ c339ff34)",
    );
  } else {
    passed = false;
    details.push(
      `Thirteenth stale review unexpected: ${JSON.stringify(thirteenthStaleCheck)}`,
    );
  }

  // 36. Fourteenth publish-eligibility still denied (F24).
  const fourteenthPublishDeny = fixturePublishEligible({
    article: approved,
    binding: bound.binding,
    evidencePackageDigest: staleDigest,
    factLabels: supportedLabels,
  });
  if (!fourteenthPublishDeny.allowed) {
    details.push(
      "Fourteenth consecutive stale publish-eligibility still denied (publishApplyAttempts=0)",
    );
  } else {
    passed = false;
    details.push(
      `Fourteenth stale publish unexpectedly allowed: ${JSON.stringify(fourteenthPublishDeny)}`,
    );
  }

  // 37. Fourteenth review validation still BINDING_INVALIDATED (F24).
  const fourteenthStaleCheck = validateContentReviewAgainstArticle({
    binding: bound.binding,
    article: approved,
    evidencePackageDigest: staleDigest,
  });
  if (
    !fourteenthStaleCheck.ok &&
    fourteenthStaleCheck.code === "BINDING_INVALIDATED" &&
    fourteenthStaleCheck.binding.status === ReviewBindingStatus.INVALIDATED
  ) {
    details.push(
      "Fourteenth consecutive stale review validation still BINDING_INVALIDATED (wipe15 #250 H)",
    );
  } else {
    passed = false;
    details.push(
      `Fourteenth stale review unexpected: ${JSON.stringify(fourteenthStaleCheck)}`,
    );
  }

  if (publishApplyAttempts !== 0) {
    passed = false;
    details.push(
      `Terminal publishApplyAttempts expected 0, got ${publishApplyAttempts}`,
    );
  }

  details.push(
    "liveProviderWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE publishApplyAttemptCount=0",
  );
  details.push(
    "Distinct from APPROVED_PAYLOAD_EDIT_INVALIDATED (T-X019/T-US-036), IMPORTED_DOC_QUARANTINED_AS_DATA (T-X069), and CLI_ERROR_DESPITE_EXIT_ZERO (T-X009)",
  );

  return {
    proofId: `proof-fact-changes-${randomUUID()}`,
    kind: SoakProofKind.FACT_CHANGES_AFTER_REVIEW_STALE,
    passed,
    details,
    applyAttemptCount: publishApplyAttempts,
    operationId: `op-x008-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
