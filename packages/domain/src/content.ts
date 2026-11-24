/**
 * R1-08 Content and distribution: article pipeline, destination variants,
 * destination registry, and gateway-gated publication receipts.
 *
 * Pure types + validators. No network I/O.
 * Released claims cite SUPPORTED facts only — never HYPOTHESIS as truth.
 * Acceptance ≠ verified. Live GBP / social / CMS adapters remain NOT_WIRED
 * without owner credentials; fixture adapters may produce receipts.
 */

import { createHash } from "node:crypto";
import {
  AdapterWiring,
  OutcomeEvidenceSource,
  OutcomeLabel,
  recordWritePathOutcome,
  type AdapterWiringValue,
  type OutcomeEvidenceSourceValue,
  type OutcomeLabelValue,
  type WritePathOutcomeEvidence,
} from "./production-mapping.js";
import { SupportLabel, type SupportLabelValue } from "./knowledge.js";

/** Destination channel kinds (v3 §14 destination matrix). */
export const DestinationKind = {
  CMS: "cms",
  GBP: "gbp",
  LINKEDIN: "linkedin",
  FACEBOOK: "facebook",
  INSTAGRAM: "instagram",
  OTHER_BLOG: "other_blog",
  DIRECTORY: "directory",
  CHATGPT_HUB: "chatgpt_hub",
} as const;

export type DestinationKindValue =
  (typeof DestinationKind)[keyof typeof DestinationKind];

/** Supported content formats per destination. */
export const ContentFormat = {
  FULL_ARTICLE: "full_article",
  SHORT_UPDATE: "short_update",
  IMAGE_CAPTION: "image_caption",
  OFFER: "offer",
  PROFILE_FACT: "profile_fact",
  EVENT: "event",
} as const;

export type ContentFormatValue =
  (typeof ContentFormat)[keyof typeof ContentFormat];

/** Per-destination publication outcome (v3 §14). */
export const PublicationOutcome = {
  PUBLISHED_VERIFIED: "PUBLISHED_VERIFIED",
  ACCEPTED_PENDING: "ACCEPTED_PENDING",
  /** Attempt blocked (e.g. stop-switch) — approved revision kept; resumable. */
  BLOCKED: "BLOCKED",
  FAILED: "FAILED",
  UNKNOWN_REMOTE_OUTCOME: "UNKNOWN_REMOTE_OUTCOME",
  NEEDS_REAUTH: "NEEDS_REAUTH",
  UNSUPPORTED_ACTION: "UNSUPPORTED_ACTION",
} as const;

export type PublicationOutcomeValue =
  (typeof PublicationOutcome)[keyof typeof PublicationOutcome];

export const ArticleStatus = {
  DRAFT: "draft",
  READY_FOR_REVIEW: "ready_for_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  RELEASED_PENDING: "released_pending",
  VERIFIED: "verified",
  FAILED: "failed",
} as const;

export type ArticleStatusValue =
  (typeof ArticleStatus)[keyof typeof ArticleStatus];

export const CONTENT_CREATABLE_STATUSES: ReadonlySet<ArticleStatusValue> =
  new Set([ArticleStatus.DRAFT, ArticleStatus.READY_FOR_REVIEW]);

export const CampaignStatus = {
  BRIEF: "brief",
  DRAFTING: "drafting",
  READY: "ready",
  DISTRIBUTING: "distributing",
  COMPLETE: "complete",
  BLOCKED: "blocked",
} as const;

export type CampaignStatusValue =
  (typeof CampaignStatus)[keyof typeof CampaignStatus];

export const VariantStatus = {
  DRAFT: "draft",
  READY: "ready",
  BLOCKED: "blocked",
  QUEUED: "queued",
  RELEASED_PENDING: "released_pending",
  VERIFIED: "verified",
  FAILED: "failed",
  SKIPPED: "skipped",
} as const;

export type VariantStatusValue =
  (typeof VariantStatus)[keyof typeof VariantStatus];

export const AdapterLiveStatus = {
  NOT_WIRED: "NOT_WIRED",
  FIXTURE: "FIXTURE",
} as const;

export type AdapterLiveStatusValue =
  (typeof AdapterLiveStatus)[keyof typeof AdapterLiveStatus];

/** Destination registry controls formats, eligibility, limits (v3 §14). */
export type DestinationRegistryEntry = {
  destinationId: string;
  kind: DestinationKindValue;
  displayName: string;
  channelId: string;
  /** Formats this destination accepts. */
  allowedFormats: ContentFormatValue[];
  /** Max body characters (short updates enforce this). */
  maxBodyChars: number | null;
  /** Whether a verified canonical owned-site URL is required first. */
  requiresCanonicalUrl: boolean;
  /** Live adapter wiring — honest NOT_WIRED until credentials exist. */
  liveWiring: AdapterLiveStatusValue;
  /** Fixture adapter available for offline receipts. */
  fixtureAvailable: boolean;
  locationRelevant: boolean;
  notes: string;
};

export type ContentBrief = {
  briefId: string;
  audienceNeed: string;
  practicalValue: string;
  intendedAction: string;
  sourceFactIds: string[];
  createdAtIso: string;
};

export type ContentCampaign = {
  campaignId: string;
  title: string;
  topic: string;
  brief: ContentBrief;
  status: CampaignStatusValue;
  /** Canonical article id once drafted. */
  canonicalArticleId: string | null;
  /** Destination ids selected for this campaign. */
  destinationIds: string[];
  fixtureOnly: boolean;
  createdAtIso: string;
  updatedAtIso: string;
};

export type CanonicalArticle = {
  articleId: string;
  campaignId: string;
  title: string;
  body: string;
  /** Digest of title+body — invalidates approval when content changes. */
  contentDigest: string;
  version: number;
  /** Authoritative author identity — QA cannot spoof this from the request body. */
  authorId: string;
  citedFactIds: string[];
  hypothesisFactIds: string[];
  status: ArticleStatusValue;
  /** Public URL after verified CMS publish — dependents wait for this. */
  verifiedCanonicalUrl: string | null;
  fixtureOnly: boolean;
  gatewayOperationId: string | null;
  writePathId: string | null;
  createdAtIso: string;
  updatedAtIso: string;
};

export type DestinationVariant = {
  variantId: string;
  campaignId: string;
  articleId: string;
  destinationId: string;
  kind: DestinationKindValue;
  format: ContentFormatValue;
  title: string;
  body: string;
  /** Digest of this variant's title+body — independent of the article digest. */
  contentDigest: string;
  /** Claims cited by this variant — must be SUPPORTED before pending release. */
  citedFactIds: string[];
  /** Bound to the article contentDigest at creation — stale if article changes. */
  articleContentDigest: string;
  status: VariantStatusValue;
  fixtureOnly: boolean;
  gatewayOperationId: string | null;
  writePathId: string | null;
  remoteId: string | null;
  createdAtIso: string;
  updatedAtIso: string;
};

export type PublicationReceipt = {
  receiptId: string;
  campaignId: string;
  articleId: string | null;
  variantId: string | null;
  destinationId: string;
  kind: DestinationKindValue;
  outcome: PublicationOutcomeValue;
  /** Provider / fixture remote identifier when known. */
  remoteId: string | null;
  gatewayOperationId: string | null;
  writePathId: string | null;
  summary: string;
  fixtureOnly: boolean;
  liveWiring: AdapterLiveStatusValue;
  recordedAtIso: string;
};

/**
 * Independent QA verdict — author cannot self-approve.
 * Approval requires a matching approved verdict for the current contentDigest.
 */
export type ArticleQaVerdict = {
  verdictId: string;
  articleId: string;
  authorId: string;
  reviewerId: string;
  approved: boolean;
  contentDigest: string;
  summary: string;
  decidedAtIso: string;
};

/**
 * Per-variant independent review — binds to the variant contentDigest so
 * unsupported claims cannot reach pending release on article approval alone.
 */
export type VariantQaVerdict = {
  verdictId: string;
  variantId: string;
  articleId: string;
  authorId: string;
  reviewerId: string;
  approved: boolean;
  contentDigest: string;
  citedFactIds: string[];
  summary: string;
  decidedAtIso: string;
};

export type ContentClaimBundle = {
  articleId: string;
  contentDigest: string;
  claims: Array<{
    claimId: string;
    factId: string;
    sourceRef: string;
    statement: string;
  }>;
  recordedAtIso: string;
};

export type ContentReviewBindingRecord = {
  bindingId: string;
  articleId: string;
  contentDigest: string;
  version: number;
  evidencePackageDigest: string;
  proposalId: string;
  authorRoleId: string;
  reviewerRoleId: "A25";
  status: string;
  bindingJson: Record<string, unknown>;
  createdAtIso: string;
  updatedAtIso: string;
};

export type ContentDistributionRunRecord = {
  runId: string;
  campaignId: string;
  articleId: string;
  status: string;
  destinationIds: string[];
  attempts: Array<Record<string, unknown>>;
  businessIdempotencyKey: string;
  fixtureOnly: boolean;
  /** Fixture honesty — persisted with the run (never live-wired). */
  liveProviderWiring: "NOT_WIRED";
  externalEffects: "NONE";
  createdAtIso: string;
  updatedAtIso: string;
};

export type ContentState = {
  version: 1;
  updatedAtIso: string;
  destinations: DestinationRegistryEntry[];
  campaigns: ContentCampaign[];
  articles: CanonicalArticle[];
  variants: DestinationVariant[];
  receipts: PublicationReceipt[];
  qaVerdicts: ArticleQaVerdict[];
  variantQaVerdicts: VariantQaVerdict[];
  /** Verified distribution SUCCESS/FAILURE outcomes for learning-worker. */
  releaseOutcomes: WritePathOutcomeEvidence[];
  /** Durable fixture remote ledgers for independent read-back (survive restart). */
  fixtureCanonicalLedger: Record<string, Record<string, string>>;
  fixtureVariantLedger: Record<string, Record<string, string>>;
  /** M6 claim/source bundles keyed by articleId (latest digest wins). */
  claimBundles: ContentClaimBundle[];
  /** M6 A25 review bindings for canonical revisions. */
  reviewBindings: ContentReviewBindingRecord[];
  /** M6 multi-destination distribution runs with partial-failure tracking. */
  distributionRuns: ContentDistributionRunRecord[];
  liveCmsPublishWiring: "NOT_WIRED";
  liveGbpWiring: "NOT_WIRED";
  liveSocialWiring: "NOT_WIRED";
};

export function emptyContentState(nowIso: string): ContentState {
  return {
    version: 1,
    updatedAtIso: nowIso,
    destinations: [],
    campaigns: [],
    articles: [],
    variants: [],
    receipts: [],
    qaVerdicts: [],
    variantQaVerdicts: [],
    releaseOutcomes: [],
    fixtureCanonicalLedger: {},
    fixtureVariantLedger: {},
    claimBundles: [],
    reviewBindings: [],
    distributionRuns: [],
    liveCmsPublishWiring: "NOT_WIRED",
    liveGbpWiring: "NOT_WIRED",
    liveSocialWiring: "NOT_WIRED",
  };
}

export function digestArticleContent(title: string, body: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ title: title.trim(), body: body.trim() }))
    .digest("hex");
}

/** Default destination registry for R1-08. */
export function defaultDestinationRegistry(): DestinationRegistryEntry[] {
  return [
    {
      destinationId: "dest-cms",
      kind: DestinationKind.CMS,
      displayName: "Owned CMS / blog",
      channelId: "owned-site",
      allowedFormats: [ContentFormat.FULL_ARTICLE],
      maxBodyChars: null,
      requiresCanonicalUrl: false,
      liveWiring: AdapterLiveStatus.NOT_WIRED,
      fixtureAvailable: true,
      locationRelevant: false,
      notes:
        "Canonical owned-site article. Live CMS publish NOT_WIRED; fixture release + read-back only.",
    },
    {
      destinationId: "dest-gbp",
      kind: DestinationKind.GBP,
      displayName: "Google Business Profile",
      channelId: "gbp",
      allowedFormats: [
        ContentFormat.SHORT_UPDATE,
        ContentFormat.OFFER,
        ContentFormat.EVENT,
        ContentFormat.PROFILE_FACT,
      ],
      maxBodyChars: 1500,
      requiresCanonicalUrl: true,
      liveWiring: AdapterLiveStatus.NOT_WIRED,
      fixtureAvailable: true,
      locationRelevant: true,
      notes:
        "Location-specific updates. Live GBP API NOT_WIRED without ownership + credentials.",
    },
    {
      destinationId: "dest-linkedin",
      kind: DestinationKind.LINKEDIN,
      displayName: "LinkedIn organization",
      channelId: "linkedin",
      allowedFormats: [ContentFormat.SHORT_UPDATE, ContentFormat.FULL_ARTICLE],
      maxBodyChars: 3000,
      requiresCanonicalUrl: true,
      liveWiring: AdapterLiveStatus.NOT_WIRED,
      fixtureAvailable: true,
      locationRelevant: false,
      notes:
        "Organic org posts + article links. Live LinkedIn NOT_WIRED without org role + credentials.",
    },
    {
      destinationId: "dest-facebook",
      kind: DestinationKind.FACEBOOK,
      displayName: "Facebook Page",
      channelId: "facebook",
      allowedFormats: [
        ContentFormat.SHORT_UPDATE,
        ContentFormat.IMAGE_CAPTION,
        ContentFormat.OFFER,
      ],
      maxBodyChars: 2000,
      requiresCanonicalUrl: true,
      liveWiring: AdapterLiveStatus.NOT_WIRED,
      fixtureAvailable: true,
      locationRelevant: false,
      notes:
        "Page posts where authorized. Live Facebook NOT_WIRED without app review/scopes.",
    },
  ];
}

export type FactSupportLookup = ReadonlyMap<string, SupportLabelValue>;

export function createContentBrief(input: {
  briefId: string;
  audienceNeed: string;
  practicalValue: string;
  intendedAction: string;
  sourceFactIds?: string[];
  createdAtIso: string;
}): ContentBrief {
  return {
    briefId: input.briefId,
    audienceNeed: input.audienceNeed.trim(),
    practicalValue: input.practicalValue.trim(),
    intendedAction: input.intendedAction.trim(),
    sourceFactIds: [...(input.sourceFactIds ?? [])],
    createdAtIso: input.createdAtIso,
  };
}

export function createContentCampaign(input: {
  campaignId: string;
  title: string;
  topic: string;
  brief: ContentBrief;
  destinationIds?: string[];
  fixtureOnly: boolean;
  createdAtIso: string;
  status?: CampaignStatusValue;
}): ContentCampaign {
  return {
    campaignId: input.campaignId,
    title: input.title.trim(),
    topic: input.topic.trim(),
    brief: input.brief,
    status: input.status ?? CampaignStatus.BRIEF,
    canonicalArticleId: null,
    destinationIds: [...(input.destinationIds ?? ["dest-cms"])],
    fixtureOnly: input.fixtureOnly,
    createdAtIso: input.createdAtIso,
    updatedAtIso: input.createdAtIso,
  };
}

export function createCanonicalArticle(input: {
  articleId: string;
  campaignId: string;
  title: string;
  body: string;
  authorId: string;
  citedFactIds?: string[];
  hypothesisFactIds?: string[];
  fixtureOnly: boolean;
  createdAtIso: string;
  version?: number;
  status?: ArticleStatusValue;
}): CanonicalArticle {
  const title = input.title.trim();
  const body = input.body.trim();
  const authorId = input.authorId.trim();
  const requested = input.status ?? ArticleStatus.DRAFT;
  const status = CONTENT_CREATABLE_STATUSES.has(requested)
    ? requested
    : ArticleStatus.DRAFT;
  return {
    articleId: input.articleId,
    campaignId: input.campaignId,
    title,
    body,
    contentDigest: digestArticleContent(title, body),
    version: input.version ?? 1,
    authorId: authorId || "unknown-author",
    citedFactIds: [...(input.citedFactIds ?? [])],
    hypothesisFactIds: [...(input.hypothesisFactIds ?? [])],
    status,
    verifiedCanonicalUrl: null,
    fixtureOnly: input.fixtureOnly,
    gatewayOperationId: null,
    writePathId: null,
    createdAtIso: input.createdAtIso,
    updatedAtIso: input.createdAtIso,
  };
}

/**
 * Gate article review/release: cited facts must be SUPPORTED;
 * hypotheses cannot also be citations.
 */
export function evaluateArticleGate(input: {
  article: CanonicalArticle;
  factLabels: FactSupportLookup;
}): { allowed: boolean; code: string | null; reasons: string[] } {
  const reasons: string[] = [];

  if (!input.article.title.trim() || !input.article.body.trim()) {
    reasons.push("Article title and body are required");
  }

  for (const factId of input.article.citedFactIds) {
    const label = input.factLabels.get(factId);
    if (!label) {
      reasons.push(`Cited fact ${factId} missing from registry`);
    } else if (label !== SupportLabel.SUPPORTED) {
      reasons.push(
        `Cited fact ${factId} is ${label} — only SUPPORTED facts may back released claims`,
      );
    }
  }

  for (const factId of input.article.hypothesisFactIds) {
    if (input.article.citedFactIds.includes(factId)) {
      reasons.push(
        `Fact ${factId} listed as both citation and hypothesis — hypotheses cannot be published truth`,
      );
    }
  }

  if (reasons.length > 0) {
    return { allowed: false, code: "ARTICLE_GATE_FAILED", reasons };
  }
  return { allowed: true, code: null, reasons: ["Article gate passed"] };
}

export function createArticleQaVerdict(input: {
  verdictId: string;
  articleId: string;
  authorId: string;
  reviewerId: string;
  approved: boolean;
  contentDigest: string;
  summary: string;
  decidedAtIso: string;
}):
  | { ok: true; verdict: ArticleQaVerdict }
  | { ok: false; code: string; reasons: string[] } {
  if (!input.authorId.trim() || !input.reviewerId.trim()) {
    return {
      ok: false,
      code: "QA_IDENTITY_REQUIRED",
      reasons: ["authorId and reviewerId are required"],
    };
  }
  if (input.authorId === input.reviewerId) {
    return {
      ok: false,
      code: "QA_SELF_REVIEW_FORBIDDEN",
      reasons: ["Independent QA reviewer must differ from the article author"],
    };
  }
  return {
    ok: true,
    verdict: {
      verdictId: input.verdictId,
      articleId: input.articleId,
      authorId: input.authorId.trim(),
      reviewerId: input.reviewerId.trim(),
      approved: input.approved,
      contentDigest: input.contentDigest,
      summary: input.summary.trim(),
      decidedAtIso: input.decidedAtIso,
    },
  };
}

/**
 * Approval requires SUPPORTED-fact gate plus an independent QA verdict bound
 * to the current article contentDigest (author ≠ reviewer).
 */
export function evaluateArticleApprovalGate(input: {
  article: CanonicalArticle;
  factLabels: FactSupportLookup;
  qaVerdict: ArticleQaVerdict | null;
}): { allowed: boolean; code: string | null; reasons: string[] } {
  const factGate = evaluateArticleGate({
    article: input.article,
    factLabels: input.factLabels,
  });
  if (!factGate.allowed) {
    return factGate;
  }
  const reasons: string[] = [...factGate.reasons];
  if (!input.qaVerdict) {
    return {
      allowed: false,
      code: "INDEPENDENT_QA_REQUIRED",
      reasons: [
        ...reasons,
        "Independent QA verdict required before approval (Draft → Independent QA → Canonical release)",
      ],
    };
  }
  if (input.qaVerdict.articleId !== input.article.articleId) {
    return {
      allowed: false,
      code: "QA_ARTICLE_MISMATCH",
      reasons: [...reasons, "QA verdict articleId does not match article"],
    };
  }
  if (input.qaVerdict.authorId !== input.article.authorId) {
    return {
      allowed: false,
      code: "QA_AUTHOR_MISMATCH",
      reasons: [
        ...reasons,
        "QA verdict authorId must match the article's authoritative authorId",
      ],
    };
  }
  if (input.qaVerdict.contentDigest !== input.article.contentDigest) {
    return {
      allowed: false,
      code: "QA_DIGEST_STALE",
      reasons: [
        ...reasons,
        "QA verdict contentDigest does not match current article — re-run QA after edits",
      ],
    };
  }
  if (input.qaVerdict.authorId === input.qaVerdict.reviewerId) {
    return {
      allowed: false,
      code: "QA_SELF_REVIEW_FORBIDDEN",
      reasons: [...reasons, "QA reviewer must differ from author"],
    };
  }
  if (!input.qaVerdict.approved) {
    return {
      allowed: false,
      code: "QA_REJECTED",
      reasons: [...reasons, "Independent QA rejected this revision"],
    };
  }
  return {
    allowed: true,
    code: null,
    reasons: [...reasons, "Independent QA verdict accepted"],
  };
}

/**
 * Adapt a canonical article into a destination variant.
 * Rejects formats the destination does not allow; truncates short updates.
 */
export function createDestinationVariant(input: {
  variantId: string;
  campaignId: string;
  article: CanonicalArticle;
  destination: DestinationRegistryEntry;
  format: ContentFormatValue;
  title?: string;
  body?: string;
  citedFactIds?: string[];
  fixtureOnly: boolean;
  createdAtIso: string;
}):
  | { ok: true; variant: DestinationVariant }
  | { ok: false; code: string; reasons: string[] } {
  const reasons: string[] = [];

  if (!input.destination.allowedFormats.includes(input.format)) {
    reasons.push(
      `Format ${input.format} is not allowed on ${input.destination.destinationId}`,
    );
  }

  if (
    input.format === ContentFormat.FULL_ARTICLE &&
    input.destination.kind !== DestinationKind.CMS &&
    input.destination.kind !== DestinationKind.OTHER_BLOG &&
    input.destination.kind !== DestinationKind.LINKEDIN
  ) {
    reasons.push(
      `Full-blog distribution rejected for ${input.destination.kind} — use a short update`,
    );
  }

  let body = (input.body ?? input.article.body).trim();
  const title = (input.title ?? input.article.title).trim();

  if (
    input.destination.maxBodyChars !== null &&
    body.length > input.destination.maxBodyChars
  ) {
    body = body.slice(0, input.destination.maxBodyChars).trimEnd();
  }

  if (reasons.length > 0) {
    return { ok: false, code: "VARIANT_FORMAT_REJECTED", reasons };
  }

  const citedFactIds = [
    ...(input.citedFactIds ?? input.article.citedFactIds),
  ];

  return {
    ok: true,
    variant: {
      variantId: input.variantId,
      campaignId: input.campaignId,
      articleId: input.article.articleId,
      destinationId: input.destination.destinationId,
      kind: input.destination.kind,
      format: input.format,
      title,
      body,
      contentDigest: digestArticleContent(title, body),
      citedFactIds,
      articleContentDigest: input.article.contentDigest,
      status: VariantStatus.DRAFT,
      fixtureOnly: input.fixtureOnly,
      gatewayOperationId: null,
      writePathId: null,
      remoteId: null,
      createdAtIso: input.createdAtIso,
      updatedAtIso: input.createdAtIso,
    },
  };
}

export function createVariantQaVerdict(input: {
  verdictId: string;
  variantId: string;
  articleId: string;
  authorId: string;
  reviewerId: string;
  approved: boolean;
  contentDigest: string;
  citedFactIds?: string[];
  summary: string;
  decidedAtIso: string;
}):
  | { ok: true; verdict: VariantQaVerdict }
  | { ok: false; code: string; reasons: string[] } {
  if (!input.authorId.trim() || !input.reviewerId.trim()) {
    return {
      ok: false,
      code: "VARIANT_QA_IDENTITY_REQUIRED",
      reasons: ["authorId and reviewerId are required"],
    };
  }
  if (input.authorId === input.reviewerId) {
    return {
      ok: false,
      code: "VARIANT_QA_SELF_REVIEW_FORBIDDEN",
      reasons: ["Independent variant QA reviewer must differ from the author"],
    };
  }
  return {
    ok: true,
    verdict: {
      verdictId: input.verdictId,
      variantId: input.variantId,
      articleId: input.articleId,
      authorId: input.authorId.trim(),
      reviewerId: input.reviewerId.trim(),
      approved: input.approved,
      contentDigest: input.contentDigest,
      citedFactIds: [...(input.citedFactIds ?? [])],
      summary: input.summary.trim(),
      decidedAtIso: input.decidedAtIso,
    },
  };
}

/**
 * Evaluate whether a variant may be released.
 * CMS is canonical-only — never via the destination variant path.
 * Dependent destinations require a verified canonical URL first.
 * Article digest must still match (approval invalidated on edit).
 * Per-variant claims must be SUPPORTED; optional QA binds to variant digest.
 */
export function evaluateVariantReleaseGate(input: {
  variant: DestinationVariant;
  article: CanonicalArticle;
  destination: DestinationRegistryEntry;
  preferLive?: boolean;
  factLabels?: FactSupportLookup;
  variantQaVerdict?: VariantQaVerdict | null;
  requireVariantQa?: boolean;
}): { allowed: boolean; code: string | null; reasons: string[] } {
  const reasons: string[] = [];

  if (
    input.destination.kind === DestinationKind.CMS ||
    input.variant.kind === DestinationKind.CMS ||
    input.variant.destinationId === "dest-cms"
  ) {
    reasons.push(
      "CMS publication must use the canonical article release path — destination variants are for GBP/social only",
    );
  }

  if (input.variant.articleContentDigest !== input.article.contentDigest) {
    reasons.push(
      "Article changed after variant was prepared — approval invalidated; recreate variant",
    );
  }

  const expectedDigest = digestArticleContent(
    input.variant.title,
    input.variant.body,
  );
  if (input.variant.contentDigest !== expectedDigest) {
    reasons.push(
      "Variant contentDigest does not match title/body — recreate or re-digest before release",
    );
  }

  if (input.factLabels) {
    for (const factId of input.variant.citedFactIds) {
      const label = input.factLabels.get(factId);
      if (!label) {
        reasons.push(`Variant cited fact ${factId} missing from registry`);
      } else if (label !== SupportLabel.SUPPORTED) {
        reasons.push(
          `Variant cited fact ${factId} is ${label} — unsupported claims cannot reach pending release`,
        );
      }
    }
  }

  if (input.requireVariantQa === true || input.variantQaVerdict) {
    const verdict = input.variantQaVerdict ?? null;
    if (!verdict) {
      reasons.push(
        "Per-variant QA verdict required before release — article approval alone is insufficient",
      );
    } else if (verdict.variantId !== input.variant.variantId) {
      reasons.push("Variant QA verdict variantId mismatch");
    } else if (verdict.articleId !== input.article.articleId) {
      reasons.push("Variant QA verdict articleId does not match the article");
    } else if (verdict.authorId !== input.article.authorId) {
      reasons.push(
        "Variant QA authorId must match the article's authoritative authorId",
      );
    } else if (verdict.contentDigest !== input.variant.contentDigest) {
      reasons.push(
        "Variant QA verdict contentDigest is stale — re-review after variant edits",
      );
    } else if (verdict.authorId === verdict.reviewerId) {
      reasons.push("Variant QA reviewer must differ from author");
    } else if (!verdict.approved) {
      reasons.push("Variant QA rejected this revision");
    }
  }

  if (
    input.destination.requiresCanonicalUrl &&
    !input.article.verifiedCanonicalUrl
  ) {
    reasons.push(
      `Destination ${input.destination.destinationId} requires a verified canonical URL first`,
    );
  }

  if (input.preferLive === true) {
    if (input.destination.liveWiring === AdapterLiveStatus.NOT_WIRED) {
      reasons.push(
        `Live adapter for ${input.destination.kind} is NOT_WIRED — no credentials / ownership proof`,
      );
    }
  } else if (!input.destination.fixtureAvailable) {
    reasons.push(
      `No fixture adapter available for ${input.destination.destinationId}`,
    );
  }

  if (
    input.variant.status !== VariantStatus.READY &&
    input.variant.status !== VariantStatus.QUEUED &&
    input.variant.status !== VariantStatus.DRAFT
  ) {
    reasons.push(
      `Variant status ${input.variant.status} is not releasable`,
    );
  }

  if (reasons.length > 0) {
    return { allowed: false, code: "VARIANT_RELEASE_BLOCKED", reasons };
  }
  return { allowed: true, code: null, reasons: ["Variant release gate passed"] };
}

/**
 * Compare fixture read-back to expected published payload.
 * Gateway acceptance alone never verifies.
 */
export function evaluateContentReadBack(input: {
  expected: Record<string, string>;
  observed: Record<string, string>;
}): { matched: boolean; details: string[] } {
  const details: string[] = [];
  const keys = Object.keys(input.expected).sort();
  if (keys.length === 0) {
    return { matched: false, details: ["Expected fields empty — nothing to verify"] };
  }
  for (const key of keys) {
    const expected = input.expected[key]!;
    const observed = input.observed[key];
    if (observed === undefined) {
      details.push(`Missing read-back field ${key}`);
      continue;
    }
    if (observed !== expected) {
      details.push(`Read-back mismatch on ${key}`);
    }
  }
  if (details.length === 0) {
    details.push("Fixture read-back matched expected fields");
    return { matched: true, details };
  }
  return { matched: false, details };
}

export const ContentReleaseDecision = {
  SUCCESS: "SUCCESS",
  FAILURE: "FAILURE",
} as const;

export type ContentReleaseDecisionValue =
  (typeof ContentReleaseDecision)[keyof typeof ContentReleaseDecision];

export function buildContentReleaseOutcome(input: {
  outcomeId: string;
  campaignId: string;
  articleId?: string | null;
  variantId?: string | null;
  destinationId: string;
  writePathId: string;
  operationId: string;
  decision: ContentReleaseDecisionValue;
  source: OutcomeEvidenceSourceValue;
  fixtureOnly: boolean;
  summary: string;
  recordedAtIso: string;
  featureHints?: Record<string, string | number | boolean | null>;
}): WritePathOutcomeEvidence {
  const label: OutcomeLabelValue =
    input.decision === ContentReleaseDecision.SUCCESS
      ? OutcomeLabel.SUCCESS
      : OutcomeLabel.FAILURE;

  if (input.source === OutcomeEvidenceSource.FIXTURE && !input.fixtureOnly) {
    throw new Error("FIXTURE content release outcome must set fixtureOnly=true");
  }

  return recordWritePathOutcome({
    outcomeId: input.outcomeId,
    writePathId: input.writePathId,
    operationId: input.operationId,
    label,
    source: input.source,
    fixtureOnly: input.fixtureOnly,
    summary: input.summary,
    recordedAtIso: input.recordedAtIso,
    featureHints: {
      campaignId: input.campaignId,
      articleId: input.articleId ?? null,
      variantId: input.variantId ?? null,
      destinationId: input.destinationId,
      contentSlice: "R1-08",
      releaseDecision: input.decision,
      ...(input.featureHints ?? {}),
    },
  });
}

export function listContentOutcomesForLearning(
  state: ContentState,
  options?: { includeFixture?: boolean },
): WritePathOutcomeEvidence[] {
  const includeFixture = options?.includeFixture === true;
  return state.releaseOutcomes.filter((row) => {
    if (row.label === OutcomeLabel.UNKNOWN) return false;
    if (row.fixtureOnly && !includeFixture) return false;
    return true;
  });
}

export function createPublicationReceipt(input: {
  receiptId: string;
  campaignId: string;
  articleId?: string | null;
  variantId?: string | null;
  destinationId: string;
  kind: DestinationKindValue;
  outcome: PublicationOutcomeValue;
  remoteId?: string | null;
  gatewayOperationId?: string | null;
  writePathId?: string | null;
  summary: string;
  fixtureOnly: boolean;
  liveWiring: AdapterLiveStatusValue;
  recordedAtIso: string;
}): PublicationReceipt {
  return {
    receiptId: input.receiptId,
    campaignId: input.campaignId,
    articleId: input.articleId ?? null,
    variantId: input.variantId ?? null,
    destinationId: input.destinationId,
    kind: input.kind,
    outcome: input.outcome,
    remoteId: input.remoteId ?? null,
    gatewayOperationId: input.gatewayOperationId ?? null,
    writePathId: input.writePathId ?? null,
    summary: input.summary,
    fixtureOnly: input.fixtureOnly,
    liveWiring: input.liveWiring,
    recordedAtIso: input.recordedAtIso,
  };
}

/**
 * Apply verified (or failed) canonical article release.
 * Only after markVerified / explicit failure — never on ACCEPTED_PENDING alone.
 */
export function applyCanonicalReleaseVerification(
  state: ContentState,
  input: {
    articleId: string;
    decision: ContentReleaseDecisionValue;
    source: OutcomeEvidenceSourceValue;
    fixtureOnly: boolean;
    summary: string;
    outcomeId: string;
    operationId: string;
    writePathId: string;
    canonicalUrl?: string | null;
    nowIso: string;
  },
): {
  state: ContentState;
  article: CanonicalArticle | null;
  receipt: PublicationReceipt | null;
  outcome: WritePathOutcomeEvidence | null;
  reasons: string[];
} {
  const idx = state.articles.findIndex((a) => a.articleId === input.articleId);
  if (idx < 0) {
    return {
      state,
      article: null,
      receipt: null,
      outcome: null,
      reasons: [`Unknown articleId ${input.articleId}`],
    };
  }

  const existing = state.articles[idx]!;
  const success = input.decision === ContentReleaseDecision.SUCCESS;
  const article: CanonicalArticle = {
    ...existing,
    status: success ? ArticleStatus.VERIFIED : ArticleStatus.FAILED,
    verifiedCanonicalUrl: success
      ? (input.canonicalUrl ??
        `https://fixture.worksocial.local/articles/${existing.articleId}`)
      : null,
    gatewayOperationId: input.operationId,
    writePathId: input.writePathId,
    updatedAtIso: input.nowIso,
  };

  const receipt = createPublicationReceipt({
    receiptId: `rcpt-${input.outcomeId}`,
    campaignId: article.campaignId,
    articleId: article.articleId,
    destinationId: "dest-cms",
    kind: DestinationKind.CMS,
    outcome: success
      ? PublicationOutcome.PUBLISHED_VERIFIED
      : PublicationOutcome.FAILED,
    remoteId: article.verifiedCanonicalUrl,
    gatewayOperationId: input.operationId,
    writePathId: input.writePathId,
    summary: input.summary,
    fixtureOnly: input.fixtureOnly,
    liveWiring: AdapterLiveStatus.NOT_WIRED,
    recordedAtIso: input.nowIso,
  });

  const outcome = buildContentReleaseOutcome({
    outcomeId: input.outcomeId,
    campaignId: article.campaignId,
    articleId: article.articleId,
    destinationId: "dest-cms",
    writePathId: input.writePathId,
    operationId: input.operationId,
    decision: input.decision,
    source: input.source,
    fixtureOnly: input.fixtureOnly,
    summary: input.summary,
    recordedAtIso: input.nowIso,
  });

  const articles = [...state.articles];
  articles[idx] = article;

  return {
    state: {
      ...state,
      articles,
      receipts: [...state.receipts, receipt].slice(-500),
      releaseOutcomes: [...state.releaseOutcomes, outcome].slice(-500),
      updatedAtIso: input.nowIso,
    },
    article,
    receipt,
    outcome,
    reasons: [
      success
        ? "Canonical article verified with evidence"
        : "Canonical article release failed — learning FAILURE recorded",
    ],
  };
}

/**
 * Apply verified (or failed) destination variant release.
 */
export function applyVariantReleaseVerification(
  state: ContentState,
  input: {
    variantId: string;
    decision: ContentReleaseDecisionValue;
    source: OutcomeEvidenceSourceValue;
    fixtureOnly: boolean;
    summary: string;
    outcomeId: string;
    operationId: string;
    writePathId: string;
    remoteId?: string | null;
    nowIso: string;
  },
): {
  state: ContentState;
  variant: DestinationVariant | null;
  receipt: PublicationReceipt | null;
  outcome: WritePathOutcomeEvidence | null;
  reasons: string[];
} {
  const idx = state.variants.findIndex((v) => v.variantId === input.variantId);
  if (idx < 0) {
    return {
      state,
      variant: null,
      receipt: null,
      outcome: null,
      reasons: [`Unknown variantId ${input.variantId}`],
    };
  }

  const existing = state.variants[idx]!;
  const success = input.decision === ContentReleaseDecision.SUCCESS;
  const variant: DestinationVariant = {
    ...existing,
    status: success ? VariantStatus.VERIFIED : VariantStatus.FAILED,
    gatewayOperationId: input.operationId,
    writePathId: input.writePathId,
    remoteId: success ? (input.remoteId ?? `fixture-${existing.variantId}`) : null,
    updatedAtIso: input.nowIso,
  };

  const receipt = createPublicationReceipt({
    receiptId: `rcpt-${input.outcomeId}`,
    campaignId: variant.campaignId,
    articleId: variant.articleId,
    variantId: variant.variantId,
    destinationId: variant.destinationId,
    kind: variant.kind,
    outcome: success
      ? PublicationOutcome.PUBLISHED_VERIFIED
      : PublicationOutcome.FAILED,
    remoteId: variant.remoteId,
    gatewayOperationId: input.operationId,
    writePathId: input.writePathId,
    summary: input.summary,
    fixtureOnly: input.fixtureOnly,
    liveWiring: AdapterLiveStatus.NOT_WIRED,
    recordedAtIso: input.nowIso,
  });

  const outcome = buildContentReleaseOutcome({
    outcomeId: input.outcomeId,
    campaignId: variant.campaignId,
    articleId: variant.articleId,
    variantId: variant.variantId,
    destinationId: variant.destinationId,
    writePathId: input.writePathId,
    operationId: input.operationId,
    decision: input.decision,
    source: input.source,
    fixtureOnly: input.fixtureOnly,
    summary: input.summary,
    recordedAtIso: input.nowIso,
  });

  const variants = [...state.variants];
  variants[idx] = variant;

  return {
    state: {
      ...state,
      variants,
      receipts: [...state.receipts, receipt].slice(-500),
      releaseOutcomes: [...state.releaseOutcomes, outcome].slice(-500),
      updatedAtIso: input.nowIso,
    },
    variant,
    receipt,
    outcome,
    reasons: [
      success
        ? `Variant ${variant.destinationId} verified with evidence`
        : `Variant ${variant.destinationId} failed — learning FAILURE recorded`,
    ],
  };
}

/** Honest live wiring status from adapter descriptor. */
export function contentLiveWiringStatus(
  adapterWiring: AdapterWiringValue,
): AdapterLiveStatusValue {
  if (adapterWiring === AdapterWiring.FIXTURE) return AdapterLiveStatus.FIXTURE;
  return AdapterLiveStatus.NOT_WIRED;
}

/** Catalog case ids related to content/distribution (do not mark VERIFIED without evidence). */
export const CONTENT_RELATED_CASE_IDS = [
  "T-C01", // article pipeline + SUPPORTED fact gate
  "T-C02", // destination variant format contracts
  "T-C03", // canonical-first distribution order
  "T-C04", // gateway release + per-destination receipts
] as const;
