/**
 * Contract: AA-20 isolated EVAL_ONLY worker — fixture vs live boundaries,
 * no authority/effect expansion, broker deny, Ads blocked, catalog NOT_RUN.
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EvalCaseVerdict,
  EvalProvider,
  EvalRunMode,
  EvalToolClass,
  FORBIDDEN_EVAL_TOOLS,
  FIXED_EVALUATION_ISOLATION,
  assertEvaluationWorkerIsolation,
} from "@worksocial/domain";
import {
  assertAuthorityNonExpansion,
  FIXED_NON_EXPANDING_AUTHORITY,
  createLearningProposal,
  LearningProposalKind,
} from "@worksocial/ml";
import { createFileEvaluationStore } from "@worksocial/persistence";
import {
  EVAL_GOLDEN_SUITE_ID,
  createEvaluationWorker,
} from "@worksocial/evaluation-worker";
import { createCredentialBroker } from "@worksocial/credential-broker";

const dirs: string[] = [];
const now = "2026-11-21T21:30:00.000Z";

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("contract: evaluation-worker isolation (AA-20)", () => {
  it("pins isolation invariants matching FIXED_EVALUATION_ISOLATION", () => {
    assertEvaluationWorkerIsolation(FIXED_EVALUATION_ISOLATION);
    const dir = mkdtempSync(join(tmpdir(), "ws-eval-contract-"));
    dirs.push(dir);
    const worker = createEvaluationWorker(createFileEvaluationStore(dir));
    expect(worker.isolation).toEqual(FIXED_EVALUATION_ISOLATION);
    expect(worker.status().isolation.learningCannotExpandEffects).toBe(true);
    expect(worker.status().liveEvalWiring).toBe("NOT_WIRED");
  });

  it("denies evaluation-worker credential mint via broker", () => {
    const broker = createCredentialBroker();
    const ref = broker.putReference(
      "claude",
      ["eval"],
      "eval-secret",
      now,
    );
    const minted = broker.mintScopedHandle({
      principal: "evaluation-worker",
      referenceId: ref.referenceId,
      requestedScopes: ["eval"],
      nowIso: now,
    });
    expect(minted).toMatchObject({ ok: false, code: "PRINCIPAL_DENIED" });
  });

  it("blocks every FORBIDDEN_EVAL_TOOLS class with no effect", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-eval-contract-"));
    dirs.push(dir);
    const worker = createEvaluationWorker(createFileEvaluationStore(dir));
    for (const tool of FORBIDDEN_EVAL_TOOLS) {
      const gate = worker.attemptTool(tool);
      expect(gate.allowed).toBe(false);
    }
    expect(worker.attemptTool(EvalToolClass.JUDGE_ANSWER).allowed).toBe(true);
  });

  it("returns LIVE_NOT_WIRED for live mode without network I/O", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-eval-contract-"));
    dirs.push(dir);
    const worker = createEvaluationWorker(createFileEvaluationStore(dir));
    worker.seedFixtures(now);
    const live = worker.runSuite({
      mode: EvalRunMode.LIVE,
      provider: EvalProvider.CLAUDE,
      nowIso: now,
    });
    expect(live.ok).toBe(false);
    if (live.ok) return;
    expect(live.code).toBe("LIVE_NOT_WIRED");
  });

  it("runs fixture golden suite with grounding and blocked-tool honesty", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-eval-contract-"));
    dirs.push(dir);
    const worker = createEvaluationWorker(createFileEvaluationStore(dir));
    worker.seedFixtures(now);
    const run = worker.runSuite({
      suiteId: EVAL_GOLDEN_SUITE_ID,
      provider: EvalProvider.GEMINI,
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
      byId["eval-case-hypothesis-not-truth"]?.toolAttemptsBlocked,
    ).toEqual(
      expect.arrayContaining([
        EvalToolClass.PUBLISH,
        EvalToolClass.CRM_WRITE,
        EvalToolClass.CUSTOMER_MESSAGE,
      ]),
    );
    expect(run.run.chatgptAdsDecision.allowed).toBe(false);
    expect(worker.chatgptAdsStatus().wiring).toBe("NOT_WIRED");
  });

  it("keeps learning proposals from expanding authority/effects", () => {
    expect(() =>
      assertAuthorityNonExpansion(FIXED_NON_EXPANDING_AUTHORITY, {
        capabilityGrants: [],
      }),
    ).toThrow(/authority-expansion/i);
    expect(() =>
      createLearningProposal({
        proposalId: "eval-linked",
        kind: LearningProposalKind.PLAYBOOK,
        modelIds: ["outcome-nb-bernoulli@1.0.0"],
        trainingRunId: "r-eval",
        summary: "eval-linked proposal must not expand effects",
        metrics: {
          sampleCount: 0,
          heldOutCount: 0,
          accuracy: null,
          successRate: null,
          meanScore: null,
          fixtureExcludedCount: 0,
          modelIds: ["outcome-nb-bernoulli@1.0.0"],
          dataAdequacy: "INSUFFICIENT_DATA",
          dataAdequacyReason: "fixture eval only",
        },
        payload: { publishAuthority: true },
        createdAtIso: now,
      }),
    ).toThrow(/authority-expansion/i);
  });

  it("does not claim catalog cases VERIFIED", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-eval-contract-"));
    dirs.push(dir);
    const worker = createEvaluationWorker(createFileEvaluationStore(dir));
    const status = worker.status();
    expect(status.acceptanceCaseIds.length).toBeGreaterThan(0);
    expect(status.honestNote).toMatch(/NOT_RUN/i);
    expect(status.liveEvalWiring).toBe("NOT_WIRED");
  });
});
