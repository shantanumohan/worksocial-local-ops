/**
 * AA-19 paid-media + analysis decision-support service.
 * Fixture-only. External effects: NONE. Live Ads mutations NOT_WIRED.
 */

import { randomUUID } from "node:crypto";
import {
  PAID_MEDIA_RELATED_CASE_IDS,
  attemptPaidMediaExecution,
  createAnalysisDefinition,
  createAnalysisHypothesis,
  createDecisionBrief,
  createPaidMediaProposal,
  diagnoseDelivery,
  paidMediaChannelStatus,
  recordPaidMediaDecision,
  type AnalysisDefinition,
  type AnalysisHypothesis,
  type DecisionBrief,
  type DeliveryDiagnosis,
  type FinancialDiff,
  type PaidChangeKindValue,
  type PaidMediaDecision,
  type PaidMediaPlatformValue,
  type PaidMediaProposal,
} from "@worksocial/domain";
import type { PaidMediaStore } from "@worksocial/persistence";
import {
  PAID_MEDIA_CHATGPT_PROPOSAL_ID,
  PAID_MEDIA_GOOGLE_PROPOSAL_ID,
  buildPaidMediaFixtureBundle,
} from "./fixtures.js";

export type PaidMediaService = {
  status(): ReturnType<PaidMediaStore["status"]> & {
    channels: ReturnType<typeof paidMediaChannelStatus>;
    relatedCaseIds: readonly string[];
    principal: "paid-media";
  };
  listDefinitions(limit?: number): AnalysisDefinition[];
  listHypotheses(limit?: number): AnalysisHypothesis[];
  listBriefs(limit?: number): DecisionBrief[];
  listProposals(limit?: number): PaidMediaProposal[];
  listDecisions(limit?: number): PaidMediaDecision[];
  seedFixtures(nowIso?: string): {
    definition: AnalysisDefinition;
    hypothesis: AnalysisHypothesis;
    brief: DecisionBrief;
    googleProposal: PaidMediaProposal;
    chatgptBlockedProposal: PaidMediaProposal;
  };
  saveDefinition(input: {
    definitionId?: string;
    siteId: string;
    periodStartIso: string;
    periodEndIso: string;
    comparisonLabel: string;
    reportingTimezone: string;
    nowIso?: string;
  }): AnalysisDefinition;
  saveHypothesis(input: {
    hypothesisId?: string;
    definitionId: string;
    statement: string;
    primaryOutcome: string;
    baseline: string;
    comparison: string;
    observationWindowDays: number;
    nowIso?: string;
  }):
    | { ok: true; hypothesis: AnalysisHypothesis }
    | { ok: false; code: string; reasons: string[] };
  saveBrief(input: {
    briefId?: string;
    definitionId: string;
    hypothesisId?: string | null;
    title: string;
    summary: string;
    sourceCaveats?: string[];
    proposedActions?: string[];
    nowIso?: string;
  }): DecisionBrief;
  requestRecommendation(input: {
    proposalId?: string;
    platform: PaidMediaPlatformValue;
    accountId: string;
    campaignId: string;
    changeKind: PaidChangeKindValue;
    hypothesis: string;
    exactChange: string;
    risk: string;
    alternative: string;
    impressions: number | null;
    clicks: number | null;
    eventsPresent: boolean;
    attributionSettled: boolean;
    sameDaySpendComplete: boolean;
    financialDiff: FinancialDiff;
    nowIso?: string;
  }):
    | { ok: true; proposal: PaidMediaProposal; diagnosis: DeliveryDiagnosis }
    | {
        ok: false;
        code: string;
        reasons: string[];
        proposal: PaidMediaProposal | null;
        diagnosis: DeliveryDiagnosis;
      };
  decide(input: {
    proposalId: string;
    decision: "approve" | "decline";
    actorRole?: string;
    reason: string;
    nowIso?: string;
  }):
    | {
        ok: true;
        proposal: PaidMediaProposal;
        decision: PaidMediaDecision;
      }
    | { ok: false; code: string; reasons: string[] };
  execute(input: {
    proposalId: string;
    preferLive?: boolean;
  }): ReturnType<typeof attemptPaidMediaExecution> & {
    proposal: PaidMediaProposal | null;
  };
};

export function createPaidMediaService(store: PaidMediaStore): PaidMediaService {
  return {
    status() {
      return {
        ...store.status(),
        channels: paidMediaChannelStatus(),
        relatedCaseIds: PAID_MEDIA_RELATED_CASE_IDS,
        principal: "paid-media",
      };
    },

    listDefinitions(limit) {
      return store.listDefinitions(limit);
    },
    listHypotheses(limit) {
      return store.listHypotheses(limit);
    },
    listBriefs(limit) {
      return store.listBriefs(limit);
    },
    listProposals(limit) {
      return store.listProposals(limit);
    },
    listDecisions(limit) {
      return store.listDecisions(limit);
    },

    seedFixtures(nowIso) {
      const bundle = buildPaidMediaFixtureBundle(nowIso);
      store.upsertDefinition(bundle.definition);
      store.upsertHypothesis(bundle.hypothesis);
      store.upsertBrief(bundle.brief);
      store.upsertProposal(bundle.googleProposal);
      store.upsertProposal(bundle.chatgptBlockedProposal);
      return bundle;
    },

    saveDefinition(input) {
      const definition = createAnalysisDefinition({
        definitionId: input.definitionId ?? randomUUID(),
        siteId: input.siteId,
        periodStartIso: input.periodStartIso,
        periodEndIso: input.periodEndIso,
        comparisonLabel: input.comparisonLabel,
        reportingTimezone: input.reportingTimezone,
        createdAtIso: input.nowIso ?? new Date().toISOString(),
      });
      store.upsertDefinition(definition);
      return definition;
    },

    saveHypothesis(input) {
      const created = createAnalysisHypothesis({
        hypothesisId: input.hypothesisId ?? randomUUID(),
        definitionId: input.definitionId,
        statement: input.statement,
        primaryOutcome: input.primaryOutcome,
        baseline: input.baseline,
        comparison: input.comparison,
        observationWindowDays: input.observationWindowDays,
        createdAtIso: input.nowIso ?? new Date().toISOString(),
      });
      if (!created.ok) return created;
      store.upsertHypothesis(created.hypothesis);
      return created;
    },

    saveBrief(input) {
      const brief = createDecisionBrief({
        briefId: input.briefId ?? randomUUID(),
        definitionId: input.definitionId,
        hypothesisId: input.hypothesisId ?? null,
        title: input.title,
        summary: input.summary,
        sourceCaveats: input.sourceCaveats ?? [
          "FIXTURE ≠ LIVE",
          "Catalog cases remain NOT_RUN",
        ],
        proposedActions: input.proposedActions ?? [],
        createdAtIso: input.nowIso ?? new Date().toISOString(),
      });
      store.upsertBrief(brief);
      return brief;
    },

    requestRecommendation(input) {
      const diagnosis = diagnoseDelivery({
        impressions: input.impressions,
        clicks: input.clicks,
        eventsPresent: input.eventsPresent,
        attributionSettled: input.attributionSettled,
        sameDaySpendComplete: input.sameDaySpendComplete,
      });
      const created = createPaidMediaProposal({
        proposalId: input.proposalId ?? randomUUID(),
        platform: input.platform,
        accountId: input.accountId,
        campaignId: input.campaignId,
        changeKind: input.changeKind,
        hypothesis: input.hypothesis,
        exactChange: input.exactChange,
        risk: input.risk,
        alternative: input.alternative,
        diagnosis,
        financialDiff: input.financialDiff,
        createdAtIso: input.nowIso ?? new Date().toISOString(),
      });
      if (created.proposal) {
        store.upsertProposal(created.proposal);
      }
      if (!created.ok) {
        return {
          ok: false,
          code: created.code,
          reasons: created.reasons,
          proposal: created.proposal,
          diagnosis,
        };
      }
      return { ok: true, proposal: created.proposal, diagnosis };
    },

    decide(input) {
      const proposal =
        store
          .listProposals(500)
          .find((p) => p.proposalId === input.proposalId) ?? null;
      if (!proposal) {
        return {
          ok: false,
          code: "PROPOSAL_NOT_FOUND",
          reasons: [`Unknown proposal ${input.proposalId}`],
        };
      }
      const result = recordPaidMediaDecision({
        decisionId: randomUUID(),
        proposal,
        decision: input.decision,
        actorRole: input.actorRole ?? "administrator",
        reason: input.reason,
        recordedAtIso: input.nowIso ?? new Date().toISOString(),
      });
      if (!result.ok) return result;
      store.upsertProposal(result.proposal);
      store.addDecision(result.decision);
      return {
        ok: true,
        proposal: result.proposal,
        decision: result.decision,
      };
    },

    execute(input) {
      const proposal =
        store
          .listProposals(500)
          .find((p) => p.proposalId === input.proposalId) ?? null;
      if (!proposal) {
        return {
          ok: false as const,
          code: "NOT_APPROVED" as const,
          reasons: [`Unknown proposal ${input.proposalId}`],
          externalEffects: "NONE" as const,
          liveMutationWiring: "NOT_WIRED" as const,
          acceptanceEqualsVerified: false as const,
          mutationAttempted: false as const,
          proposal: null,
        };
      }
      const result = attemptPaidMediaExecution({
        proposal,
        ...(input.preferLive !== undefined
          ? { preferLive: input.preferLive }
          : {}),
      });
      return { ...result, proposal };
    },
  };
}

export { PAID_MEDIA_GOOGLE_PROPOSAL_ID, PAID_MEDIA_CHATGPT_PROPOSAL_ID };
