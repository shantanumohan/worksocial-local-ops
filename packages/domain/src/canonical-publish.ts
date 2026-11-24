/**
 * M6 / NEXT-17 — canonical article authoring + multi-destination publish.
 *
 * Pure helpers: versioned draft edits, claim/source QA, A25 review binding
 * for content revisions, stable business operation keys, and partial-failure
 * recovery for per-destination distribution. No network I/O.
 * External effects: none (fixture/simulator only). Does not claim R1-complete.
 */

import { createHash } from "node:crypto";
import {
  ArticleStatus,
  DestinationKind,
  digestArticleContent,
  evaluateArticleGate,
  type ArticleStatusValue,
  type CanonicalArticle,
  type DestinationKindValue,
  type FactSupportLookup,
  type PublicationOutcomeValue,
} from "./content.js";
import { SupportLabel } from "./knowledge.js";
import {
  ReviewBindingStatus,
  createReviewBinding,
  validateReviewBinding,
  type ReviewBinding,
} from "./review-binding.js";
import type { EffectProposal } from "./role-runtime.js";

export const CANONICAL_PUBLISH_RELATED_CASE_IDS = [
  "T-C01",
  "T-C02",
  "T-C03",
  "T-C04",
  "T-C05", // versioned draft authoring
  "T-C06", // claim/source QA + A25 binding
  "T-C07", // multi-destination partial failure recovery
] as const;

/** Catalog cases tied to partial-destination per-state honesty (T-X045). */
export const PARTIAL_CAMPAIGN_DESTINATIONS_RELATED_CASE_IDS = [
  "T-X045",
] as const;

export const DistributionRunStatus = {
  PLANNING: "planning",
  IN_PROGRESS: "in_progress",
  PARTIAL: "partial",
  COMPLETE: "complete",
  FAILED: "failed",
  RECOVERING: "recovering",
} as const;

export type DistributionRunStatusValue =
  (typeof DistributionRunStatus)[keyof typeof DistributionRunStatus];

export const DestinationAttemptStatus = {
  PENDING: "pending",
  ACCEPTED_PENDING: "accepted_pending",
  VERIFIED: "verified",
  FAILED: "failed",
  BLOCKED: "blocked",
  SKIPPED: "skipped",
  UNKNOWN_REMOTE: "unknown_remote",
} as const;

export type DestinationAttemptStatusValue =
  (typeof DestinationAttemptStatus)[keyof typeof DestinationAttemptStatus];

export type ClaimSourceRecord = {
  claimId: string;
  factId: string;
  /** Source id / URL / evidence artifact id backing the claim. */
  sourceRef: string;
  statement: string;
};

export type ClaimSourceQaResult = {
  allowed: boolean;
  code: string | null;
  reasons: string[];
  unsupportedFactIds: string[];
  missingSourceClaimIds: string[];
};

export type ContentReviewSnapshot = {
  articleId: string;
  version: number;
  contentDigest: string;
  evidencePackageDigest: string;
  citedFactIds: readonly string[];
};

export type DestinationAttempt = {
  attemptId: string;
  destinationId: string;
  kind: DestinationKindValue;
  variantId: string | null;
  articleId: string | null;
  status: DestinationAttemptStatusValue;
  operationKey: string;
  durableOperationId: string | null;
  gatewayOperationId: string | null;
  receiptId: string | null;
  outcome: PublicationOutcomeValue | null;
  summary: string;
  updatedAtIso: string;
};

export type DistributionRun = {
  runId: string;
  campaignId: string;
  articleId: string;
  status: DistributionRunStatusValue;
  destinationIds: string[];
  attempts: DestinationAttempt[];
  /** Stable business key for the whole run (idempotent retry). */
  businessIdempotencyKey: string;
  fixtureOnly: boolean;
  /** Fixture honesty — domain helpers never wire live providers. */
  liveProviderWiring: "NOT_WIRED";
  externalEffects: "NONE";
  createdAtIso: string;
  updatedAtIso: string;
};

/**
 * Editable article statuses for versioned drafts.
 * Released / verified / failed revisions are immutable — create a new draft.
 */
export const EDITABLE_ARTICLE_STATUSES: ReadonlySet<ArticleStatusValue> =
  new Set([
    ArticleStatus.DRAFT,
    ArticleStatus.READY_FOR_REVIEW,
    ArticleStatus.APPROVED,
    ArticleStatus.REJECTED,
  ]);

function sameIdList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((v, i) => v === right[i]);
}

export function editCanonicalArticle(input: {
  article: CanonicalArticle;
  title?: string;
  body?: string;
  citedFactIds?: string[];
  hypothesisFactIds?: string[];
  nowIso: string;
}):
  | {
      ok: true;
      article: CanonicalArticle;
      digestChanged: boolean;
      /** True when cited/hypothesis facts changed — A25 evidence must rebind. */
      evidenceChanged: boolean;
    }
  | { ok: false; code: string; reasons: string[] } {
  if (!EDITABLE_ARTICLE_STATUSES.has(input.article.status)) {
    return {
      ok: false,
      code: "ARTICLE_NOT_EDITABLE",
      reasons: [
        `Article status ${input.article.status} cannot be edited — create a new draft revision`,
      ],
    };
  }

  const title = (input.title ?? input.article.title).trim();
  const body = (input.body ?? input.article.body).trim();
  if (!title || !body) {
    return {
      ok: false,
      code: "ARTICLE_FIELDS_REQUIRED",
      reasons: ["Edited title and body are required"],
    };
  }

  const nextCited =
    input.citedFactIds !== undefined
      ? [...input.citedFactIds]
      : input.article.citedFactIds;
  const nextHypothesis =
    input.hypothesisFactIds !== undefined
      ? [...input.hypothesisFactIds]
      : input.article.hypothesisFactIds;
  const evidenceChanged =
    !sameIdList(nextCited, input.article.citedFactIds) ||
    !sameIdList(nextHypothesis, input.article.hypothesisFactIds);

  const nextDigest = digestArticleContent(title, body);
  const digestChanged = nextDigest !== input.article.contentDigest;
  const nextVersion =
    digestChanged || evidenceChanged
      ? input.article.version + 1
      : input.article.version;

  // Edits invalidate approval — return to draft (or ready_for_review if only claims change).
  let nextStatus: ArticleStatusValue = input.article.status;
  if (digestChanged) {
    nextStatus = ArticleStatus.DRAFT;
  } else if (evidenceChanged) {
    nextStatus = ArticleStatus.READY_FOR_REVIEW;
  }

  return {
    ok: true,
    digestChanged,
    evidenceChanged,
    article: {
      ...input.article,
      title,
      body,
      contentDigest: nextDigest,
      version: nextVersion,
      citedFactIds: nextCited,
      hypothesisFactIds: nextHypothesis,
      status: nextStatus,
      // Clear release linkage on digest change.
      ...(digestChanged
        ? {
            verifiedCanonicalUrl: null,
            gatewayOperationId: null,
            writePathId: null,
          }
        : {}),
      updatedAtIso: input.nowIso,
    },
  };
}

/**
 * Claim/source QA: every released claim must cite a SUPPORTED fact and name a source.
 */
export function evaluateClaimSourceQa(input: {
  article: CanonicalArticle;
  claims: ClaimSourceRecord[];
  factLabels: FactSupportLookup;
  /** Optional factId → known source refs from the knowledge registry. */
  factSources?: ReadonlyMap<string, readonly string[]>;
}): ClaimSourceQaResult {
  const reasons: string[] = [];
  const unsupportedFactIds: string[] = [];
  const missingSourceClaimIds: string[] = [];

  const factGate = evaluateArticleGate({
    article: input.article,
    factLabels: input.factLabels,
  });
  if (!factGate.allowed) {
    reasons.push(...factGate.reasons);
  }

  if (input.claims.length === 0 && input.article.citedFactIds.length > 0) {
    reasons.push(
      "Cited facts require claim/source records before independent review",
    );
  }

  for (const claim of input.claims) {
    if (!claim.claimId.trim() || !claim.statement.trim()) {
      reasons.push(`Claim ${claim.claimId || "(empty)"} missing identity/statement`);
      continue;
    }
    if (!claim.sourceRef.trim()) {
      missingSourceClaimIds.push(claim.claimId);
      reasons.push(`Claim ${claim.claimId} missing sourceRef`);
      continue;
    }
    const label = input.factLabels.get(claim.factId);
    if (!label) {
      unsupportedFactIds.push(claim.factId);
      reasons.push(`Claim ${claim.claimId} cites unknown fact ${claim.factId}`);
    } else if (label !== SupportLabel.SUPPORTED) {
      unsupportedFactIds.push(claim.factId);
      reasons.push(
        `Claim ${claim.claimId} cites ${claim.factId} labeled ${label} — only SUPPORTED`,
      );
    }
    if (input.factSources) {
      const known = input.factSources.get(claim.factId);
      if (known && known.length > 0 && !known.includes(claim.sourceRef)) {
        reasons.push(
          `Claim ${claim.claimId} sourceRef is not registered for fact ${claim.factId}`,
        );
      }
    }
    if (!input.article.citedFactIds.includes(claim.factId)) {
      reasons.push(
        `Claim ${claim.claimId} fact ${claim.factId} is not listed on the article citedFactIds`,
      );
    }
  }

  // Every cited fact must appear in at least one claim when claims are supplied.
  if (input.claims.length > 0) {
    const claimedFacts = new Set(input.claims.map((c) => c.factId));
    for (const factId of input.article.citedFactIds) {
      if (!claimedFacts.has(factId)) {
        reasons.push(`Cited fact ${factId} has no claim/source record`);
      }
    }
  }

  if (reasons.length > 0) {
    return {
      allowed: false,
      code: "CLAIM_SOURCE_QA_FAILED",
      reasons,
      unsupportedFactIds: [...new Set(unsupportedFactIds)],
      missingSourceClaimIds: [...new Set(missingSourceClaimIds)],
    };
  }
  return {
    allowed: true,
    code: null,
    reasons: ["Claim/source QA passed — SUPPORTED facts with sources"],
    unsupportedFactIds: [],
    missingSourceClaimIds: [],
  };
}

export function digestContentEvidencePackage(input: {
  articleId: string;
  contentDigest: string;
  version: number;
  citedFactIds: readonly string[];
  claimIds: readonly string[];
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        articleId: input.articleId,
        contentDigest: input.contentDigest,
        version: input.version,
        citedFactIds: [...input.citedFactIds].sort(),
        claimIds: [...input.claimIds].sort(),
      }),
    )
    .digest("hex");
}

/**
 * Bind A25 independent review to the exact article revision + evidence package.
 * Reuses M3 review-binding invariants (self-approval forbidden; edit invalidates).
 */
export function bindContentIndependentReview(input: {
  bindingId: string;
  proposal: EffectProposal;
  snapshot: ContentReviewSnapshot;
  createdAtIso: string;
}):
  | { ok: true; binding: ReviewBinding }
  | { ok: false; code: string; reason: string } {
  if (input.proposal.assetId !== input.snapshot.articleId) {
    return {
      ok: false,
      code: "BINDING_ASSET_MISMATCH",
      reason: "Effect proposal assetId must equal articleId",
    };
  }
  if (input.proposal.payloadDigest !== input.snapshot.contentDigest) {
    return {
      ok: false,
      code: "BINDING_DIGEST_MISMATCH",
      reason: "Effect proposal payloadDigest must equal article contentDigest",
    };
  }
  return createReviewBinding({
    bindingId: input.bindingId,
    proposal: input.proposal,
    proposalArtifactId: input.snapshot.articleId,
    proposalRevision: `v${input.snapshot.version}`,
    proposalChecksum: input.snapshot.contentDigest,
    evidencePackageDigest: input.snapshot.evidencePackageDigest,
    evidenceArtifactIds: [...input.proposal.evidenceArtifactIds],
    createdAtIso: input.createdAtIso,
  });
}

export function validateContentReviewAgainstArticle(input: {
  binding: ReviewBinding;
  article: CanonicalArticle;
  evidencePackageDigest: string;
}):
  | { ok: true; binding: ReviewBinding }
  | {
      ok: false;
      code: string;
      reason: string;
      binding: ReviewBinding;
    } {
  return validateReviewBinding(input.binding, {
    proposalArtifactId: input.article.articleId,
    proposalRevision: `v${input.article.version}`,
    proposalChecksum: input.article.contentDigest,
    evidencePackageDigest: input.evidencePackageDigest,
  });
}

/**
 * Stable business operation keys for content effects (M2 durable accept).
 * Format is deterministic so retries do not create duplicate provider effects.
 */
export function stableContentOperationKey(input: {
  kind: "canonical" | "variant" | "distribution";
  campaignId: string;
  articleId: string;
  destinationId?: string;
  /** Sorted destination set for distribution-run keys (required for kind=distribution). */
  destinationIds?: readonly string[];
  contentDigest: string;
  version: number;
}): string {
  const dest =
    input.kind === "distribution"
      ? [...(input.destinationIds ?? [])].sort().join("+") || "none"
      : (input.destinationId ?? "owned-site");
  return [
    "biz-content",
    input.kind,
    input.campaignId,
    input.articleId,
    dest,
    `v${input.version}`,
    input.contentDigest.slice(0, 16),
  ].join(":");
}

export function stableGatewayOperationId(input: {
  destinationId: string;
  articleId: string;
  contentDigest: string;
  version: number;
}): string {
  const material = [
    input.destinationId,
    input.articleId,
    input.contentDigest,
    String(input.version),
  ].join("|");
  const short = createHash("sha256").update(material).digest("hex").slice(0, 20);
  return `content-op-${input.destinationId}-${short}`;
}

export function createDistributionRun(input: {
  runId: string;
  campaignId: string;
  articleId: string;
  destinationIds: string[];
  businessIdempotencyKey: string;
  fixtureOnly: boolean;
  createdAtIso: string;
}): DistributionRun {
  return {
    runId: input.runId,
    campaignId: input.campaignId,
    articleId: input.articleId,
    status: DistributionRunStatus.PLANNING,
    destinationIds: [...input.destinationIds],
    attempts: [],
    businessIdempotencyKey: input.businessIdempotencyKey,
    fixtureOnly: input.fixtureOnly,
    liveProviderWiring: "NOT_WIRED",
    externalEffects: "NONE",
    createdAtIso: input.createdAtIso,
    updatedAtIso: input.createdAtIso,
  };
}

export function upsertDestinationAttempt(
  run: DistributionRun,
  attempt: DestinationAttempt,
): DistributionRun {
  const others = run.attempts.filter(
    (a) => a.destinationId !== attempt.destinationId,
  );
  const attempts = [...others, attempt];
  return {
    ...run,
    attempts,
    updatedAtIso: attempt.updatedAtIso,
    status: deriveDistributionStatus(attempts, run.destinationIds),
  };
}

export function deriveDistributionStatus(
  attempts: readonly DestinationAttempt[],
  destinationIds: readonly string[],
): DistributionRunStatusValue {
  if (attempts.length === 0) return DistributionRunStatus.PLANNING;

  const byDest = new Map(attempts.map((a) => [a.destinationId, a]));
  let verified = 0;
  let failed = 0;
  let pending = 0;
  let unknown = 0;
  let blocked = 0;

  for (const destId of destinationIds) {
    const attempt = byDest.get(destId);
    if (!attempt || attempt.status === DestinationAttemptStatus.PENDING) {
      pending += 1;
      continue;
    }
    if (attempt.status === DestinationAttemptStatus.VERIFIED) verified += 1;
    else if (attempt.status === DestinationAttemptStatus.FAILED) failed += 1;
    else if (attempt.status === DestinationAttemptStatus.UNKNOWN_REMOTE)
      unknown += 1;
    else if (attempt.status === DestinationAttemptStatus.BLOCKED) blocked += 1;
    else if (attempt.status === DestinationAttemptStatus.ACCEPTED_PENDING)
      pending += 1;
    else if (attempt.status === DestinationAttemptStatus.SKIPPED) verified += 1;
  }

  if (unknown > 0 || (failed > 0 && verified > 0) || (blocked > 0 && verified > 0)) {
    return DistributionRunStatus.PARTIAL;
  }
  if (failed > 0 && verified === 0 && pending === 0) {
    return DistributionRunStatus.FAILED;
  }
  if (verified === destinationIds.length) {
    return DistributionRunStatus.COMPLETE;
  }
  if (pending > 0 || attempts.some((a) => a.status === DestinationAttemptStatus.ACCEPTED_PENDING)) {
    return DistributionRunStatus.IN_PROGRESS;
  }
  return DistributionRunStatus.PARTIAL;
}

/**
 * Safe recovery: only unfinished / failed / unknown destinations are eligible.
 * Verified destinations are never re-applied (no duplicate effects).
 */
export function listRecoverableDestinations(
  run: DistributionRun,
): DestinationAttempt[] {
  return run.attempts.filter(
    (a) =>
      a.status === DestinationAttemptStatus.FAILED ||
      a.status === DestinationAttemptStatus.UNKNOWN_REMOTE ||
      a.status === DestinationAttemptStatus.BLOCKED ||
      a.status === DestinationAttemptStatus.ACCEPTED_PENDING ||
      a.status === DestinationAttemptStatus.PENDING,
  );
}

/**
 * Hillclimb suite (T-X045): mixed per-destination states → PARTIAL;
 * recoverable = unfinished only; ACCEPTED_PENDING ≠ VERIFIED; all-failed
 * stays FAILED; every run carries liveProviderWiring=NOT_WIRED.
 */
export function evaluatePartialCampaignDestinationsAttackSuite(input: {
  nowIso: string;
}): {
  passed: boolean;
  details: string[];
  runs: DistributionRun[];
} {
  const details: string[] = [];
  const runs: DistributionRun[] = [];
  let passed = true;
  const nowIso = input.nowIso;
  const articleId = "art-suite-x045";
  const campaignId = "camp-suite-x045";

  let mixed = createDistributionRun({
    runId: "run-suite-mixed",
    campaignId,
    articleId,
    destinationIds: ["dest-cms", "dest-gbp", "dest-linkedin"],
    businessIdempotencyKey: "biz-suite-mixed",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  mixed = upsertDestinationAttempt(mixed, {
    attemptId: "s-cms",
    destinationId: "dest-cms",
    kind: DestinationKind.CMS,
    variantId: null,
    articleId,
    status: DestinationAttemptStatus.VERIFIED,
    operationKey: "suite:cms",
    durableOperationId: "dur-cms",
    gatewayOperationId: "gw-cms",
    receiptId: "rcpt-cms",
    outcome: "PUBLISHED_VERIFIED",
    summary: "cms verified",
    updatedAtIso: nowIso,
  });
  mixed = upsertDestinationAttempt(mixed, {
    attemptId: "s-gbp",
    destinationId: "dest-gbp",
    kind: DestinationKind.GBP,
    variantId: "var-gbp",
    articleId,
    status: DestinationAttemptStatus.FAILED,
    operationKey: "suite:gbp",
    durableOperationId: null,
    gatewayOperationId: "gw-gbp",
    receiptId: "rcpt-gbp",
    outcome: "FAILED",
    summary: "gbp failed",
    updatedAtIso: nowIso,
  });
  mixed = upsertDestinationAttempt(mixed, {
    attemptId: "s-li",
    destinationId: "dest-linkedin",
    kind: DestinationKind.LINKEDIN,
    variantId: "var-li",
    articleId,
    status: DestinationAttemptStatus.UNKNOWN_REMOTE,
    operationKey: "suite:li",
    durableOperationId: "dur-li",
    gatewayOperationId: "gw-li",
    receiptId: null,
    outcome: "UNKNOWN_REMOTE_OUTCOME",
    summary: "linkedin unknown",
    updatedAtIso: nowIso,
  });
  runs.push(mixed);

  if (
    mixed.status === DistributionRunStatus.PARTIAL &&
    mixed.liveProviderWiring === "NOT_WIRED" &&
    mixed.externalEffects === "NONE"
  ) {
    details.push(
      "Mixed VERIFIED+FAILED+UNKNOWN_REMOTE → PARTIAL with NOT_WIRED honesty",
    );
  } else {
    passed = false;
    details.push(`mixed unexpectedly status=${mixed.status} wiring=${mixed.liveProviderWiring}`);
  }

  const recoverable = listRecoverableDestinations(mixed).map((a) => a.destinationId);
  if (
    recoverable.length === 2 &&
    recoverable.includes("dest-gbp") &&
    recoverable.includes("dest-linkedin") &&
    !recoverable.includes("dest-cms")
  ) {
    details.push(
      "Recoverable destinations = unfinished only; verified cms not re-applied",
    );
  } else {
    passed = false;
    details.push(`recoverable unexpected: ${recoverable.join(",")}`);
  }

  let pendingPeer = createDistributionRun({
    runId: "run-suite-pending",
    campaignId,
    articleId,
    destinationIds: ["dest-cms", "dest-gbp"],
    businessIdempotencyKey: "biz-suite-pending",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  pendingPeer = upsertDestinationAttempt(pendingPeer, {
    attemptId: "p-cms",
    destinationId: "dest-cms",
    kind: DestinationKind.CMS,
    variantId: null,
    articleId,
    status: DestinationAttemptStatus.VERIFIED,
    operationKey: "suite:cms2",
    durableOperationId: "dur-cms2",
    gatewayOperationId: "gw-cms2",
    receiptId: "rcpt-cms2",
    outcome: "PUBLISHED_VERIFIED",
    summary: "cms verified",
    updatedAtIso: nowIso,
  });
  pendingPeer = upsertDestinationAttempt(pendingPeer, {
    attemptId: "p-gbp",
    destinationId: "dest-gbp",
    kind: DestinationKind.GBP,
    variantId: "var-gbp2",
    articleId,
    status: DestinationAttemptStatus.ACCEPTED_PENDING,
    operationKey: "suite:gbp2",
    durableOperationId: null,
    gatewayOperationId: "gw-gbp2",
    receiptId: "rcpt-gbp2",
    outcome: "ACCEPTED_PENDING",
    summary: "gbp accepted pending ≠ verified",
    updatedAtIso: nowIso,
  });
  runs.push(pendingPeer);
  if (
    pendingPeer.status === DistributionRunStatus.IN_PROGRESS &&
    pendingPeer.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "ACCEPTED_PENDING kept distinct from VERIFIED; run stays IN_PROGRESS (not COMPLETE)",
    );
  } else {
    passed = false;
    details.push(`pendingPeer unexpectedly status=${pendingPeer.status}`);
  }

  let allFailed = createDistributionRun({
    runId: "run-suite-failed",
    campaignId,
    articleId,
    destinationIds: ["dest-cms", "dest-gbp"],
    businessIdempotencyKey: "biz-suite-failed",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  for (const destId of ["dest-cms", "dest-gbp"] as const) {
    allFailed = upsertDestinationAttempt(allFailed, {
      attemptId: `f-${destId}`,
      destinationId: destId,
      kind: destId === "dest-cms" ? DestinationKind.CMS : DestinationKind.GBP,
      variantId: null,
      articleId,
      status: DestinationAttemptStatus.FAILED,
      operationKey: `suite:fail:${destId}`,
      durableOperationId: null,
      gatewayOperationId: null,
      receiptId: null,
      outcome: "FAILED",
      summary: "failed",
      updatedAtIso: nowIso,
    });
  }
  runs.push(allFailed);
  if (
    allFailed.status === DistributionRunStatus.FAILED &&
    allFailed.externalEffects === "NONE"
  ) {
    details.push("All-destination FAILED → DistributionRunStatus.FAILED (honest)");
  } else {
    passed = false;
    details.push(`allFailed unexpectedly status=${allFailed.status}`);
  }

  // BLOCKED + VERIFIED peer also yields PARTIAL (not COMPLETE).
  let blockedPeer = createDistributionRun({
    runId: "run-suite-blocked",
    campaignId,
    articleId,
    destinationIds: ["dest-cms", "dest-gbp"],
    businessIdempotencyKey: "biz-suite-blocked",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  blockedPeer = upsertDestinationAttempt(blockedPeer, {
    attemptId: "b-cms",
    destinationId: "dest-cms",
    kind: DestinationKind.CMS,
    variantId: null,
    articleId,
    status: DestinationAttemptStatus.VERIFIED,
    operationKey: "suite:b-cms",
    durableOperationId: "dur-b-cms",
    gatewayOperationId: "gw-b-cms",
    receiptId: "rcpt-b-cms",
    outcome: "PUBLISHED_VERIFIED",
    summary: "cms verified",
    updatedAtIso: nowIso,
  });
  blockedPeer = upsertDestinationAttempt(blockedPeer, {
    attemptId: "b-gbp",
    destinationId: "dest-gbp",
    kind: DestinationKind.GBP,
    variantId: null,
    articleId,
    status: DestinationAttemptStatus.BLOCKED,
    operationKey: "suite:b-gbp",
    durableOperationId: null,
    gatewayOperationId: null,
    receiptId: null,
    outcome: "BLOCKED",
    summary: "gbp blocked",
    updatedAtIso: nowIso,
  });
  runs.push(blockedPeer);
  const blockedRecoverable = listRecoverableDestinations(blockedPeer).map(
    (a) => a.destinationId,
  );
  if (
    blockedPeer.status === DistributionRunStatus.PARTIAL &&
    blockedRecoverable.includes("dest-gbp") &&
    !blockedRecoverable.includes("dest-cms")
  ) {
    details.push(
      "BLOCKED+VERIFIED → PARTIAL; only blocked destination recoverable",
    );
  } else {
    passed = false;
    details.push(
      `blockedPeer unexpectedly status=${blockedPeer.status} recoverable=${blockedRecoverable.join(",")}`,
    );
  }

  if (passed) {
    details.push(
      "liveProviderWiring=NOT_WIRED externalEffects=NONE on every partial-destination path",
    );
  }

  return { passed, details, runs };
}

export function contentReviewStillBound(binding: ReviewBinding): boolean {
  return binding.status === ReviewBindingStatus.BOUND;
}
