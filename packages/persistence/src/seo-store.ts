/**
 * File-backed SEO / search store (R1-07).
 * Schema companion: database/migrations/009_seo.sql.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  emptySeoState,
  type PageAuditRecord,
  type SchemaValidationResult,
  type SearchJudgmentRecord,
  type SearchRemediationTask,
  type SemanticSearchIndex,
  type SemanticSearchResult,
  type SeoChangeProposal,
  type SeoState,
  type WritePathOutcomeEvidence,
} from "@worksocial/domain";

export type SeoStore = {
  readonly stateDir: string;
  read(): SeoState;
  write(state: SeoState): void;
  update(mutator: (current: SeoState) => SeoState): SeoState;
  upsertAudit(audit: PageAuditRecord): SeoState;
  upsertProposal(proposal: SeoChangeProposal): SeoState;
  addSchemaValidation(result: SchemaValidationResult): SeoState;
  setSearchIndex(index: SemanticSearchIndex): SeoState;
  addSearchResult(result: SemanticSearchResult): SeoState;
  addSearchJudgment(judgment: SearchJudgmentRecord): SeoState;
  addSearchRemediation(task: SearchRemediationTask): SeoState;
  addReleaseOutcome(outcome: WritePathOutcomeEvidence): SeoState;
  listAudits(limit?: number): PageAuditRecord[];
  listProposals(limit?: number): SeoChangeProposal[];
  listSchemaValidations(limit?: number): SchemaValidationResult[];
  listSearchJudgments(limit?: number): SearchJudgmentRecord[];
  listSearchRemediations(limit?: number): SearchRemediationTask[];
  status(): {
    auditCount: number;
    proposalCount: number;
    schemaValidationCount: number;
    searchIndexVersion: number | null;
    searchResultCount: number;
    searchJudgmentCount: number;
    releaseOutcomeCount: number;
    liveCmsPublishWiring: SeoState["liveCmsPublishWiring"];
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

export function defaultSeoStateDir(baseDir: string): string {
  return join(baseDir, "seo");
}

export function createFileSeoStore(stateDir: string): SeoStore {
  const seoDir = join(stateDir, "seo");
  const statePath = join(seoDir, "seo-state.json");

  const read = (): SeoState => {
    const existing = readJsonFile<SeoState>(statePath);
    if (!existing || existing.version !== 1) {
      return emptySeoState(new Date().toISOString());
    }
    return {
      ...existing,
      pageAudits: existing.pageAudits ?? [],
      proposals: existing.proposals ?? [],
      schemaValidations: existing.schemaValidations ?? [],
      searchIndex: existing.searchIndex ?? null,
      searchResults: existing.searchResults ?? [],
      searchJudgments: existing.searchJudgments ?? [],
      searchRemediations: existing.searchRemediations ?? [],
      releaseOutcomes: existing.releaseOutcomes ?? [],
      fixtureRemoteLedger: existing.fixtureRemoteLedger ?? {},
      liveCmsPublishWiring: "NOT_WIRED",
    };
  };

  const write = (state: SeoState): void => {
    atomicWriteJson(statePath, state);
  };

  const update = (
    mutator: (current: SeoState) => SeoState,
  ): SeoState => {
    const next = mutator(read());
    write(next);
    return next;
  };

  return {
    stateDir: seoDir,
    read,
    write,
    update,
    upsertAudit: (audit) =>
      update((state) => {
        const others = state.pageAudits.filter(
          (a) => a.pageAuditId !== audit.pageAuditId,
        );
        return {
          ...state,
          pageAudits: [...others, audit].slice(-500),
          updatedAtIso: audit.updatedAtIso,
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
    addSchemaValidation: (result) =>
      update((state) => ({
        ...state,
        schemaValidations: [...state.schemaValidations, result].slice(-500),
        updatedAtIso: result.createdAtIso,
      })),
    setSearchIndex: (index) =>
      update((state) => ({
        ...state,
        searchIndex: index,
        updatedAtIso: index.updatedAtIso,
      })),
    addSearchResult: (result) =>
      update((state) => ({
        ...state,
        searchResults: [...state.searchResults, result].slice(-500),
        updatedAtIso: result.createdAtIso,
      })),
    addSearchJudgment: (judgment) =>
      update((state) => ({
        ...state,
        searchJudgments: [...state.searchJudgments, judgment].slice(-500),
        updatedAtIso: judgment.createdAtIso,
      })),
    addSearchRemediation: (task) =>
      update((state) => ({
        ...state,
        searchRemediations: [...state.searchRemediations, task].slice(-500),
        updatedAtIso: task.createdAtIso,
      })),
    addReleaseOutcome: (outcome) =>
      update((state) => ({
        ...state,
        releaseOutcomes: [...state.releaseOutcomes, outcome].slice(-500),
        updatedAtIso: outcome.recordedAtIso,
      })),
    listAudits: (limit = 100) => {
      const rows = read().pageAudits;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    listProposals: (limit = 100) => {
      const rows = read().proposals;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    listSchemaValidations: (limit = 100) => {
      const rows = read().schemaValidations;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    listSearchJudgments: (limit = 100) => {
      const rows = read().searchJudgments;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    listSearchRemediations: (limit = 100) => {
      const rows = read().searchRemediations;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    status: () => {
      const state = read();
      return {
        auditCount: state.pageAudits.length,
        proposalCount: state.proposals.length,
        schemaValidationCount: state.schemaValidations.length,
        searchIndexVersion: state.searchIndex?.version ?? null,
        searchResultCount: state.searchResults.length,
        searchJudgmentCount: state.searchJudgments.length,
        releaseOutcomeCount: state.releaseOutcomes.length,
        liveCmsPublishWiring: state.liveCmsPublishWiring,
        honestNote:
          "M8 grounded search cites SUPPORTED facts only. Judged retrieval + remediation ledger. Live CMS publish remains NOT_WIRED. Gateway acceptance ≠ verified. Schema truth requires SUPPORTED facts — never HYPOTHESIS.",
      };
    },
  };
}
