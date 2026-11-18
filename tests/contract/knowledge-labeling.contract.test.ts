/**
 * Contract: R1-06 knowledge labeling — unsourced/model claims cannot become
 * SUPPORTED facts; demand omissions are UNKNOWN; confirm/refute emits
 * fixtureOnly learning outcomes without authority expansion.
 */
import { describe, expect, it } from "vitest";
import {
  CollectionMethod,
  DemandSignalKind,
  FactVerificationDecision,
  SupportLabel,
  createInstructionIngestion,
  ingestClaimAsHypothesis,
  registerDemandObservation,
  registerFact,
} from "@worksocial/domain";
import { createFileKnowledgeStore } from "@worksocial/persistence";
import { createKnowledgeService } from "@worksocial/knowledge";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const now = "2026-11-18T22:00:00.000Z";

describe("contract: knowledge labeling and provenance", () => {
  it("never promotes model claims to SUPPORTED facts", () => {
    const result = ingestClaimAsHypothesis({
      factId: "c-model",
      statement: "Plausible Claude-generated demand question",
      sourceSystem: "claude",
      modelGenerated: true,
      createdAtIso: now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fact.supportLabel).toBe(SupportLabel.HYPOTHESIS);
    }

    const strict = registerFact(
      {
        factId: "c-strict",
        statement: "Unsourced commercial claim",
        requestedLabel: SupportLabel.SUPPORTED,
        evidenceLinks: [],
        provenance: {
          registeredBy: "ingestion",
          collectionMethod: CollectionMethod.UNSOURCED,
          sourceSystem: "upload",
          observedAtIso: now,
          modelGenerated: false,
        },
        createdAtIso: now,
      },
      { strictSupported: true },
    );
    expect(strict.ok).toBe(false);
  });

  it("treats omitted rank/query rows as UNKNOWN not zero demand", () => {
    const obs = registerDemandObservation({
      observationId: "c-omit",
      kind: DemandSignalKind.RANK,
      queryOrTopic: "training rooms near PATH",
      collectionMethod: CollectionMethod.PLATFORM_EXPORT,
      sourceSystem: "search_console",
      missingDataState: "omitted",
      requestedLabel: SupportLabel.SUPPORTED,
      evidenceLinks: [
        {
          evidenceId: "c-omit-ev",
          sourceRef: "fixture://gsc-export",
          collectionMethod: CollectionMethod.PLATFORM_EXPORT,
          summary: "Export row documenting omission",
          observedAtIso: now,
          fixtureOnly: true,
        },
      ],
      observedAtIso: now,
      createdAtIso: now,
      fixtureOnly: true,
    });
    expect(obs.supportLabel).toBe(SupportLabel.UNKNOWN);
    expect(obs.rawValue).toBeNull();
  });

  it("upgrades model hypothesis when verification evidence replaces provenance", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-know-upgrade-"));
    try {
      const store = createFileKnowledgeStore(dir);
      const svc = createKnowledgeService(store);
      const claim = svc.ingestUnsourcedClaim({
        statement: "Model claim about weekend parking",
        modelGenerated: true,
        nowIso: now,
      });
      expect(claim.fact?.supportLabel).toBe(SupportLabel.HYPOTHESIS);
      const verified = svc.verifyFact({
        factId: claim.fact!.factId,
        decision: FactVerificationDecision.CONFIRMED,
        summary: "Owner confirmed with evidence",
        fixtureOnly: false,
        source: "owner_decision",
        evidenceLink: {
          evidenceId: "c-upgrade-ev",
          sourceRef: "owner://policy",
          collectionMethod: CollectionMethod.OWNER_DECLARED,
          summary: "Owner policy",
          observedAtIso: now,
          fixtureOnly: false,
        },
        nowIso: now,
      });
      expect(verified.fact?.supportLabel).toBe(SupportLabel.SUPPORTED);
      expect(verified.fact?.provenance.modelGenerated).toBe(false);
      expect(verified.outcome?.fixtureOnly).toBe(false);
      expect(svc.listLearningOutcomes()).toHaveLength(1);
      expect(svc.listLearningOutcomes(false)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps instruction ingestion non-executable and wires fixture learning hooks", () => {
    const ingestion = createInstructionIngestion({
      ingestionId: "c-ing",
      sourcePath: "incoming/notes.md",
      checksum: "sha256:contract",
      fixtureOnly: true,
      createdAtIso: now,
    });
    expect(ingestion.status).toBe("pending_classification");
    expect(ingestion.instructionVersion).toBeNull();

    const dir = mkdtempSync(join(tmpdir(), "ws-know-contract-"));
    try {
      const store = createFileKnowledgeStore(dir);
      const svc = createKnowledgeService(store);
      svc.registerFact({
        factId: "c-fact",
        statement: "Fixture phone number is +1-555-0100",
        collectionMethod: CollectionMethod.FIXTURE,
        sourceSystem: "fixture",
        requestedLabel: SupportLabel.HYPOTHESIS,
        nowIso: now,
      });
      const verified = svc.verifyFact({
        factId: "c-fact",
        decision: FactVerificationDecision.CONFIRMED,
        summary: "Owner confirmed via fixture",
        fixtureOnly: true,
        source: "owner_decision",
        evidenceLink: {
          evidenceId: "c-ev",
          sourceRef: "fixture://owner",
          collectionMethod: CollectionMethod.OWNER_DECLARED,
          summary: "Owner decision",
          observedAtIso: now,
          fixtureOnly: true,
        },
        nowIso: now,
      });
      expect(verified.outcome?.label).toBe("SUCCESS");
      expect(verified.outcome?.fixtureOnly).toBe(true);
      expect(verified.fact?.supportLabel).toBe(SupportLabel.SUPPORTED);
      expect(svc.status().liveSerpWiring).toBe("NOT_WIRED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
