/**
 * File-backed knowledge / demand store (R1-06).
 * Schema companion: database/migrations/008_knowledge.sql.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  emptyKnowledgeState,
  type DemandObservation,
  type FactRecord,
  type InstructionIngestionRecord,
  type KnowledgeState,
} from "@worksocial/domain";
import type { WritePathOutcomeEvidence } from "@worksocial/domain";

export type KnowledgeStore = {
  readonly stateDir: string;
  read(): KnowledgeState;
  write(state: KnowledgeState): void;
  update(mutator: (current: KnowledgeState) => KnowledgeState): KnowledgeState;
  upsertFact(fact: FactRecord): KnowledgeState;
  addIngestion(record: InstructionIngestionRecord): KnowledgeState;
  addDemandSignal(obs: DemandObservation): KnowledgeState;
  upsertDemandSignal(obs: DemandObservation): KnowledgeState;
  addFactOutcome(outcome: WritePathOutcomeEvidence): KnowledgeState;
  listFacts(limit?: number): FactRecord[];
  listDemandSignals(limit?: number): DemandObservation[];
  listIngestions(limit?: number): InstructionIngestionRecord[];
  status(): {
    factCount: number;
    demandSignalCount: number;
    ingestionCount: number;
    factOutcomeCount: number;
    supportedCount: number;
    hypothesisCount: number;
    unknownCount: number;
    liveSerpWiring: KnowledgeState["liveSerpWiring"];
    liveTrendsWiring: KnowledgeState["liveTrendsWiring"];
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

export function defaultKnowledgeStateDir(baseDir: string): string {
  return join(baseDir, "knowledge");
}

export function createFileKnowledgeStore(stateDir: string): KnowledgeStore {
  const knowledgeDir = join(stateDir, "knowledge");
  const statePath = join(knowledgeDir, "knowledge-state.json");

  const read = (): KnowledgeState => {
    const existing = readJsonFile<KnowledgeState>(statePath);
    if (!existing || existing.version !== 1) {
      return emptyKnowledgeState(new Date().toISOString());
    }
    return {
      ...existing,
      facts: existing.facts ?? [],
      ingestions: existing.ingestions ?? [],
      demandSignals: existing.demandSignals ?? [],
      factOutcomes: existing.factOutcomes ?? [],
      liveSerpWiring: "NOT_WIRED",
      liveTrendsWiring: "NOT_WIRED",
    };
  };

  const write = (state: KnowledgeState): void => {
    atomicWriteJson(statePath, state);
  };

  const update = (
    mutator: (current: KnowledgeState) => KnowledgeState,
  ): KnowledgeState => {
    const next = mutator(read());
    write(next);
    return next;
  };

  return {
    stateDir: knowledgeDir,
    read,
    write,
    update,
    upsertFact: (fact) =>
      update((state) => {
        const others = state.facts.filter((f) => f.factId !== fact.factId);
        return {
          ...state,
          facts: [...others, fact].slice(-500),
          updatedAtIso: fact.updatedAtIso,
        };
      }),
    addIngestion: (record) =>
      update((state) => ({
        ...state,
        ingestions: [...state.ingestions, record].slice(-500),
        updatedAtIso: record.updatedAtIso,
      })),
    addDemandSignal: (obs) =>
      update((state) => ({
        ...state,
        demandSignals: [...state.demandSignals, obs].slice(-500),
        updatedAtIso: obs.createdAtIso,
      })),
    upsertDemandSignal: (obs) =>
      update((state) => {
        const others = state.demandSignals.filter(
          (row) => row.observationId !== obs.observationId,
        );
        return {
          ...state,
          demandSignals: [...others, obs].slice(-500),
          updatedAtIso: obs.createdAtIso,
        };
      }),
    addFactOutcome: (outcome) =>
      update((state) => ({
        ...state,
        factOutcomes: [...state.factOutcomes, outcome].slice(-500),
        updatedAtIso: outcome.recordedAtIso,
      })),
    listFacts: (limit = 100) => {
      const facts = read().facts;
      return facts.slice(Math.max(0, facts.length - limit));
    },
    listDemandSignals: (limit = 100) => {
      const signals = read().demandSignals;
      return signals.slice(Math.max(0, signals.length - limit));
    },
    listIngestions: (limit = 100) => {
      const rows = read().ingestions;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    status: () => {
      const state = read();
      let supportedCount = 0;
      let hypothesisCount = 0;
      let unknownCount = 0;
      for (const fact of state.facts) {
        if (fact.supportLabel === "SUPPORTED") supportedCount += 1;
        else if (fact.supportLabel === "HYPOTHESIS") hypothesisCount += 1;
        else unknownCount += 1;
      }
      for (const signal of state.demandSignals) {
        if (signal.supportLabel === "SUPPORTED") supportedCount += 1;
        else if (signal.supportLabel === "HYPOTHESIS") hypothesisCount += 1;
        else unknownCount += 1;
      }
      return {
        factCount: state.facts.length,
        demandSignalCount: state.demandSignals.length,
        ingestionCount: state.ingestions.length,
        factOutcomeCount: state.factOutcomes.length,
        supportedCount,
        hypothesisCount,
        unknownCount,
        liveSerpWiring: state.liveSerpWiring,
        liveTrendsWiring: state.liveTrendsWiring,
        honestNote:
          "Fact registry and demand signals use SUPPORTED / UNKNOWN / HYPOTHESIS labels with provenance. Live SERP and Google Trends APIs remain NOT_WIRED; fixture adapters only. Model claims are never facts.",
      };
    },
  };
}
