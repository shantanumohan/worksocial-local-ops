import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_EVAL_BUDGET_LIMIT_MINOR,
  EvalProvider,
  EvalRunMode,
} from "@worksocial/domain";
import { createFileEvaluationStore } from "@worksocial/persistence";
import { createEvaluationWorker } from "./worker.js";
import { EVAL_GOLDEN_SUITE_ID } from "./fixtures.js";

const now = "2026-11-21T21:00:00.000Z";

describe("evaluation-worker isolation (AA-20)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-eval-worker-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("exposes isolation flags and never holds effect credentials", async () => {
    const worker = createEvaluationWorker(createFileEvaluationStore(dir));
    expect(worker.principal).toBe("evaluation-worker");
    expect(worker.hasActionGatewayWritePrincipal).toBe(false);
    expect(worker.hasProductionEffectCredentials).toBe(false);
    expect(worker.learningCannotExpandEffects).toBe(true);
    const status = await worker.status();
    expect(status.isolation).toEqual({
      principal: "evaluation-worker",
      hasActionGatewayWritePrincipal: false,
      hasProductionEffectCredentials: false,
      learningCannotExpandEffects: true,
    });
    expect(status.liveEvalWiring).toBe("NOT_WIRED");
    expect(status.chatgptAdsWiring).toBe("NOT_WIRED");
  });

  it("refuses live suite mode with LIVE_NOT_WIRED (no network)", async () => {
    const worker = createEvaluationWorker(createFileEvaluationStore(dir));
    await worker.seedFixtures(now);
    const live = await worker.runSuite({
      suiteId: EVAL_GOLDEN_SUITE_ID,
      mode: EvalRunMode.LIVE,
      nowIso: now,
    });
    expect(live.ok).toBe(false);
    if (live.ok) return;
    expect(live.code).toBe("LIVE_NOT_WIRED");
    expect(live.run?.fixtureOnly).toBe(true);
    expect(live.run?.results).toEqual([]);
  });

  it("refuses non-fixture connections as LIVE_NOT_WIRED", async () => {
    const worker = createEvaluationWorker(createFileEvaluationStore(dir));
    const refused = await worker.connectProvider({
      provider: EvalProvider.CLAUDE,
      fixtureOnly: false,
      nowIso: now,
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.code).toBe("LIVE_NOT_WIRED");
  });

  it("exhausts isolated eval budget without touching operational pool", async () => {
    const worker = createEvaluationWorker(createFileEvaluationStore(dir));
    await worker.seedFixtures(now);
    const exhausted = await worker.runSuite({
      suiteId: EVAL_GOLDEN_SUITE_ID,
      reserveMinor: DEFAULT_EVAL_BUDGET_LIMIT_MINOR + 1,
      nowIso: now,
    });
    expect(exhausted.ok).toBe(false);
    if (exhausted.ok) return;
    expect(exhausted.code).toBe("BUDGET_EXHAUSTED");
    expect(exhausted.run?.status).toBe("budget_exhausted");
  });

  it("runs fixture suite for Claude and Gemini offline", async () => {
    const worker = createEvaluationWorker(createFileEvaluationStore(dir));
    await worker.seedFixtures(now);
    for (const provider of [EvalProvider.CLAUDE, EvalProvider.GEMINI] as const) {
      const run = await worker.runSuite({
        suiteId: EVAL_GOLDEN_SUITE_ID,
        provider,
        mode: EvalRunMode.FIXTURE,
        nowIso: now,
      });
      expect(run.ok).toBe(true);
      if (!run.ok) return;
      expect(run.run.capability).toBe("EVAL_ONLY");
      expect(run.run.fixtureOnly).toBe(true);
      expect(run.run.chatgptAdsDecision.allowed).toBe(false);
    }
  });
});
