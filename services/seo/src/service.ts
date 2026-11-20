/**
 * SEO service: page audits, proposals, schema validation, semantic search,
 * and gateway-gated fixture pilot page release.
 * Live CMS publish remains NOT_WIRED.
 */

import { randomUUID } from "node:crypto";
import {
  ActionClass,
  LocalRole,
  OutcomeEvidenceSource,
  SEO_RELATED_CASE_IDS,
  SeoChangeKind,
  SeoProposalStatus,
  SeoReleaseDecision,
  applySeoReleaseVerification,
  createPageAudit,
  createSeoProposal,
  digestSchemaNodes,
  evaluateFixtureReadBack,
  evaluateProposalGate,
  listSeoOutcomesForLearning,
  runSemanticSearch,
  validateSchemaOrg,
  type FactSupportLookup,
  type OperatingModeValue,
  type PageAuditFinding,
  type PageAuditRecord,
  type ProductionMappingState,
  type CapabilityGrant,
  type SchemaOrgNode,
  type SchemaValidationResult,
  type SemanticSearchResult,
  type SeoChangeProposal,
  type SeoChangeKindValue,
  type SeoState,
  type StandingPolicy,
  type WritePathOutcomeEvidence,
} from "@worksocial/domain";
import type { SeoStore } from "@worksocial/persistence";
import {
  createActionGateway,
  type ActionGateway,
  type GatewayAuthoritySnapshot,
  type GatewayDecisionRecord,
} from "@worksocial/action-gateway";
import {
  SEO_GOLDEN_VISIBLE_CONTENT,
  SEO_PILOT_PAGE_ASSET_ID,
  SEO_PILOT_WRITE_PATH_ID,
  buildFixtureSeoSeed,
  createFixtureSeoPilotMapping,
  proveFixtureSeoWritePath,
} from "./fixtures.js";

const TERMINAL_OR_PROGRESSED: ReadonlySet<string> = new Set([
  SeoProposalStatus.APPROVED,
  SeoProposalStatus.REJECTED,
  SeoProposalStatus.RELEASED_PENDING,
  SeoProposalStatus.VERIFIED,
  SeoProposalStatus.FAILED,
]);

export type SeoServiceOptions = {
  /** Shared action gateway — required for durable API control plane. */
  gateway?: ActionGateway;
};

export type SeoService = {
  status(): ReturnType<SeoStore["status"]> & {
    acceptanceCaseIds: readonly string[];
    learningHookNote: string;
  };
  listAudits(limit?: number): PageAuditRecord[];
  listProposals(limit?: number): SeoChangeProposal[];
  listSchemaValidations(limit?: number): SchemaValidationResult[];
  seedFixtures(nowIso?: string): {
    audits: PageAuditRecord[];
    proposals: SeoChangeProposal[];
    searchIndexVersion: number;
    skippedProgressedProposalIds: string[];
  };
  createAudit(input: {
    pageAuditId?: string;
    pageAssetId: string;
    siteId: string;
    pagePath: string;
    displayName: string;
    findings?: PageAuditFinding[];
    fixtureOnly?: boolean;
    nowIso?: string;
  }): PageAuditRecord;
  createProposal(input: {
    proposalId?: string;
    pageAssetId: string;
    pageAuditId?: string | null;
    changeKind: SeoChangeKindValue;
    title: string;
    summary: string;
    proposedFields: Record<string, string>;
    citedFactIds?: string[];
    hypothesisFactIds?: string[];
    fixtureOnly?: boolean;
    nowIso?: string;
  }): SeoChangeProposal;
  validateSchema(input: {
    validationId?: string;
    pageAssetId: string;
    proposalId?: string | null;
    nodes: SchemaOrgNode[];
    visibleContent?: string;
    factLabels?: FactSupportLookup;
    fixtureOnly?: boolean;
    nowIso?: string;
  }):
    | { ok: true; validation: SchemaValidationResult }
    | { ok: false; code: string; reasons: string[] };
  reviewProposal(input: {
    proposalId: string;
    factLabels: FactSupportLookup;
    schemaValidationId?: string | null;
  }): {
    allowed: boolean;
    code: string | null;
    reasons: string[];
    proposal: SeoChangeProposal | null;
  };
  approveProposal(input: {
    proposalId: string;
    factLabels: FactSupportLookup;
    nowIso?: string;
  }): {
    ok: boolean;
    proposal: SeoChangeProposal | null;
    reasons: string[];
  };
  semanticSearch(input: {
    queryId?: string;
    rawQuery: string;
    nowIso?: string;
  }):
    | { ok: true; result: SemanticSearchResult }
    | { ok: false; code: string; reasons: string[] };
  /**
   * Pilot page release through the shared action gateway.
   * Requires persisted productionMapping with ownership + read evidence.
   * Leaves RELEASED_PENDING / ACCEPTED_PENDING — call verifyPilotRelease with read-back.
   */
  releasePilotPage(input: {
    proposalId: string;
    authority: {
      outboundStopped: boolean;
      operatingMode: OperatingModeValue;
      policies: StandingPolicy[];
      grants: CapabilityGrant[];
      /** Authenticated role; defaults to administrator for admin-gated callers. */
      actorRole?: string;
    };
    /** Required — must come from persisted mapping store, not ephemeral prove. */
    productionMapping: ProductionMappingState;
    factLabels: FactSupportLookup;
    targetAccountId?: string;
    contentRevision?: string | null;
    nowIso?: string;
  }): {
    proposal: SeoChangeProposal | null;
    gatewayDecision: GatewayDecisionRecord | null;
    outcome: WritePathOutcomeEvidence | null;
    liveCmsPublishWiring: "NOT_WIRED";
    acceptanceEqualsVerified: false;
    details: string[];
  };
  /**
   * Verify a RELEASED_PENDING proposal with explicit fixture read-back fields.
   * Gateway acceptance alone never promotes to VERIFIED.
   */
  verifyPilotRelease(input: {
    proposalId: string;
    observedFields: Record<string, string>;
    /** Force FAILURE after read-back comparison (negative tests). */
    forceFailure?: boolean;
    nowIso?: string;
  }): {
    proposal: SeoChangeProposal | null;
    gatewayDecision: GatewayDecisionRecord | null;
    outcome: WritePathOutcomeEvidence | null;
    details: string[];
  };
  seedAndProveSeoMapping(nowIso?: string): {
    mapping: ProductionMappingState;
    writePathId: string;
  };
  listLearningOutcomes(includeFixture?: boolean): WritePathOutcomeEvidence[];
  readState(): SeoState;
  readonly gateway: ActionGateway;
};

export function createSeoService(
  store: SeoStore,
  options: SeoServiceOptions = {},
): SeoService {
  const gateway = options.gateway ?? createActionGateway();

  return {
    gateway,

    status() {
      const base = store.status();
      return {
        ...base,
        acceptanceCaseIds: SEO_RELATED_CASE_IDS,
        learningHookNote:
          "Verified SEO release SUCCESS/FAILURE emits outcomes with fixtureOnly when fixture after explicit read-back. ACCEPTED_PENDING ≠ VERIFIED. Learning-worker may consume outcomes later; no authority auto-apply.",
      };
    },

    listAudits: (limit) => store.listAudits(limit),
    listProposals: (limit) => store.listProposals(limit),
    listSchemaValidations: (limit) => store.listSchemaValidations(limit),
    readState: () => store.read(),
    listLearningOutcomes: (includeFixture) =>
      listSeoOutcomesForLearning(
        store.read(),
        includeFixture === undefined ? undefined : { includeFixture },
      ),

    seedFixtures(nowIso) {
      const ts = nowIso ?? new Date().toISOString();
      const seed = buildFixtureSeoSeed(ts);
      const existing = store.read();
      const skippedProgressedProposalIds: string[] = [];

      for (const audit of seed.audits) store.upsertAudit(audit);

      for (const proposal of seed.proposals) {
        const prior = existing.proposals.find(
          (p) => p.proposalId === proposal.proposalId,
        );
        if (prior && TERMINAL_OR_PROGRESSED.has(prior.status)) {
          skippedProgressedProposalIds.push(prior.proposalId);
          continue;
        }
        store.upsertProposal(proposal);
      }

      store.setSearchIndex(seed.searchIndex);
      return {
        audits: seed.audits,
        proposals: seed.proposals.filter(
          (p) => !skippedProgressedProposalIds.includes(p.proposalId),
        ),
        searchIndexVersion: seed.searchIndex.version,
        skippedProgressedProposalIds,
      };
    },

    createAudit(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const audit = createPageAudit({
        pageAuditId: input.pageAuditId ?? `audit-${randomUUID()}`,
        pageAssetId: input.pageAssetId,
        siteId: input.siteId,
        pagePath: input.pagePath,
        displayName: input.displayName,
        findings: input.findings ?? [],
        fixtureOnly: input.fixtureOnly !== false,
        createdAtIso: nowIso,
      });
      store.upsertAudit(audit);
      return audit;
    },

    createProposal(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      // Client creation is always DRAFT — never verified/approved via create.
      const proposal = createSeoProposal({
        proposalId: input.proposalId ?? `prop-${randomUUID()}`,
        pageAssetId: input.pageAssetId,
        pageAuditId: input.pageAuditId ?? null,
        changeKind: input.changeKind,
        title: input.title,
        summary: input.summary,
        proposedFields: input.proposedFields,
        ...(input.citedFactIds !== undefined
          ? { citedFactIds: input.citedFactIds }
          : {}),
        ...(input.hypothesisFactIds !== undefined
          ? { hypothesisFactIds: input.hypothesisFactIds }
          : {}),
        fixtureOnly: input.fixtureOnly !== false,
        createdAtIso: nowIso,
        status: SeoProposalStatus.DRAFT,
      });
      store.upsertProposal(proposal);
      return proposal;
    },

    validateSchema(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const state = store.read();
      const reasons: string[] = [];

      let proposal: SeoChangeProposal | null = null;
      if (input.proposalId) {
        proposal =
          state.proposals.find((p) => p.proposalId === input.proposalId) ??
          null;
        if (!proposal) {
          return {
            ok: false,
            code: "PROPOSAL_NOT_FOUND",
            reasons: [`Unknown proposal ${input.proposalId}`],
          };
        }
        if (input.pageAssetId !== proposal.pageAssetId) {
          reasons.push(
            `pageAssetId ${input.pageAssetId} ≠ proposal ${proposal.pageAssetId}`,
          );
        }
        const nodeDigest = digestSchemaNodes(input.pageAssetId, input.nodes);
        if (nodeDigest !== proposal.schemaPayloadDigest) {
          reasons.push(
            "Schema nodes digest does not match proposal schemaPayloadDigest",
          );
        }
        if (reasons.length > 0) {
          return { ok: false, code: "SCHEMA_PROPOSAL_MISMATCH", reasons };
        }
      }

      if (!input.factLabels) {
        return {
          ok: false,
          code: "FACT_LABELS_REQUIRED",
          reasons: [
            "Fact labels must be derived from the knowledge registry by the caller",
          ],
        };
      }

      const validation = validateSchemaOrg({
        validationId: input.validationId ?? `val-${randomUUID()}`,
        pageAssetId: input.pageAssetId,
        proposalId: input.proposalId ?? null,
        nodes: input.nodes,
        visibleContent: input.visibleContent ?? SEO_GOLDEN_VISIBLE_CONTENT,
        factLabels: input.factLabels,
        fixtureOnly: input.fixtureOnly !== false,
        createdAtIso: nowIso,
      });
      store.addSchemaValidation(validation);
      return { ok: true, validation };
    },

    reviewProposal(input) {
      const state = store.read();
      const proposal =
        state.proposals.find((p) => p.proposalId === input.proposalId) ?? null;
      if (!proposal) {
        return {
          allowed: false,
          code: "PROPOSAL_NOT_FOUND",
          reasons: [`Unknown proposal ${input.proposalId}`],
          proposal: null,
        };
      }
      const schemaValidation = input.schemaValidationId
        ? state.schemaValidations.find(
            (v) => v.validationId === input.schemaValidationId,
          ) ?? null
        : state.schemaValidations
            .filter((v) => v.proposalId === proposal.proposalId)
            .at(-1) ?? null;

      return {
        ...evaluateProposalGate({
          proposal,
          factLabels: input.factLabels,
          schemaValidation,
        }),
        proposal,
      };
    },

    approveProposal(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const state = store.read();
      const proposal =
        state.proposals.find((p) => p.proposalId === input.proposalId) ?? null;
      if (!proposal) {
        return {
          ok: false,
          proposal: null,
          reasons: [`Unknown proposal ${input.proposalId}`],
        };
      }

      if (
        proposal.status !== SeoProposalStatus.DRAFT &&
        proposal.status !== SeoProposalStatus.READY_FOR_REVIEW
      ) {
        return {
          ok: false,
          proposal,
          reasons: [
            `Cannot approve proposal in status ${proposal.status}`,
          ],
        };
      }

      const schemaValidation =
        proposal.changeKind === SeoChangeKind.SCHEMA
          ? state.schemaValidations
              .filter((v) => v.proposalId === proposal.proposalId)
              .at(-1) ?? null
          : null;

      const gate = evaluateProposalGate({
        proposal: {
          ...proposal,
          status: SeoProposalStatus.READY_FOR_REVIEW,
        },
        factLabels: input.factLabels,
        schemaValidation,
      });
      if (!gate.allowed) {
        return { ok: false, proposal, reasons: gate.reasons };
      }

      const approved: SeoChangeProposal = {
        ...proposal,
        status: SeoProposalStatus.APPROVED,
        updatedAtIso: nowIso,
      };
      store.upsertProposal(approved);
      return { ok: true, proposal: approved, reasons: gate.reasons };
    },

    semanticSearch(input) {
      const state = store.read();
      if (!state.searchIndex) {
        return {
          ok: false,
          code: "SEARCH_INDEX_EMPTY",
          reasons: ["No semantic search index — seed fixtures first"],
        };
      }
      const nowIso = input.nowIso ?? new Date().toISOString();
      const result = runSemanticSearch({
        queryId: input.queryId ?? `q-${randomUUID()}`,
        rawQuery: input.rawQuery,
        index: state.searchIndex,
        createdAtIso: nowIso,
      });
      store.addSearchResult(result);
      return { ok: true, result };
    },

    seedAndProveSeoMapping(nowIso) {
      const ts = nowIso ?? new Date().toISOString();
      const { state, writePathId } = createFixtureSeoPilotMapping(ts);
      const proven = proveFixtureSeoWritePath(state, ts);
      return { mapping: proven, writePathId };
    },

    releasePilotPage(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const details: string[] = [];
      const state = store.read();
      const proposal =
        state.proposals.find((p) => p.proposalId === input.proposalId) ?? null;

      if (!proposal) {
        return {
          proposal: null,
          gatewayDecision: null,
          outcome: null,
          liveCmsPublishWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details: [`Unknown proposal ${input.proposalId}`],
        };
      }

      details.push("Live CMS publish adapter is NOT_WIRED — fixture release only");

      if (proposal.status !== SeoProposalStatus.APPROVED) {
        details.push(
          `Proposal status is ${proposal.status}; release requires APPROVED`,
        );
        return {
          proposal,
          gatewayDecision: null,
          outcome: null,
          liveCmsPublishWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }

      const schemaValidation =
        proposal.changeKind === SeoChangeKind.SCHEMA
          ? state.schemaValidations
              .filter((v) => v.proposalId === proposal.proposalId)
              .at(-1) ?? null
          : null;

      const gate = evaluateProposalGate({
        proposal,
        factLabels: input.factLabels,
        schemaValidation,
      });
      if (!gate.allowed) {
        details.push(...gate.reasons);
        return {
          proposal,
          gatewayDecision: null,
          outcome: null,
          liveCmsPublishWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }

      const mapping = input.productionMapping;
      const operationId = `seo-release-${randomUUID()}`;
      const snapshot: GatewayAuthoritySnapshot = {
        outboundStopped: input.authority.outboundStopped,
        operatingMode: input.authority.operatingMode,
        actorRole: input.authority.actorRole ?? LocalRole.ADMINISTRATOR,
        policies: input.authority.policies,
        grants: input.authority.grants,
        nowIso,
        productionMapping: mapping,
      };

      const submitted = gateway.submitIntent(
        {
          operationId,
          actionClass: ActionClass.ROUTINE_PUBLISH,
          channelId: "owned-site",
          targetAccountId: input.targetAccountId ?? "acct-demo",
          operation: "publish_page",
          assetId: proposal.pageAssetId || SEO_PILOT_PAGE_ASSET_ID,
          contentRevision: input.contentRevision ?? "rev-demo",
          writePathId: SEO_PILOT_WRITE_PATH_ID,
          payload: {
            proposalId: proposal.proposalId,
            proposedFields: proposal.proposedFields,
            fixtureOnly: proposal.fixtureOnly,
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
        const applied = applySeoReleaseVerification(store.read(), {
          proposalId: proposal.proposalId,
          decision: SeoReleaseDecision.FAILURE,
          source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
          fixtureOnly: proposal.fixtureOnly,
          summary: `Gateway denied SEO release: ${submitted.decision.code ?? submitted.decision.reason}`,
          outcomeId: `out-${randomUUID()}`,
          operationId,
          writePathId: SEO_PILOT_WRITE_PATH_ID,
          nowIso,
        });
        // Ensure gateway op id recorded even if apply overwrites status.
        const failed: SeoChangeProposal = {
          ...(applied.proposal ?? proposal),
          status: SeoProposalStatus.FAILED,
          gatewayOperationId: operationId,
          writePathId: SEO_PILOT_WRITE_PATH_ID,
          updatedAtIso: nowIso,
        };
        store.upsertProposal(failed);
        if (applied.outcome) store.addReleaseOutcome(applied.outcome);

        return {
          proposal: failed,
          gatewayDecision: submitted.decision,
          outcome: applied.outcome,
          liveCmsPublishWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }

      // Acceptance only — verification requires explicit fixture read-back.
      const pending: SeoChangeProposal = {
        ...proposal,
        status: SeoProposalStatus.RELEASED_PENDING,
        gatewayOperationId: operationId,
        writePathId: SEO_PILOT_WRITE_PATH_ID,
        updatedAtIso: nowIso,
      };
      store.upsertProposal(pending);
      details.push(
        "Left ACCEPTED_PENDING / RELEASED_PENDING — supply fixture read-back via verifyPilotRelease",
      );

      return {
        proposal: pending,
        gatewayDecision: submitted.decision,
        outcome: null,
        liveCmsPublishWiring: "NOT_WIRED",
        acceptanceEqualsVerified: false,
        details,
      };
    },

    verifyPilotRelease(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const details: string[] = [];
      const state = store.read();
      const proposal =
        state.proposals.find((p) => p.proposalId === input.proposalId) ?? null;

      if (!proposal) {
        return {
          proposal: null,
          gatewayDecision: null,
          outcome: null,
          details: [`Unknown proposal ${input.proposalId}`],
        };
      }

      if (proposal.status !== SeoProposalStatus.RELEASED_PENDING) {
        return {
          proposal,
          gatewayDecision: null,
          outcome: null,
          details: [
            `Proposal status is ${proposal.status}; verify requires RELEASED_PENDING`,
          ],
        };
      }

      if (!proposal.gatewayOperationId) {
        return {
          proposal,
          gatewayDecision: null,
          outcome: null,
          details: ["Missing gatewayOperationId on RELEASED_PENDING proposal"],
        };
      }

      const readBack = evaluateFixtureReadBack({
        proposedFields: proposal.proposedFields,
        observedFields: input.observedFields,
      });
      details.push(...readBack.details);

      const failed =
        input.forceFailure === true || readBack.matched === false;

      if (failed) {
        const applied = applySeoReleaseVerification(store.read(), {
          proposalId: proposal.proposalId,
          decision: SeoReleaseDecision.FAILURE,
          source: OutcomeEvidenceSource.FIXTURE,
          fixtureOnly: true,
          summary: details.join("; ") || "Fixture read-back failed",
          outcomeId: `out-${randomUUID()}`,
          operationId: proposal.gatewayOperationId,
          writePathId: proposal.writePathId ?? SEO_PILOT_WRITE_PATH_ID,
          nowIso,
        });
        if (applied.outcome) store.addReleaseOutcome(applied.outcome);
        if (applied.proposal) store.upsertProposal(applied.proposal);
        return {
          proposal: applied.proposal,
          gatewayDecision:
            gateway.getDecision(proposal.gatewayOperationId) ?? null,
          outcome: applied.outcome,
          details,
        };
      }

      const verified = gateway.markVerified(
        proposal.gatewayOperationId,
        nowIso,
      );
      details.push("Fixture read-back verified; live CMS still NOT_WIRED");

      const applied = applySeoReleaseVerification(store.read(), {
        proposalId: proposal.proposalId,
        decision: SeoReleaseDecision.SUCCESS,
        source: OutcomeEvidenceSource.FIXTURE,
        fixtureOnly: true,
        summary: "Fixture SEO page release verified via read-back",
        outcomeId: `out-${randomUUID()}`,
        operationId: proposal.gatewayOperationId,
        writePathId: proposal.writePathId ?? SEO_PILOT_WRITE_PATH_ID,
        nowIso,
      });
      if (applied.outcome) store.addReleaseOutcome(applied.outcome);
      if (applied.proposal) store.upsertProposal(applied.proposal);

      return {
        proposal: applied.proposal,
        gatewayDecision: verified,
        outcome: applied.outcome,
        details,
      };
    },
  };
}
