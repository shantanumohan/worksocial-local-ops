import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EvalCaseVerdict, EvalProvider, EvalToolClass } from "@worksocial/domain";
import { createFileEvaluationStore } from "@worksocial/persistence";
import { createEvaluationService } from "./service.js";
import { EVAL_GOLDEN_SUITE_ID } from "./fixtures.js";

const now = "2026-11-21T19:00:00.000Z";

describe("evaluation-worker service", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-eval-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("seeds EVAL_ONLY connections and runs grounded suite", async () => {
    const store = createFileEvaluationStore(dir);
    const svc = createEvaluationService(store);
    const seed = await svc.seedFixtures(now);
    expect(seed.connections).toHaveLength(2);
    expect(seed.suite.suiteId).toBe(EVAL_GOLDEN_SUITE_ID);

    const run = await svc.runSuite({
      suiteId: EVAL_GOLDEN_SUITE_ID,
      provider: EvalProvider.CLAUDE,
      nowIso: now,
    });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.run.capability).toBe("EVAL_ONLY");
    expect(run.run.fixtureOnly).toBe(true);
    const byId = Object.fromEntries(
      run.run.results.map((r) => [r.caseId, r]),
    );
    expect(byId["eval-case-hours-grounded"]?.verdict).toBe(EvalCaseVerdict.PASS);
    expect(byId["eval-case-grounding-unused"]?.verdict).toBe(
      EvalCaseVerdict.NO_GROUNDING,
    );
    expect(byId["eval-case-hypothesis-not-truth"]?.toolAttemptsBlocked).toEqual(
      expect.arrayContaining([
        EvalToolClass.PUBLISH,
        EvalToolClass.CRM_WRITE,
        EvalToolClass.CUSTOMER_MESSAGE,
      ]),
    );
    expect(run.run.chatgptAdsDecision.allowed).toBe(false);
  });

  it("keeps Ads blocked and forbids operational tools", async () => {
    const store = createFileEvaluationStore(dir);
    const svc = createEvaluationService(store);
    expect(svc.chatgptAdsStatus().allowed).toBe(false);
    expect(svc.chatgptAdsStatus().wiring).toBe("NOT_WIRED");
    expect(svc.attemptTool("publish").allowed).toBe(false);
    expect(svc.attemptTool("judge_answer").allowed).toBe(true);
    const status = await svc.status();
    expect(status.backend).toBe("file");
    expect(status.liveEvalWiring).toBe("NOT_WIRED");
  });

  it("connectProvider returns ok envelope for fixture connections", async () => {
    const store = createFileEvaluationStore(dir);
    const svc = createEvaluationService(store);
    const connected = await svc.connectProvider({
      provider: EvalProvider.CLAUDE,
      nowIso: now,
    });
    expect(connected.ok).toBe(true);
    if (!connected.ok) return;
    expect(connected.connection.fixtureOnly).toBe(true);
    expect(connected.connection.operationalFallback).toBe(false);
  });
});
