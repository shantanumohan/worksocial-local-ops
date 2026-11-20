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
  OutcomeEvidenceSource,
  PublicationOutcome,
  VariantStatus,
  applyCanonicalReleaseVerification,
  applyVariantReleaseVerification,
  createCanonicalArticle,
  createContentBrief,
  createContentCampaign,
  createDestinationVariant,
  createPublicationReceipt,
  defaultDestinationRegistry,
  evaluateArticleGate,
  evaluateContentReadBack,
  evaluateVariantReleaseGate,
  listContentOutcomesForLearning,
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
  type WritePathOutcomeEvidence,
} from "@worksocial/domain";
import type { ContentStore } from "@worksocial/persistence";
import {
  createActionGateway,
  type ActionGateway,
  type GatewayAuthoritySnapshot,
  type GatewayDecisionRecord,
} from "@worksocial/action-gateway";
import {
  CONTENT_PILOT_ARTICLE_ASSET_ID,
  CONTENT_PILOT_ARTICLE_ID,
  CONTENT_PILOT_CMS_WRITE_PATH_ID,
  CONTENT_PILOT_GBP_WRITE_PATH_ID,
  CONTENT_PILOT_LINKEDIN_WRITE_PATH_ID,
  buildFixtureContentSeed,
  createFixtureContentPilotMapping,
  invokeDestinationAdapter,
  proveFixtureContentWritePaths,
} from "./fixtures.js";

const TERMINAL_ARTICLE: ReadonlySet<string> = new Set([
  ArticleStatus.APPROVED,
  ArticleStatus.REJECTED,
  ArticleStatus.RELEASED_PENDING,
  ArticleStatus.VERIFIED,
  ArticleStatus.FAILED,
]);

function writePathForDestination(destinationId: string): string {
  if (destinationId === "dest-gbp") return CONTENT_PILOT_GBP_WRITE_PATH_ID;
  if (destinationId === "dest-linkedin" || destinationId === "dest-facebook") {
    return CONTENT_PILOT_LINKEDIN_WRITE_PATH_ID;
  }
  return CONTENT_PILOT_CMS_WRITE_PATH_ID;
}

function operationForDestination(kind: string): string {
  if (kind === DestinationKind.CMS) return "publish_article";
  if (kind === DestinationKind.GBP) return "publish_gbp_update";
  return "publish_social_post";
}

export type ContentServiceOptions = {
  gateway?: ActionGateway;
};

export type ContentService = {
  status(): ReturnType<ContentStore["status"]> & {
    acceptanceCaseIds: readonly string[];
    learningHookNote: string;
  };
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
    skippedProgressedArticleIds: string[];
  };
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
    };
    productionMapping: ProductionMappingState;
    factLabels: FactSupportLookup;
    preferLive?: boolean;
    targetAccountId?: string;
    contentRevision?: string | null;
    nowIso?: string;
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
    };
    productionMapping: ProductionMappingState;
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
  seedAndProveContentMapping(nowIso?: string): {
    mapping: ProductionMappingState;
    writePathIds: { cms: string; gbp: string; linkedin: string };
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

  return {
    gateway,

    status() {
      const base = store.status();
      return {
        ...base,
        acceptanceCaseIds: CONTENT_RELATED_CASE_IDS,
        learningHookNote:
          "Verified content distribution SUCCESS/FAILURE emits outcomes with fixtureOnly when fixture after explicit read-back. ACCEPTED_PENDING ≠ VERIFIED. Live CMS/GBP/social NOT_WIRED. Learning-worker may consume outcomes later; no authority auto-apply.",
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

      store.setDestinations(seed.destinations);

      for (const campaign of seed.campaigns) {
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

      return {
        campaigns: seed.campaigns,
        articles: seed.articles.filter(
          (a) => !skippedProgressedArticleIds.includes(a.articleId),
        ),
        variants: seed.variants,
        destinations: seed.destinations,
        skippedProgressedArticleIds,
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
      const gate = evaluateArticleGate({
        article,
        factLabels: input.factLabels,
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

      if (input.preferLive === true) {
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

      const gate = evaluateArticleGate({
        article,
        factLabels: input.factLabels,
      });
      if (!gate.allowed) {
        details.push(...gate.reasons);
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
          assetId: CONTENT_PILOT_ARTICLE_ASSET_ID,
          contentRevision: input.contentRevision ?? "rev-content-demo",
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
        const applied = applyCanonicalReleaseVerification(store.read(), {
          articleId: article.articleId,
          decision: ContentReleaseDecision.FAILURE,
          source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
          fixtureOnly: article.fixtureOnly,
          summary: `Gateway denied canonical release: ${submitted.decision.code ?? submitted.decision.reason}`,
          outcomeId: `out-${randomUUID()}`,
          operationId,
          writePathId: CONTENT_PILOT_CMS_WRITE_PATH_ID,
          nowIso,
        });
        const failed: CanonicalArticle = {
          ...(applied.article ?? article),
          status: ArticleStatus.FAILED,
          gatewayOperationId: operationId,
          writePathId: CONTENT_PILOT_CMS_WRITE_PATH_ID,
          updatedAtIso: nowIso,
        };
        store.upsertArticle(failed);
        if (applied.outcome) store.addReleaseOutcome(applied.outcome);
        if (applied.receipt) store.addReceipt(applied.receipt);
        return {
          article: failed,
          gatewayDecision: submitted.decision,
          receipt: applied.receipt,
          outcome: applied.outcome,
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
      details.push(
        "Left ACCEPTED_PENDING / RELEASED_PENDING — supply fixture read-back via verifyCanonicalRelease",
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
          gatewayDecision:
            gateway.getDecision(article.gatewayOperationId) ?? null,
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
      const gate = evaluateVariantReleaseGate({
        variant,
        article,
        destination,
        preferLive,
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
          assetId: CONTENT_PILOT_ARTICLE_ASSET_ID,
          contentRevision: input.contentRevision ?? "rev-content-demo",
          writePathId,
          payload: {
            variantId: variant.variantId,
            destinationId: variant.destinationId,
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
        const applied = applyVariantReleaseVerification(store.read(), {
          variantId: variant.variantId,
          decision: ContentReleaseDecision.FAILURE,
          source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
          fixtureOnly: variant.fixtureOnly,
          summary: `Gateway denied variant release: ${submitted.decision.code ?? submitted.decision.reason}`,
          outcomeId: `out-${randomUUID()}`,
          operationId,
          writePathId,
          nowIso,
        });
        const failed: DestinationVariant = {
          ...(applied.variant ?? variant),
          status: VariantStatus.FAILED,
          gatewayOperationId: operationId,
          writePathId,
          updatedAtIso: nowIso,
        };
        store.upsertVariant(failed);
        if (applied.outcome) store.addReleaseOutcome(applied.outcome);
        if (applied.receipt) store.addReceipt(applied.receipt);
        return {
          variant: failed,
          gatewayDecision: submitted.decision,
          receipt: applied.receipt,
          outcome: applied.outcome,
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
      details.push(
        "Left ACCEPTED_PENDING / RELEASED_PENDING — supply fixture read-back via verifyVariantRelease",
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
      const writePathId =
        variant.writePathId ?? writePathForDestination(variant.destinationId);

      if (failed) {
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
          gatewayDecision:
            gateway.getDecision(variant.gatewayOperationId) ?? null,
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
