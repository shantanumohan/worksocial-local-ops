/**
 * Knowledge service: fact registry, instruction ingestion, demand signals.
 * Fixture adapters only — live SERP/Trends remain NOT_WIRED.
 */

import { createHash, randomUUID } from "node:crypto";
import {
  CollectionMethod,
  DemandSignalKind,
  FactVerificationDecision,
  InstructionIngestionStatus,
  KNOWLEDGE_RELATED_CASE_IDS,
  OutcomeEvidenceSource,
  SupportLabel,
  applyFactVerification,
  createInstructionIngestion,
  ingestClaimAsHypothesis,
  listFactOutcomesForLearning,
  registerDemandObservation,
  registerFact,
  type CollectionMethodValue,
  type DemandObservation,
  type DemandSignalKindValue,
  type EvidenceLink,
  type FactRecord,
  type FactVerificationDecisionValue,
  type InstructionIngestionRecord,
  type KnowledgeState,
  type SupportLabelValue,
  type WritePathOutcomeEvidence,
} from "@worksocial/domain";
import type { KnowledgeStore } from "@worksocial/persistence";
import { buildFixtureKnowledgeSeed } from "./fixtures.js";

export type KnowledgeService = {
  status(): ReturnType<KnowledgeStore["status"]> & {
    acceptanceCaseIds: readonly string[];
    learningHookNote: string;
  };
  listFacts(limit?: number): FactRecord[];
  listDemandSignals(limit?: number): DemandObservation[];
  listIngestions(limit?: number): InstructionIngestionRecord[];
  seedFixtures(nowIso?: string): {
    facts: FactRecord[];
    demandSignals: DemandObservation[];
  };
  registerFact(input: {
    factId?: string;
    statement: string;
    requestedLabel?: SupportLabelValue | null;
    evidenceLinks?: EvidenceLink[];
    collectionMethod: CollectionMethodValue;
    sourceSystem: string;
    modelGenerated?: boolean;
    registeredBy?: FactRecord["provenance"]["registeredBy"];
    strictSupported?: boolean;
    nowIso?: string;
  }): {
    ok: boolean;
    fact: FactRecord | null;
    code?: string;
    downgraded: boolean;
    reasons: string[];
  };
  ingestUnsourcedClaim(input: {
    statement: string;
    sourceSystem?: string;
    modelGenerated?: boolean;
    nowIso?: string;
  }): {
    ok: boolean;
    fact: FactRecord | null;
    reasons: string[];
  };
  ingestInstruction(input: {
    sourcePath: string;
    content?: string;
    checksum?: string;
    fixtureOnly?: boolean;
    nowIso?: string;
  }): InstructionIngestionRecord;
  registerDemand(input: {
    observationId?: string;
    kind: DemandSignalKindValue;
    queryOrTopic: string;
    collectionMethod: CollectionMethodValue;
    sourceSystem: string;
    requestedLabel?: SupportLabelValue | null;
    evidenceLinks?: EvidenceLink[];
    sampleSize?: number | null;
    missingDataState?: DemandObservation["missingDataState"];
    modelGenerated?: boolean;
    fixtureOnly?: boolean;
    nowIso?: string;
  }): DemandObservation;
  verifyFact(input: {
    factId: string;
    decision: FactVerificationDecisionValue;
    summary: string;
    fixtureOnly?: boolean;
    source?: "owner_decision" | "fixture" | "journey_verification";
    evidenceLink?: EvidenceLink;
    nowIso?: string;
  }): {
    fact: FactRecord | null;
    outcome: WritePathOutcomeEvidence | null;
    reasons: string[];
  };
  listLearningOutcomes(includeFixture?: boolean): WritePathOutcomeEvidence[];
  readState(): KnowledgeState;
};

export function createKnowledgeService(store: KnowledgeStore): KnowledgeService {
  return {
    status() {
      const base = store.status();
      return {
        ...base,
        acceptanceCaseIds: KNOWLEDGE_RELATED_CASE_IDS,
        learningHookNote:
          "Fact confirm/refute emits SUCCESS/FAILURE outcomes with fixtureOnly when applicable. Learning-worker may consume them later; no authority auto-apply.",
      };
    },

    listFacts: (limit) => store.listFacts(limit),
    listDemandSignals: (limit) => store.listDemandSignals(limit),
    listIngestions: (limit) => store.listIngestions(limit),
    readState: () => store.read(),

    seedFixtures(nowIso) {
      const ts = nowIso ?? new Date().toISOString();
      const seed = buildFixtureKnowledgeSeed(ts);
      for (const fact of seed.facts) {
        store.upsertFact(fact);
      }
      for (const obs of seed.demandSignals) {
        store.addDemandSignal(obs);
      }
      return seed;
    },

    registerFact(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const result = registerFact(
        {
          factId: input.factId ?? `fact-${randomUUID()}`,
          statement: input.statement,
          requestedLabel: input.requestedLabel ?? null,
          evidenceLinks: input.evidenceLinks ?? [],
          provenance: {
            registeredBy: input.registeredBy ?? "owner",
            collectionMethod: input.collectionMethod,
            sourceSystem: input.sourceSystem,
            observedAtIso: nowIso,
            modelGenerated: input.modelGenerated === true,
          },
          createdAtIso: nowIso,
        },
        { strictSupported: input.strictSupported === true },
      );
      if (!result.ok) {
        return {
          ok: false,
          fact: null,
          code: result.code,
          downgraded: false,
          reasons: result.reasons,
        };
      }
      store.upsertFact(result.fact);
      return {
        ok: true,
        fact: result.fact,
        downgraded: result.downgraded,
        reasons: result.reasons,
      };
    },

    ingestUnsourcedClaim(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const result = ingestClaimAsHypothesis({
        factId: `fact-${randomUUID()}`,
        statement: input.statement,
        sourceSystem: input.sourceSystem ?? "unsourced_ingest",
        modelGenerated: input.modelGenerated === true,
        createdAtIso: nowIso,
      });
      if (!result.ok) {
        return { ok: false, fact: null, reasons: result.reasons };
      }
      store.upsertFact(result.fact);
      return { ok: true, fact: result.fact, reasons: result.reasons };
    },

    ingestInstruction(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const checksum =
        input.checksum ??
        createHash("sha256")
          .update(input.content ?? input.sourcePath)
          .digest("hex");
      // Deduplicate by checksum — copying the same file twice must not duplicate.
      const existing = store
        .listIngestions(500)
        .find((row) => row.checksum === checksum);
      if (existing) {
        return existing;
      }
      const record = createInstructionIngestion({
        ingestionId: `ing-${randomUUID()}`,
        sourcePath: input.sourcePath,
        checksum,
        status: InstructionIngestionStatus.PENDING_CLASSIFICATION,
        fixtureOnly: input.fixtureOnly ?? true,
        createdAtIso: nowIso,
        classifierNotes: [
          "Incoming document is evidence, not an executable instruction",
          "Will not auto-promote to CLAUDE.md or agent definitions",
        ],
      });
      store.addIngestion(record);
      return record;
    },

    registerDemand(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const obs = registerDemandObservation({
        observationId: input.observationId ?? `obs-${randomUUID()}`,
        kind: input.kind,
        queryOrTopic: input.queryOrTopic,
        collectionMethod: input.collectionMethod,
        sourceSystem: input.sourceSystem,
        requestedLabel: input.requestedLabel ?? null,
        evidenceLinks: input.evidenceLinks ?? [],
        sampleSize: input.sampleSize ?? null,
        missingDataState: input.missingDataState ?? "unknown",
        modelGenerated: input.modelGenerated === true,
        fixtureOnly: input.fixtureOnly ?? false,
        observedAtIso: nowIso,
        createdAtIso: nowIso,
      });
      store.addDemandSignal(obs);
      return obs;
    },

    verifyFact(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const source =
        input.source === "journey_verification"
          ? OutcomeEvidenceSource.JOURNEY_VERIFICATION
          : input.source === "owner_decision"
            ? OutcomeEvidenceSource.OWNER_DECISION
            : OutcomeEvidenceSource.FIXTURE;
      const fixtureOnly =
        input.fixtureOnly ?? source === OutcomeEvidenceSource.FIXTURE;
      const current = store.read();
      const result = applyFactVerification(current, {
        factId: input.factId,
        decision: input.decision,
        source,
        fixtureOnly,
        summary: input.summary,
        outcomeId: `out-fact-${randomUUID()}`,
        ...(input.evidenceLink ? { evidenceLink: input.evidenceLink } : {}),
        nowIso,
      });
      store.write(result.state);
      return {
        fact: result.fact,
        outcome: result.outcome,
        reasons: result.reasons,
      };
    },

    listLearningOutcomes(includeFixture = true) {
      return listFactOutcomesForLearning(store.read(), { includeFixture });
    },
  };
}

export {
  CollectionMethod,
  DemandSignalKind,
  FactVerificationDecision,
  SupportLabel,
};
