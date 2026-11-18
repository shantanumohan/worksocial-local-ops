import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTrainLoop } from "@worksocial/ml";
import { OutcomeEvidenceSource, OutcomeLabel } from "@worksocial/domain";
import { createFileLearningStore } from "./learning-store.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("learning-store", () => {
  it("persists training runs and awaiting-review proposals", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-learn-"));
    dirs.push(dir);
    const store = createFileLearningStore(dir);
    const trained = runTrainLoop({
      writePathOutcomes: [
        {
          outcomeId: "o1",
          writePathId: "wp",
          operationId: "op",
          label: OutcomeLabel.SUCCESS,
          source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
          featureHints: {},
          summary: "ok",
          fixtureOnly: false,
          recordedAtIso: "2026-11-18T10:00:00.000Z",
        },
      ],
      roleOutcomes: [],
      nowIso: "2026-11-18T10:01:00.000Z",
      runId: "run-store-1",
      isolation: store.read().isolation,
    });
    store.recordTraining(trained.run, trained.proposals, [...trained.run.modelWeights]);
    const status = store.status();
    expect(status.modelCount).toBeGreaterThanOrEqual(2);
    expect(status.lastRun?.runId).toBe("run-store-1");
    expect(status.awaitingReview.length).toBeGreaterThanOrEqual(2);
    expect(status.isolation.hasActionGatewayWritePrincipal).toBe(false);
    expect(status.isolation.hasProductionEffectCredentials).toBe(false);
  });
});
