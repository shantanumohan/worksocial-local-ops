/**
 * Content service: article pipeline, destination variants, and
 * gateway-gated fixture distribution with per-destination receipts.
 * Live CMS / GBP / social remain NOT_WIRED.
 */

import { randomUUID } from "node:crypto";
import {
  ActionClass,
  AdapterLiveStatus,
  ArticleStatus,
  CONTENT_RELATED_CASE_IDS,
  CampaignStatus,
  ContentReleaseDecision,
  DestinationKind,
  LocalRole,
  OutcomeEvidenceSource,
  PublicationOutcome,
  VariantStatus,
  applyCanonicalReleaseVerification,
  applyVariantReleaseVerification,
  createArticleQaVerdict,
  createCanonicalArticle,
  createContentBrief,
  createContentCampaign,
  createDestinationVariant,
  createPublicationReceipt,
  createVariantQaVerdict,
  defaultDestinationRegistry,
  evaluateArticleApprovalGate,
  evaluateContentReadBack,
  evaluateVariantReleaseGate,
  gateVenueMediaBundleForPublish,
  listContentOutcomesForLearning,
  type ArticleQaVerdict,
  type CanonicalArticle,
  type ContentCampaign,
  type ContentFormatValue,
  type ContentState,
  type DestinationRegistryEntry,
  type DestinationVariant,
  type FactSupportLookup,
  type OperatingModeValue,
  type ProductionMappingState,
  type CapabilityGrant,
  type PublicationReceipt,
  type StandingPolicy,
  type VariantQaVerdict,
  type VenueMediaPublishGateInput,
  type WritePathOutcomeEvidence,
} from "@worksocial/domain";
import type { ContentStore, DurableExecutionService } from "@worksocial/persistence";
import {
  createActionGateway,
  type ActionGateway,
  type GatewayAuthoritySnapshot,
  type GatewayDecisionRecord,
} from "@worksocial/action-gateway";
import {
  CONTENT_PILOT_ARTICLE_ID,
  CONTENT_PILOT_CMS_WRITE_PATH_ID,
  CONTENT_PILOT_FACEBOOK_WRITE_PATH_ID,
  CONTENT_PILOT_GBP_WRITE_PATH_ID,
  CONTENT_PILOT_LINKEDIN_WRITE_PATH_ID,
  buildFixtureContentSeed,
  createFixtureContentPilotMapping,
  invokeDestinationAdapter,
  proveFixtureContentWritePaths,
} from "./fixtures.js";
import {
  createCanonicalPublishOps,
  type CanonicalPublishOps,
} from "./canonical-publish-ops.js";

const TERMINAL_ARTICLE: ReadonlySet<string> = new Set([
  ArticleStatus.APPROVED,
  ArticleStatus.REJECTED,
  ArticleStatus.RELEASED_PENDING,
  ArticleStatus.VERIFIED,
  ArticleStatus.FAILED,
]);

function writePathForDestination(destinationId: string): string {
  if (destinationId === "dest-gbp") return CONTENT_PILOT_GBP_WRITE_PATH_ID;
  if (destinationId === "dest-linkedin") return CONTENT_PILOT_LINKEDIN_WRITE_PATH_ID;
  if (destinationId === "dest-facebook") return CONTENT_PILOT_FACEBOOK_WRITE_PATH_ID;
  return CONTENT_PILOT_CMS_WRITE_PATH_ID;
}

function operationForDestination(kind: string): string {
  if (kind === DestinationKind.CMS) return "publish_article";
  if (kind === DestinationKind.GBP) return "publish_gbp_update";
  return "publish_social_post";
}

export type ContentServiceOptions = {
  gateway?: ActionGateway;
  durable?: DurableExecutionService;
};

export type ContentService = {
  status(): ReturnType<ContentStore["status"]> & {
    acceptanceCaseIds: readonly string[];
    learningHookNote: string;
    m6Note: string;
  };
  /** M6 / NEXT-17 canonical authoring + multi-destination publish. */
  readonly canonicalPublish: CanonicalPublishOps;
  listCampaigns(limit?: number): ContentCampaign[];
  listArticles(limit?: number): CanonicalArticle[];
  listVariants(limit?: number): DestinationVariant[];
  listReceipts(limit?: number): PublicationReceipt[];
  listDestinations(): DestinationRegistryEntry[];
  seedFixtures(nowIso?: string): {
    campaigns: ContentCampaign[];
    articles: CanonicalArticle[];
    variants: DestinationVariant[];
    destinations: DestinationRegistryEntry[];
    qaVerdicts: ArticleQaVerdict[];
    variantQaVerdicts: VariantQaVerdict[];
    skippedProgressedArticleIds: string[];
    skippedProgressedCampaignIds: string[];
  };
  recordQaVerdict(input: {
    verdictId?: string;
    articleId: string;
    authorId: string;
    reviewerId: string;
    approved: boolean;
    summary?: string;
    nowIso?: string;
  }):
    | { ok: true; verdict: ArticleQaVerdict }
    | { ok: false; code: string; reasons: string[] };
  /** Digest-bound per-variant QA — required before releaseVariant. */
  recordVariantQaVerdict(input: {
    verdictId?: string;
    variantId: string;
    authorId: string;
    reviewerId: string;
    approved: boolean;
    summary?: string;
    nowIso?: string;
  }):
    | { ok: true; verdict: VariantQaVerdict }
    | { ok: false; code: string; reasons: string[] };
  createCampaign(input: {
    campaignId?: string;
    title: string;
    topic: string;
    audienceNeed: string;
    practicalValue: string;
    intendedAction: string;
    sourceFactIds?: string[];
    destinationIds?: string[];
    fixtureOnly?: boolean;
    nowIso?: string;
  }): ContentCampaign;
  createArticle(input: {
    articleId?: string;
    campaignId: string;
    title: string;
    body: string;
    authorId: string;
    citedFactIds?: string[];
    hypothesisFactIds?: string[];
    fixtureOnly?: boolean;
    nowIso?: string;
  }):
    | { ok: true; article: CanonicalArticle }
    | { ok: false; code: string; reasons: string[] };
  prepareVariant(input: {
    variantId?: string;
    campaignId: string;
    articleId: string;
    destinationId: string;
    format: ContentFormatValue;
    title?: string;
    body?: string;
    fixtureOnly?: boolean;
    nowIso?: string;
  }):
    | { ok: true; variant: DestinationVariant }
    | { ok: false; code: string; reasons: string[] };
  approveArticle(input: {
    articleId: string;
    factLabels: FactSupportLookup;
    nowIso?: string;
  }): {
    ok: boolean;
    article: CanonicalArticle | null;
    reasons: string[];
  };
  /**
   * Canonical CMS release through the shared action gateway.
   * Leaves RELEASED_PENDING / ACCEPTED_PENDING — call verifyCanonicalRelease.
   */
  releaseCanonical(input: {
    articleId: string;
    authority: {
      outboundStopped: boolean;
      operatingMode: OperatingModeValue;
      policies: StandingPolicy[];
      grants: CapabilityGrant[];
      /** Authenticated role; defaults to administrator for admin-gated callers. */
      actorRole?: string;
    };
    productionMapping: ProductionMappingState;
    factLabels: FactSupportLookup;
    preferLive?: boolean;
    targetAccountId?: string;
    contentRevision?: string | null;
    nowIso?: string;
    /**
     * Optional venue media cited by this release (T-X044).
     * When present, unlicensed / uncleared media blocks publish before gateway.
     */
    venueMedia?: readonly VenueMediaPublishGateInput[];
  }): {
    article: CanonicalArticle | null;
    gatewayDecision: GatewayDecisionRecord | null;
    receipt: PublicationReceipt | null;
    outcome: WritePathOutcomeEvidence | null;
    liveCmsPublishWiring: "NOT_WIRED";
    acceptanceEqualsVerified: false;
    details: string[];
  };
  verifyCanonicalRelease(input: {
    articleId: string;
    observedFields: Record<string, string>;
    forceFailure?: boolean;
    nowIso?: string;
  }): {
    article: CanonicalArticle | null;
    gatewayDecision: GatewayDecisionRecord | null;
    receipt: PublicationReceipt | null;
    outcome: WritePathOutcomeEvidence | null;
    details: string[];
  };
  independentCanonicalReadBack(input: { articleId: string }): {
    ok: boolean;
    articleId: string;
    observedFields: Record<string, string> | null;
    source: "fixture_remote_ledger";
    reason: string;
  };
  /**
   * Release a destination variant (GBP / social) after verified canonical URL.
   * Live preferLive path returns honest NOT_WIRED without fabricating success.
   */
  releaseVariant(input: {
    variantId: string;
    authority: {
      outboundStopped: boolean;
      operatingMode: OperatingModeValue;
      policies: StandingPolicy[];
      grants: CapabilityGrant[];
      /** Authenticated role; defaults to administrator for admin-gated callers. */
      actorRole?: string;
    };
    productionMapping: ProductionMappingState;
    /** Current knowledge support labels — required; missing fails closed. */
    factLabels: FactSupportLookup;
    preferLive?: boolean;
    targetAccountId?: string;
    contentRevision?: string | null;
    nowIso?: string;
  }): {
    variant: DestinationVariant | null;
    gatewayDecision: GatewayDecisionRecord | null;
    receipt: PublicationReceipt | null;
    outcome: WritePathOutcomeEvidence | null;
    liveWiring: "NOT_WIRED" | "FIXTURE";
    acceptanceEqualsVerified: false;
    details: string[];
  };
  verifyVariantRelease(input: {
    variantId: string;
    observedFields: Record<string, string>;
    forceFailure?: boolean;
    nowIso?: string;
  }): {
    variant: DestinationVariant | null;
    gatewayDecision: GatewayDecisionRecord | null;
    receipt: PublicationReceipt | null;
    outcome: WritePathOutcomeEvidence | null;
    details: string[];
  };
  independentVariantReadBack(input: { variantId: string }): {
    ok: boolean;
    variantId: string;
    observedFields: Record<string, string> | null;
    source: "fixture_remote_ledger";
    reason: string;
  };
  seedAndProveContentMapping(nowIso?: string): {
    mapping: ProductionMappingState;
    writePathIds: { cms: string; gbp: string; linkedin: string; facebook: string };
  };
  listLearningOutcomes(includeFixture?: boolean): WritePathOutcomeEvidence[];
  readState(): ContentState;
  readonly gateway: ActionGateway;
};

export function createContentService(
  store: ContentStore,
  options: ContentServiceOptions = {},
): ContentService {
  const gateway = options.gateway ?? createActionGateway();
  const canonicalPublish = createCanonicalPublishOps(store, {
    gateway,
    ...(options.durable ? { durable: options.durable } : {}),
  });

  const putCanonicalLedger = (
    articleId: string,
    fields: Record<string, string>,
    nowIso: string,
  ) => {
    store.update((state) => ({
      ...state,
      fixtureCanonicalLedger: {
        ...state.fixtureCanonicalLedger,
        [articleId]: { ...fields },
      },
      updatedAtIso: nowIso,
    }));
  };

  const putVariantLedger = (
    variantId: string,
    fields: Record<string, string>,
    nowIso: string,
  ) => {
    store.update((state) => ({
      ...state,
      fixtureVariantLedger: {
        ...state.fixtureVariantLedger,
        [variantId]: { ...fields },
      },
      updatedAtIso: nowIso,
    }));
  };

  return {
    gateway,
    canonicalPublish,

    status() {
      const base = store.status();
      return {
        ...base,
        acceptanceCaseIds: [
          ...CONTENT_RELATED_CASE_IDS,
          ...canonicalPublish.acceptanceCaseIds,
        ],
        learningHookNote:
          "Verified content distribution SUCCESS/FAILURE emits outcomes with fixtureOnly when fixture after explicit read-back. ACCEPTED_PENDING ≠ VERIFIED. Live CMS/GBP/social NOT_WIRED. Learning-worker may consume outcomes later; no authority auto-apply.",
        m6Note:
          "M6/NEXT-17: versioned create/edit, claim/source QA + A25 binding, owned-site+GBP+LinkedIn fixture distribute with durable effects and partial recovery. External effects NONE. Temporal NOT_WIRED. Not R1-complete.",
      };
    },

    listCampaigns: (limit) => store.listCampaigns(limit),
    listArticles: (limit) => store.listArticles(limit),
    listVariants: (limit) => store.listVariants(limit),
    listReceipts: (limit) => store.listReceipts(limit),
    listDestinations: () => {
      const state = store.read();
      return state.destinations.length > 0
        ? state.destinations
        : defaultDestinationRegistry();
    },
    readState: () => store.read(),
    listLearningOutcomes: (includeFixture) =>
      listContentOutcomesForLearning(
        store.read(),
        includeFixture === undefined ? undefined : { includeFixture },
      ),

    seedFixtures(nowIso) {
      const ts = nowIso ?? new Date().toISOString();
      const seed = buildFixtureContentSeed(ts);
      const existing = store.read();
      const skippedProgressedArticleIds: string[] = [];
      const skippedProgressedCampaignIds: string[] = [];

      store.setDestinations(seed.destinations);

      for (const campaign of seed.campaigns) {
        const prior = existing.campaigns.find(
          (c) => c.campaignId === campaign.campaignId,
        );
        if (
          prior &&
          (prior.status === CampaignStatus.DISTRIBUTING ||
            prior.status === CampaignStatus.COMPLETE ||
            prior.status === CampaignStatus.BLOCKED)
        ) {
          skippedProgressedCampaignIds.push(prior.campaignId);
          continue;
        }
        store.upsertCampaign(campaign);
      }

      for (const article of seed.articles) {
        const prior = existing.articles.find(
          (a) => a.articleId === article.articleId,
        );
        if (prior && TERMINAL_ARTICLE.has(prior.status)) {
          skippedProgressedArticleIds.push(prior.articleId);
          continue;
        }
        store.upsertArticle(article);
      }

      for (const variant of seed.variants) {
        const prior = existing.variants.find(
          (v) => v.variantId === variant.variantId,
        );
        if (
          prior &&
          (prior.status === VariantStatus.VERIFIED ||
            prior.status === VariantStatus.RELEASED_PENDING ||
            prior.status === VariantStatus.FAILED)
        ) {
          continue;
        }
        store.upsertVariant(variant);
      }

      for (const verdict of seed.qaVerdicts) {
        const prior = existing.qaVerdicts.find(
          (v) => v.verdictId === verdict.verdictId,
        );
        if (prior) continue;
        store.addQaVerdict(verdict);
      }

      for (const verdict of seed.variantQaVerdicts) {
        const prior = existing.variantQaVerdicts.find(
          (v) => v.verdictId === verdict.verdictId,
        );
        if (prior) continue;
        store.addVariantQaVerdict(verdict);
      }

      return {
        campaigns: seed.campaigns.filter(
          (c) => !skippedProgressedCampaignIds.includes(c.campaignId),
        ),
        articles: seed.articles.filter(
          (a) => !skippedProgressedArticleIds.includes(a.articleId),
        ),
        variants: seed.variants,
        destinations: seed.destinations,
        qaVerdicts: seed.qaVerdicts,
        variantQaVerdicts: seed.variantQaVerdicts,
        skippedProgressedArticleIds,
        skippedProgressedCampaignIds,
      };
    },

    createCampaign(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      if (store.read().destinations.length === 0) {
        store.setDestinations(defaultDestinationRegistry());
      }
      const campaign = createContentCampaign({
        campaignId: input.campaignId ?? `camp-${randomUUID()}`,
        title: input.title,
        topic: input.topic,
        brief: createContentBrief({
          briefId: `brief-${randomUUID()}`,
          audienceNeed: input.audienceNeed,
          practicalValue: input.practicalValue,
          intendedAction: input.intendedAction,
          ...(input.sourceFactIds !== undefined
            ? { sourceFactIds: input.sourceFactIds }
            : {}),
          createdAtIso: nowIso,
        }),
        ...(input.destinationIds !== undefined
          ? { destinationIds: input.destinationIds }
          : {}),
        fixtureOnly: input.fixtureOnly !== false,
        createdAtIso: nowIso,
        status: CampaignStatus.BRIEF,
      });
      store.upsertCampaign(campaign);
      return campaign;
    },

    createArticle(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const state = store.read();
      const campaign = state.campaigns.find(
        (c) => c.campaignId === input.campaignId,
      );
      if (!campaign) {
        return {
          ok: false,
          code: "CAMPAIGN_NOT_FOUND",
          reasons: [`Unknown campaign ${input.campaignId}`],
        };
      }
      const article = createCanonicalArticle({
        articleId: input.articleId ?? `art-${randomUUID()}`,
        campaignId: input.campaignId,
        title: input.title,
        body: input.body,
        authorId: input.authorId,
        ...(input.citedFactIds !== undefined
          ? { citedFactIds: input.citedFactIds }
          : {}),
        ...(input.hypothesisFactIds !== undefined
          ? { hypothesisFactIds: input.hypothesisFactIds }
          : {}),
        fixtureOnly: input.fixtureOnly !== false,
        createdAtIso: nowIso,
        status: ArticleStatus.DRAFT,
      });
      store.upsertArticle(article);
      store.upsertCampaign({
        ...campaign,
        canonicalArticleId: article.articleId,
        status: CampaignStatus.DRAFTING,
        updatedAtIso: nowIso,
      });
      return { ok: true, article };
    },

    prepareVariant(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const state = store.read();
      const article =
        state.articles.find((a) => a.articleId === input.articleId) ?? null;
      if (!article) {
        return {
          ok: false,
          code: "ARTICLE_NOT_FOUND",
          reasons: [`Unknown article ${input.articleId}`],
        };
      }
      const destinations =
        state.destinations.length > 0
          ? state.destinations
          : defaultDestinationRegistry();
      const destination =
        destinations.find((d) => d.destinationId === input.destinationId) ??
        null;
      if (!destination) {
        return {
          ok: false,
          code: "DESTINATION_NOT_FOUND",
          reasons: [`Unknown destination ${input.destinationId}`],
        };
      }
      const created = createDestinationVariant({
        variantId: input.variantId ?? `var-${randomUUID()}`,
        campaignId: input.campaignId,
        article,
        destination,
        format: input.format,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        fixtureOnly: input.fixtureOnly !== false,
        createdAtIso: nowIso,
      });
      if (!created.ok) return created;
      const variant: DestinationVariant = {
        ...created.variant,
        status: VariantStatus.READY,
      };
      store.upsertVariant(variant);
      return { ok: true, variant };
    },

    recordQaVerdict(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const state = store.read();
      const article =
        state.articles.find((a) => a.articleId === input.articleId) ?? null;
      if (!article) {
        return {
          ok: false as const,
          code: "ARTICLE_NOT_FOUND",
          reasons: [`Unknown article ${input.articleId}`],
        };
      }
      const created = createArticleQaVerdict({
        verdictId: input.verdictId ?? `qa-${randomUUID()}`,
        articleId: article.articleId,
        authorId: input.authorId,
        reviewerId: input.reviewerId,
        approved: input.approved,
        contentDigest: article.contentDigest,
        summary: input.summary ?? "Independent QA verdict",
        decidedAtIso: nowIso,
      });
      if (!created.ok) {
        return {
          ok: false as const,
          code: created.code,
          reasons: created.reasons,
        };
      }
      if (created.verdict.authorId !== article.authorId) {
        return {
          ok: false as const,
          code: "QA_AUTHOR_MISMATCH",
          reasons: [
            "QA authorId must match the article's authoritative authorId",
          ],
        };
      }
      store.addQaVerdict(created.verdict);

      // A later reject for the current digest revokes APPROVED so release cannot proceed.
      if (
        !created.verdict.approved &&
        article.status === ArticleStatus.APPROVED &&
        created.verdict.contentDigest === article.contentDigest
      ) {
        store.upsertArticle({
          ...article,
          status: ArticleStatus.READY_FOR_REVIEW,
          updatedAtIso: nowIso,
        });
      }

      return { ok: true as const, verdict: created.verdict };
    },

    recordVariantQaVerdict(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const state = store.read();
      const variant =
        state.variants.find((v) => v.variantId === input.variantId) ?? null;
      if (!variant) {
        return {
          ok: false as const,
          code: "VARIANT_NOT_FOUND",
          reasons: [`Unknown variant ${input.variantId}`],
        };
      }
      const article =
        state.articles.find((a) => a.articleId === variant.articleId) ?? null;
      if (!article) {
        return {
          ok: false as const,
          code: "ARTICLE_NOT_FOUND",
          reasons: [`Unknown article ${variant.articleId}`],
        };
      }
      if (input.authorId !== article.authorId) {
        return {
          ok: false as const,
          code: "VARIANT_QA_AUTHOR_MISMATCH",
          reasons: [
            "Variant QA authorId must match the article's authoritative authorId",
          ],
        };
      }
      const created = createVariantQaVerdict({
        verdictId: input.verdictId ?? `vqa-${randomUUID()}`,
        variantId: variant.variantId,
        articleId: article.articleId,
        authorId: article.authorId,
        reviewerId: input.reviewerId,
        approved: input.approved,
        contentDigest: variant.contentDigest,
        citedFactIds: variant.citedFactIds,
        summary: input.summary ?? "Independent per-variant QA verdict",
        decidedAtIso: nowIso,
      });
      if (!created.ok) {
        return {
          ok: false as const,
          code: created.code,
          reasons: created.reasons,
        };
      }
      store.addVariantQaVerdict(created.verdict);
      return { ok: true as const, verdict: created.verdict };
    },

    approveArticle(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const state = store.read();
      const article =
        state.articles.find((a) => a.articleId === input.articleId) ?? null;
      if (!article) {
        return {
          ok: false,
          article: null,
          reasons: [`Unknown article ${input.articleId}`],
        };
      }
      if (
        article.status !== ArticleStatus.DRAFT &&
        article.status !== ArticleStatus.READY_FOR_REVIEW
      ) {
        return {
          ok: false,
          article,
          reasons: [`Cannot approve article in status ${article.status}`],
        };
      }
      const qaVerdict =
        state.qaVerdicts
          .filter((v) => v.articleId === article.articleId)
          .filter((v) => v.contentDigest === article.contentDigest)
          .at(-1) ?? null;
      const gate = evaluateArticleApprovalGate({
        article,
        factLabels: input.factLabels,
        qaVerdict,
      });
      if (!gate.allowed) {
        return { ok: false, article, reasons: gate.reasons };
      }
      const approved: CanonicalArticle = {
        ...article,
        status: ArticleStatus.APPROVED,
        updatedAtIso: nowIso,
      };
      store.upsertArticle(approved);
      return { ok: true, article: approved, reasons: gate.reasons };
    },

    seedAndProveContentMapping(nowIso) {
      const ts = nowIso ?? new Date().toISOString();
      const { state, writePathIds } = createFixtureContentPilotMapping(ts);
      const proven = proveFixtureContentWritePaths(state, ts);
      return { mapping: proven, writePathIds };
    },

    releaseCanonical(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const details: string[] = [];
      const state = store.read();
      const article =
        state.articles.find((a) => a.articleId === input.articleId) ?? null;

      if (!article) {
        return {
          article: null,
          gatewayDecision: null,
          receipt: null,
          outcome: null,
          liveCmsPublishWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details: [`Unknown article ${input.articleId}`],
        };
      }

      details.push("Live CMS publish adapter is NOT_WIRED — fixture release only");

      // T-X044 — unlicensed / uncleared venue media blocks publish before
      // gateway AND before the preferLive NOT_WIRED early return (no receipt).
      const venueMediaGate = gateVenueMediaBundleForPublish(input.venueMedia);
      if (!venueMediaGate.allowed) {
        details.push(
          `Venue media publish blocked: ${venueMediaGate.code} — ${venueMediaGate.reason}`,
        );
        details.push("externalEffects=NONE");
        details.push("liveMediaWiring=NOT_WIRED ACCEPTED≠VERIFIED");
        return {
          article,
          gatewayDecision: null,
          receipt: null,
          outcome: null,
          liveCmsPublishWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }
      if (!("skipped" in venueMediaGate && venueMediaGate.skipped)) {
        details.push(venueMediaGate.reason);
      }

      if (input.preferLive === true) {
        // Empty-media preferLive stays honest NOT_WIRED adapter refuse.
        // Attached venueMedia already passed the T-X044 gate above.
        const live = invokeDestinationAdapter({
          kind: DestinationKind.CMS,
          preferLive: true,
        });
        details.push(live.summary);
        const receipt = createPublicationReceipt({
          receiptId: `rcpt-${randomUUID()}`,
          campaignId: article.campaignId,
          articleId: article.articleId,
          destinationId: "dest-cms",
          kind: DestinationKind.CMS,
          outcome: PublicationOutcome.UNSUPPORTED_ACTION,
          summary: live.summary,
          fixtureOnly: false,
          liveWiring: AdapterLiveStatus.NOT_WIRED,
          recordedAtIso: nowIso,
        });
        store.addReceipt(receipt);
        return {
          article,
          gatewayDecision: null,
          receipt,
          outcome: null,
          liveCmsPublishWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }

      if (article.status !== ArticleStatus.APPROVED) {
        details.push(
          `Article status is ${article.status}; release requires APPROVED`,
        );
        return {
          article,
          gatewayDecision: null,
          receipt: null,
          outcome: null,
          liveCmsPublishWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }

      const qaVerdict =
        state.qaVerdicts
          .filter((v) => v.articleId === article.articleId)
          .filter((v) => v.contentDigest === article.contentDigest)
          .at(-1) ?? null;
      const gate = evaluateArticleApprovalGate({
        article,
        factLabels: input.factLabels,
        qaVerdict,
      });
      if (!gate.allowed) {
        details.push(...gate.reasons);
        // Latest QA reject after approval must not publish.
        if (
          qaVerdict &&
          !qaVerdict.approved &&
          article.status === ArticleStatus.APPROVED
        ) {
          const revoked: CanonicalArticle = {
            ...article,
            status: ArticleStatus.READY_FOR_REVIEW,
            updatedAtIso: nowIso,
          };
          store.upsertArticle(revoked);
          return {
            article: revoked,
            gatewayDecision: null,
            receipt: null,
            outcome: null,
            liveCmsPublishWiring: "NOT_WIRED",
            acceptanceEqualsVerified: false,
            details,
          };
        }
        return {
          article,
          gatewayDecision: null,
          receipt: null,
          outcome: null,
          liveCmsPublishWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }

      const operationId = `content-cms-${randomUUID()}`;
      const snapshot: GatewayAuthoritySnapshot = {
        outboundStopped: input.authority.outboundStopped,
        operatingMode: input.authority.operatingMode,
        actorRole: input.authority.actorRole ?? LocalRole.ADMINISTRATOR,
        policies: input.authority.policies,
        grants: input.authority.grants,
        nowIso,
        productionMapping: input.productionMapping,
      };

      const submitted = gateway.submitIntent(
        {
          operationId,
          actionClass: ActionClass.ROUTINE_PUBLISH,
          channelId: "owned-site",
          targetAccountId: input.targetAccountId ?? "acct-demo",
          operation: "publish_article",
          assetId: article.articleId,
          contentRevision: input.contentRevision ?? article.contentDigest,
          writePathId: CONTENT_PILOT_CMS_WRITE_PATH_ID,
          payload: {
            articleId: article.articleId,
            title: article.title,
            contentDigest: article.contentDigest,
            fixtureOnly: article.fixtureOnly,
            liveCms: false,
          },
        },
        snapshot,
      );

      details.push(submitted.decision.reason);
      details.push(
        `Gateway outcome=${submitted.decision.outcome} (acceptance ≠ verified)`,
      );

      if (!submitted.decision.allowed) {
        // Transient authority denials stay retryable — article remains APPROVED.
        // Stop-switch uses BLOCKED (resumable); other denials stay FAILED attempt receipts.
        const blockedAttempt =
          submitted.decision.code === "OUTBOUND_STOPPED";
        details.push(
          blockedAttempt
            ? "Stop-switch BLOCKED attempt; approved revision kept — resumable after outbound resumes"
            : "Gateway denial recorded; article remains APPROVED for retry after authority is restored",
        );
        const receipt = createPublicationReceipt({
          receiptId: `rcpt-${randomUUID()}`,
          campaignId: article.campaignId,
          articleId: article.articleId,
          destinationId: "dest-cms",
          kind: DestinationKind.CMS,
          outcome: blockedAttempt
            ? PublicationOutcome.BLOCKED
            : PublicationOutcome.FAILED,
          gatewayOperationId: operationId,
          writePathId: CONTENT_PILOT_CMS_WRITE_PATH_ID,
          summary: `Gateway denied (retryable): ${submitted.decision.code ?? submitted.decision.reason}`,
          fixtureOnly: article.fixtureOnly,
          liveWiring: AdapterLiveStatus.NOT_WIRED,
          recordedAtIso: nowIso,
        });
        store.addReceipt(receipt);
        return {
          article,
          gatewayDecision: submitted.decision,
          receipt,
          outcome: null,
          liveCmsPublishWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }

      // Fixture adapter accepts — still ACCEPTED_PENDING until read-back.
      const adapter = invokeDestinationAdapter({
        kind: DestinationKind.CMS,
        preferLive: false,
        articleId: article.articleId,
        title: article.title,
      });
      details.push(adapter.summary);

      const pending: CanonicalArticle = {
        ...article,
        status: ArticleStatus.RELEASED_PENDING,
        gatewayOperationId: operationId,
        writePathId: CONTENT_PILOT_CMS_WRITE_PATH_ID,
        updatedAtIso: nowIso,
      };
      store.upsertArticle(pending);

      const receipt = createPublicationReceipt({
        receiptId: `rcpt-${randomUUID()}`,
        campaignId: article.campaignId,
        articleId: article.articleId,
        destinationId: "dest-cms",
        kind: DestinationKind.CMS,
        outcome: PublicationOutcome.ACCEPTED_PENDING,
        remoteId: adapter.accepted ? adapter.remoteId : null,
        gatewayOperationId: operationId,
        writePathId: CONTENT_PILOT_CMS_WRITE_PATH_ID,
        summary: "Gateway accepted; awaiting fixture read-back verification",
        fixtureOnly: true,
        liveWiring: AdapterLiveStatus.NOT_WIRED,
        recordedAtIso: nowIso,
      });
      store.addReceipt(receipt);
      putCanonicalLedger(
        article.articleId,
        {
          title: article.title,
          body: article.body,
          contentDigest: article.contentDigest,
        },
        nowIso,
      );
      details.push(
        "Left ACCEPTED_PENDING / RELEASED_PENDING — call independentCanonicalReadBack then verify",
      );

      return {
        article: pending,
        gatewayDecision: submitted.decision,
        receipt,
        outcome: null,
        liveCmsPublishWiring: "NOT_WIRED",
        acceptanceEqualsVerified: false,
        details,
      };
    },

    independentCanonicalReadBack(input) {
      const article =
        store.read().articles.find((a) => a.articleId === input.articleId) ??
        null;
      if (!article) {
        return {
          ok: false,
          articleId: input.articleId,
          observedFields: null,
          source: "fixture_remote_ledger" as const,
          reason: "Unknown article",
        };
      }
      if (article.status !== ArticleStatus.RELEASED_PENDING) {
        return {
          ok: false,
          articleId: input.articleId,
          observedFields: null,
          source: "fixture_remote_ledger" as const,
          reason: `Article status is ${article.status}; independent read requires RELEASED_PENDING`,
        };
      }
      const observed =
        store.read().fixtureCanonicalLedger[input.articleId] ?? null;
      if (!observed) {
        return {
          ok: false,
          articleId: input.articleId,
          observedFields: null,
          source: "fixture_remote_ledger" as const,
          reason: "Fixture remote ledger empty for article",
        };
      }
      return {
        ok: true,
        articleId: input.articleId,
        observedFields: { ...observed },
        source: "fixture_remote_ledger" as const,
        reason: "Independent fixture remote read-back",
      };
    },

    verifyCanonicalRelease(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const details: string[] = [];
      const state = store.read();
      const article =
        state.articles.find((a) => a.articleId === input.articleId) ?? null;

      if (!article) {
        return {
          article: null,
          gatewayDecision: null,
          receipt: null,
          outcome: null,
          details: [`Unknown article ${input.articleId}`],
        };
      }

      if (article.status !== ArticleStatus.RELEASED_PENDING) {
        return {
          article,
          gatewayDecision: null,
          receipt: null,
          outcome: null,
          details: [
            `Article status is ${article.status}; verify requires RELEASED_PENDING`,
          ],
        };
      }

      if (!article.gatewayOperationId) {
        return {
          article,
          gatewayDecision: null,
          receipt: null,
          outcome: null,
          details: ["Missing gatewayOperationId on RELEASED_PENDING article"],
        };
      }

      // Survive API/gateway restarts: rehydrate ACCEPTED_PENDING from durable op id.
      if (!gateway.getDecision(article.gatewayOperationId)) {
        gateway.rehydratePending({
          operationId: article.gatewayOperationId,
          writePathId: article.writePathId ?? CONTENT_PILOT_CMS_WRITE_PATH_ID,
          decidedAtIso: article.updatedAtIso,
          reason: "Rehydrated content canonical release after gateway restart",
        });
        details.push("Rehydrated gateway decision after process restart");
      }

      const expected = {
        title: article.title,
        body: article.body,
        contentDigest: article.contentDigest,
      };
      const readBack = evaluateContentReadBack({
        expected,
        observed: input.observedFields,
      });
      details.push(...readBack.details);

      const failed =
        input.forceFailure === true || readBack.matched === false;

      if (failed) {
        const failedDecision = gateway.markFailed(
          article.gatewayOperationId,
          nowIso,
          details.join("; ") || "Fixture read-back failed",
        );
        const applied = applyCanonicalReleaseVerification(store.read(), {
          articleId: article.articleId,
          decision: ContentReleaseDecision.FAILURE,
          source: OutcomeEvidenceSource.FIXTURE,
          fixtureOnly: true,
          summary: details.join("; ") || "Fixture read-back failed",
          outcomeId: `out-${randomUUID()}`,
          operationId: article.gatewayOperationId,
          writePathId: article.writePathId ?? CONTENT_PILOT_CMS_WRITE_PATH_ID,
          nowIso,
        });
        if (applied.outcome) store.addReleaseOutcome(applied.outcome);
        if (applied.receipt) store.addReceipt(applied.receipt);
        if (applied.article) store.upsertArticle(applied.article);
        return {
          article: applied.article,
          gatewayDecision: failedDecision,
          receipt: applied.receipt,
          outcome: applied.outcome,
          details,
        };
      }

      const verified = gateway.markVerified(
        article.gatewayOperationId,
        nowIso,
      );
      details.push("Fixture read-back verified; live CMS still NOT_WIRED");

      const applied = applyCanonicalReleaseVerification(store.read(), {
        articleId: article.articleId,
        decision: ContentReleaseDecision.SUCCESS,
        source: OutcomeEvidenceSource.FIXTURE,
        fixtureOnly: true,
        summary: "Fixture canonical article release verified via read-back",
        outcomeId: `out-${randomUUID()}`,
        operationId: article.gatewayOperationId,
        writePathId: article.writePathId ?? CONTENT_PILOT_CMS_WRITE_PATH_ID,
        canonicalUrl: `https://fixture.worksocial.local/articles/${article.articleId}`,
        nowIso,
      });
      if (applied.outcome) store.addReleaseOutcome(applied.outcome);
      if (applied.receipt) store.addReceipt(applied.receipt);
      if (applied.article) store.upsertArticle(applied.article);

      const campaign = store
        .read()
        .campaigns.find((c) => c.campaignId === article.campaignId);
      if (campaign) {
        store.upsertCampaign({
          ...campaign,
          status: CampaignStatus.DISTRIBUTING,
          updatedAtIso: nowIso,
        });
      }

      return {
        article: applied.article,
        gatewayDecision: verified,
        receipt: applied.receipt,
        outcome: applied.outcome,
        details,
      };
    },

    releaseVariant(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const details: string[] = [];
      const state = store.read();
      const variant =
        state.variants.find((v) => v.variantId === input.variantId) ?? null;

      if (!variant) {
        return {
          variant: null,
          gatewayDecision: null,
          receipt: null,
          outcome: null,
          liveWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details: [`Unknown variant ${input.variantId}`],
        };
      }

      const destinations =
        state.destinations.length > 0
          ? state.destinations
          : defaultDestinationRegistry();
      const destination =
        destinations.find((d) => d.destinationId === variant.destinationId) ??
        null;
      if (!destination) {
        return {
          variant,
          gatewayDecision: null,
          receipt: null,
          outcome: null,
          liveWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details: [`Unknown destination ${variant.destinationId}`],
        };
      }

      const article =
        state.articles.find((a) => a.articleId === variant.articleId) ?? null;
      if (!article) {
        return {
          variant,
          gatewayDecision: null,
          receipt: null,
          outcome: null,
          liveWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details: [`Unknown article ${variant.articleId}`],
        };
      }

      const preferLive = input.preferLive === true;
      const variantQaVerdict =
        state.variantQaVerdicts
          .filter((v) => v.variantId === variant.variantId)
          .filter((v) => v.contentDigest === variant.contentDigest)
          .sort((a, b) => b.decidedAtIso.localeCompare(a.decidedAtIso))[0] ??
        null;
      // Current knowledge labels are required — never synthesize SUPPORTED from citation membership.
      if (!input.factLabels) {
        details.push(
          "factLabels required for variant release — missing labels fail closed (do not infer SUPPORTED)",
        );
        const receipt = createPublicationReceipt({
          receiptId: `rcpt-${randomUUID()}`,
          campaignId: variant.campaignId,
          articleId: variant.articleId,
          variantId: variant.variantId,
          destinationId: variant.destinationId,
          kind: variant.kind,
          outcome: PublicationOutcome.FAILED,
          summary: "factLabels required; missing labels fail closed",
          fixtureOnly: !preferLive,
          liveWiring: AdapterLiveStatus.NOT_WIRED,
          recordedAtIso: nowIso,
        });
        store.addReceipt(receipt);
        return {
          variant,
          gatewayDecision: null,
          receipt,
          outcome: null,
          liveWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }
      const gate = evaluateVariantReleaseGate({
        variant,
        article,
        destination,
        preferLive,
        factLabels: input.factLabels,
        variantQaVerdict,
        requireVariantQa: true,
      });
      if (!gate.allowed) {
        details.push(...gate.reasons);
        const outcomeCode = preferLive
          ? PublicationOutcome.UNSUPPORTED_ACTION
          : PublicationOutcome.FAILED;
        const receipt = createPublicationReceipt({
          receiptId: `rcpt-${randomUUID()}`,
          campaignId: variant.campaignId,
          articleId: variant.articleId,
          variantId: variant.variantId,
          destinationId: variant.destinationId,
          kind: variant.kind,
          outcome: outcomeCode,
          summary: gate.reasons.join("; "),
          fixtureOnly: !preferLive,
          liveWiring: AdapterLiveStatus.NOT_WIRED,
          recordedAtIso: nowIso,
        });
        store.addReceipt(receipt);
        return {
          variant,
          gatewayDecision: null,
          receipt,
          outcome: null,
          liveWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }

      if (preferLive) {
        const live = invokeDestinationAdapter({
          kind: variant.kind,
          preferLive: true,
          variantId: variant.variantId,
        });
        details.push(live.summary);
        const receipt = createPublicationReceipt({
          receiptId: `rcpt-${randomUUID()}`,
          campaignId: variant.campaignId,
          articleId: variant.articleId,
          variantId: variant.variantId,
          destinationId: variant.destinationId,
          kind: variant.kind,
          outcome: PublicationOutcome.UNSUPPORTED_ACTION,
          summary: live.summary,
          fixtureOnly: false,
          liveWiring: AdapterLiveStatus.NOT_WIRED,
          recordedAtIso: nowIso,
        });
        store.addReceipt(receipt);
        return {
          variant,
          gatewayDecision: null,
          receipt,
          outcome: null,
          liveWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }

      const writePathId = writePathForDestination(variant.destinationId);
      const operationId = `content-var-${randomUUID()}`;
      const snapshot: GatewayAuthoritySnapshot = {
        outboundStopped: input.authority.outboundStopped,
        operatingMode: input.authority.operatingMode,
        actorRole: input.authority.actorRole ?? LocalRole.ADMINISTRATOR,
        policies: input.authority.policies,
        grants: input.authority.grants,
        nowIso,
        productionMapping: input.productionMapping,
      };

      const submitted = gateway.submitIntent(
        {
          operationId,
          actionClass: ActionClass.ROUTINE_PUBLISH,
          channelId: destination.channelId,
          targetAccountId: input.targetAccountId ?? "acct-demo",
          operation: operationForDestination(variant.kind),
          assetId: article.articleId,
          contentRevision: input.contentRevision ?? article.contentDigest,
          writePathId,
          payload: {
            variantId: variant.variantId,
            destinationId: variant.destinationId,
            articleId: article.articleId,
            contentDigest: article.contentDigest,
            title: variant.title,
            body: variant.body,
            fixtureOnly: variant.fixtureOnly,
            live: false,
          },
        },
        snapshot,
      );

      details.push(submitted.decision.reason);
      details.push(
        `Gateway outcome=${submitted.decision.outcome} (acceptance ≠ verified)`,
      );

      if (!submitted.decision.allowed) {
        // Transient authority denials stay retryable — variant remains READY/prior status.
        const blockedAttempt =
          submitted.decision.code === "OUTBOUND_STOPPED";
        details.push(
          blockedAttempt
            ? "Stop-switch BLOCKED attempt; variant remains resumable after outbound resumes"
            : "Gateway denial recorded; variant remains retryable after authority is restored",
        );
        const receipt = createPublicationReceipt({
          receiptId: `rcpt-${randomUUID()}`,
          campaignId: variant.campaignId,
          articleId: variant.articleId,
          variantId: variant.variantId,
          destinationId: variant.destinationId,
          kind: variant.kind,
          outcome: blockedAttempt
            ? PublicationOutcome.BLOCKED
            : PublicationOutcome.FAILED,
          gatewayOperationId: operationId,
          writePathId,
          summary: `Gateway denied (retryable): ${submitted.decision.code ?? submitted.decision.reason}`,
          fixtureOnly: variant.fixtureOnly,
          liveWiring: AdapterLiveStatus.NOT_WIRED,
          recordedAtIso: nowIso,
        });
        store.addReceipt(receipt);
        return {
          variant,
          gatewayDecision: submitted.decision,
          receipt,
          outcome: null,
          liveWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }

      const adapter = invokeDestinationAdapter({
        kind: variant.kind,
        preferLive: false,
        variantId: variant.variantId,
        body: variant.body,
      });
      details.push(adapter.summary);

      const pending: DestinationVariant = {
        ...variant,
        status: VariantStatus.RELEASED_PENDING,
        gatewayOperationId: operationId,
        writePathId,
        remoteId: adapter.accepted ? adapter.remoteId : null,
        updatedAtIso: nowIso,
      };
      store.upsertVariant(pending);

      const receipt = createPublicationReceipt({
        receiptId: `rcpt-${randomUUID()}`,
        campaignId: variant.campaignId,
        articleId: variant.articleId,
        variantId: variant.variantId,
        destinationId: variant.destinationId,
        kind: variant.kind,
        outcome: PublicationOutcome.ACCEPTED_PENDING,
        remoteId: pending.remoteId,
        gatewayOperationId: operationId,
        writePathId,
        summary: "Gateway accepted; awaiting fixture read-back verification",
        fixtureOnly: true,
        liveWiring: AdapterLiveStatus.NOT_WIRED,
        recordedAtIso: nowIso,
      });
      store.addReceipt(receipt);
      putVariantLedger(
        variant.variantId,
        {
          title: variant.title,
          body: variant.body,
        },
        nowIso,
      );
      details.push(
        "Left ACCEPTED_PENDING / RELEASED_PENDING — call independentVariantReadBack then verify",
      );

      return {
        variant: pending,
        gatewayDecision: submitted.decision,
        receipt,
        outcome: null,
        liveWiring: "FIXTURE",
        acceptanceEqualsVerified: false,
        details,
      };
    },

    independentVariantReadBack(input) {
      const variant =
        store.read().variants.find((v) => v.variantId === input.variantId) ??
        null;
      if (!variant) {
        return {
          ok: false,
          variantId: input.variantId,
          observedFields: null,
          source: "fixture_remote_ledger" as const,
          reason: "Unknown variant",
        };
      }
      if (variant.status !== VariantStatus.RELEASED_PENDING) {
        return {
          ok: false,
          variantId: input.variantId,
          observedFields: null,
          source: "fixture_remote_ledger" as const,
          reason: `Variant status is ${variant.status}; independent read requires RELEASED_PENDING`,
        };
      }
      const observed =
        store.read().fixtureVariantLedger[input.variantId] ?? null;
      if (!observed) {
        return {
          ok: false,
          variantId: input.variantId,
          observedFields: null,
          source: "fixture_remote_ledger" as const,
          reason: "Fixture remote ledger empty for variant",
        };
      }
      return {
        ok: true,
        variantId: input.variantId,
        observedFields: { ...observed },
        source: "fixture_remote_ledger" as const,
        reason: "Independent fixture remote read-back",
      };
    },

    verifyVariantRelease(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const details: string[] = [];
      const state = store.read();
      const variant =
        state.variants.find((v) => v.variantId === input.variantId) ?? null;

      if (!variant) {
        return {
          variant: null,
          gatewayDecision: null,
          receipt: null,
          outcome: null,
          details: [`Unknown variant ${input.variantId}`],
        };
      }

      if (variant.status !== VariantStatus.RELEASED_PENDING) {
        return {
          variant,
          gatewayDecision: null,
          receipt: null,
          outcome: null,
          details: [
            `Variant status is ${variant.status}; verify requires RELEASED_PENDING`,
          ],
        };
      }

      if (!variant.gatewayOperationId) {
        return {
          variant,
          gatewayDecision: null,
          receipt: null,
          outcome: null,
          details: ["Missing gatewayOperationId on RELEASED_PENDING variant"],
        };
      }

      const writePathId =
        variant.writePathId ?? writePathForDestination(variant.destinationId);

      if (!gateway.getDecision(variant.gatewayOperationId)) {
        gateway.rehydratePending({
          operationId: variant.gatewayOperationId,
          writePathId,
          decidedAtIso: variant.updatedAtIso,
          reason: "Rehydrated content variant release after gateway restart",
        });
        details.push("Rehydrated gateway decision after process restart");
      }

      const expected = {
        title: variant.title,
        body: variant.body,
      };
      const readBack = evaluateContentReadBack({
        expected,
        observed: input.observedFields,
      });
      details.push(...readBack.details);

      const failed =
        input.forceFailure === true || readBack.matched === false;

      if (failed) {
        const failedDecision = gateway.markFailed(
          variant.gatewayOperationId,
          nowIso,
          details.join("; ") || "Fixture read-back failed",
        );
        const applied = applyVariantReleaseVerification(store.read(), {
          variantId: variant.variantId,
          decision: ContentReleaseDecision.FAILURE,
          source: OutcomeEvidenceSource.FIXTURE,
          fixtureOnly: true,
          summary: details.join("; ") || "Fixture read-back failed",
          outcomeId: `out-${randomUUID()}`,
          operationId: variant.gatewayOperationId,
          writePathId,
          nowIso,
        });
        if (applied.outcome) store.addReleaseOutcome(applied.outcome);
        if (applied.receipt) store.addReceipt(applied.receipt);
        if (applied.variant) store.upsertVariant(applied.variant);
        return {
          variant: applied.variant,
          gatewayDecision: failedDecision,
          receipt: applied.receipt,
          outcome: applied.outcome,
          details,
        };
      }

      const verified = gateway.markVerified(
        variant.gatewayOperationId,
        nowIso,
      );
      details.push(
        `Fixture read-back verified for ${variant.kind}; live adapter still NOT_WIRED`,
      );

      const applied = applyVariantReleaseVerification(store.read(), {
        variantId: variant.variantId,
        decision: ContentReleaseDecision.SUCCESS,
        source: OutcomeEvidenceSource.FIXTURE,
        fixtureOnly: true,
        summary: `Fixture ${variant.kind} release verified via read-back`,
        outcomeId: `out-${randomUUID()}`,
        operationId: variant.gatewayOperationId,
        writePathId,
        remoteId: variant.remoteId,
        nowIso,
      });
      if (applied.outcome) store.addReleaseOutcome(applied.outcome);
      if (applied.receipt) store.addReceipt(applied.receipt);
      if (applied.variant) store.upsertVariant(applied.variant);

      return {
        variant: applied.variant,
        gatewayDecision: verified,
        receipt: applied.receipt,
        outcome: applied.outcome,
        details,
      };
    },
  };
}

// Re-export pilot ids for API convenience
export { CONTENT_PILOT_ARTICLE_ID, CONTENT_PILOT_CMS_WRITE_PATH_ID };
