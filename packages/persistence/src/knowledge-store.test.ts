import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CollectionMethod,
  SupportLabel,
  registerFact,
} from "@worksocial/domain";
import { createFileKnowledgeStore } from "./knowledge-store.js";

const now = "2026-11-18T20:30:00.000Z";

describe("knowledge store", () => {
  it("persists facts and reports honest status", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-knowledge-"));
    try {
      const store = createFileKnowledgeStore(dir);
      const registered = registerFact({
        factId: "fact-1",
        statement: "Fixture business address is 1 Test Plaza",
        requestedLabel: SupportLabel.SUPPORTED,
        evidenceLinks: [
          {
            evidenceId: "ev-1",
            sourceRef: "fixture://address",
            collectionMethod: CollectionMethod.FIXTURE,
            summary: "Fixture address",
            observedAtIso: now,
            fixtureOnly: true,
          },
        ],
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
      store.upsertFact(registered.fact);
      const again = createFileKnowledgeStore(dir);
      expect(again.listFacts()).toHaveLength(1);
      const status = again.status();
      expect(status.factCount).toBe(1);
      expect(status.supportedCount).toBe(1);
      expect(status.liveSerpWiring).toBe("NOT_WIRED");
      expect(status.honestNote).toMatch(/HYPOTHESIS/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
