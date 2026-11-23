import { describe, expect, it } from "vitest";
import {
  CollectionMethod,
  DemandSignalKind,
  FactVerificationDecision,
  SupportLabel,
  applyFactVerification,
  createInstructionIngestion,
  deriveSupportLabel,
  emptyKnowledgeState,
  ingestClaimAsHypothesis,
  listFactOutcomesForLearning,
  registerDemandObservation,
  compareTrendIndices,
  registerFact,
} from "./knowledge.js";
import { OutcomeEvidenceSource, OutcomeLabel } from "./production-mapping.js";

const now = "2026-11-18T20:00:00.000Z";

describe("knowledge support labeling", () => {
  it("forces model-generated claims to HYPOTHESIS", () => {
    expect(
      deriveSupportLabel({
        requestedLabel: SupportLabel.SUPPORTED,
        collectionMethod: CollectionMethod.MODEL_GENERATED,
        modelGenerated: true,
        evidenceLinks: [],
      }),
    ).toBe(SupportLabel.HYPOTHESIS);
  });

  it("forces unsourced claims to HYPOTHESIS", () => {
    expect(
      deriveSupportLabel({
        requestedLabel: SupportLabel.SUPPORTED,
        collectionMethod: CollectionMethod.UNSOURCED,
        modelGenerated: false,
        evidenceLinks: [],
      }),
    ).toBe(SupportLabel.HYPOTHESIS);
  });

  it("labels measured-but-missing as UNKNOWN even with omission evidence", () => {
    expect(
      deriveSupportLabel({
        collectionMethod: CollectionMethod.PLATFORM_EXPORT,
        modelGenerated: false,
        evidenceLinks: [
          {
            evidenceId: "ev-omit",
            sourceRef: "fixture://gsc-omission",
            collectionMethod: CollectionMethod.PLATFORM_EXPORT,
            summary: "Export documents omitted query",
            observedAtIso: now,
            fixtureOnly: true,
          },
        ],
        measuredButMissing: true,
      }),
    ).toBe(SupportLabel.UNKNOWN);
  });

  it("rejects empty sourceRef evidence as unusable", () => {
    expect(
      deriveSupportLabel({
        requestedLabel: SupportLabel.SUPPORTED,
        collectionMethod: CollectionMethod.OWNER_DECLARED,
        modelGenerated: false,
        evidenceLinks: [
          {
            evidenceId: "ev-empty",
            sourceRef: "   ",
            collectionMethod: CollectionMethod.OWNER_DECLARED,
            summary: "Empty ref",
            observedAtIso: now,
            fixtureOnly: true,
          },
        ],
      }),
    ).toBe(SupportLabel.UNKNOWN);
  });

  it("allows SUPPORTED only with usable evidence", () => {
    expect(
      deriveSupportLabel({
        requestedLabel: SupportLabel.SUPPORTED,
        collectionMethod: CollectionMethod.FIRST_PARTY_MEASURED,
        modelGenerated: false,
        evidenceLinks: [
          {
            evidenceId: "ev-1",
            sourceRef: "fixture://gsc-export-1",
            collectionMethod: CollectionMethod.PLATFORM_EXPORT,
            summary: "Search Console export row",
            observedAtIso: now,
            fixtureOnly: true,
          },
        ],
      }),
    ).toBe(SupportLabel.SUPPORTED);
  });
});

describe("fact registry", () => {
  it("registers an evidenced fixture fact as SUPPORTED", () => {
    const result = registerFact({
      factId: "fact-hours",
      statement: "WorkSocial Jersey City closes at 22:00 local on weekdays",
      requestedLabel: SupportLabel.SUPPORTED,
      evidenceLinks: [
        {
          evidenceId: "ev-hours",
          sourceRef: "fixture://owner-declared-hours",
          collectionMethod: CollectionMethod.OWNER_DECLARED,
          summary: "Owner-declared hours fixture",
          observedAtIso: now,
          fixtureOnly: true,
        },
      ],
      provenance: {
        registeredBy: "owner",
        collectionMethod: CollectionMethod.OWNER_DECLARED,
        sourceSystem: "owner",
        observedAtIso: now,
        modelGenerated: false,
      },
      createdAtIso: now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fact.supportLabel).toBe(SupportLabel.SUPPORTED);
      expect(result.downgraded).toBe(false);
    }
  });

  it("downgrades unsourced SUPPORTED requests to HYPOTHESIS", () => {
    const result = registerFact({
      factId: "fact-model",
      statement: "Customers always ask about rooftop AV",
      requestedLabel: SupportLabel.SUPPORTED,
      evidenceLinks: [],
      provenance: {
        registeredBy: "ingestion",
        collectionMethod: CollectionMethod.UNSOURCED,
        sourceSystem: "claude-draft",
        observedAtIso: now,
        modelGenerated: false,
      },
      createdAtIso: now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fact.supportLabel).toBe(SupportLabel.HYPOTHESIS);
      expect(result.downgraded).toBe(true);
      expect(result.reasons.join(" ")).toMatch(/Unsourced/i);
    }
  });

  it("strictSupported rejects model claims as facts", () => {
    const result = registerFact(
      {
        factId: "fact-strict",
        statement: "Invented ranking claim",
        requestedLabel: SupportLabel.SUPPORTED,
        evidenceLinks: [],
        provenance: {
          registeredBy: "agent_proposal",
          collectionMethod: CollectionMethod.MODEL_GENERATED,
          sourceSystem: "claude",
          observedAtIso: now,
          modelGenerated: true,
        },
        createdAtIso: now,
      },
      { strictSupported: true },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("UNSUPPORTED_AS_FACT");
    }
  });

  it("ingestClaimAsHypothesis never yields SUPPORTED", () => {
    const result = ingestClaimAsHypothesis({
      factId: "fact-ingest",
      statement: "Plausible trending question about team offsites",
      sourceSystem: "model",
      modelGenerated: true,
      createdAtIso: now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fact.supportLabel).toBe(SupportLabel.HYPOTHESIS);
    }
  });
});

describe("instruction ingestion", () => {
  it("marks incoming docs as evidence, not executable instructions", () => {
    const record = createInstructionIngestion({
      ingestionId: "ing-1",
      sourcePath: "incoming/playbook-draft.md",
      checksum: "sha256:abc",
      fixtureOnly: true,
      createdAtIso: now,
    });
    expect(record.status).toBe("pending_classification");
    expect(record.classifierNotes.join(" ")).toMatch(/not an executable/i);
    expect(record.instructionVersion).toBeNull();
  });
});

describe("demand observations", () => {
  it("labels omitted Search Console queries as UNKNOWN, not zero", () => {
    const obs = registerDemandObservation({
      observationId: "obs-omit",
      kind: DemandSignalKind.TREND,
      queryOrTopic: "meeting rooms near PATH",
      collectionMethod: CollectionMethod.PLATFORM_EXPORT,
      sourceSystem: "search_console",
      missingDataState: "omitted",
      requestedLabel: SupportLabel.SUPPORTED,
      observedAtIso: now,
      createdAtIso: now,
      fixtureOnly: true,
    });
    expect(obs.supportLabel).toBe(SupportLabel.UNKNOWN);
    expect(obs.notes.join(" ")).toMatch(/not zero demand/i);
  });

  it("labels manual chatbot rank samples as HYPOTHESIS", () => {
    const obs = registerDemandObservation({
      observationId: "obs-rank",
      kind: DemandSignalKind.RANK,
      queryOrTopic: "WorkSocial Jersey City",
      collectionMethod: CollectionMethod.MANUAL_SAMPLE,
      sourceSystem: "chatgpt_manual",
      sampleSize: 3,
      requestedLabel: SupportLabel.SUPPORTED,
      observedAtIso: now,
      createdAtIso: now,
      fixtureOnly: true,
    });
    expect(obs.supportLabel).toBe(SupportLabel.HYPOTHESIS);
    expect(obs.notes.join(" ")).toMatch(/not a universal/i);
  });

  it("registers fixture FAQ with evidence as SUPPORTED", () => {
    const obs = registerDemandObservation({
      observationId: "obs-faq",
      kind: DemandSignalKind.FAQ,
      queryOrTopic: "Do you have day-pass meeting rooms?",
      normalizedIntent: "day_pass_availability",
      collectionMethod: CollectionMethod.FIXTURE,
      sourceSystem: "fixture_demand",
      evidenceLinks: [
        {
          evidenceId: "ev-faq",
          sourceRef: "fixture://faq-cluster-1",
          collectionMethod: CollectionMethod.FIXTURE,
          summary: "Fixture FAQ cluster",
          observedAtIso: now,
          fixtureOnly: true,
        },
      ],
      requestedLabel: SupportLabel.SUPPORTED,
      sampleSize: 12,
      missingDataState: "complete",
      observedAtIso: now,
      createdAtIso: now,
      fixtureOnly: true,
    });
    expect(obs.supportLabel).toBe(SupportLabel.SUPPORTED);
  });

  it("rejects incomparable trend indices and allows same-group ratios", () => {
    const base = {
      kind: DemandSignalKind.TREND,
      unit: "relative_interest_index",
      sourceSystem: "trends_fixture_a",
      rawValue: 50,
      comparabilityGroup: "extract-week-2026-W45",
    } as const;
    const sameGroup = compareTrendIndices(base, {
      ...base,
      rawValue: 75,
    });
    expect(sameGroup).toEqual({
      kind: "comparable",
      ratio: 1.5,
      comparabilityGroup: "extract-week-2026-W45",
      label: "comparable",
    });

    const otherExtract = compareTrendIndices(base, {
      ...base,
      rawValue: 80,
      comparabilityGroup: "extract-week-2026-W46-rescale",
    });
    expect(otherExtract).toEqual({
      kind: "rejected",
      reason: "incomparable_group",
      label: "incomparable",
    });

    const unlabeled = compareTrendIndices(
      { ...base, comparabilityGroup: null },
      { ...base, rawValue: 60, comparabilityGroup: null },
    );
    expect(unlabeled).toEqual({
      kind: "rejected",
      reason: "missing_comparability_group",
      label: "unlabeled",
    });

    const unitMismatch = compareTrendIndices(base, {
      ...base,
      rawValue: 60,
      unit: "search_volume",
    });
    expect(unitMismatch.kind).toBe("rejected");
    if (unitMismatch.kind === "rejected") {
      expect(unitMismatch.reason).toBe("unit_mismatch");
    }

    const sourceMismatch = compareTrendIndices(base, {
      ...base,
      rawValue: 60,
      sourceSystem: "trends_fixture_b",
    });
    expect(sourceMismatch).toEqual({
      kind: "rejected",
      reason: "source_mismatch",
      label: "incomparable",
    });
  });
});

describe("fact verification learning hooks", () => {
  it("emits fixtureOnly SUCCESS on confirmation with evidence", () => {
    let state = emptyKnowledgeState(now);
    const registered = registerFact({
      factId: "fact-confirm",
      statement: "Lobby wifi SSID is WorkSocial-Guest",
      requestedLabel: SupportLabel.HYPOTHESIS,
      evidenceLinks: [],
      provenance: {
        registeredBy: "fixture",
        collectionMethod: CollectionMethod.FIXTURE,
        sourceSystem: "fixture",
        observedAtIso: now,
        modelGenerated: false,
      },
      createdAtIso: now,
    });
    expect(registered.ok).toBe(true);
    if (!registered.ok) return;
    state = {
      ...state,
      facts: [registered.fact],
      updatedAtIso: now,
    };

    const verified = applyFactVerification(state, {
      factId: "fact-confirm",
      decision: FactVerificationDecision.CONFIRMED,
      source: OutcomeEvidenceSource.FIXTURE,
      fixtureOnly: true,
      summary: "Owner confirmed wifi SSID via fixture probe",
      outcomeId: "out-fact-1",
      evidenceLink: {
        evidenceId: "ev-wifi",
        sourceRef: "fixture://probe-wifi",
        collectionMethod: CollectionMethod.FIXTURE,
        summary: "Fixture probe read",
        observedAtIso: now,
        fixtureOnly: true,
      },
      nowIso: now,
    });

    expect(verified.fact?.supportLabel).toBe(SupportLabel.SUPPORTED);
    expect(verified.outcome?.label).toBe(OutcomeLabel.SUCCESS);
    expect(verified.outcome?.fixtureOnly).toBe(true);
    expect(verified.outcome?.writePathId).toBe("fact:fact-confirm");

    const forLearning = listFactOutcomesForLearning(verified.state, {
      includeFixture: true,
    });
    expect(forLearning).toHaveLength(1);

    const excluded = listFactOutcomesForLearning(verified.state, {
      includeFixture: false,
    });
    expect(excluded).toHaveLength(0);
  });

  it("upgrades model hypothesis to SUPPORTED when verification evidence replaces provenance", () => {
    let state = emptyKnowledgeState(now);
    const registered = ingestClaimAsHypothesis({
      factId: "fact-upgrade",
      statement: "Rooftop AV is available on request",
      sourceSystem: "claude",
      modelGenerated: true,
      createdAtIso: now,
    });
    expect(registered.ok).toBe(true);
    if (!registered.ok) return;
    expect(registered.fact.supportLabel).toBe(SupportLabel.HYPOTHESIS);
    state = { ...state, facts: [registered.fact], updatedAtIso: now };

    const verified = applyFactVerification(state, {
      factId: "fact-upgrade",
      decision: FactVerificationDecision.CONFIRMED,
      source: OutcomeEvidenceSource.OWNER_DECISION,
      fixtureOnly: false,
      summary: "Owner confirmed AV availability with evidence",
      outcomeId: "out-upgrade",
      evidenceLink: {
        evidenceId: "ev-av",
        sourceRef: "owner://inventory-sheet",
        collectionMethod: CollectionMethod.OWNER_DECLARED,
        summary: "Owner inventory",
        observedAtIso: now,
        fixtureOnly: false,
      },
      nowIso: now,
    });

    expect(verified.fact?.supportLabel).toBe(SupportLabel.SUPPORTED);
    expect(verified.fact?.provenance.modelGenerated).toBe(false);
    expect(verified.fact?.provenance.collectionMethod).toBe(
      CollectionMethod.OWNER_DECLARED,
    );
    expect(verified.outcome?.fixtureOnly).toBe(false);
  });

  it("emits FAILURE and UNKNOWN on refutation", () => {
    let state = emptyKnowledgeState(now);
    const registered = registerFact({
      factId: "fact-refute",
      statement: "Parking is free after 18:00",
      requestedLabel: SupportLabel.HYPOTHESIS,
      evidenceLinks: [],
      provenance: {
        registeredBy: "ingestion",
        collectionMethod: CollectionMethod.UNSOURCED,
        sourceSystem: "web",
        observedAtIso: now,
        modelGenerated: false,
      },
      createdAtIso: now,
    });
    expect(registered.ok).toBe(true);
    if (!registered.ok) return;
    state = { ...state, facts: [registered.fact], updatedAtIso: now };

    const verified = applyFactVerification(state, {
      factId: "fact-refute",
      decision: FactVerificationDecision.REFUTED,
      source: OutcomeEvidenceSource.OWNER_DECISION,
      fixtureOnly: true,
      summary: "Owner refuted free-parking claim",
      outcomeId: "out-fact-2",
      nowIso: now,
    });

    expect(verified.fact?.supportLabel).toBe(SupportLabel.UNKNOWN);
    expect(verified.outcome?.label).toBe(OutcomeLabel.FAILURE);
    expect(verified.fact?.conflictNotes.join(" ")).toMatch(/Refuted/);
  });
});
