/**
 * SEO service: page audits, proposals, schema validation, semantic search,
 * and gateway-gated fixture pilot page release.
 * Live CMS publish remains NOT_WIRED.
 */

import { randomUUID } from "node:crypto";
import {
  ActionClass,
  OutcomeEvidenceSource,
  SEO_RELATED_CASE_IDS,
  SeoChangeKind,
  SeoProposalStatus,
  SeoReleaseDecision,
  SupportLabel,
  applySeoReleaseVerification,
  createPageAudit,
  createSeoProposal,
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
  type SupportLabelValue,
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
    status?: SeoChangeProposal["status"];
    nowIso?: string;
  }): SeoChangeProposal;
  validateSchema(input: {
    validationId?: string;
    pageAssetId: string;
    proposalId?: string | null;
    nodes: SchemaOrgNode[];
    visibleContent?: string;
    factLabels?: Record<string, SupportLabelValue> | FactSupportLookup;
    fixtureOnly?: boolean;
    nowIso?: string;
  }): SchemaValidationResult;
  reviewProposal(input: {
    proposalId: string;
    factLabels?: Record<string, SupportLabelValue> | FactSupportLookup;
    schemaValidationId?: string | null;
  }): {
    allowed: boolean;
    code: string | null;
    reasons: string[];
    proposal: SeoChangeProposal | null;
  };
  approveProposal(input: {
    proposalId: string;
    factLabels?: Record<string, SupportLabelValue> | FactSupportLookup;
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
   * Pilot page release through the action gateway.
   * Requires mapping ownership + read evidence + standing grant.
   * Acceptance ≠ verified; live CMS stays NOT_WIRED (fixture read-back only).
   */
  releasePilotPage(input: {
    proposalId: string;
    authority: {
      outboundStopped: boolean;
      operatingMode: OperatingModeValue;
      policies: StandingPolicy[];
      grants: CapabilityGrant[];
    };
    productionMapping?: ProductionMappingState;
    factLabels?: Record<string, SupportLabelValue> | FactSupportLookup;
    targetAccountId?: string;
    contentRevision?: string | null;
    /** When true, skip markVerified (leaves ACCEPTED_PENDING). */
    skipVerification?: boolean;
    /** Force FAILURE path after gateway accept (fixture negative test). */
    forceFailure?: boolean;
    nowIso?: string;
  }): {
    proposal: SeoChangeProposal | null;
    gatewayDecision: GatewayDecisionRecord | null;
    outcome: WritePathOutcomeEvidence | null;
    liveCmsPublishWiring: "NOT_WIRED";
    acceptanceEqualsVerified: false;
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

function toFactLookup(
  input?: Record<string, SupportLabelValue> | FactSupportLookup,
): FactSupportLookup {
  if (!input) {
    return new Map([
      ["fixture-fact-hours", SupportLabel.SUPPORTED],
      ["fixture-fact-hypothesis", SupportLabel.HYPOTHESIS],
    ]);
  }
  if (input instanceof Map) return input;
  return new Map(Object.entries(input));
}

export function createSeoService(store: SeoStore): SeoService {
  const gateway = createActionGateway();

  return {
    gateway,

    status() {
      const base = store.status();
      return {
        ...base,
        acceptanceCaseIds: SEO_RELATED_CASE_IDS,
        learningHookNote:
          "Verified SEO release SUCCESS/FAILURE emits outcomes with fixtureOnly when fixture. Learning-worker may consume them later; no authority auto-apply. ACCEPTED_PENDING ≠ VERIFIED.",
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
      for (const audit of seed.audits) store.upsertAudit(audit);
      for (const proposal of seed.proposals) store.upsertProposal(proposal);
      store.setSearchIndex(seed.searchIndex);
      return {
        audits: seed.audits,
        proposals: seed.proposals,
        searchIndexVersion: seed.searchIndex.version,
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
        ...(input.status !== undefined ? { status: input.status } : {}),
      });
      store.upsertProposal(proposal);
      return proposal;
    },

    validateSchema(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const result = validateSchemaOrg({
        validationId: input.validationId ?? `val-${randomUUID()}`,
        pageAssetId: input.pageAssetId,
        proposalId: input.proposalId ?? null,
        nodes: input.nodes,
        visibleContent: input.visibleContent ?? SEO_GOLDEN_VISIBLE_CONTENT,
        factLabels: toFactLookup(input.factLabels),
        fixtureOnly: input.fixtureOnly !== false,
        createdAtIso: nowIso,
      });
      store.addSchemaValidation(result);
      return result;
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
          factLabels: toFactLookup(input.factLabels),
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
        factLabels: toFactLookup(input.factLabels),
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
        factLabels: toFactLookup(input.factLabels),
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

      const mapping =
        input.productionMapping ??
        proveFixtureSeoWritePath(
          createFixtureSeoPilotMapping(nowIso).state,
          nowIso,
        );

      const operationId = `seo-release-${randomUUID()}`;
      const snapshot: GatewayAuthoritySnapshot = {
        outboundStopped: input.authority.outboundStopped,
        operatingMode: input.authority.operatingMode,
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
        const failedPending: SeoChangeProposal = {
          ...proposal,
          status: SeoProposalStatus.FAILED,
          gatewayOperationId: operationId,
          writePathId: SEO_PILOT_WRITE_PATH_ID,
          updatedAtIso: nowIso,
        };
        store.upsertProposal(failedPending);

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
        if (applied.outcome) store.addReleaseOutcome(applied.outcome);
        if (applied.proposal) store.upsertProposal(applied.proposal);

        return {
          proposal: applied.proposal ?? failedPending,
          gatewayDecision: submitted.decision,
          outcome: applied.outcome,
          liveCmsPublishWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }

      // Stub apply accepted — not verified yet.
      const pending: SeoChangeProposal = {
        ...proposal,
        status: SeoProposalStatus.RELEASED_PENDING,
        gatewayOperationId: operationId,
        writePathId: SEO_PILOT_WRITE_PATH_ID,
        updatedAtIso: nowIso,
      };
      store.upsertProposal(pending);

      if (input.skipVerification) {
        details.push(
          "Left ACCEPTED_PENDING / RELEASED_PENDING — verification skipped",
        );
        return {
          proposal: pending,
          gatewayDecision: submitted.decision,
          outcome: null,
          liveCmsPublishWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }

      if (input.forceFailure) {
        details.push("Forced fixture FAILURE after gateway accept");
        const applied = applySeoReleaseVerification(store.read(), {
          proposalId: proposal.proposalId,
          decision: SeoReleaseDecision.FAILURE,
          source: OutcomeEvidenceSource.FIXTURE,
          fixtureOnly: true,
          summary: "Fixture read-back did not match proposed fields",
          outcomeId: `out-${randomUUID()}`,
          operationId,
          writePathId: SEO_PILOT_WRITE_PATH_ID,
          nowIso,
        });
        if (applied.outcome) store.addReleaseOutcome(applied.outcome);
        if (applied.proposal) store.upsertProposal(applied.proposal);
        return {
          proposal: applied.proposal,
          gatewayDecision: submitted.decision,
          outcome: applied.outcome,
          liveCmsPublishWiring: "NOT_WIRED",
          acceptanceEqualsVerified: false,
          details,
        };
      }

      // Fixture read-back verification — never a live CMS mutation.
      const verified = gateway.markVerified(operationId, nowIso);
      details.push("Fixture read-back verified; live CMS still NOT_WIRED");

      const applied = applySeoReleaseVerification(store.read(), {
        proposalId: proposal.proposalId,
        decision: SeoReleaseDecision.SUCCESS,
        source: OutcomeEvidenceSource.FIXTURE,
        fixtureOnly: true,
        summary: "Fixture SEO page release verified via read-back",
        outcomeId: `out-${randomUUID()}`,
        operationId,
        writePathId: SEO_PILOT_WRITE_PATH_ID,
        nowIso,
      });
      if (applied.outcome) store.addReleaseOutcome(applied.outcome);
      if (applied.proposal) store.upsertProposal(applied.proposal);

      return {
        proposal: applied.proposal,
        gatewayDecision: verified,
        outcome: applied.outcome,
        liveCmsPublishWiring: "NOT_WIRED",
        acceptanceEqualsVerified: false,
        details,
      };
    },
  };
}
