/**
 * E2E-lite (offline): M8 grounded search → judgment → analytics fixture read
 * → EVAL_ONLY suite with Ads blocked. No live providers. External effects: none.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SupportLabel } from "@worksocial/domain";
import {
  createFileEvaluationStore,
  createFileSeoStore,
} from "@worksocial/persistence";
import { createSeoService } from "@worksocial/seo";
import {
  createEvaluationService,
  EVAL_GOLDEN_SUITE_ID,
} from "@worksocial/evaluation-worker";
import { readAnalyticsFixtureBundle } from "@worksocial/provider-adapters";

const now = "2026-11-21T20:30:00.000Z";

describe("e2e-lite: M8 search + analytics + eval", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-m8-e2e-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("completes offline grounded search, analysis, and EVAL_ONLY journey", () => {
    const seo = createSeoService(createFileSeoStore(dir));
    const evaluation = createEvaluationService(createFileEvaluationStore(dir));

    seo.seedFixtures(now);
    evaluation.seedFixtures(now);

    const labels = new Map([
      ["fixture-fact-hours", SupportLabel.SUPPORTED],
      ["fixture-fact-hypothesis", SupportLabel.HYPOTHESIS],
    ]);
    const search = seo.semanticSearch({
      rawQuery: "Training room for 20 in Jersey City with video",
      factLabels: labels,
      nowIso: now,
    });
    expect(search.ok).toBe(true);
    if (!search.ok) return;
    expect(search.result.answerStatus).toBe("grounded");

    const judgment = seo.judgeSearchResult({
      queryId: search.result.queryId,
      label: "relevant",
      nowIso: now,
    });
    expect(judgment.judgment.label).toBe("relevant");

    const analytics = readAnalyticsFixtureBundle({ nowIso: now });
    expect(analytics.liveWiring.gsc).toMatch(/FIXTURE|NOT_WIRED/);
    expect(analytics.ga4.observation.note).toMatch(/FIXTURE|UNAVAILABLE|not live/i);

    const ads = evaluation.chatgptAdsStatus();
    expect(ads.allowed).toBe(false);
    expect(ads.wiring).toBe("NOT_WIRED");

    const run = evaluation.runSuite({
      suiteId: EVAL_GOLDEN_SUITE_ID,
      provider: "claude",
      factLabels: labels,
      nowIso: now,
    });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.run.results.length).toBeGreaterThanOrEqual(3);
    expect(run.run.settledMinor).toBeGreaterThan(0);
    expect(evaluation.status().liveEvalWiring).toBe("NOT_WIRED");
  });
});
