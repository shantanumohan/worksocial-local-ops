/**
 * R1-06 knowledge and research / demand & content intelligence.
 *
 * Pure types + labeling rules. No network, SERP, or Node APIs.
 * Honest provenance: model claims are never facts. Unsourced claims
 * may only enter as HYPOTHESIS until evidence exists.
 */

import {
  OutcomeLabel,
  recordWritePathOutcome,
  type OutcomeEvidenceSourceValue,
  type OutcomeLabelValue,
  type WritePathOutcomeEvidence,
} from "./production-mapping.js";

/** Support / confidence label for facts and demand signals. */
export const SupportLabel = {
  SUPPORTED: "SUPPORTED",
  UNKNOWN: "UNKNOWN",
  HYPOTHESIS: "HYPOTHESIS",
} as const;

export type SupportLabelValue =
  (typeof SupportLabel)[keyof typeof SupportLabel];

const SUPPORT_LABELS: ReadonlySet<string> = new Set(Object.values(SupportLabel));

export function isSupportLabel(value: string): value is SupportLabelValue {
  return SUPPORT_LABELS.has(value);
}

/** How a claim or observation was collected. */
export const CollectionMethod = {
  FIRST_PARTY_MEASURED: "first_party_measured",
  PLATFORM_EXPORT: "platform_export",
  LICENSED_RESEARCH: "licensed_research",
  OWNER_DECLARED: "owner_declared",
  FIXTURE: "fixture",
  MODEL_GENERATED: "model_generated",
  MANUAL_SAMPLE: "manual_sample",
  UNSOURCED: "unsourced",
} as const;

export type CollectionMethodValue =
  (typeof CollectionMethod)[keyof typeof CollectionMethod];

const COLLECTION_METHODS: ReadonlySet<string> = new Set(
  Object.values(CollectionMethod),
);

export function isCollectionMethod(
  value: string,
): value is CollectionMethodValue {
  return COLLECTION_METHODS.has(value);
}

/** Evidence that can support a fact or demand observation. */
export type EvidenceLink = {
  evidenceId: string;
  /** Non-secret source descriptor (URL, export id, fixture id). */
  sourceRef: string;
  collectionMethod: CollectionMethodValue;
  summary: string;
  observedAtIso: string;
  /** Fixture evidence must never be labeled as live measured. */
  fixtureOnly: boolean;
};

export type FactRegisteredBy =
  | "owner"
  | "operator"
  | "ingestion"
  | "fixture"
  | "agent_proposal";

export type FactProvenance = {
  /** Authenticated actor or system path that registered the claim. */
  registeredBy: FactRegisteredBy;
  collectionMethod: CollectionMethodValue;
  /** Free-text source system label — never a secret. */
  sourceSystem: string;
  observedAtIso: string;
  /** True when a language model proposed the statement. */
  modelGenerated: boolean;
};

export type FactRecord = {
  factId: string;
  statement: string;
  supportLabel: SupportLabelValue;
  evidenceLinks: EvidenceLink[];
  provenance: FactProvenance;
  /** Optional conflict notes when sources disagree. */
  conflictNotes: string[];
  createdAtIso: string;
  updatedAtIso: string;
};

export const InstructionIngestionStatus = {
  PENDING_CLASSIFICATION: "pending_classification",
  INGESTED: "ingested",
  REJECTED: "rejected",
  QUARANTINED: "quarantined",
} as const;

export type InstructionIngestionStatusValue =
  (typeof InstructionIngestionStatus)[keyof typeof InstructionIngestionStatus];

/**
 * Incoming documents are evidence, not executable instructions.
 * Ingestion records track classification — never auto-promote to CLAUDE.md.
 */
export type InstructionIngestionRecord = {
  ingestionId: string;
  /** Relative path or upload checksum key under incoming/. */
  sourcePath: string;
  checksum: string;
  status: InstructionIngestionStatusValue;
  /** Proposed playbook/instruction version label if ingested. */
  instructionVersion: string | null;
  classifierNotes: string[];
  /** Claims extracted during ingestion with honest labels. */
  extractedClaimIds: string[];
  fixtureOnly: boolean;
  createdAtIso: string;
  updatedAtIso: string;
};

export const DemandSignalKind = {
  TREND: "trend",
  FAQ: "faq",
  RANK: "rank",
  QUERY_CLUSTER: "query_cluster",
} as const;

export type DemandSignalKindValue =
  (typeof DemandSignalKind)[keyof typeof DemandSignalKind];

/**
 * Observation schema (v3 §11): source, method, topic, intent, geography,
 * device, language, surface, time, period, value/unit, sample size,
 * missing-data, comparability group.
 */
export type DemandObservation = {
  observationId: string;
  kind: DemandSignalKindValue;
  queryOrTopic: string;
  normalizedIntent: string | null;
  geography: string | null;
  device: string | null;
  language: string | null;
  searchSurface: string | null;
  observedAtIso: string;
  coveredPeriodStartIso: string | null;
  coveredPeriodEndIso: string | null;
  rawValue: number | null;
  normalizedValue: number | null;
  unit: string | null;
  sampleSize: number | null;
  missingDataState: "complete" | "partial" | "omitted" | "unknown";
  comparabilityGroup: string | null;
  supportLabel: SupportLabelValue;
  evidenceLinks: EvidenceLink[];
  collectionMethod: CollectionMethodValue;
  sourceSystem: string;
  fixtureOnly: boolean;
  notes: string[];
  createdAtIso: string;
};

export type KnowledgeState = {
  version: 1;
  updatedAtIso: string;
  facts: FactRecord[];
  ingestions: InstructionIngestionRecord[];
  demandSignals: DemandObservation[];
  /** Fact confirmation/refutation outcomes for learning-worker (fixtureOK). */
  factOutcomes: WritePathOutcomeEvidence[];
  liveSerpWiring: "NOT_WIRED";
  liveTrendsWiring: "NOT_WIRED";
};

export function emptyKnowledgeState(nowIso: string): KnowledgeState {
  return {
    version: 1,
    updatedAtIso: nowIso,
    facts: [],
    ingestions: [],
    demandSignals: [],
    factOutcomes: [],
    liveSerpWiring: "NOT_WIRED",
    liveTrendsWiring: "NOT_WIRED",
  };
}

/**
 * Methods that can ever justify SUPPORTED. Model-generated and unsourced
 * claims cannot.
 */
export function collectionMethodCanSupport(
  method: CollectionMethodValue,
): boolean {
  return (
    method === CollectionMethod.FIRST_PARTY_MEASURED ||
    method === CollectionMethod.PLATFORM_EXPORT ||
    method === CollectionMethod.LICENSED_RESEARCH ||
    method === CollectionMethod.OWNER_DECLARED ||
    method === CollectionMethod.FIXTURE
  );
}

/** Evidence is usable only with a non-empty source descriptor and support-capable method. */
export function isUsableEvidenceLink(link: EvidenceLink): boolean {
  return (
    link.sourceRef.trim().length > 0 &&
    collectionMethodCanSupport(link.collectionMethod)
  );
}

/**
 * Derive the only honest support label allowed for a claim given provenance
 * and evidence. Unsourced / model-generated claims are forced to HYPOTHESIS
 * unless later verification supplies usable evidence (see applyFactVerification).
 * Empty evidence → cannot be SUPPORTED (UNKNOWN if measured-but-missing,
 * otherwise HYPOTHESIS). Omitted/partial measured rows stay UNKNOWN even when
 * an evidence link documents the omission itself.
 */
export function deriveSupportLabel(input: {
  requestedLabel?: SupportLabelValue | null;
  collectionMethod: CollectionMethodValue;
  modelGenerated: boolean;
  evidenceLinks: readonly EvidenceLink[];
  /** When true, missing measured data is UNKNOWN rather than HYPOTHESIS. */
  measuredButMissing?: boolean;
}): SupportLabelValue {
  // Omitted/partial observations are UNKNOWN even if an export evidence link exists.
  if (input.measuredButMissing) {
    return SupportLabel.UNKNOWN;
  }

  if (
    input.modelGenerated ||
    input.collectionMethod === CollectionMethod.MODEL_GENERATED ||
    input.collectionMethod === CollectionMethod.UNSOURCED
  ) {
    return SupportLabel.HYPOTHESIS;
  }

  const usableEvidence = input.evidenceLinks.filter(isUsableEvidenceLink);

  if (usableEvidence.length === 0) {
    // Manual samples without evidence stay hypotheses.
    if (input.collectionMethod === CollectionMethod.MANUAL_SAMPLE) {
      return SupportLabel.HYPOTHESIS;
    }
    if (!collectionMethodCanSupport(input.collectionMethod)) {
      return SupportLabel.HYPOTHESIS;
    }
    return SupportLabel.UNKNOWN;
  }

  if (input.requestedLabel === SupportLabel.HYPOTHESIS) {
    return SupportLabel.HYPOTHESIS;
  }
  if (input.requestedLabel === SupportLabel.UNKNOWN) {
    return SupportLabel.UNKNOWN;
  }
  return SupportLabel.SUPPORTED;
}

export type FactRegistrationInput = {
  factId: string;
  statement: string;
  /** Caller-requested label — may be downgraded by provenance rules. */
  requestedLabel?: SupportLabelValue | null;
  evidenceLinks?: EvidenceLink[];
  provenance: FactProvenance;
  conflictNotes?: string[];
  createdAtIso: string;
};

export type FactRegistrationResult =
  | { ok: true; fact: FactRecord; downgraded: boolean; reasons: string[] }
  | { ok: false; code: string; reasons: string[] };

/**
 * Register a fact with honest labeling. Rejects empty statements.
 * Unsourced / model claims cannot become SUPPORTED facts — they register
 * only as HYPOTHESIS (or the call fails if the caller insisted on SUPPORTED
 * without evidence via `strictSupported`).
 */
export function registerFact(
  input: FactRegistrationInput,
  options?: { strictSupported?: boolean },
): FactRegistrationResult {
  const statement = input.statement.trim();
  if (!statement) {
    return {
      ok: false,
      code: "EMPTY_STATEMENT",
      reasons: ["Fact statement must be non-empty"],
    };
  }

  const evidenceLinks = (input.evidenceLinks ?? []).filter(
    (e) => e.sourceRef.trim().length > 0,
  );
  if ((input.evidenceLinks?.length ?? 0) > evidenceLinks.length) {
    // Drop empty sourceRef entries rather than treating them as support.
  }
  const reasons: string[] = [];
  const derived = deriveSupportLabel({
    requestedLabel: input.requestedLabel ?? null,
    collectionMethod: input.provenance.collectionMethod,
    modelGenerated: input.provenance.modelGenerated,
    evidenceLinks,
  });

  if (
    input.provenance.modelGenerated ||
    input.provenance.collectionMethod === CollectionMethod.MODEL_GENERATED
  ) {
    reasons.push(
      "Model-generated claim cannot be treated as a measured fact — labeled HYPOTHESIS",
    );
  }
  if (input.provenance.collectionMethod === CollectionMethod.UNSOURCED) {
    reasons.push(
      "Unsourced claim rejected as fact — labeled HYPOTHESIS until evidence exists",
    );
  }
  if (
    (input.requestedLabel === SupportLabel.SUPPORTED ||
      options?.strictSupported) &&
    derived !== SupportLabel.SUPPORTED
  ) {
    reasons.push(
      `Requested SUPPORTED but provenance/evidence only allow ${derived}`,
    );
    if (options?.strictSupported) {
      return {
        ok: false,
        code: "UNSUPPORTED_AS_FACT",
        reasons,
      };
    }
  }

  const downgraded =
    input.requestedLabel != null && input.requestedLabel !== derived;

  const fact: FactRecord = {
    factId: input.factId,
    statement,
    supportLabel: derived,
    evidenceLinks: [...evidenceLinks],
    provenance: input.provenance,
    conflictNotes: input.conflictNotes ?? [],
    createdAtIso: input.createdAtIso,
    updatedAtIso: input.createdAtIso,
  };

  return { ok: true, fact, downgraded, reasons };
}

/**
 * Ingest an instruction/playbook document record. Documents in incoming/
 * are evidence, not executable agent instructions.
 */
export function createInstructionIngestion(input: {
  ingestionId: string;
  sourcePath: string;
  checksum: string;
  status?: InstructionIngestionStatusValue;
  instructionVersion?: string | null;
  classifierNotes?: string[];
  extractedClaimIds?: string[];
  fixtureOnly?: boolean;
  createdAtIso: string;
}): InstructionIngestionRecord {
  if (!input.sourcePath.trim()) {
    throw new Error("Instruction ingestion requires sourcePath");
  }
  if (!input.checksum.trim()) {
    throw new Error("Instruction ingestion requires checksum");
  }
  return {
    ingestionId: input.ingestionId,
    sourcePath: input.sourcePath,
    checksum: input.checksum,
    status: input.status ?? InstructionIngestionStatus.PENDING_CLASSIFICATION,
    instructionVersion: input.instructionVersion ?? null,
    classifierNotes: input.classifierNotes ?? [
      "Incoming document is evidence, not an executable instruction",
    ],
    extractedClaimIds: input.extractedClaimIds ?? [],
    fixtureOnly: input.fixtureOnly ?? false,
    createdAtIso: input.createdAtIso,
    updatedAtIso: input.createdAtIso,
  };
}

/**
 * Register a demand/trend/FAQ/rank observation with honest support labels.
 * Omitted Search Console queries are UNKNOWN, not zero demand.
 * Manual chatbot samples are HYPOTHESIS / samples, not universal ranks.
 */
export function registerDemandObservation(input: {
  observationId: string;
  kind: DemandSignalKindValue;
  queryOrTopic: string;
  normalizedIntent?: string | null;
  geography?: string | null;
  device?: string | null;
  language?: string | null;
  searchSurface?: string | null;
  observedAtIso: string;
  coveredPeriodStartIso?: string | null;
  coveredPeriodEndIso?: string | null;
  rawValue?: number | null;
  normalizedValue?: number | null;
  unit?: string | null;
  sampleSize?: number | null;
  missingDataState?: DemandObservation["missingDataState"];
  comparabilityGroup?: string | null;
  requestedLabel?: SupportLabelValue | null;
  evidenceLinks?: EvidenceLink[];
  collectionMethod: CollectionMethodValue;
  sourceSystem: string;
  fixtureOnly?: boolean;
  modelGenerated?: boolean;
  notes?: string[];
  createdAtIso: string;
}): DemandObservation {
  if (!input.queryOrTopic.trim()) {
    throw new Error("Demand observation requires queryOrTopic");
  }

  const evidenceLinks = input.evidenceLinks ?? [];
  const modelGenerated = input.modelGenerated === true;
  const missingDataState = input.missingDataState ?? "unknown";
  const measuredButMissing =
    missingDataState === "omitted" || missingDataState === "partial";

  // Manual samples / chatbot questions are samples, not universal ranks.
  let requested = input.requestedLabel ?? null;
  const notes = [...(input.notes ?? [])];
  if (
    input.kind === DemandSignalKind.RANK &&
    input.collectionMethod === CollectionMethod.MANUAL_SAMPLE
  ) {
    requested = SupportLabel.HYPOTHESIS;
    notes.push(
      "Manual/chatbot rank samples are labeled samples, not a universal ChatGPT/search rank",
    );
  }
  if (missingDataState === "omitted") {
    notes.push(
      "Omitted query/observation is not zero demand — labeled UNKNOWN when measured-but-missing",
    );
  }

  const supportLabel = deriveSupportLabel({
    requestedLabel: requested,
    collectionMethod: input.collectionMethod,
    modelGenerated,
    evidenceLinks,
    measuredButMissing,
  });

  return {
    observationId: input.observationId,
    kind: input.kind,
    queryOrTopic: input.queryOrTopic.trim(),
    normalizedIntent: input.normalizedIntent ?? null,
    geography: input.geography ?? null,
    device: input.device ?? null,
    language: input.language ?? null,
    searchSurface: input.searchSurface ?? null,
    observedAtIso: input.observedAtIso,
    coveredPeriodStartIso: input.coveredPeriodStartIso ?? null,
    coveredPeriodEndIso: input.coveredPeriodEndIso ?? null,
    rawValue: input.rawValue ?? null,
    normalizedValue: input.normalizedValue ?? null,
    unit: input.unit ?? null,
    sampleSize: input.sampleSize ?? null,
    missingDataState,
    comparabilityGroup: input.comparabilityGroup ?? null,
    supportLabel,
    evidenceLinks: [...evidenceLinks],
    collectionMethod: input.collectionMethod,
    sourceSystem: input.sourceSystem,
    fixtureOnly: input.fixtureOnly ?? false,
    notes,
    createdAtIso: input.createdAtIso,
  };
}

/**
 * Ingest a proposed claim from an untrusted source (upload, model, SERP stub).
 * Always returns HYPOTHESIS when unsourced; never promotes to SUPPORTED here.
 */
export function ingestClaimAsHypothesis(input: {
  factId: string;
  statement: string;
  sourceSystem: string;
  collectionMethod?: CollectionMethodValue;
  modelGenerated?: boolean;
  createdAtIso: string;
}): FactRegistrationResult {
  const method =
    input.collectionMethod ??
    (input.modelGenerated
      ? CollectionMethod.MODEL_GENERATED
      : CollectionMethod.UNSOURCED);
  return registerFact({
    factId: input.factId,
    statement: input.statement,
    requestedLabel: SupportLabel.SUPPORTED,
    evidenceLinks: [],
    provenance: {
      registeredBy: "ingestion",
      collectionMethod: method,
      sourceSystem: input.sourceSystem,
      observedAtIso: input.createdAtIso,
      modelGenerated: input.modelGenerated === true || method === CollectionMethod.MODEL_GENERATED,
    },
    createdAtIso: input.createdAtIso,
  });
}

export const FactVerificationDecision = {
  CONFIRMED: "CONFIRMED",
  REFUTED: "REFUTED",
} as const;

export type FactVerificationDecisionValue =
  (typeof FactVerificationDecision)[keyof typeof FactVerificationDecision];

/**
 * Wire optional SUCCESS/FAILURE learning hooks when a fact is confirmed or
 * refuted by probes or owner decision. fixtureOnly stays true for fixture
 * evidence — never auto-applies authority or expands grants.
 */
export function buildFactVerificationOutcome(input: {
  outcomeId: string;
  factId: string;
  decision: FactVerificationDecisionValue;
  /** owner_decision | journey_verification (probe) | fixture */
  source: OutcomeEvidenceSourceValue;
  fixtureOnly: boolean;
  summary: string;
  recordedAtIso: string;
  featureHints?: Record<string, string | number | boolean | null>;
}): WritePathOutcomeEvidence {
  const label: OutcomeLabelValue =
    input.decision === FactVerificationDecision.CONFIRMED
      ? OutcomeLabel.SUCCESS
      : OutcomeLabel.FAILURE;

  return recordWritePathOutcome({
    outcomeId: input.outcomeId,
    writePathId: `fact:${input.factId}`,
    operationId: `fact-verify:${input.factId}:${input.decision.toLowerCase()}`,
    label,
    source: input.source,
    fixtureOnly: input.fixtureOnly,
    summary: input.summary,
    recordedAtIso: input.recordedAtIso,
    featureHints: {
      factId: input.factId,
      verificationDecision: input.decision,
      knowledgeSlice: "R1-06",
      ...(input.featureHints ?? {}),
    },
  });
}

/**
 * Apply confirmation/refutation to a fact: updates support label and appends
 * a learning outcome. Confirmed → SUPPORTED when verification evidence is
 * usable (verification provenance replaces original UNSOURCED/MODEL_GENERATED
 * origin). Refuted → UNKNOWN with conflict note.
 */
export function applyFactVerification(
  state: KnowledgeState,
  input: {
    factId: string;
    decision: FactVerificationDecisionValue;
    source: OutcomeEvidenceSourceValue;
    fixtureOnly: boolean;
    summary: string;
    outcomeId: string;
    evidenceLink?: EvidenceLink;
    nowIso: string;
  },
): {
  state: KnowledgeState;
  outcome: WritePathOutcomeEvidence | null;
  fact: FactRecord | null;
  reasons: string[];
} {
  const idx = state.facts.findIndex((f) => f.factId === input.factId);
  if (idx < 0) {
    return {
      state,
      outcome: null,
      fact: null,
      reasons: [`Unknown factId ${input.factId}`],
    };
  }

  const existing = state.facts[idx]!;
  const reasons: string[] = [];
  const nextEvidence =
    input.evidenceLink && input.evidenceLink.sourceRef.trim().length > 0
      ? input.evidenceLink
      : null;
  const evidenceLinks = nextEvidence
    ? [...existing.evidenceLinks, nextEvidence]
    : [...existing.evidenceLinks];

  let supportLabel = existing.supportLabel;
  const conflictNotes = [...existing.conflictNotes];
  let provenance = existing.provenance;

  if (input.decision === FactVerificationDecision.CONFIRMED) {
    // Verification evidence replaces untrusted claim origin for labeling.
    const verificationMethod = nextEvidence
      ? nextEvidence.collectionMethod
      : existing.provenance.collectionMethod;
    const usable = evidenceLinks.some(isUsableEvidenceLink);
    if (usable && collectionMethodCanSupport(verificationMethod)) {
      provenance = {
        registeredBy: existing.provenance.registeredBy,
        collectionMethod: verificationMethod,
        sourceSystem:
          nextEvidence?.sourceRef ?? existing.provenance.sourceSystem,
        observedAtIso: input.nowIso,
        modelGenerated: false,
      };
      reasons.push(
        "Verification evidence replaced untrusted claim provenance for support labeling",
      );
    }

    supportLabel = deriveSupportLabel({
      requestedLabel: SupportLabel.SUPPORTED,
      collectionMethod: provenance.collectionMethod,
      modelGenerated: provenance.modelGenerated,
      evidenceLinks,
    });
    if (supportLabel !== SupportLabel.SUPPORTED) {
      reasons.push(
        "Confirmation recorded but evidence still insufficient for SUPPORTED — label not elevated to fact",
      );
    }
  } else {
    supportLabel = SupportLabel.UNKNOWN;
    conflictNotes.push(`Refuted at ${input.nowIso}: ${input.summary}`);
    reasons.push("Fact refuted — support label set to UNKNOWN");
  }

  const fact: FactRecord = {
    ...existing,
    supportLabel,
    evidenceLinks,
    provenance,
    conflictNotes,
    updatedAtIso: input.nowIso,
  };

  const outcome = buildFactVerificationOutcome({
    outcomeId: input.outcomeId,
    factId: input.factId,
    decision: input.decision,
    source: input.source,
    fixtureOnly: input.fixtureOnly,
    summary: input.summary,
    recordedAtIso: input.nowIso,
  });

  const facts = [...state.facts];
  facts[idx] = fact;

  return {
    state: {
      ...state,
      facts,
      factOutcomes: [...state.factOutcomes, outcome].slice(-500),
      updatedAtIso: input.nowIso,
    },
    outcome,
    fact,
    reasons,
  };
}

/** Learning-worker may consume fact outcomes; exclude UNKNOWN; fixture opt-in. */
export function listFactOutcomesForLearning(
  state: KnowledgeState,
  options?: { includeFixture?: boolean },
): WritePathOutcomeEvidence[] {
  const includeFixture = options?.includeFixture === true;
  return state.factOutcomes.filter((row) => {
    if (row.label === OutcomeLabel.UNKNOWN) {
      return false;
    }
    if (row.fixtureOnly && !includeFixture) {
      return false;
    }
    return true;
  });
}

/** Catalog case ids related to knowledge/demand (do not mark VERIFIED without evidence). */
export const KNOWLEDGE_RELATED_CASE_IDS = [
  "T-D01", // demand observatory provenance
  "T-D02", // fact registry support labels
  "T-K01", // instruction ingestion quarantine
] as const;
