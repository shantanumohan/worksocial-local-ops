/**
 * File-backed production mapping store (R1-03).
 * Schema companion: database/migrations/004_production_mapping.sql.
 * Not Postgres-bound yet; no live Zoho/CMS mutations.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  emptyProductionMappingState,
  type ProductionMappingState,
  type SourceBinding,
  type FormMapping,
  type BookingOwnership,
  type CrmOwnership,
  type PilotWritePath,
  type JourneyRegistryEntry,
  type ReadEvidenceRecord,
  type WritePathOutcomeEvidence,
} from "@worksocial/domain";

export type ProductionMappingStore = {
  readonly stateDir: string;
  read(): ProductionMappingState;
  write(state: ProductionMappingState): void;
  update(
    mutator: (current: ProductionMappingState) => ProductionMappingState,
  ): ProductionMappingState;
  upsertBinding(binding: SourceBinding): ProductionMappingState;
  upsertForm(form: FormMapping): ProductionMappingState;
  upsertBookingOwnership(record: BookingOwnership): ProductionMappingState;
  upsertCrmOwnership(record: CrmOwnership): ProductionMappingState;
  upsertWritePath(path: PilotWritePath): ProductionMappingState;
  upsertJourney(journey: JourneyRegistryEntry): ProductionMappingState;
  addReadEvidence(evidence: ReadEvidenceRecord): ProductionMappingState;
  /** Hook for later learning-worker — stores labeled outcomes only. */
  addWritePathOutcome(outcome: WritePathOutcomeEvidence): ProductionMappingState;
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

function ensureSite(
  state: ProductionMappingState,
  siteId: string,
): ProductionMappingState {
  if (state.sites.includes(siteId)) {
    return state;
  }
  return { ...state, sites: [...state.sites, siteId] };
}

export function createFileProductionMappingStore(
  stateDir: string,
): ProductionMappingStore {
  const statePath = join(stateDir, "production-mapping.json");

  const read = (): ProductionMappingState => {
    const existing = readJsonFile<ProductionMappingState>(statePath);
    if (!existing || existing.version !== 1) {
      return emptyProductionMappingState(new Date().toISOString());
    }
    return {
      ...existing,
      writePathOutcomes: existing.writePathOutcomes ?? [],
      readEvidence: existing.readEvidence ?? [],
      journeys: existing.journeys ?? [],
      writePaths: existing.writePaths ?? [],
      bindings: existing.bindings ?? [],
      forms: existing.forms ?? [],
      bookingOwnership: existing.bookingOwnership ?? [],
      crmOwnership: existing.crmOwnership ?? [],
      sites: existing.sites ?? [],
    };
  };

  const write = (state: ProductionMappingState): void => {
    atomicWriteJson(statePath, state);
  };

  const update = (
    mutator: (current: ProductionMappingState) => ProductionMappingState,
  ): ProductionMappingState => {
    const next = mutator(read());
    write(next);
    return next;
  };

  return {
    stateDir,
    read,
    write,
    update,
    upsertBinding: (binding) =>
      update((state) => {
        const withSite = ensureSite(state, binding.siteId);
        const others = withSite.bindings.filter(
          (b) => b.bindingId !== binding.bindingId,
        );
        return {
          ...withSite,
          bindings: [...others, binding],
          updatedAt: binding.updatedAtIso,
        };
      }),
    upsertForm: (form) =>
      update((state) => {
        const withSite = ensureSite(state, form.siteId);
        const others = withSite.forms.filter((f) => f.formId !== form.formId);
        return {
          ...withSite,
          forms: [...others, form],
          updatedAt: form.updatedAtIso,
        };
      }),
    upsertBookingOwnership: (record) =>
      update((state) => {
        const withSite = ensureSite(state, record.siteId);
        const others = withSite.bookingOwnership.filter(
          (b) => b.bookingOwnershipId !== record.bookingOwnershipId,
        );
        return {
          ...withSite,
          bookingOwnership: [...others, record],
          updatedAt: record.updatedAtIso,
        };
      }),
    upsertCrmOwnership: (record) =>
      update((state) => {
        const others = state.crmOwnership.filter(
          (c) => c.crmOwnershipId !== record.crmOwnershipId,
        );
        return {
          ...state,
          crmOwnership: [...others, record],
          updatedAt: record.updatedAtIso,
        };
      }),
    upsertWritePath: (path) =>
      update((state) => {
        const withSite = ensureSite(state, path.siteId);
        const others = withSite.writePaths.filter(
          (p) => p.writePathId !== path.writePathId,
        );
        return {
          ...withSite,
          writePaths: [...others, path],
          updatedAt: path.createdAtIso,
        };
      }),
    upsertJourney: (journey) =>
      update((state) => {
        const withSite = ensureSite(state, journey.siteId);
        const others = withSite.journeys.filter(
          (j) => j.journeyId !== journey.journeyId,
        );
        return {
          ...withSite,
          journeys: [...others, journey],
          updatedAt: journey.createdAtIso,
        };
      }),
    addReadEvidence: (evidence) =>
      update((state) => ({
        ...state,
        readEvidence: [
          ...state.readEvidence.filter(
            (e) => e.evidenceId !== evidence.evidenceId,
          ),
          evidence,
        ],
        updatedAt: evidence.observedAtIso,
      })),
    addWritePathOutcome: (outcome) =>
      update((state) => ({
        ...state,
        writePathOutcomes: [
          ...state.writePathOutcomes.filter(
            (o) => o.outcomeId !== outcome.outcomeId,
          ),
          outcome,
        ],
        updatedAt: outcome.recordedAtIso,
      })),
  };
}

export function defaultProductionMappingStateDir(repoRoot: string): string {
  return join(repoRoot, ".worksocial", "local-state");
}
