/**
 * File-backed paid-media / analysis decision-support store (AA-19 / WP13–14).
 * Schema companion: database/migrations/025_paid_media_proposals.sql
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  emptyPaidMediaState,
  type AnalysisDefinition,
  type AnalysisHypothesis,
  type DecisionBrief,
  type PaidMediaDecision,
  type PaidMediaProposal,
  type PaidMediaState,
} from "@worksocial/domain";

export type PaidMediaStore = {
  readonly stateDir: string;
  read(): PaidMediaState;
  write(state: PaidMediaState): void;
  update(mutator: (current: PaidMediaState) => PaidMediaState): PaidMediaState;
  upsertDefinition(definition: AnalysisDefinition): PaidMediaState;
  upsertHypothesis(hypothesis: AnalysisHypothesis): PaidMediaState;
  upsertBrief(brief: DecisionBrief): PaidMediaState;
  upsertProposal(proposal: PaidMediaProposal): PaidMediaState;
  addDecision(decision: PaidMediaDecision): PaidMediaState;
  listDefinitions(limit?: number): AnalysisDefinition[];
  listHypotheses(limit?: number): AnalysisHypothesis[];
  listBriefs(limit?: number): DecisionBrief[];
  listProposals(limit?: number): PaidMediaProposal[];
  listDecisions(limit?: number): PaidMediaDecision[];
  status(): {
    definitionCount: number;
    hypothesisCount: number;
    briefCount: number;
    proposalCount: number;
    decisionCount: number;
    googleAdsWiring: PaidMediaState["googleAdsWiring"];
    chatgptAdsWiring: PaidMediaState["chatgptAdsWiring"];
    liveMutationWiring: "NOT_WIRED";
    productionActivated: false;
    externalEffects: "NONE";
    honestNote: string;
  };
};

function atomicWriteJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  renameSync(tmp, filePath);
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export function defaultPaidMediaStateDir(baseDir: string): string {
  return join(baseDir, "paid-media");
}

export function createFilePaidMediaStore(stateDir: string): PaidMediaStore {
  const paidDir = join(stateDir, "paid-media");
  const statePath = join(paidDir, "paid-media-state.json");

  const read = (): PaidMediaState => {
    const existing = readJsonFile<PaidMediaState>(statePath);
    if (!existing || existing.version !== 1) {
      return emptyPaidMediaState(new Date().toISOString());
    }
    const base = emptyPaidMediaState(existing.updatedAtIso);
    return {
      ...base,
      ...existing,
      definitions: existing.definitions ?? [],
      hypotheses: existing.hypotheses ?? [],
      briefs: existing.briefs ?? [],
      proposals: existing.proposals ?? [],
      decisions: existing.decisions ?? [],
      googleAdsWiring: existing.googleAdsWiring ?? "FIXTURE",
      chatgptAdsWiring: "ACCESS_BLOCKED",
      liveMutationWiring: "NOT_WIRED",
      productionActivated: false,
    };
  };

  const write = (state: PaidMediaState): void => {
    atomicWriteJson(statePath, {
      ...state,
      chatgptAdsWiring: "ACCESS_BLOCKED",
      liveMutationWiring: "NOT_WIRED",
      productionActivated: false,
    } satisfies PaidMediaState);
  };

  const update = (
    mutator: (current: PaidMediaState) => PaidMediaState,
  ): PaidMediaState => {
    const next = mutator(read());
    write(next);
    return next;
  };

  return {
    stateDir: paidDir,

    read,
    write,
    update,

    upsertDefinition: (definition) =>
      update((state) => {
        const others = state.definitions.filter(
          (d) => d.definitionId !== definition.definitionId,
        );
        return {
          ...state,
          definitions: [...others, definition].slice(-200),
          updatedAtIso: definition.createdAtIso,
        };
      }),

    upsertHypothesis: (hypothesis) =>
      update((state) => {
        const others = state.hypotheses.filter(
          (h) => h.hypothesisId !== hypothesis.hypothesisId,
        );
        return {
          ...state,
          hypotheses: [...others, hypothesis].slice(-200),
          updatedAtIso: hypothesis.createdAtIso,
        };
      }),

    upsertBrief: (brief) =>
      update((state) => {
        const others = state.briefs.filter((b) => b.briefId !== brief.briefId);
        return {
          ...state,
          briefs: [...others, brief].slice(-200),
          updatedAtIso: brief.createdAtIso,
        };
      }),

    upsertProposal: (proposal) =>
      update((state) => {
        const others = state.proposals.filter(
          (p) => p.proposalId !== proposal.proposalId,
        );
        return {
          ...state,
          proposals: [...others, proposal].slice(-500),
          updatedAtIso: proposal.updatedAtIso,
        };
      }),

    addDecision: (decision) =>
      update((state) => ({
        ...state,
        decisions: [...state.decisions, decision].slice(-500),
        updatedAtIso: decision.recordedAtIso,
      })),

    listDefinitions: (limit = 50) => read().definitions.slice(-limit).reverse(),
    listHypotheses: (limit = 50) => read().hypotheses.slice(-limit).reverse(),
    listBriefs: (limit = 50) => read().briefs.slice(-limit).reverse(),
    listProposals: (limit = 50) => read().proposals.slice(-limit).reverse(),
    listDecisions: (limit = 50) => read().decisions.slice(-limit).reverse(),

    status: () => {
      const state = read();
      return {
        definitionCount: state.definitions.length,
        hypothesisCount: state.hypotheses.length,
        briefCount: state.briefs.length,
        proposalCount: state.proposals.length,
        decisionCount: state.decisions.length,
        googleAdsWiring: state.googleAdsWiring,
        chatgptAdsWiring: "ACCESS_BLOCKED" as const,
        liveMutationWiring: "NOT_WIRED" as const,
        productionActivated: false as const,
        externalEffects: "NONE" as const,
        honestNote:
          "AA-19 fixture analysis + paid-media proposals. Google Ads Analyze-only (fixture). ChatGPT Ads ACCESS_BLOCKED until transport+entitlement. Live mutations NOT_WIRED. External effects NONE. Catalog cases NOT_RUN — never silently VERIFIED.",
      };
    },
  };
}
