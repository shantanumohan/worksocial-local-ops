/**
 * AA-20 offline isolation suite for the EVAL_ONLY worker.
 * Proves fixture vs live boundaries; does not claim product acceptance VERIFIED.
 * External effects: NONE.
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_EVAL_BUDGET_LIMIT_MINOR,
  EvalCaseVerdict,
  EvalProvider,
  EvalRunMode,
  EvalToolClass,
  FORBIDDEN_EVAL_TOOLS,
  FIXED_EVALUATION_ISOLATION,
} from "@worksocial/domain";
import {
  FIXED_NON_EXPANDING_AUTHORITY,
  assertAuthorityNonExpansion,
} from "@worksocial/ml";
import { createFileEvaluationStore } from "@worksocial/persistence";
import {
  EVAL_GOLDEN_SUITE_ID,
  createEvaluationWorker,
} from "@worksocial/evaluation-worker";
import { createCredentialBroker } from "@worksocial/credential-broker";

const dirs: string[] = [];
const now = "2026-11-21T22:00:00.000Z";

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("eval isolation suite (AA-20)", () => {
  it("principal + isolation flags match fixed context", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-eval-suite-"));
    dirs.push(dir);
    const worker = createEvaluationWorker(createFileEvaluationStore(dir));
    expect(worker.principal).toBe("evaluation-worker");
    expect(worker.hasActionGatewayWritePrincipal).toBe(false);
    expect(worker.hasProductionEffectCredentials).toBe(false);
    expect(worker.learningCannotExpandEffects).toBe(true);
    expect(worker.isolation).toEqual(FIXED_EVALUATION_ISOLATION);
    expect(worker.status().isolation).toEqual(FIXED_EVALUATION_ISOLATION);
  });

  it("broker denies mint for evaluation-worker", () => {
    const broker = createCredentialBroker();
    const ref = broker.putReference("gemini", ["eval"], "secret", now);
    expect(
      broker.mintScopedHandle({
        principal: "evaluation-worker",
        referenceId: ref.referenceId,
        requestedScopes: ["eval"],
        nowIso: now,
      }),
    ).toMatchObject({ ok: false, code: "PRINCIPAL_DENIED" });
  });

  it("forbids operational tools and allows judge/read/compare", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-eval-suite-"));
    dirs.push(dir);
    const worker = createEvaluationWorker(createFileEvaluationStore(dir));
    for (const tool of FORBIDDEN_EVAL_TOOLS) {
      expect(worker.attemptTool(tool).allowed).toBe(false);
    }
    expect(worker.attemptTool(EvalToolClass.JUDGE_ANSWER).allowed).toBe(true);
    expect(worker.attemptTool(EvalToolClass.READ_EVIDENCE).allowed).toBe(true);
    expect(worker.attemptTool(EvalToolClass.COMPARE_GOLDEN).allowed).toBe(true);
  });

  it("golden suite: grounded pass, unused grounding, blocked tools", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-eval-suite-"));
    dirs.push(dir);
    const worker = createEvaluationWorker(createFileEvaluationStore(dir));
    worker.seedFixtures(now);
    const run = worker.runSuite({
      suiteId: EVAL_GOLDEN_SUITE_ID,
      provider: EvalProvider.CLAUDE,
      mode: EvalRunMode.FIXTURE,
      nowIso: now,
    });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    const byId = Object.fromEntries(run.run.results.map((r) => [r.caseId, r]));
    expect(byId["eval-case-hours-grounded"]?.verdict).toBe(EvalCaseVerdict.PASS);
    expect(byId["eval-case-grounding-unused"]?.verdict).toBe(
      EvalCaseVerdict.NO_GROUNDING,
    );
    expect(
      byId["eval-case-hypothesis-not-truth"]?.toolAttemptsBlocked.length,
    ).toBeGreaterThan(0);
  });

  it("live mode and non-fixture connect return LIVE_NOT_WIRED", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-eval-suite-"));
    dirs.push(dir);
    const worker = createEvaluationWorker(createFileEvaluationStore(dir));
    worker.seedFixtures(now);
    const live = worker.runSuite({ mode: EvalRunMode.LIVE, nowIso: now });
    expect(live.ok).toBe(false);
    if (!live.ok) expect(live.code).toBe("LIVE_NOT_WIRED");
    const connect = worker.connectProvider({
      provider: EvalProvider.GEMINI,
      fixtureOnly: false,
      nowIso: now,
    });
    expect(connect.ok).toBe(false);
    if (!connect.ok) expect(connect.code).toBe("LIVE_NOT_WIRED");
  });

  it("eval budget exhausts independently; Ads stay NOT_WIRED", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-eval-suite-"));
    dirs.push(dir);
    const worker = createEvaluationWorker(createFileEvaluationStore(dir));
    worker.seedFixtures(now);
    const exhausted = worker.runSuite({
      reserveMinor: DEFAULT_EVAL_BUDGET_LIMIT_MINOR + 50,
      nowIso: now,
    });
    expect(exhausted.ok).toBe(false);
    if (!exhausted.ok) expect(exhausted.code).toBe("BUDGET_EXHAUSTED");
    expect(worker.chatgptAdsStatus().allowed).toBe(false);
    expect(worker.chatgptAdsStatus().wiring).toBe("NOT_WIRED");
  });

  it("learning cannot expand authority/effects from eval-adjacent payloads", () => {
    expect(() =>
      assertAuthorityNonExpansion(FIXED_NON_EXPANDING_AUTHORITY, {
        spendLimit: 999,
      }),
    ).toThrow(/authority-expansion/i);
  });

  it("status keeps acceptance IDs as NOT_RUN honesty, not VERIFIED", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-eval-suite-"));
    dirs.push(dir);
    const worker = createEvaluationWorker(createFileEvaluationStore(dir));
    const status = worker.status();
    expect(status.acceptanceCaseIds).toEqual(
      expect.arrayContaining(["T-X037", "T-X038", "T-US-018"]),
    );
    expect(status.honestNote).toMatch(/NOT_RUN/);
    expect(status.liveEvalWiring).toBe("NOT_WIRED");
  });
});
