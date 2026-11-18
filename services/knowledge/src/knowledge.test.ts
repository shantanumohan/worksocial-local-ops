import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CollectionMethod,
  DemandSignalKind,
  FactVerificationDecision,
  SupportLabel,
} from "@worksocial/domain";
import { createFileKnowledgeStore } from "@worksocial/persistence";
import { createKnowledgeService } from "./service.js";
import { fixtureEvidence } from "./fixtures.js";

const now = "2026-11-18T21:00:00.000Z";

describe("knowledge service", () => {
  it("seeds fixtures with mixed honest labels and NOT_WIRED live adapters", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-know-svc-"));
    try {
      const store = createFileKnowledgeStore(dir);
      const svc = createKnowledgeService(store);
      const seed = svc.seedFixtures(now);
      expect(seed.facts.length).toBeGreaterThanOrEqual(2);
      expect(seed.demandSignals.length).toBeGreaterThanOrEqual(3);
      const hypothesis = seed.facts.find((f) => f.factId === "fixture-fact-hypothesis");
      expect(hypothesis?.supportLabel).toBe(SupportLabel.HYPOTHESIS);
      const omitted = seed.demandSignals.find(
        (d) => d.observationId === "fixture-rank-omitted",
      );
      expect(omitted?.supportLabel).toBe(SupportLabel.UNKNOWN);
      const status = svc.status();
      expect(status.liveSerpWiring).toBe("NOT_WIRED");
      expect(status.liveTrendsWiring).toBe("NOT_WIRED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects unsourced claims as SUPPORTED facts (hypothesis only)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-know-svc-"));
    try {
      const store = createFileKnowledgeStore(dir);
      const svc = createKnowledgeService(store);
      const result = svc.ingestUnsourcedClaim({
        statement: "Everyone searches for free parking near Exchange Place",
        modelGenerated: true,
        nowIso: now,
      });
      expect(result.ok).toBe(true);
      expect(result.fact?.supportLabel).toBe(SupportLabel.HYPOTHESIS);

      const strict = svc.registerFact({
        statement: "Still unsourced",
        collectionMethod: CollectionMethod.UNSOURCED,
        sourceSystem: "web",
        requestedLabel: SupportLabel.SUPPORTED,
        strictSupported: true,
        nowIso: now,
      });
      expect(strict.ok).toBe(false);
      expect(strict.code).toBe("UNSUPPORTED_AS_FACT");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("deduplicates instruction ingestion by checksum", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-know-svc-"));
    try {
      const store = createFileKnowledgeStore(dir);
      const svc = createKnowledgeService(store);
      const first = svc.ingestInstruction({
        sourcePath: "incoming/a.md",
        content: "same-bytes",
        nowIso: now,
      });
      const second = svc.ingestInstruction({
        sourcePath: "incoming/copy-of-a.md",
        content: "same-bytes",
        nowIso: now,
      });
      expect(second.ingestionId).toBe(first.ingestionId);
      expect(svc.listIngestions()).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("wires fixtureOK learning outcomes on confirm/refute", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-know-svc-"));
    try {
      const store = createFileKnowledgeStore(dir);
      const svc = createKnowledgeService(store);
      const registered = svc.registerFact({
        factId: "fact-wifi",
        statement: "Guest wifi SSID is WorkSocial-Guest",
        collectionMethod: CollectionMethod.FIXTURE,
        sourceSystem: "fixture",
        requestedLabel: SupportLabel.HYPOTHESIS,
        nowIso: now,
      });
      expect(registered.ok).toBe(true);

      const confirmed = svc.verifyFact({
        factId: "fact-wifi",
        decision: FactVerificationDecision.CONFIRMED,
        summary: "Fixture probe confirmed SSID",
        fixtureOnly: true,
        source: "fixture",
        evidenceLink: fixtureEvidence("ev-wifi", "probe", now),
        nowIso: now,
      });
      expect(confirmed.fact?.supportLabel).toBe(SupportLabel.SUPPORTED);
      expect(confirmed.outcome?.label).toBe("SUCCESS");
      expect(confirmed.outcome?.fixtureOnly).toBe(true);

      const outcomes = svc.listLearningOutcomes(true);
      expect(outcomes.some((o) => o.label === "SUCCESS")).toBe(true);

      // demand signal register path
      const faq = svc.registerDemand({
        kind: DemandSignalKind.FAQ,
        queryOrTopic: "Do you have phone booths?",
        collectionMethod: CollectionMethod.FIXTURE,
        sourceSystem: "fixture_demand",
        evidenceLinks: [fixtureEvidence("ev-faq", "faq", now)],
        requestedLabel: SupportLabel.SUPPORTED,
        missingDataState: "complete",
        fixtureOnly: true,
        nowIso: now,
      });
      expect(faq.supportLabel).toBe(SupportLabel.SUPPORTED);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
