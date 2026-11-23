/**
 * Fixture proof for T-US-016 — Claude runtime vs API eval auth separated.
 *
 * Exercises real component boundaries offline:
 * - credential-broker denies operational mint/reveal for both claude-runner
 *   and evaluation-worker (distinct principals; no shared handle reuse)
 * - evaluation-worker stays EVAL_ONLY (no effect credentials; separate budget)
 * - claude-runner keeps an independent operational budget account
 *
 * External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_EVAL_BUDGET_LIMIT_MINOR,
  EvalProvider,
  EvalRunMode,
  EvalToolClass,
  RoleExecutionMode,
  SoakProofKind,
  createBudgetAccount,
  type SoakProofRecord,
} from "@worksocial/domain";
import { createCredentialBroker } from "@worksocial/credential-broker";
import { createClaudeRunner } from "@worksocial/claude-runner";
import {
  EVAL_GOLDEN_SUITE_ID,
  createEvaluationWorker,
} from "@worksocial/evaluation-worker";
import { createMemoryEvaluationStore } from "@worksocial/persistence";

/**
 * Complete expected proof set for T-US-016 fixture ACCEPTED.
 */
export async function proofClaudeRuntimeEvalAuthSeparated(
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  let passed = true;
  const tmpRoot = mkdtempSync(join(tmpdir(), "ws-us016-"));

  try {
    const broker = createCredentialBroker();
    const effectRef = broker.putReference(
      "cms",
      ["publish"],
      `fixture-secret-${randomUUID().slice(0, 8)}`,
      nowIso,
    );

    // Cross-use: neither Claude runtime nor eval API principal may mint
    // operational effect credentials.
    for (const principal of ["claude-runner", "evaluation-worker"] as const) {
      const mint = broker.mintScopedHandle({
        principal,
        referenceId: effectRef.referenceId,
        requestedScopes: ["publish"],
        nowIso,
      });
      if (!mint.ok && mint.code === "PRINCIPAL_DENIED") {
        details.push(
          `credential-broker mint denied for ${principal} (PRINCIPAL_DENIED)`,
        );
      } else {
        passed = false;
        details.push(
          `credential-broker mint unexpectedly ${JSON.stringify(mint)} for ${principal}`,
        );
      }
    }

    // Positive control: effect principal can mint; reasoning principals cannot
    // reveal that handle (no shared auth material).
    const gatewayMint = broker.mintScopedHandle({
      principal: "action-gateway",
      referenceId: effectRef.referenceId,
      requestedScopes: ["publish"],
      nowIso,
    });
    if (gatewayMint.ok) {
      details.push("action-gateway mint of operational publish handle ok");
      for (const principal of ["claude-runner", "evaluation-worker"] as const) {
        const reveal = broker.revealForPrincipal(
          gatewayMint.handle.handleId,
          principal,
          nowIso,
        );
        if (!reveal.ok) {
          details.push(
            `${principal} cannot reveal gateway-minted handle (auth material separated)`,
          );
        } else {
          passed = false;
          details.push(`${principal} revealed gateway handle — auth leak`);
        }
      }
    } else {
      passed = false;
      details.push(`action-gateway mint failed: ${JSON.stringify(gatewayMint)}`);
    }

    // Evaluation worker (API eval auth path).
    const evalWorker = createEvaluationWorker(createMemoryEvaluationStore());
    if (
      evalWorker.principal === "evaluation-worker" &&
      evalWorker.hasActionGatewayWritePrincipal === false &&
      evalWorker.hasProductionEffectCredentials === false
    ) {
      details.push(
        "evaluation-worker principal has no gateway-write / production effect credentials",
      );
    } else {
      passed = false;
      details.push("evaluation-worker isolation flags unexpected");
    }

    await evalWorker.seedFixtures(nowIso);
    const liveRefuse = await evalWorker.connectProvider({
      provider: EvalProvider.CLAUDE,
      fixtureOnly: false,
      nowIso,
    });
    if (!liveRefuse.ok && liveRefuse.code === "LIVE_NOT_WIRED") {
      details.push(
        "Claude live API eval connect refused LIVE_NOT_WIRED (fixture EVAL_ONLY only)",
      );
    } else {
      passed = false;
      details.push(
        `Live Claude eval connect unexpectedly ${JSON.stringify(liveRefuse)}`,
      );
    }

    const evalRun = await evalWorker.runSuite({
      suiteId: EVAL_GOLDEN_SUITE_ID,
      provider: EvalProvider.CLAUDE,
      mode: EvalRunMode.FIXTURE,
      nowIso,
    });
    if (
      evalRun.ok &&
      evalRun.run.capability === "EVAL_ONLY" &&
      evalRun.run.fixtureOnly === true
    ) {
      details.push(
        "Claude EVAL_ONLY fixture suite runs on evaluation-worker (API eval auth)",
      );
    } else {
      passed = false;
      details.push(`Eval suite unexpectedly ${JSON.stringify(evalRun)}`);
    }

    const publishAttempt = evalWorker.attemptTool(EvalToolClass.PUBLISH);
    if (!publishAttempt.allowed) {
      details.push("evaluation-worker attemptTool(PUBLISH) forbidden");
    } else {
      passed = false;
      details.push("evaluation-worker allowed PUBLISH");
    }

    // Exhaust eval budget; Claude runtime budget must stay independent.
    const operationalBudget = createBudgetAccount({
      dayKey: nowIso.slice(0, 10),
      currency: "USD",
      limitMinor: 5_000,
    });
    const runner = createClaudeRunner({
      workspaceRoot: tmpRoot,
      forceFixture: true,
      budgetAccount: operationalBudget,
    });
    const before = runner.getBudgetAccount();

    const exhausted = await evalWorker.runSuite({
      suiteId: EVAL_GOLDEN_SUITE_ID,
      provider: EvalProvider.CLAUDE,
      reserveMinor: DEFAULT_EVAL_BUDGET_LIMIT_MINOR + 1,
      nowIso,
    });
    if (!exhausted.ok && exhausted.code === "BUDGET_EXHAUSTED") {
      details.push(
        "evaluation-worker budget exhausts on over-limit reserve (isolated eval pool)",
      );
    } else {
      passed = false;
      details.push(`Eval over-limit unexpectedly ${JSON.stringify(exhausted)}`);
    }

    const after = runner.getBudgetAccount();
    if (
      after.reservedMinor === before.reservedMinor &&
      after.settledMinor === before.settledMinor &&
      after.limitMinor === before.limitMinor
    ) {
      details.push(
        "claude-runner operational budget unchanged after eval budget exhaust",
      );
    } else {
      passed = false;
      details.push(
        `claude-runner budget mutated by eval exhaust before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
      );
    }

    const runtimeModes = new Set<string>([
      RoleExecutionMode.LIVE_CLI,
      RoleExecutionMode.FIXTURE,
    ]);
    if (
      runtimeModes.size === 2 &&
      !runtimeModes.has(evalWorker.principal) &&
      evalWorker.principal === "evaluation-worker"
    ) {
      details.push(
        "Claude runtime modes (LIVE_CLI|FIXTURE) remain distinct from evaluation-worker principal",
      );
    } else {
      passed = false;
      details.push("Runtime mode / eval principal collision");
    }

    details.push("liveProviderSuccessClaimed=false externalEffects=NONE");
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }

  return {
    proofId: `proof-claude-runtime-eval-auth-${randomUUID()}`,
    kind: SoakProofKind.CLAUDE_RUNTIME_EVAL_AUTH_SEPARATED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-us016-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
