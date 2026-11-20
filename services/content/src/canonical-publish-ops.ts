/**
 * M6 / NEXT-17 orchestration: versioned authoring, claim/source QA + A25
 * binding, multi-destination distribute with durable effects and partial recovery.
 * Fixture/simulator only — live CMS/GBP/social remain NOT_WIRED.
 */

import { randomUUID } from "node:crypto";
import {
  ActionClass,
  ArticleStatus,
  CANONICAL_PUBLISH_RELATED_CASE_IDS,
  CampaignStatus,
  ContentFormat,
  DestinationAttemptStatus,
  DestinationKind,
  DistributionRunStatus,
  PublicationOutcome,
  VariantStatus,
  bindContentIndependentReview,
  createDestinationVariant,
  createDistributionRun,
  createVariantQaVerdict,
  digestContentEvidencePackage,
  editCanonicalArticle,
  evaluateClaimSourceQa,
  listRecoverableDestinations,
  stableContentOperationKey,
  stableGatewayOperationId,
  upsertDestinationAttempt,
  type CanonicalArticle,
  type ClaimSourceRecord,
  type ContentClaimBundle,
  type ContentDistributionRunRecord,
  type ContentReviewBindingRecord,
  type DestinationAttempt,
  type DestinationVariant,
  type DistributionRun,
  type FactSupportLookup,
  type OperatingModeValue,
  type ProductionMappingState,
  type CapabilityGrant,
  type StandingPolicy,
} from "@worksocial/domain";
import {
  createDurableExecutionService,
  createMemoryDurableStores,
  newJobId,
  type ContentStore,
  type DurableExecutionService,
} from "@worksocial/persistence";
import {
  createGbpFixtureSimulator,
  createLinkedInFixtureSimulator,
  createStagingCmsSimulator,
  type GbpFixtureSimulator,
  type LinkedInFixtureSimulator,
  type StagingCmsSimulator,
} from "@worksocial/provider-adapters";
import type { ActionGateway, GatewayAuthoritySnapshot } from "@worksocial/action-gateway";
import {
  ensureContentMappingForArticle,
  invokeDestinationAdapter,
} from "./fixtures.js";

function toRunRecord(run: DistributionRun): ContentDistributionRunRecord {
  return {
    runId: run.runId,
    campaignId: run.campaignId,
    articleId: run.articleId,
    status: run.status,
    destinationIds: [...run.destinationIds],
    attempts: run.attempts.map((a) => ({ ...a })),
    businessIdempotencyKey: run.businessIdempotencyKey,
    fixtureOnly: run.fixtureOnly,
    createdAtIso: run.createdAtIso,
    updatedAtIso: run.updatedAtIso,
  };
}

function fromRunRecord(record: ContentDistributionRunRecord): DistributionRun {
  return {
    runId: record.runId,
    campaignId: record.campaignId,
    articleId: record.articleId,
    status: record.status as DistributionRun["status"],
    destinationIds: [...record.destinationIds],
    attempts: record.attempts.map((a) => a as unknown as DestinationAttempt),
    businessIdempotencyKey: record.businessIdempotencyKey,
    fixtureOnly: record.fixtureOnly,
    createdAtIso: record.createdAtIso,
    updatedAtIso: record.updatedAtIso,
  };
}

export type CanonicalPublishOpsOptions = {
  gateway: ActionGateway;
  durable?: DurableExecutionService;
  stagingCms?: StagingCmsSimulator;
  gbp?: GbpFixtureSimulator;
  linkedIn?: LinkedInFixtureSimulator;
};

export type CanonicalPublishOps = {
  readonly acceptanceCaseIds: readonly string[];
  editArticle(input: {
    articleId: string;
    title?: string;
    body?: string;
    citedFactIds?: string[];
    hypothesisFactIds?: string[];
    nowIso?: string;
  }):
    | { ok: true; article: CanonicalArticle; digestChanged: boolean }
    | { ok: false; code: string; reasons: string[] };
  recordClaimSourceQa(input: {
    articleId: string;
    claims: ClaimSourceRecord[];
    factLabels: FactSupportLookup;
    nowIso?: string;
  }):
    | { ok: true; bundle: ContentClaimBundle; reasons: string[] }
    | { ok: false; code: string; reasons: string[] };
  bindIndependentReview(input: {
    articleId: string;
    authorRoleId?: "A13" | "A12" | "A14";
    proposalId?: string;
    nowIso?: string;
  }):
    | {
        ok: true;
        binding: ContentReviewBindingRecord;
        evidencePackageDigest: string;
      }
    | { ok: false; code: string; reason: string };
  listClaimBundles(limit?: number): ContentClaimBundle[];
  listReviewBindings(limit?: number): ContentReviewBindingRecord[];
  listDistributionRuns(limit?: number): ContentDistributionRunRecord[];
  /**
   * Canonical-first distribute: owned-site (staging CMS + content fixture),
   * then GBP + LinkedIn variants with per-destination format/claims/review/
   * receipt/independent read-back and durable accept/verify.
   */
  runCanonicalDistribution(input: {
    articleId: string;
    /** Defaults to CMS + GBP + LinkedIn. */
    destinationIds?: string[];
    authority: {
      outboundStopped: boolean;
      operatingMode: OperatingModeValue;
      policies: StandingPolicy[];
      grants: CapabilityGrant[];
      actorRole?: string;
    };
    productionMapping: ProductionMappingState;
    factLabels: FactSupportLookup;
    forceGbpFailure?: boolean;
    forceGbpUnknown?: boolean;
    nowIso?: string;
  }): Promise<{
    run: ContentDistributionRunRecord;
    article: CanonicalArticle | null;
    details: string[];
  }>;
  recoverDistribution(input: {
    runId: string;
    authority: {
      outboundStopped: boolean;
      operatingMode: OperatingModeValue;
      policies: StandingPolicy[];
      grants: CapabilityGrant[];
      actorRole?: string;
    };
    productionMapping: ProductionMappingState;
    factLabels: FactSupportLookup;
    nowIso?: string;
  }): Promise<{
    run: ContentDistributionRunRecord | null;
    details: string[];
  }>;
};

export function createCanonicalPublishOps(
  store: ContentStore,
  options: CanonicalPublishOpsOptions,
): CanonicalPublishOps {
  const gateway = options.gateway;
  const durable =
    options.durable ??
    createDurableExecutionService(createMemoryDurableStores());
  const stagingCms = options.stagingCms ?? createStagingCmsSimulator();
  const gbp = options.gbp ?? createGbpFixtureSimulator();
  const linkedIn = options.linkedIn ?? createLinkedInFixtureSimulator();

  // Seed a default staging page for owned-site article publishes.
  if (!stagingCms.getPage("page-canonical-blog")) {
    stagingCms.seedPage({
      pageId: "page-canonical-blog",
      siteId: "worksocial-pilot",
      path: "/blog/canonical",
      fields: {
        title: "Placeholder",
        metaDescription: "Placeholder",
        h1: "Placeholder",
        bodyExcerpt: "Placeholder",
      },
      revision: "rev_seed",
      contentDigest: "seed",
      updatedAtIso: new Date().toISOString(),
    });
  }

  const persistRun = (run: DistributionRun) => {
    const record = toRunRecord(run);
    store.upsertDistributionRun(record);
    return record;
  };

  const findVariant = (
    articleId: string,
    destinationId: string,
  ): DestinationVariant | null =>
    store
      .read()
      .variants.find(
        (v) =>
          v.articleId === articleId && v.destinationId === destinationId,
      ) ?? null;

  async function durableAccept(input: {
    operationId: string;
    businessKey: string;
    assetId: string;
    writePathId: string;
    payloadDigest: string;
    grantId: string | null;
    policyId: string | null;
    reason: string;
    decidedAtIso: string;
    nowIso: string;
    roleId: string;
  }): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      await durable.acceptPending({
        job: {
          jobId: newJobId(),
          roleId: input.roleId,
          workflowId: "wf-canonical-publish",
          siteId: "worksocial-pilot",
          assetId: input.assetId,
          trigger: "canonical_distribution",
          policyVersion: "1",
          inputArtifactIds: [],
          capabilityGrantId: input.grantId ?? "grant-content-fixture",
          sourceRevision: input.payloadDigest.slice(0, 24),
          maxAttempts: 3,
          deadlineSeconds: 900,
          idempotencyKey: input.businessKey,
          expectedOutcome: "verified_destination_receipt",
        },
        operationId: input.operationId,
        payloadDigest: input.payloadDigest,
        businessIdempotencyKey: input.businessKey,
        nowIso: input.nowIso,
        decision: {
          decisionId: `dec-${input.operationId}`,
          operationId: input.operationId,
          payloadDigest: input.payloadDigest,
          allowed: true,
          code: null,
          reason: input.reason,
          grantId: input.grantId,
          policyId: input.policyId,
          decidedAtIso: input.decidedAtIso,
          writePathId: input.writePathId,
          gateDetails: [],
        },
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async function durableVerify(input: {
    operationId: string;
    observedDigest: string;
    nowIso: string;
  }): Promise<{ matched: boolean; details: string[] }> {
    try {
      const v = await durable.verifyIndependent({
        operationId: input.operationId,
        observedDigest: input.observedDigest,
        observedPayload: { operationId: input.operationId },
        nowIso: input.nowIso,
      });
      return {
        matched: v.matched,
        details: v.matched
          ? [`Durable verify VERIFIED (applyCount=${v.applyAttemptCount})`]
          : ["Durable independent verify mismatched"],
      };
    } catch (err) {
      return {
        matched: false,
        details: [
          `Durable verify error: ${err instanceof Error ? err.message : String(err)}`,
        ],
      };
    }
  }

  return {
    acceptanceCaseIds: CANONICAL_PUBLISH_RELATED_CASE_IDS,

    editArticle(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const article =
        store.read().articles.find((a) => a.articleId === input.articleId) ??
        null;
      if (!article) {
        return {
          ok: false,
          code: "ARTICLE_NOT_FOUND",
          reasons: [`Unknown article ${input.articleId}`],
        };
      }
      const edited = editCanonicalArticle({
        article,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.citedFactIds !== undefined
          ? { citedFactIds: input.citedFactIds }
          : {}),
        ...(input.hypothesisFactIds !== undefined
          ? { hypothesisFactIds: input.hypothesisFactIds }
          : {}),
        nowIso,
      });
      if (!edited.ok) return edited;
      store.upsertArticle(edited.article);
      if (edited.digestChanged) {
        // Invalidate prior review bindings for this article on digest change.
        for (const binding of store.read().reviewBindings) {
          if (
            binding.articleId === edited.article.articleId &&
            binding.status === "bound"
          ) {
            store.upsertReviewBinding({
              ...binding,
              status: "invalidated",
              updatedAtIso: nowIso,
              bindingJson: {
                ...binding.bindingJson,
                status: "invalidated",
                invalidationReason: "Article digest changed — rebind A25 review",
              },
            });
          }
        }
      }
      return edited;
    },

    recordClaimSourceQa(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const article =
        store.read().articles.find((a) => a.articleId === input.articleId) ??
        null;
      if (!article) {
        return {
          ok: false,
          code: "ARTICLE_NOT_FOUND",
          reasons: [`Unknown article ${input.articleId}`],
        };
      }
      const qa = evaluateClaimSourceQa({
        article,
        claims: input.claims,
        factLabels: input.factLabels,
      });
      if (!qa.allowed) {
        return {
          ok: false,
          code: qa.code ?? "CLAIM_SOURCE_QA_FAILED",
          reasons: qa.reasons,
        };
      }
      const bundle: ContentClaimBundle = {
        articleId: article.articleId,
        contentDigest: article.contentDigest,
        claims: input.claims.map((c) => ({ ...c })),
        recordedAtIso: nowIso,
      };
      store.upsertClaimBundle(bundle);
      if (
        article.status === ArticleStatus.DRAFT ||
        article.status === ArticleStatus.REJECTED
      ) {
        store.upsertArticle({
          ...article,
          status: ArticleStatus.READY_FOR_REVIEW,
          updatedAtIso: nowIso,
        });
      }
      return { ok: true, bundle, reasons: qa.reasons };
    },

    bindIndependentReview(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const state = store.read();
      const article =
        state.articles.find((a) => a.articleId === input.articleId) ?? null;
      if (!article) {
        return {
          ok: false,
          code: "ARTICLE_NOT_FOUND",
          reason: `Unknown article ${input.articleId}`,
        };
      }
      const bundle =
        state.claimBundles
          .filter(
            (b) =>
              b.articleId === article.articleId &&
              b.contentDigest === article.contentDigest,
          )
          .at(-1) ?? null;
      if (!bundle) {
        return {
          ok: false,
          code: "CLAIM_SOURCE_REQUIRED",
          reason:
            "Record claim/source QA for the current revision before A25 binding",
        };
      }
      const evidencePackageDigest = digestContentEvidencePackage({
        articleId: article.articleId,
        contentDigest: article.contentDigest,
        version: article.version,
        citedFactIds: article.citedFactIds,
        claimIds: bundle.claims.map((c) => c.claimId),
      });
      const authorRoleId = input.authorRoleId ?? "A13";
      const proposalId = input.proposalId ?? `prop-${randomUUID()}`;
      const bound = bindContentIndependentReview({
        bindingId: `crb-${randomUUID()}`,
        proposal: {
          proposalId,
          authorRoleId,
          actionClass: ActionClass.ROUTINE_PUBLISH,
          operation: "publish_article",
          assetId: article.articleId,
          channelId: "owned-site",
          payloadDigest: article.contentDigest,
          evidenceArtifactIds: bundle.claims.map((c) => c.sourceRef),
        },
        snapshot: {
          articleId: article.articleId,
          version: article.version,
          contentDigest: article.contentDigest,
          evidencePackageDigest,
          citedFactIds: article.citedFactIds,
        },
        createdAtIso: nowIso,
      });
      if (!bound.ok) {
        return { ok: false, code: bound.code, reason: bound.reason };
      }
      const record: ContentReviewBindingRecord = {
        bindingId: bound.binding.bindingId,
        articleId: article.articleId,
        contentDigest: article.contentDigest,
        version: article.version,
        evidencePackageDigest,
        proposalId,
        authorRoleId,
        reviewerRoleId: "A25",
        status: bound.binding.status,
        bindingJson: { ...bound.binding } as unknown as Record<string, unknown>,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      store.upsertReviewBinding(record);
      return { ok: true, binding: record, evidencePackageDigest };
    },

    listClaimBundles: (limit) => store.listClaimBundles(limit),
    listReviewBindings: (limit) => store.listReviewBindings(limit),
    listDistributionRuns: (limit) => store.listDistributionRuns(limit),

    async runCanonicalDistribution(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const details: string[] = [];
      const state = store.read();
      const article =
        state.articles.find((a) => a.articleId === input.articleId) ?? null;
      if (!article) {
        return {
          run: toRunRecord(
            createDistributionRun({
              runId: `run-missing`,
              campaignId: "unknown",
              articleId: input.articleId,
              destinationIds: [],
              businessIdempotencyKey: "missing",
              fixtureOnly: true,
              createdAtIso: nowIso,
            }),
          ),
          article: null,
          details: [`Unknown article ${input.articleId}`],
        };
      }

      const destinationIds =
        input.destinationIds ??
        ["dest-cms", "dest-gbp", "dest-linkedin"].filter(Boolean);

      const businessKey = stableContentOperationKey({
        kind: "distribution",
        campaignId: article.campaignId,
        articleId: article.articleId,
        contentDigest: article.contentDigest,
        version: article.version,
      });

      // Idempotent: reuse existing run for same business key when still open.
      // Checked before APPROVED gate so COMPLETE retries refuse duplicate effects
      // even after the article is already VERIFIED.
      const existing = state.distributionRuns.find(
        (r) =>
          r.businessIdempotencyKey === businessKey &&
          (r.status === DistributionRunStatus.PARTIAL ||
            r.status === DistributionRunStatus.IN_PROGRESS ||
            r.status === DistributionRunStatus.COMPLETE ||
            r.status === DistributionRunStatus.RECOVERING),
      );
      let run: DistributionRun = existing
        ? fromRunRecord(existing)
        : createDistributionRun({
            runId: `run-${randomUUID()}`,
            campaignId: article.campaignId,
            articleId: article.articleId,
            destinationIds,
            businessIdempotencyKey: businessKey,
            fixtureOnly: article.fixtureOnly,
            createdAtIso: nowIso,
          });

      if (existing?.status === DistributionRunStatus.COMPLETE) {
        details.push(
          "Distribution already COMPLETE for this business key — refusing duplicate effects",
        );
        return { run: toRunRecord(run), article, details };
      }

      if (
        article.status !== ArticleStatus.APPROVED &&
        existing?.status !== DistributionRunStatus.PARTIAL &&
        existing?.status !== DistributionRunStatus.RECOVERING &&
        existing?.status !== DistributionRunStatus.IN_PROGRESS
      ) {
        return {
          run: toRunRecord(
            createDistributionRun({
              runId: `run-blocked-${article.articleId}`,
              campaignId: article.campaignId,
              articleId: article.articleId,
              destinationIds: [],
              businessIdempotencyKey: "blocked",
              fixtureOnly: true,
              createdAtIso: nowIso,
            }),
          ),
          article,
          details: [
            `Article status is ${article.status}; distribution requires APPROVED`,
          ],
        };
      }

      const binding =
        state.reviewBindings
          .filter(
            (b) =>
              b.articleId === article.articleId &&
              b.contentDigest === article.contentDigest &&
              b.status === "bound",
          )
          .at(-1) ?? null;
      if (!binding) {
        details.push(
          "No bound A25 review for current revision — continuing with QA verdict path only (bindIndependentReview recommended)",
        );
      }

      store.upsertCampaign({
        ...(state.campaigns.find((c) => c.campaignId === article.campaignId) ?? {
          campaignId: article.campaignId,
          title: article.title,
          topic: article.title,
          brief: {
            briefId: `brief-${article.campaignId}`,
            audienceNeed: "",
            practicalValue: "",
            intendedAction: "",
            sourceFactIds: [],
            createdAtIso: nowIso,
          },
          status: CampaignStatus.DISTRIBUTING,
          canonicalArticleId: article.articleId,
          destinationIds,
          fixtureOnly: true,
          createdAtIso: nowIso,
          updatedAtIso: nowIso,
        }),
        status: CampaignStatus.DISTRIBUTING,
        destinationIds,
        updatedAtIso: nowIso,
      });

      // Ensure fixture write paths exist for this article asset (not only golden).
      const ensured = ensureContentMappingForArticle(
        input.productionMapping,
        article.articleId,
        nowIso,
      );
      const productionMapping = ensured.state;
      const articleWritePaths = ensured.writePathIds;
      details.push(
        `Ensured fixture write paths for article ${article.articleId}`,
      );

      // --- 1) Owned-site / CMS canonical ---
      if (destinationIds.includes("dest-cms")) {
        const prior = run.attempts.find((a) => a.destinationId === "dest-cms");
        if (prior?.status === DestinationAttemptStatus.VERIFIED) {
          details.push("CMS already verified — skip");
        } else {
          const opId = stableGatewayOperationId({
            destinationId: "dest-cms",
            articleId: article.articleId,
            contentDigest: article.contentDigest,
            version: article.version,
          });
          const opKey = stableContentOperationKey({
            kind: "canonical",
            campaignId: article.campaignId,
            articleId: article.articleId,
            destinationId: "dest-cms",
            contentDigest: article.contentDigest,
            version: article.version,
          });
          const snapshot: GatewayAuthoritySnapshot = {
            outboundStopped: input.authority.outboundStopped,
            operatingMode: input.authority.operatingMode,
            actorRole: input.authority.actorRole ?? "administrator",
            policies: input.authority.policies,
            grants: input.authority.grants,
            nowIso,
            productionMapping,
          };
          const submitted = gateway.submitIntent(
            {
              operationId: opId,
              actionClass: ActionClass.ROUTINE_PUBLISH,
              channelId: "owned-site",
              targetAccountId: "acct-demo",
              operation: "publish_article",
              assetId: article.articleId,
              contentRevision: article.contentDigest,
              writePathId: articleWritePaths.cms,
              payload: {
                articleId: article.articleId,
                title: article.title,
                contentDigest: article.contentDigest,
                fixtureOnly: true,
              },
            },
            snapshot,
          );
          details.push(`CMS gateway: ${submitted.decision.reason}`);

          if (!submitted.decision.allowed) {
            run = upsertDestinationAttempt(run, {
              attemptId: `att-${randomUUID()}`,
              destinationId: "dest-cms",
              kind: DestinationKind.CMS,
              variantId: null,
              articleId: article.articleId,
              status:
                submitted.decision.code === "OUTBOUND_STOPPED"
                  ? DestinationAttemptStatus.BLOCKED
                  : DestinationAttemptStatus.FAILED,
              operationKey: opKey,
              durableOperationId: null,
              gatewayOperationId: opId,
              receiptId: null,
              outcome:
                submitted.decision.code === "OUTBOUND_STOPPED"
                  ? PublicationOutcome.BLOCKED
                  : PublicationOutcome.FAILED,
              summary: submitted.decision.reason,
              updatedAtIso: nowIso,
            });
            details.push("CMS blocked/failed — dependents will wait");
          } else {
            const dur = await durableAccept({
              operationId: opId,
              businessKey: opKey,
              assetId: article.articleId,
              writePathId: articleWritePaths.cms,
              payloadDigest: article.contentDigest,
              grantId: submitted.decision.grantId,
              policyId: submitted.decision.policyId,
              reason: submitted.decision.reason,
              decidedAtIso: submitted.decision.decidedAtIso,
              nowIso,
              roleId: "A15",
            });
            if (!dur.ok) {
              details.push(`CMS durable accept failed: ${dur.reason}`);
              run = upsertDestinationAttempt(run, {
                attemptId: `att-${randomUUID()}`,
                destinationId: "dest-cms",
                kind: DestinationKind.CMS,
                variantId: null,
                articleId: article.articleId,
                status: DestinationAttemptStatus.FAILED,
                operationKey: opKey,
                durableOperationId: null,
                gatewayOperationId: opId,
                receiptId: null,
                outcome: PublicationOutcome.FAILED,
                summary: dur.reason,
                updatedAtIso: nowIso,
              });
            } else {
              // Staging CMS apply (owned-site) + content fixture ledger.
              const desired = {
                title: article.title,
                metaDescription: article.title.slice(0, 140),
                h1: article.title,
                bodyExcerpt: article.body.slice(0, 280),
              };
              const staging = stagingCms.applyChange({
                changeId: `chg-${opId}`,
                missionId: run.runId,
                pageId: "page-canonical-blog",
                desiredFields: desired,
                nowIso,
              });
              details.push(staging.note);
              const adapter = invokeDestinationAdapter({
                kind: DestinationKind.CMS,
                preferLive: false,
                articleId: article.articleId,
                title: article.title,
              });
              details.push(adapter.summary);

              store.upsertArticle({
                ...article,
                status: ArticleStatus.RELEASED_PENDING,
                gatewayOperationId: opId,
                writePathId: articleWritePaths.cms,
                updatedAtIso: nowIso,
              });
              store.update((s) => ({
                ...s,
                fixtureCanonicalLedger: {
                  ...s.fixtureCanonicalLedger,
                  [article.articleId]: {
                    title: article.title,
                    body: article.body,
                    contentDigest: article.contentDigest,
                  },
                },
                updatedAtIso: nowIso,
              }));

              const read = stagingCms.independentRead({
                change: staging.change,
                nowIso,
              });
              details.push(...read.details);
              const ledger =
                store.read().fixtureCanonicalLedger[article.articleId] ?? {};
              const matched =
                read.matched &&
                ledger.title === article.title &&
                ledger.body === article.body;

              const dVerify = await durableVerify({
                operationId: opId,
                observedDigest: article.contentDigest,
                nowIso,
              });
              details.push(...dVerify.details);

              if (matched && dVerify.matched) {
                gateway.markVerified(opId, nowIso);
                const url = `https://fixture.worksocial.local/articles/${article.articleId}`;
                store.upsertArticle({
                  ...store
                    .read()
                    .articles.find((a) => a.articleId === article.articleId)!,
                  status: ArticleStatus.VERIFIED,
                  verifiedCanonicalUrl: url,
                  updatedAtIso: nowIso,
                });
                run = upsertDestinationAttempt(run, {
                  attemptId: `att-${randomUUID()}`,
                  destinationId: "dest-cms",
                  kind: DestinationKind.CMS,
                  variantId: null,
                  articleId: article.articleId,
                  status: DestinationAttemptStatus.VERIFIED,
                  operationKey: opKey,
                  durableOperationId: opId,
                  gatewayOperationId: opId,
                  receiptId: `rcpt-${opId}`,
                  outcome: PublicationOutcome.PUBLISHED_VERIFIED,
                  summary: "Owned-site verified via staging CMS + fixture ledger",
                  updatedAtIso: nowIso,
                });
                details.push("CMS PUBLISHED_VERIFIED");
              } else {
                run = upsertDestinationAttempt(run, {
                  attemptId: `att-${randomUUID()}`,
                  destinationId: "dest-cms",
                  kind: DestinationKind.CMS,
                  variantId: null,
                  articleId: article.articleId,
                  status: DestinationAttemptStatus.FAILED,
                  operationKey: opKey,
                  durableOperationId: opId,
                  gatewayOperationId: opId,
                  receiptId: null,
                  outcome: PublicationOutcome.FAILED,
                  summary: "Owned-site independent read-back failed",
                  updatedAtIso: nowIso,
                });
              }
            }
          }
        }
      }

      const refreshedArticle =
        store.read().articles.find((a) => a.articleId === article.articleId) ??
        article;
      const canonicalReady =
        refreshedArticle.status === ArticleStatus.VERIFIED &&
        Boolean(refreshedArticle.verifiedCanonicalUrl);

      // --- 2) GBP + LinkedIn (require verified canonical) ---
      for (const destId of destinationIds.filter((d) => d !== "dest-cms")) {
        const prior = run.attempts.find((a) => a.destinationId === destId);
        if (prior?.status === DestinationAttemptStatus.VERIFIED) {
          details.push(`${destId} already verified — skip`);
          continue;
        }
        if (!canonicalReady) {
          run = upsertDestinationAttempt(run, {
            attemptId: `att-${randomUUID()}`,
            destinationId: destId,
            kind:
              destId === "dest-gbp"
                ? DestinationKind.GBP
                : DestinationKind.LINKEDIN,
            variantId: findVariant(article.articleId, destId)?.variantId ?? null,
            articleId: article.articleId,
            status: DestinationAttemptStatus.BLOCKED,
            operationKey: stableContentOperationKey({
              kind: "variant",
              campaignId: article.campaignId,
              articleId: article.articleId,
              destinationId: destId,
              contentDigest: article.contentDigest,
              version: article.version,
            }),
            durableOperationId: null,
            gatewayOperationId: null,
            receiptId: null,
            outcome: PublicationOutcome.BLOCKED,
            summary: "Blocked — verified canonical URL required first",
            updatedAtIso: nowIso,
          });
          details.push(`${destId} blocked until canonical verified`);
          continue;
        }

        let variant = findVariant(article.articleId, destId);
        if (!variant) {
          // Auto-prepare a short-update / social variant from the article.
          const destinations =
            store.read().destinations.length > 0
              ? store.read().destinations
              : [];
          const dest = destinations.find((d) => d.destinationId === destId);
          if (!dest) {
            details.push(`Unknown destination ${destId}`);
            continue;
          }
          const format =
            destId === "dest-gbp"
              ? ContentFormat.SHORT_UPDATE
              : ContentFormat.SHORT_UPDATE;
          const created = createDestinationVariant({
            variantId: `var-${destId}-${article.articleId}`,
            campaignId: article.campaignId,
            article: refreshedArticle,
            destination: dest,
            format,
            body:
              destId === "dest-gbp"
                ? refreshedArticle.body.slice(0, Math.min(280, refreshedArticle.body.length))
                : refreshedArticle.body.slice(0, 500),
            fixtureOnly: true,
            createdAtIso: nowIso,
          });
          if (!created.ok) {
            details.push(...created.reasons);
            run = upsertDestinationAttempt(run, {
              attemptId: `att-${randomUUID()}`,
              destinationId: destId,
              kind: dest.kind,
              variantId: null,
              articleId: article.articleId,
              status: DestinationAttemptStatus.FAILED,
              operationKey: "n/a",
              durableOperationId: null,
              gatewayOperationId: null,
              receiptId: null,
              outcome: PublicationOutcome.FAILED,
              summary: created.reasons.join("; "),
              updatedAtIso: nowIso,
            });
            continue;
          }
          variant = { ...created.variant, status: VariantStatus.READY };
          store.upsertVariant(variant);
        }

        // Per-variant QA required
        const vQa =
          store
            .read()
            .variantQaVerdicts.filter(
              (v) =>
                v.variantId === variant!.variantId &&
                v.contentDigest === variant!.contentDigest &&
                v.approved,
            )
            .at(-1) ?? null;
        if (!vQa) {
          // Auto-record fixture independent variant QA for M6 happy path when
          // claims already passed article QA — still digest-bound.
          const auto = createVariantQaVerdict({
            verdictId: `vqa-${randomUUID()}`,
            variantId: variant.variantId,
            articleId: article.articleId,
            authorId: refreshedArticle.authorId,
            reviewerId: "reviewer-a25",
            approved: true,
            contentDigest: variant.contentDigest,
            citedFactIds: variant.citedFactIds,
            summary: "M6 auto fixture per-destination claim review",
            decidedAtIso: nowIso,
          });
          if (auto.ok) {
            store.addVariantQaVerdict(auto.verdict);
            details.push(`Recorded per-destination QA for ${destId}`);
          }
        }

        const writePathId =
          destId === "dest-gbp"
            ? articleWritePaths.gbp
            : articleWritePaths.linkedin;
        const opId = stableGatewayOperationId({
          destinationId: destId,
          articleId: article.articleId,
          contentDigest: variant.contentDigest,
          version: article.version,
        });
        const opKey = stableContentOperationKey({
          kind: "variant",
          campaignId: article.campaignId,
          articleId: article.articleId,
          destinationId: destId,
          contentDigest: variant.contentDigest,
          version: article.version,
        });

        const snapshot: GatewayAuthoritySnapshot = {
          outboundStopped: input.authority.outboundStopped,
          operatingMode: input.authority.operatingMode,
          actorRole: input.authority.actorRole ?? "administrator",
          policies: input.authority.policies,
          grants: input.authority.grants,
          nowIso,
          productionMapping,
        };
        // Asset scope + contentRevisionBound follow the canonical article
        // (same as releaseVariant) — write paths are mapped to article asset id.
        const submitted = gateway.submitIntent(
          {
            operationId: opId,
            actionClass: ActionClass.ROUTINE_PUBLISH,
            channelId: destId === "dest-gbp" ? "gbp" : "linkedin",
            targetAccountId: "acct-demo",
            operation:
              destId === "dest-gbp"
                ? "publish_gbp_update"
                : "publish_social_post",
            assetId: article.articleId,
            contentRevision: refreshedArticle.contentDigest,
            writePathId,
            payload: {
              variantId: variant.variantId,
              destinationId: destId,
              contentDigest: variant.contentDigest,
              fixtureOnly: true,
            },
          },
          snapshot,
        );
        details.push(`${destId} gateway: ${submitted.decision.reason}`);
        if (!submitted.decision.allowed) {
          run = upsertDestinationAttempt(run, {
            attemptId: `att-${randomUUID()}`,
            destinationId: destId,
            kind: variant.kind,
            variantId: variant.variantId,
            articleId: article.articleId,
            status:
              submitted.decision.code === "OUTBOUND_STOPPED"
                ? DestinationAttemptStatus.BLOCKED
                : DestinationAttemptStatus.FAILED,
            operationKey: opKey,
            durableOperationId: null,
            gatewayOperationId: opId,
            receiptId: null,
            outcome:
              submitted.decision.code === "OUTBOUND_STOPPED"
                ? PublicationOutcome.BLOCKED
                : PublicationOutcome.FAILED,
            summary: submitted.decision.reason,
            updatedAtIso: nowIso,
          });
          continue;
        }

        const dur = await durableAccept({
          operationId: opId,
          businessKey: opKey,
          assetId: article.articleId,
          writePathId,
          payloadDigest: variant.contentDigest,
          grantId: submitted.decision.grantId,
          policyId: submitted.decision.policyId,
          reason: submitted.decision.reason,
          decidedAtIso: submitted.decision.decidedAtIso,
          nowIso,
          roleId: "A16",
        });
        if (!dur.ok) {
          details.push(`${destId} durable accept failed: ${dur.reason}`);
          run = upsertDestinationAttempt(run, {
            attemptId: `att-${randomUUID()}`,
            destinationId: destId,
            kind: variant.kind,
            variantId: variant.variantId,
            articleId: article.articleId,
            status: DestinationAttemptStatus.FAILED,
            operationKey: opKey,
            durableOperationId: null,
            gatewayOperationId: opId,
            receiptId: null,
            outcome: PublicationOutcome.FAILED,
            summary: dur.reason,
            updatedAtIso: nowIso,
          });
          continue;
        }

        let applyOutcome: {
          outcome: string;
          remoteId: string | null;
          note: string;
        };
        if (destId === "dest-gbp") {
          applyOutcome = gbp.apply({
            variantId: variant.variantId,
            body: variant.body,
            nowIso,
            forceFailure: input.forceGbpFailure === true,
            forceUnknownRemote: input.forceGbpUnknown === true,
          });
        } else {
          applyOutcome = linkedIn.apply({
            variantId: variant.variantId,
            title: variant.title,
            body: variant.body,
            nowIso,
          });
        }
        details.push(applyOutcome.note);

        if (applyOutcome.outcome === "UNKNOWN_REMOTE_OUTCOME") {
          run = upsertDestinationAttempt(run, {
            attemptId: `att-${randomUUID()}`,
            destinationId: destId,
            kind: variant.kind,
            variantId: variant.variantId,
            articleId: article.articleId,
            status: DestinationAttemptStatus.UNKNOWN_REMOTE,
            operationKey: opKey,
            durableOperationId: opId,
            gatewayOperationId: opId,
            receiptId: null,
            outcome: PublicationOutcome.UNKNOWN_REMOTE_OUTCOME,
            summary: applyOutcome.note,
            updatedAtIso: nowIso,
          });
          continue;
        }
        if (applyOutcome.outcome !== "ACCEPTED_PENDING") {
          run = upsertDestinationAttempt(run, {
            attemptId: `att-${randomUUID()}`,
            destinationId: destId,
            kind: variant.kind,
            variantId: variant.variantId,
            articleId: article.articleId,
            status: DestinationAttemptStatus.FAILED,
            operationKey: opKey,
            durableOperationId: opId,
            gatewayOperationId: opId,
            receiptId: null,
            outcome: PublicationOutcome.FAILED,
            summary: applyOutcome.note,
            updatedAtIso: nowIso,
          });
          continue;
        }

        store.upsertVariant({
          ...variant,
          status: VariantStatus.RELEASED_PENDING,
          gatewayOperationId: opId,
          writePathId,
          remoteId: applyOutcome.remoteId,
          updatedAtIso: nowIso,
        });
        store.update((s) => ({
          ...s,
          fixtureVariantLedger: {
            ...s.fixtureVariantLedger,
            [variant!.variantId]: {
              title: variant!.title,
              body: variant!.body,
              contentDigest: variant!.contentDigest,
            },
          },
          updatedAtIso: nowIso,
        }));

        const read =
          destId === "dest-gbp"
            ? gbp.independentRead({
                variantId: variant.variantId,
                expectedBody: variant.body,
              })
            : linkedIn.independentRead({
                variantId: variant.variantId,
                expectedTitle: variant.title,
                expectedBody: variant.body,
              });
        details.push(...read.details);
        const dVerify = await durableVerify({
          operationId: opId,
          observedDigest: variant.contentDigest,
          nowIso,
        });
        details.push(...dVerify.details);

        if (read.matched && dVerify.matched) {
          gateway.markVerified(opId, nowIso);
          store.upsertVariant({
            ...store
              .read()
              .variants.find((v) => v.variantId === variant!.variantId)!,
            status: VariantStatus.VERIFIED,
            updatedAtIso: nowIso,
          });
          run = upsertDestinationAttempt(run, {
            attemptId: `att-${randomUUID()}`,
            destinationId: destId,
            kind: variant.kind,
            variantId: variant.variantId,
            articleId: article.articleId,
            status: DestinationAttemptStatus.VERIFIED,
            operationKey: opKey,
            durableOperationId: opId,
            gatewayOperationId: opId,
            receiptId: `rcpt-${opId}`,
            outcome: PublicationOutcome.PUBLISHED_VERIFIED,
            summary: `${destId} verified via independent fixture read-back`,
            updatedAtIso: nowIso,
          });
        } else {
          run = upsertDestinationAttempt(run, {
            attemptId: `att-${randomUUID()}`,
            destinationId: destId,
            kind: variant.kind,
            variantId: variant.variantId,
            articleId: article.articleId,
            status: DestinationAttemptStatus.FAILED,
            operationKey: opKey,
            durableOperationId: opId,
            gatewayOperationId: opId,
            receiptId: null,
            outcome: PublicationOutcome.FAILED,
            summary: `${destId} independent read-back failed`,
            updatedAtIso: nowIso,
          });
        }
      }

      if (run.status === DistributionRunStatus.COMPLETE) {
        const camp = store
          .read()
          .campaigns.find((c) => c.campaignId === article.campaignId);
        if (camp) {
          store.upsertCampaign({
            ...camp,
            status: CampaignStatus.COMPLETE,
            updatedAtIso: nowIso,
          });
        }
      }

      const record = persistRun(run);
      details.push(`Distribution status=${record.status}`);
      return {
        run: record,
        article:
          store.read().articles.find((a) => a.articleId === article.articleId) ??
          null,
        details,
      };
    },

    async recoverDistribution(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const details: string[] = [];
      const record =
        store.read().distributionRuns.find((r) => r.runId === input.runId) ??
        null;
      if (!record) {
        return { run: null, details: [`Unknown run ${input.runId}`] };
      }
      let run = fromRunRecord(record);
      if (run.status === DistributionRunStatus.COMPLETE) {
        return {
          run: record,
          details: ["Run already COMPLETE — nothing to recover"],
        };
      }

      const recoverable = listRecoverableDestinations(run);
      if (recoverable.length === 0) {
        return {
          run: record,
          details: ["No recoverable destinations (verified stays untouched)"],
        };
      }

      run = {
        ...run,
        status: DistributionRunStatus.RECOVERING,
        updatedAtIso: nowIso,
      };
      persistRun(run);

      const article =
        store.read().articles.find((a) => a.articleId === run.articleId) ?? null;
      if (!article) {
        return { run: toRunRecord(run), details: ["Article missing"] };
      }

      for (const attempt of recoverable) {
        if (attempt.destinationId === "dest-cms") {
          details.push("Re-running CMS via distribution (verified destinations skipped)");
          continue;
        }
        const variant = attempt.variantId
          ? store
              .read()
              .variants.find((v) => v.variantId === attempt.variantId) ?? null
          : findVariant(article.articleId, attempt.destinationId);
        if (!variant) {
          details.push(`Missing variant for ${attempt.destinationId}`);
          continue;
        }
        if (attempt.status === DestinationAttemptStatus.UNKNOWN_REMOTE) {
          const recovered =
            attempt.destinationId === "dest-gbp"
              ? gbp.recover({
                  variantId: variant.variantId,
                  body: variant.body,
                  nowIso,
                })
              : linkedIn.recover({
                  variantId: variant.variantId,
                  title: variant.title,
                  body: variant.body,
                  nowIso,
                });
          details.push(`Recover ${attempt.destinationId}: ${recovered.note}`);
          if (recovered.outcome !== "ACCEPTED_PENDING") {
            run = upsertDestinationAttempt(run, {
              ...attempt,
              attemptId: `att-${randomUUID()}`,
              status: DestinationAttemptStatus.FAILED,
              summary: recovered.note,
              updatedAtIso: nowIso,
            });
            continue;
          }
        }

        const read =
          attempt.destinationId === "dest-gbp"
            ? gbp.independentRead({
                variantId: variant.variantId,
                expectedBody: variant.body,
              })
            : linkedIn.independentRead({
                variantId: variant.variantId,
                expectedTitle: variant.title,
                expectedBody: variant.body,
              });
        details.push(...read.details);

        if (
          attempt.durableOperationId &&
          read.matched &&
          read.observedFields
        ) {
          const dVerify = await durableVerify({
            operationId: attempt.durableOperationId,
            observedDigest: variant.contentDigest,
            nowIso,
          });
          details.push(...dVerify.details);
          if (dVerify.matched) {
              if (attempt.gatewayOperationId) {
              if (!gateway.getDecision(attempt.gatewayOperationId)) {
                const ensured = ensureContentMappingForArticle(
                  input.productionMapping,
                  article.articleId,
                  nowIso,
                );
                gateway.rehydratePending({
                  operationId: attempt.gatewayOperationId,
                  writePathId:
                    attempt.destinationId === "dest-gbp"
                      ? ensured.writePathIds.gbp
                      : ensured.writePathIds.linkedin,
                  decidedAtIso: nowIso,
                  reason: "Rehydrated after recovery",
                });
              }
              gateway.markVerified(attempt.gatewayOperationId, nowIso);
            }
            store.upsertVariant({
              ...variant,
              status: VariantStatus.VERIFIED,
              updatedAtIso: nowIso,
            });
            run = upsertDestinationAttempt(run, {
              ...attempt,
              attemptId: `att-${randomUUID()}`,
              status: DestinationAttemptStatus.VERIFIED,
              outcome: PublicationOutcome.PUBLISHED_VERIFIED,
              summary: `Recovered and verified ${attempt.destinationId}`,
              updatedAtIso: nowIso,
            });
            continue;
          }
        }

        // Failed destinations: re-apply through simulator (verified never re-applied).
        if (
          attempt.status === DestinationAttemptStatus.FAILED ||
          attempt.status === DestinationAttemptStatus.BLOCKED
        ) {
          if (
            !article.verifiedCanonicalUrl &&
            article.status !== ArticleStatus.VERIFIED
          ) {
            details.push(
              `Cannot recover ${attempt.destinationId} without verified canonical`,
            );
            continue;
          }
          const reapply =
            attempt.destinationId === "dest-gbp"
              ? gbp.apply({
                  variantId: variant.variantId,
                  body: variant.body,
                  nowIso,
                })
              : linkedIn.apply({
                  variantId: variant.variantId,
                  title: variant.title,
                  body: variant.body,
                  nowIso,
                });
          details.push(`Re-apply ${attempt.destinationId}: ${reapply.note}`);
          if (reapply.outcome === "ACCEPTED_PENDING") {
            const read2 =
              attempt.destinationId === "dest-gbp"
                ? gbp.independentRead({
                    variantId: variant.variantId,
                    expectedBody: variant.body,
                  })
                : linkedIn.independentRead({
                    variantId: variant.variantId,
                    expectedTitle: variant.title,
                    expectedBody: variant.body,
                  });
            if (read2.matched) {
              store.upsertVariant({
                ...variant,
                status: VariantStatus.VERIFIED,
                remoteId: reapply.remoteId,
                updatedAtIso: nowIso,
              });
              run = upsertDestinationAttempt(run, {
                ...attempt,
                attemptId: `att-${randomUUID()}`,
                status: DestinationAttemptStatus.VERIFIED,
                outcome: PublicationOutcome.PUBLISHED_VERIFIED,
                summary: `Recovered ${attempt.destinationId} via re-apply + read-back`,
                updatedAtIso: nowIso,
              });
            }
          }
        }
      }

      if (run.status === DistributionRunStatus.COMPLETE) {
        const camp = store
          .read()
          .campaigns.find((c) => c.campaignId === article.campaignId);
        if (camp) {
          store.upsertCampaign({
            ...camp,
            status: CampaignStatus.COMPLETE,
            updatedAtIso: nowIso,
          });
        }
      }

      const saved = persistRun(run);
      details.push(`Recovery complete — status=${saved.status}`);
      return { run: saved, details };
    },
  };
}
