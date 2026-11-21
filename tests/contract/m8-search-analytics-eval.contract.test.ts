/**
 * Contract: M8 / NEXT-19 — grounded search (SUPPORTED only), analytics honesty
 * (fixture ≠ sandbox ≠ live; omitted ≠ zero; debug ≠ receipt), EVAL_ONLY
 * isolation (no publish/CRM; Ads blocked; separate budget).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AnalyticsEnvironment,
  EvalCaseVerdict,
  EvalProvider,
  EvalToolClass,
  Ga4PropertyKind,
  SupportLabel,
  classifyGscDemand,
  evaluateChatGptAdsAccess,
  interpretGa4DebugValidation,
  validateGa4PropertyBinding,
} from "@worksocial/domain";
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

const now = "2026-11-21T20:00:00.000Z";

describe("contract: M8 grounded search", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-m8-seo-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns grounded hits for SUPPORTED facts and judges no-match", () => {
    const store = createFileSeoStore(dir);
    const seo = createSeoService(store);
    seo.seedFixtures(now);
    const labels = new Map([
      ["fixture-fact-hours", SupportLabel.SUPPORTED],
      ["fixture-fact-hypothesis", SupportLabel.HYPOTHESIS],
    ]);
    const search = seo.semanticSearch({
      rawQuery: "Meeting for 8 with a display in Jersey City",
      factLabels: labels,
      bookingHandoffUrl: "https://fixture.worksocial.local/book",
      nowIso: now,
    });
    expect(search.ok).toBe(true);
    if (!search.ok) return;
    expect(search.result.answerStatus).toBe("grounded");
    expect(search.result.hits.every((h) => h.groundingStatus === "grounded")).toBe(
      true,
    );
    expect(
      search.result.hits.every((h) =>
        h.citations.every((c) => !c.includes("hypothesis")),
      ),
    ).toBe(true);

    const judged = seo.judgeSearchResult({
      queryId: search.result.queryId,
      label: "no_match",
      note: "fixture judgment",
      nowIso: now,
    });
    expect(judged.judgment.label).toBe("no_match");
    expect(judged.remediation?.status).toBe("open");
  });
});

describe("contract: M8 analytics honesty", () => {
  it("keeps fixture reads labeled and rejects wrong GA4 kind / Ads", () => {
    const bundle = readAnalyticsFixtureBundle({ nowIso: now });
    expect(bundle.gsc.measurementMode).toMatch(/FIXTURE|UNAVAILABLE/);
    expect(bundle.environmentNotes.join(" ")).toMatch(/FIXTURE ≠ SANDBOX ≠ LIVE/);

    if (bundle.gscOmittedRow) {
      const demand = classifyGscDemand(bundle.gscOmittedRow);
      expect(demand.demandLabel).toBe("unknown");
    }

    const debug = interpretGa4DebugValidation({ debugEndpointAccepted: true });
    expect(debug.deliveredConversionClaimed).toBe(false);

    const wrong = validateGa4PropertyBinding({
      propertyId: "UA-9",
      kind: Ga4PropertyKind.UA_PROPERTY,
      measurementId: null,
      displayName: "UA",
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(wrong.ok).toBe(false);

    const ads = evaluateChatGptAdsAccess({
      localTransportVerified: false,
      entitlementVerified: false,
      authVerified: false,
      projectEnvironment: AnalyticsEnvironment.FIXTURE,
      requestedEnvironment: AnalyticsEnvironment.LIVE,
    });
    expect(ads.allowed).toBe(false);
    expect(ads.environment).toBe(AnalyticsEnvironment.NOT_WIRED);
  });
});

describe("contract: M8 EVAL_ONLY worker", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-m8-eval-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs golden suite with blocked tools, no-grounding, and Ads blocked", async () => {
    const store = createFileEvaluationStore(dir);
    const evaluation = createEvaluationService(store);
    await evaluation.seedFixtures(now);
    const run = await evaluation.runSuite({
      suiteId: EVAL_GOLDEN_SUITE_ID,
      provider: EvalProvider.GEMINI,
      nowIso: now,
    });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.run.capability).toBe("EVAL_ONLY");
    expect(run.run.chatgptAdsDecision.allowed).toBe(false);
    const unused = run.run.results.find(
      (r) => r.caseId === "eval-case-grounding-unused",
    );
    expect(unused?.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    const hyp = run.run.results.find(
      (r) => r.caseId === "eval-case-hypothesis-not-truth",
    );
    expect(hyp?.toolAttemptsBlocked).toEqual(
      expect.arrayContaining([
        EvalToolClass.PUBLISH,
        EvalToolClass.CRM_WRITE,
        EvalToolClass.CUSTOMER_MESSAGE,
      ]),
    );
    expect(evaluation.attemptTool("crm_write").allowed).toBe(false);
  });
});
