/**
 * File-backed bounded repair store (R1-10).
 * Schema companion: database/migrations/012_repair.sql.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  emptyRepairState,
  type FixtureAssetSnapshot,
  type IncidentRecord,
  type RepairAttempt,
  type RepairProposal,
  type RepairState,
  type RepairTicket,
  type TestEvidence,
  type WritePathOutcomeEvidence,
} from "@worksocial/domain";
import type { ReviewVerdict } from "@worksocial/domain";

export type RepairStore = {
  readonly stateDir: string;
  read(): RepairState;
  write(state: RepairState): void;
  update(mutator: (current: RepairState) => RepairState): RepairState;
  upsertIncident(incident: IncidentRecord): RepairState;
  upsertTicket(ticket: RepairTicket): RepairState;
  upsertProposal(proposal: RepairProposal): RepairState;
  addAttempt(attempt: RepairAttempt): RepairState;
  addTestEvidence(evidence: TestEvidence): RepairState;
  addReviewVerdict(verdict: ReviewVerdict): RepairState;
  upsertFixtureAsset(asset: FixtureAssetSnapshot): RepairState;
  addReleaseOutcome(outcome: WritePathOutcomeEvidence): RepairState;
  listIncidents(limit?: number): IncidentRecord[];
  listTickets(limit?: number): RepairTicket[];
  listProposals(limit?: number): RepairProposal[];
  listAttempts(ticketId?: string, limit?: number): RepairAttempt[];
  status(): {
    incidentCount: number;
    ticketCount: number;
    proposalCount: number;
    attemptCount: number;
    verifiedCount: number;
    releaseOutcomeCount: number;
    liveCmsRepairWiring: RepairState["liveCmsRepairWiring"];
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

export function defaultRepairStateDir(baseDir: string): string {
  return join(baseDir, "repair");
}

export function createFileRepairStore(stateDir: string): RepairStore {
  const repairDir = join(stateDir, "repair");
  const statePath = join(repairDir, "repair-state.json");

  const read = (): RepairState => {
    const existing = readJsonFile<RepairState>(statePath);
    if (!existing || existing.version !== 1) {
      return emptyRepairState(new Date().toISOString());
    }
    return {
      ...existing,
      incidents: existing.incidents ?? [],
      tickets: existing.tickets ?? [],
      proposals: existing.proposals ?? [],
      attempts: existing.attempts ?? [],
      testEvidence: existing.testEvidence ?? [],
      reviewVerdicts: existing.reviewVerdicts ?? [],
      fixtureAssets: existing.fixtureAssets ?? [],
      releaseOutcomes: existing.releaseOutcomes ?? [],
      liveCmsRepairWiring: "NOT_WIRED",
    };
  };

  const write = (state: RepairState): void => {
    atomicWriteJson(statePath, state);
  };

  const update = (
    mutator: (current: RepairState) => RepairState,
  ): RepairState => {
    const next = mutator(read());
    write(next);
    return next;
  };

  return {
    stateDir: repairDir,
    read,
    write,
    update,
    upsertIncident: (incident) =>
      update((state) => {
        const others = state.incidents.filter(
          (i) => i.incidentId !== incident.incidentId,
        );
        return {
          ...state,
          incidents: [...others, incident].slice(-500),
          updatedAtIso: incident.updatedAtIso,
        };
      }),
    upsertTicket: (ticket) =>
      update((state) => {
        const others = state.tickets.filter((t) => t.ticketId !== ticket.ticketId);
        return {
          ...state,
          tickets: [...others, ticket].slice(-500),
          updatedAtIso: ticket.updatedAtIso,
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
    addAttempt: (attempt) =>
      update((state) => ({
        ...state,
        attempts: [...state.attempts, attempt].slice(-1000),
        updatedAtIso: attempt.createdAtIso,
      })),
    addTestEvidence: (evidence) =>
      update((state) => ({
        ...state,
        testEvidence: [...state.testEvidence, evidence].slice(-1000),
        updatedAtIso: evidence.recordedAtIso,
      })),
    addReviewVerdict: (verdict) =>
      update((state) => ({
        ...state,
        reviewVerdicts: [...state.reviewVerdicts, verdict].slice(-500),
        updatedAtIso: verdict.decidedAtIso,
      })),
    upsertFixtureAsset: (asset) =>
      update((state) => {
        const others = state.fixtureAssets.filter((a) => a.assetId !== asset.assetId);
        return {
          ...state,
          fixtureAssets: [...others, asset].slice(-100),
          updatedAtIso: asset.updatedAtIso,
        };
      }),
    addReleaseOutcome: (outcome) =>
      update((state) => ({
        ...state,
        releaseOutcomes: [...state.releaseOutcomes, outcome].slice(-500),
        updatedAtIso: outcome.recordedAtIso,
      })),
    listIncidents: (limit = 100) => {
      const rows = read().incidents;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    listTickets: (limit = 100) => {
      const rows = read().tickets;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    listProposals: (limit = 100) => {
      const rows = read().proposals;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    listAttempts: (ticketId, limit = 200) => {
      const rows = ticketId
        ? read().attempts.filter((a) => a.ticketId === ticketId)
        : read().attempts;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    status: () => {
      const state = read();
      return {
        incidentCount: state.incidents.length,
        ticketCount: state.tickets.length,
        proposalCount: state.proposals.length,
        attemptCount: state.attempts.length,
        verifiedCount: state.proposals.filter((p) => p.status === "verified")
          .length,
        releaseOutcomeCount: state.releaseOutcomes.length,
        liveCmsRepairWiring: state.liveCmsRepairWiring,
        honestNote:
          "Bounded repair proposals with fail-closed test/policy gates, independent A25 review, attempt limits, and fixture canary apply/verify. Live CMS repair remains NOT_WIRED. Acceptance ≠ verified.",
      };
    },
  };
}
