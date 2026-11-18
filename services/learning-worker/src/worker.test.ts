import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  OutcomeEvidenceSource,
  OutcomeLabel,
  emptyProductionMappingState,
  recordWritePathOutcome,
} from "@worksocial/domain";
import { createFileLearningStore } from "@worksocial/persistence";
import { createLearningWorker } from "./worker.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("learning-worker isolation + train", () => {
  it("has no gateway write principal or production effect credentials", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-lw-"));
    dirs.push(dir);
    const worker = createLearningWorker(createFileLearningStore(dir));
    expect(worker.principal).toBe("learning-worker");
    expect(worker.hasActionGatewayWritePrincipal).toBe(false);
    expect(worker.hasProductionEffectCredentials).toBe(false);
    const status = worker.status();
    expect(status.models.length).toBeGreaterThanOrEqual(2);
    expect(status.isolation.hasActionGatewayWritePrincipal).toBe(false);
  });

  it("trains from verified ledger rows and excludes fixtures by default", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-lw-"));
    dirs.push(dir);
    const worker = createLearningWorker(createFileLearningStore(dir));
    const now = "2026-11-18T12:00:00.000Z";
    let mapping = emptyProductionMappingState(now);
    const real = recordWritePathOutcome({
      outcomeId: "real-1",
      writePathId: "wp-1",
      operationId: "op-1",
      label: OutcomeLabel.FAILURE,
      source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
      summary: "denied",
      fixtureOnly: false,
      recordedAtIso: now,
      featureHints: { code: "DENIED" },
    });
    const fixture = recordWritePathOutcome({
      outcomeId: "fx-1",
      writePathId: "wp-1",
      operationId: "op-fx",
      label: OutcomeLabel.SUCCESS,
      source: OutcomeEvidenceSource.FIXTURE,
      summary: "fixture",
      fixtureOnly: true,
      recordedAtIso: now,
    });
    mapping = {
      ...mapping,
      writePathOutcomes: [real, fixture],
      updatedAt: now,
    };

    const result = worker.trainFromLedgers({
      mapping,
      roleOutcomes: [],
      nowIso: now,
    });
    expect(result.examples.map((e) => e.exampleId)).toEqual(["real-1"]);
    expect(result.proposals.every((p) => p.status === "awaiting_review")).toBe(true);
    expect(result.proposals.every((p) => p.authorityImpact.expandsPublish === false)).toBe(
      true,
    );

    const status = worker.status();
    expect(status.lastRun?.runId).toBe(result.run.runId);
    expect(status.awaitingReview.length).toBeGreaterThanOrEqual(1);
  });
});
