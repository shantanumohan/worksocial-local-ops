import { describe, expect, it } from "vitest";
import { OutcomeLabel } from "./production-mapping.js";
import {
  CostRecordingKind,
  MAX_DELEGATION_DEPTH,
  RoleExecutionMode,
  RoleRunStatus,
  acceptReviewVerdict,
  createRoleRunOutcome,
  evaluateIndependentReviewGate,
  listRoleOutcomesForLearning,
  classifyClaudeCliCompletion,
  claudeCliLiveWiringStatus,
  cliReportsIsError,
  DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  evaluateClaudeCliErrorRetryBudget,
  shouldRecordClaudeCliAttemptOnBudgetDenial,
  parseClaudeUsageCost,
  proposeEffect,
  roleRunStatusForClaudeCliCompletion,
  unwrapClaudeJsonPayload,
  validateRoleStructuredOutput,
  validateTypedDelegation,
  type EffectProposal,
  type TypedTaskRequest,
} from "./role-runtime.js";

const baseProposal = (): EffectProposal => ({
  proposalId: "prop-1",
  authorRoleId: "A13",
  actionClass: "routine_publish",
  operation: "publish_page",
  assetId: "page-home",
  channelId: "owned-site",
  payloadDigest: "abc",
  evidenceArtifactIds: ["ev-1"],
});

describe("role-runtime gates (R1-04)", () => {
  it("blocks uncontrolled recursion beyond max depth", () => {
    const request: TypedTaskRequest = {
      requestId: "tr-1",
      fromRoleId: "A01",
      toRoleId: "A13",
      objective: "draft article",
      inputArtifactIds: [],
      parentDepth: MAX_DELEGATION_DEPTH,
    };
    const denied = validateTypedDelegation(request);
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.code).toBe("UNCONTROLLED_RECURSION");
    }

    const ok = validateTypedDelegation({ ...request, parentDepth: 0 });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.nextDepth).toBe(1);
    }
  });

  it("denies self-delegation and roles without task_request tool", () => {
    expect(
      validateTypedDelegation({
        requestId: "tr-2",
        fromRoleId: "A01",
        toRoleId: "A01",
        objective: "loop",
        inputArtifactIds: [],
        parentDepth: 0,
      }).ok,
    ).toBe(false);

    const noTool = validateTypedDelegation({
      requestId: "tr-3",
      fromRoleId: "A03",
      toRoleId: "A13",
      objective: "write",
      inputArtifactIds: [],
      parentDepth: 0,
    });
    expect(noTool.ok).toBe(false);
    if (!noTool.ok) {
      expect(noTool.code).toBe("TOOL_DENIED");
    }
  });

  it("denies author self-approval; requires independent A25 review", () => {
    const self = evaluateIndependentReviewGate({
      proposal: { ...baseProposal(), selfApprovalAttempted: true },
    });
    expect(self.ok).toBe(false);
    if (!self.ok) {
      expect(self.code).toBe("SELF_APPROVAL_FORBIDDEN");
    }

    const gate = evaluateIndependentReviewGate({ proposal: baseProposal() });
    expect(gate.ok).toBe(true);
    if (gate.ok && gate.requiresReview) {
      expect(gate.reviewerRoleId).toBe("A25");
    }

    const same = evaluateIndependentReviewGate({
      proposal: baseProposal(),
      reviewerRoleId: "A13",
    });
    expect(same.ok).toBe(false);
  });

  it("rejects A25 reviewing its own authorship", () => {
    const gate = evaluateIndependentReviewGate({
      proposal: {
        ...baseProposal(),
        authorRoleId: "A25",
        proposalId: "prop-a25",
      },
      reviewerRoleId: "A25",
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.code).toBe("REVIEWER_CANNOT_AUTHOR_SAME");
    }
  });

  it("proposeEffect denies self-approval and accepts reviewable proposals", () => {
    const denied = proposeEffect({
      ...baseProposal(),
      selfApprovalAttempted: true,
    });
    expect(denied.ok).toBe(false);

    const ok = proposeEffect(baseProposal());
    expect(ok.ok).toBe(true);
  });

  it("acceptReviewVerdict enforces author ≠ reviewer", () => {
    const proposal = baseProposal();
    const bad = acceptReviewVerdict({
      proposal,
      verdict: {
        verdictId: "v1",
        proposalId: proposal.proposalId,
        reviewerRoleId: "A13",
        authorRoleId: "A13",
        approved: true,
        reason: "nope",
        decidedAtIso: "2026-11-18T12:00:00.000Z",
      },
    });
    expect(bad.ok).toBe(false);

    const good = acceptReviewVerdict({
      proposal,
      verdict: {
        verdictId: "v2",
        proposalId: proposal.proposalId,
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "evidence complete",
        decidedAtIso: "2026-11-18T12:00:00.000Z",
      },
    });
    expect(good.ok).toBe(true);
  });

  it("emits durable SUCCESS/FAILURE outcomes for later learning-worker", () => {
    const success = createRoleRunOutcome({
      outcomeId: "out-1",
      roleId: "A21",
      jobId: "job-1",
      runId: "run-1",
      label: OutcomeLabel.SUCCESS,
      status: RoleRunStatus.SUCCEEDED,
      executionMode: RoleExecutionMode.FIXTURE,
      reason: "fixture canary matched",
      recordedAtIso: "2026-11-18T12:00:00.000Z",
      featureHints: { suite: "eval-A21-forms" },
    });
    const failure = createRoleRunOutcome({
      outcomeId: "out-2",
      roleId: "A21",
      jobId: "job-2",
      runId: "run-2",
      label: OutcomeLabel.FAILURE,
      status: RoleRunStatus.FAILED,
      executionMode: RoleExecutionMode.FIXTURE,
      reason: "crm delivery gap",
      recordedAtIso: "2026-11-18T12:01:00.000Z",
    });
    const hooks = listRoleOutcomesForLearning([success, failure]);
    expect(hooks).toHaveLength(2);
    expect(hooks.map((h) => h.label)).toEqual([
      OutcomeLabel.SUCCESS,
      OutcomeLabel.FAILURE,
    ]);
    expect(success.costKind).toBe(CostRecordingKind.FIXTURE);
  });

  it("fails the job when CLI reports is_error despite exit 0 (T-X009)", () => {
    const poisonedSuccess = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: true,
        result: JSON.stringify({
          roleId: "A01",
          jobId: "11111111-1111-4111-8111-111111111111",
          status: "ok",
          summary: "should not succeed",
          artifactIds: [],
          proposedEffects: [],
          taskRequests: [],
        }),
      }),
    });
    expect(poisonedSuccess.ok).toBe(false);
    if (!poisonedSuccess.ok) {
      expect(poisonedSuccess.code).toBe("CLI_REPORTED_ERROR");
      expect(poisonedSuccess.jobShouldFail).toBe(true);
      expect(poisonedSuccess.exitCode).toBe(0);
      expect(poisonedSuccess.externalEffects).toBe("NONE");
    }
    expect(roleRunStatusForClaudeCliCompletion(poisonedSuccess)).toBe(
      RoleRunStatus.FAILED,
    );

    const subtypeError = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "error",
        is_error: false,
        result: "rate limited",
      }),
    });
    expect(subtypeError.ok).toBe(false);
    if (!subtypeError.ok) {
      expect(subtypeError.code).toBe("CLI_REPORTED_ERROR");
    }

    const clean = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: '{"roleId":"A01"}',
      }),
    });
    expect(clean.ok).toBe(true);
    expect(clean.externalEffects).toBe("NONE");

    const nonzero = classifyClaudeCliCompletion({
      exitCode: 2,
      stdout: "",
    });
    expect(nonzero.ok).toBe(false);
    if (!nonzero.ok) {
      expect(nonzero.code).toBe("NONZERO_EXIT");
      expect(nonzero.externalEffects).toBe("NONE");
    }
  });

  it("fail-closes alias error signals and NDJSON last event (T-X009)", () => {
    const stringTrue = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: " True ",
        result: "poisoned",
      }),
    });
    expect(stringTrue.ok).toBe(false);
    if (!stringTrue.ok) {
      expect(stringTrue.code).toBe("CLI_REPORTED_ERROR");
    }
    expect(cliReportsIsError(" True ")).toBe(true);
    expect(cliReportsIsError("yes")).toBe(false);

    const typeCase = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({ type: "ERROR", message: "boom" }),
    });
    expect(typeCase.ok).toBe(false);

    const successFalse = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        success: false,
        result: "nope",
      }),
    });
    expect(successFalse.ok).toBe(false);
    if (!successFalse.ok) {
      expect(successFalse.reason).toMatch(/success\/ok=false/);
    }

    const errorField = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        error: { message: "auth failed" },
      }),
    });
    expect(errorField.ok).toBe(false);

    const ndjson = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout:
        '{"type":"stream","partial":true}\n' +
        JSON.stringify({
          type: "result",
          subtype: "success",
          is_error: true,
          result: "late error",
        }),
    });
    expect(ndjson.ok).toBe(false);
    if (!ndjson.ok) {
      expect(ndjson.code).toBe("CLI_REPORTED_ERROR");
    }

    expect(claudeCliLiveWiringStatus()).toBe("NOT_WIRED");
    expect(
      roleRunStatusForClaudeCliCompletion({
        ok: false,
        code: "CLI_REPORTED_ERROR",
        reason: "x",
        jobShouldFail: true,
        exitCode: 0,
        externalEffects: "NONE",
      }),
    ).toBe(RoleRunStatus.FAILED);
  });

  it("fail-closes deepen signals: isError, ok=false, status, array, BOM (T-X009)", () => {
    expect(cliReportsIsError("1")).toBe(true);
    expect(cliReportsIsError("yes")).toBe(false);

    const camelIsError = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        isError: true,
        result: "camel",
      }),
    });
    expect(camelIsError.ok).toBe(false);

    const okFalse = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        ok: false,
        result: "nope",
      }),
    });
    expect(okFalse.ok).toBe(false);
    if (!okFalse.ok) {
      expect(okFalse.reason).toMatch(/success\/ok=false/);
    }

    const statusFailed = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        status: " FAILED ",
        result: "x",
      }),
    });
    expect(statusFailed.ok).toBe(false);

    const failedFlag = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        failed: "1",
        result: "x",
      }),
    });
    expect(failedFlag.ok).toBe(false);

    const arrayBatch = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify([
        { type: "stream", partial: true },
        {
          type: "result",
          subtype: "success",
          is_error: true,
          result: "array-tail",
        },
      ]),
    });
    expect(arrayBatch.ok).toBe(false);

    const bom = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout:
        "\uFEFF" +
        JSON.stringify({
          type: "result",
          subtype: "success",
          is_error: true,
          result: "bom",
        }),
    });
    expect(bom.ok).toBe(false);

    const cleanStatusOk = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        status: "ok",
        result: '{"roleId":"A01"}',
      }),
    });
    expect(cleanStatusOk.ok).toBe(true);
    expect(cleanStatusOk.externalEffects).toBe("NONE");
  });

  it("fail-closes E9 deepen: stderr, stop_reason, errors[], nested, embedded exit (T-X009)", () => {
    const stderrOnly = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: "",
      stderr: JSON.stringify({
        type: "result",
        subtype: "error_during_execution",
        is_error: true,
        result: "stderr-path",
      }),
    });
    expect(stderrOnly.ok).toBe(false);

    const stopReason = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        stop_reason: "refusal",
        result: "x",
      }),
    });
    expect(stopReason.ok).toBe(false);

    const errorsArr = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        errors: [{ message: "boom" }],
        result: "x",
      }),
    });
    expect(errorsArr.ok).toBe(false);

    const embeddedExit = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        exit_code: 2,
        result: "x",
      }),
    });
    expect(embeddedExit.ok).toBe(false);

    const nestedPoison = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: JSON.stringify({
          type: "result",
          is_error: true,
          result: "nested",
        }),
      }),
    });
    expect(nestedPoison.ok).toBe(false);

    const aborted = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        aborted: true,
        result: "x",
      }),
    });
    expect(aborted.ok).toBe(false);

    const cleanIgnoresStderr = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: '{"roleId":"A01"}',
      }),
      stderr: JSON.stringify({ is_error: true, result: "noise" }),
    });
    expect(cleanIgnoresStderr.ok).toBe(true);
    expect(cleanIgnoresStderr.externalEffects).toBe("NONE");
  });

  it("fences CLI error retry budget without recording past max (T-X009 E10)", () => {
    const failed = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: true,
        result: "poison",
      }),
    });
    expect(failed.ok).toBe(false);

    const within = evaluateClaudeCliErrorRetryBudget({
      classification: failed,
      attemptCount: 1,
      startingNewAttempt: false,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(within.allowed).toBe(true);
    expect(within.recordAttempt).toBe(true);
    expect(within.jobShouldFail).toBe(true);
    expect(within.externalEffects).toBe("NONE");
    expect(within.claudeCliLiveWiring).toBe("NOT_WIRED");

    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: failed,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.allowed).toBe(false);
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(exhausted.recordAttempt).toBe(false);
    expect(exhausted.attemptCount).toBe(1);
    expect(shouldRecordClaudeCliAttemptOnBudgetDenial(exhausted.code)).toBe(
      false,
    );

    const clean = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: '{"roleId":"A01"}',
      }),
    });
    const cleanBudget = evaluateClaudeCliErrorRetryBudget({
      classification: clean,
      attemptCount: 0,
      startingNewAttempt: false,
    });
    expect(cleanBudget.allowed).toBe(true);
    expect(cleanBudget.recordAttempt).toBe(false);
    expect(cleanBudget.jobShouldFail).toBe(false);
  });

  it("does not consume retry budget on clean success after prior failure (T-X009 E11)", () => {
    const failed = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: true,
        result: "poison",
      }),
    });
    expect(failed.ok).toBe(false);

    const clean = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: '{"roleId":"A01"}',
      }),
    });
    expect(clean.ok).toBe(true);

    const afterFailure = evaluateClaudeCliErrorRetryBudget({
      classification: clean,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(afterFailure.allowed).toBe(true);
    expect(afterFailure.code).toBeNull();
    expect(afterFailure.recordAttempt).toBe(false);
    expect(afterFailure.jobShouldFail).toBe(false);
    expect(afterFailure.externalEffects).toBe("NONE");
    expect(afterFailure.claudeCliLiveWiring).toBe("NOT_WIRED");
  });

  it("keeps job FAILED when retry exhausted on CLI_REPORTED_ERROR (T-X009 E14)", () => {
    const poisoned = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: true,
        result: "poison",
      }),
    });
    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: poisoned,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(roleRunStatusForClaudeCliCompletion(poisoned)).toBe(
      RoleRunStatus.FAILED,
    );
    expect(exhausted.jobShouldFail).toBe(true);
    expect(exhausted.externalEffects).toBe("NONE");
  });

  it("exhausted budget still FAILED on with_error flag (T-X009 E32)", () => {
    const withError = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        with_error: true,
        result: "with_error flag",
      }),
    });
    expect(withError.ok).toBe(false);
    expect(withError.code).toBe("CLI_REPORTED_ERROR");
    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: withError,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(roleRunStatusForClaudeCliCompletion(withError)).toBe(
      RoleRunStatus.FAILED,
    );
    expect(exhausted.jobShouldFail).toBe(true);
    expect(exhausted.externalEffects).toBe("NONE");
    expect(exhausted.claudeCliLiveWiring).toBe("NOT_WIRED");
  });

  it("exhausted budget still FAILED on was_error flag (T-X009 E31)", () => {
    const wasError = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        was_error: true,
        result: "was_error flag",
      }),
    });
    expect(wasError.ok).toBe(false);
    expect(wasError.code).toBe("CLI_REPORTED_ERROR");
    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: wasError,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(roleRunStatusForClaudeCliCompletion(wasError)).toBe(
      RoleRunStatus.FAILED,
    );
    expect(exhausted.jobShouldFail).toBe(true);
    expect(exhausted.externalEffects).toBe("NONE");
    expect(exhausted.claudeCliLiveWiring).toBe("NOT_WIRED");
  });

  it("exhausted budget still FAILED on had_error flag (T-X009 E30)", () => {
    const hadError = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        had_error: true,
        result: "had_error flag",
      }),
    });
    expect(hadError.ok).toBe(false);
    expect(hadError.code).toBe("CLI_REPORTED_ERROR");
    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: hadError,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(roleRunStatusForClaudeCliCompletion(hadError)).toBe(
      RoleRunStatus.FAILED,
    );
    expect(exhausted.jobShouldFail).toBe(true);
    expect(exhausted.externalEffects).toBe("NONE");
    expect(exhausted.claudeCliLiveWiring).toBe("NOT_WIRED");
  });

  it("exhausted budget still FAILED on is_failed flag (T-X009 E29)", () => {
    const isFailed = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        is_failed: true,
        result: "is_failed flag",
      }),
    });
    expect(isFailed.ok).toBe(false);
    expect(isFailed.code).toBe("CLI_REPORTED_ERROR");
    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: isFailed,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(roleRunStatusForClaudeCliCompletion(isFailed)).toBe(
      RoleRunStatus.FAILED,
    );
    expect(exhausted.jobShouldFail).toBe(true);
    expect(exhausted.externalEffects).toBe("NONE");
    expect(exhausted.claudeCliLiveWiring).toBe("NOT_WIRED");
  });

  it("exhausted budget still FAILED on is_failure flag (T-X009 E28)", () => {
    const isFailure = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        is_failure: true,
        result: "is_failure flag",
      }),
    });
    expect(isFailure.ok).toBe(false);
    expect(isFailure.code).toBe("CLI_REPORTED_ERROR");
    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: isFailure,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(roleRunStatusForClaudeCliCompletion(isFailure)).toBe(
      RoleRunStatus.FAILED,
    );
    expect(exhausted.jobShouldFail).toBe(true);
    expect(exhausted.externalEffects).toBe("NONE");
    expect(exhausted.claudeCliLiveWiring).toBe("NOT_WIRED");
  });

  it("exhausted budget still FAILED on errored flag (T-X009 E27)", () => {
    const errored = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        errored: true,
        result: "errored flag",
      }),
    });
    expect(errored.ok).toBe(false);
    expect(errored.code).toBe("CLI_REPORTED_ERROR");
    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: errored,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(roleRunStatusForClaudeCliCompletion(errored)).toBe(
      RoleRunStatus.FAILED,
    );
    expect(exhausted.jobShouldFail).toBe(true);
    expect(exhausted.externalEffects).toBe("NONE");
    expect(exhausted.claudeCliLiveWiring).toBe("NOT_WIRED");
  });

  it("exhausted budget still FAILED on failed flag (T-X009 E26)", () => {
    const failedFlag = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        failed: true,
        result: "failed flag",
      }),
    });
    expect(failedFlag.ok).toBe(false);
    expect(failedFlag.code).toBe("CLI_REPORTED_ERROR");
    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: failedFlag,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(roleRunStatusForClaudeCliCompletion(failedFlag)).toBe(
      RoleRunStatus.FAILED,
    );
    expect(exhausted.jobShouldFail).toBe(true);
    expect(exhausted.externalEffects).toBe("NONE");
    expect(exhausted.claudeCliLiveWiring).toBe("NOT_WIRED");
  });

  it("exhausted budget still FAILED on cancelled flag (T-X009 E25)", () => {
    const cancelled = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        cancelled: true,
        result: "cancelled",
      }),
    });
    expect(cancelled.ok).toBe(false);
    expect(cancelled.code).toBe("CLI_REPORTED_ERROR");
    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: cancelled,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(roleRunStatusForClaudeCliCompletion(cancelled)).toBe(
      RoleRunStatus.FAILED,
    );
    expect(exhausted.claudeCliLiveWiring).toBe("NOT_WIRED");
    expect(exhausted.externalEffects).toBe("NONE");
  });

  it("exhausted budget still FAILED on has_error flag (T-X009 E24)", () => {
    const hasError = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        has_error: true,
        result: "has_error flag",
      }),
    });
    expect(hasError.ok).toBe(false);
    expect(hasError.code).toBe("CLI_REPORTED_ERROR");
    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: hasError,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(roleRunStatusForClaudeCliCompletion(hasError)).toBe(
      RoleRunStatus.FAILED,
    );
    expect(exhausted.jobShouldFail).toBe(true);
    expect(exhausted.claudeCliLiveWiring).toBe("NOT_WIRED");
    expect(exhausted.externalEffects).toBe("NONE");
  });

  it("exhausted budget still FAILED on aborted flag (T-X009 E23)", () => {
    const aborted = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        aborted: true,
        result: "aborted run",
      }),
    });
    expect(aborted.ok).toBe(false);
    expect(aborted.code).toBe("CLI_REPORTED_ERROR");
    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: aborted,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(roleRunStatusForClaudeCliCompletion(aborted)).toBe(
      RoleRunStatus.FAILED,
    );
    expect(exhausted.claudeCliLiveWiring).toBe("NOT_WIRED");
    expect(exhausted.externalEffects).toBe("NONE");
  });

  it("exhausted budget still FAILED on errors[] envelope (T-X009 E22)", () => {
    const errorsArr = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        errors: [{ message: "policy blocked" }],
        result: "errors present",
      }),
    });
    expect(errorsArr.ok).toBe(false);
    expect(errorsArr.code).toBe("CLI_REPORTED_ERROR");
    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: errorsArr,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(roleRunStatusForClaudeCliCompletion(errorsArr)).toBe(
      RoleRunStatus.FAILED,
    );
    expect(exhausted.jobShouldFail).toBe(true);
    expect(exhausted.claudeCliLiveWiring).toBe("NOT_WIRED");
    expect(exhausted.externalEffects).toBe("NONE");
  });

  it("exhausted budget still FAILED on stop_reason end_turn error (T-X009 E21)", () => {
    const stop = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        stop_reason: "error",
        result: "stop error",
      }),
    });
    expect(stop.ok).toBe(false);
    expect(stop.code).toBe("CLI_REPORTED_ERROR");
    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: stop,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(roleRunStatusForClaudeCliCompletion(stop)).toBe(RoleRunStatus.FAILED);
    expect(exhausted.claudeCliLiveWiring).toBe("NOT_WIRED");
    expect(exhausted.externalEffects).toBe("NONE");
  });

  it("exhausted budget still FAILED on embedded exit_code (T-X009 E20)", () => {
    const embeddedExit = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        exit_code: 2,
        result: "embedded nonzero",
      }),
    });
    expect(embeddedExit.ok).toBe(false);
    expect(embeddedExit.code).toBe("CLI_REPORTED_ERROR");
    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: embeddedExit,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(roleRunStatusForClaudeCliCompletion(embeddedExit)).toBe(
      RoleRunStatus.FAILED,
    );
    expect(exhausted.jobShouldFail).toBe(true);
    expect(exhausted.claudeCliLiveWiring).toBe("NOT_WIRED");
    expect(exhausted.externalEffects).toBe("NONE");
  });

  it("exhausted budget still FAILED on status=failed envelope (T-X009 E19)", () => {
    const statusFailed = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        status: "failed",
        result: "status failed",
      }),
    });
    expect(statusFailed.ok).toBe(false);
    expect(statusFailed.code).toBe("CLI_REPORTED_ERROR");
    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: statusFailed,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(roleRunStatusForClaudeCliCompletion(statusFailed)).toBe(
      RoleRunStatus.FAILED,
    );
    expect(exhausted.jobShouldFail).toBe(true);
    expect(exhausted.externalEffects).toBe("NONE");
    expect(exhausted.claudeCliLiveWiring).toBe("NOT_WIRED");
  });

  it("exhausted budget still FAILED on ok=false envelope (T-X009 E18)", () => {
    const okFalse = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        ok: false,
        result: "declared ok false",
      }),
    });
    expect(okFalse.ok).toBe(false);
    expect(okFalse.code).toBe("CLI_REPORTED_ERROR");
    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: okFalse,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(roleRunStatusForClaudeCliCompletion(okFalse)).toBe(
      RoleRunStatus.FAILED,
    );
    expect(exhausted.jobShouldFail).toBe(true);
    expect(exhausted.claudeCliLiveWiring).toBe("NOT_WIRED");
    expect(exhausted.externalEffects).toBe("NONE");
  });

  it("exhausted budget still FAILED on success=false envelope (T-X009 E17)", () => {
    const successFalse = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        success: false,
        result: "declared failure",
      }),
    });
    expect(successFalse.ok).toBe(false);
    expect(successFalse.code).toBe("CLI_REPORTED_ERROR");
    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: successFalse,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(roleRunStatusForClaudeCliCompletion(successFalse)).toBe(
      RoleRunStatus.FAILED,
    );
    expect(exhausted.jobShouldFail).toBe(true);
    expect(exhausted.externalEffects).toBe("NONE");
    expect(exhausted.claudeCliLiveWiring).toBe("NOT_WIRED");
  });

  it("exhausted budget still FAILED on stderr-only CLI error (T-X009 E16)", () => {
    const stderrErr = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: "",
      stderr: JSON.stringify({ type: "result", is_error: true, result: "stderr-only" }),
    });
    expect(stderrErr.ok).toBe(false);
    expect(stderrErr.code).toBe("CLI_REPORTED_ERROR");
    const within = evaluateClaudeCliErrorRetryBudget({
      classification: stderrErr,
      attemptCount: 0,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(within.recordAttempt).toBe(true);
    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: stderrErr,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(roleRunStatusForClaudeCliCompletion(stderrErr)).toBe(RoleRunStatus.FAILED);
    expect(exhausted.jobShouldFail).toBe(true);
    expect(shouldRecordClaudeCliAttemptOnBudgetDenial(exhausted.code)).toBe(false);
    expect(exhausted.claudeCliLiveWiring).toBe("NOT_WIRED");
  });

  it("keeps job FAILED when retry exhausted on NONZERO_EXIT (T-X009 E15)", () => {
    const nonzero = classifyClaudeCliCompletion({
      exitCode: 2,
      stdout: "",
    });
    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: nonzero,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(roleRunStatusForClaudeCliCompletion(nonzero)).toBe(
      RoleRunStatus.FAILED,
    );
    expect(exhausted.jobShouldFail).toBe(true);
    expect(exhausted.claudeCliLiveWiring).toBe("NOT_WIRED");
    expect(exhausted.externalEffects).toBe("NONE");
  });

  it("consumes retry budget on NONZERO_EXIT failures (T-X009 E13)", () => {
    const nonzero = classifyClaudeCliCompletion({
      exitCode: 1,
      stdout: JSON.stringify({ type: "result", subtype: "success", is_error: false }),
    });
    expect(nonzero.ok).toBe(false);
    expect(nonzero.code).toBe("NONZERO_EXIT");

    const within = evaluateClaudeCliErrorRetryBudget({
      classification: nonzero,
      attemptCount: 0,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(within.allowed).toBe(true);
    expect(within.recordAttempt).toBe(true);
    expect(within.jobShouldFail).toBe(true);
    expect(within.externalEffects).toBe("NONE");
    expect(within.claudeCliLiveWiring).toBe("NOT_WIRED");

    const exhausted = evaluateClaudeCliErrorRetryBudget({
      classification: nonzero,
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
    });
    expect(exhausted.allowed).toBe(false);
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(shouldRecordClaudeCliAttemptOnBudgetDenial(exhausted.code)).toBe(
      false,
    );
  });

  it("fail-closes is_error numeric 1 without inventing success (T-X009 E12)", () => {
    expect(cliReportsIsError(1)).toBe(true);
    expect(cliReportsIsError("1")).toBe(true);
    const numeric = classifyClaudeCliCompletion({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: 1,
        result: "poison",
      }),
    });
    expect(numeric.ok).toBe(false);
    expect(numeric.code).toBe("CLI_REPORTED_ERROR");
    expect(roleRunStatusForClaudeCliCompletion(numeric)).toBe(
      RoleRunStatus.FAILED,
    );
    expect(numeric.externalEffects).toBe("NONE");
  });

  it("parses CLI usage when present and never invents 25/50/75 as ACTUAL (F07)", () => {
    const actual = parseClaudeUsageCost({
      stdout: JSON.stringify({ total_cost_usd: 0.42, usage: { input_tokens: 10 } }),
      executionMode: RoleExecutionMode.LIVE_CLI,
    });
    expect(actual.costKind).toBe(CostRecordingKind.ACTUAL);
    expect(actual.costMinor).toBe(42);

    const unknown = parseClaudeUsageCost({
      stdout: JSON.stringify({ summary: "no usage" }),
      executionMode: RoleExecutionMode.LIVE_CLI,
    });
    expect(unknown.costKind).toBe(CostRecordingKind.UNKNOWN);
    expect(unknown.costMinor).toBe(0);

    const estimate = parseClaudeUsageCost({
      executionMode: RoleExecutionMode.LIVE_CLI,
      estimateMinor: 75,
    });
    expect(estimate.costKind).toBe(CostRecordingKind.ESTIMATE);
    expect(estimate.costMinor).toBe(75);
    expect(estimate.detail).toMatch(/ESTIMATE/);

    const fixture = parseClaudeUsageCost({
      executionMode: RoleExecutionMode.FIXTURE,
    });
    expect(fixture.costKind).toBe(CostRecordingKind.FIXTURE);
    expect(fixture.costMinor).toBe(0);
  });

  it("validates structured role output", () => {
    const ok = validateRoleStructuredOutput({
      roleId: "A01",
      jobId: "11111111-1111-4111-8111-111111111111",
      status: "ok",
      summary: "plan ready",
      artifactIds: ["a1"],
      proposedEffects: [],
      taskRequests: [],
      modelConfidence: 0.5,
    });
    expect(ok.ok).toBe(true);

    const bad = validateRoleStructuredOutput({ roleId: "Z99" });
    expect(bad.ok).toBe(false);
  });

  it("unwraps Claude JSON result envelope and binds role/job identities", () => {
    const inner = {
      roleId: "A01",
      jobId: "11111111-1111-4111-8111-111111111111",
      status: "ok",
      summary: "plan",
      artifactIds: [],
      proposedEffects: [],
      taskRequests: [],
    };
    const unwrapped = unwrapClaudeJsonPayload({
      type: "result",
      result: JSON.stringify(inner),
    });
    expect(unwrapped).toEqual(inner);

    const bound = validateRoleStructuredOutput(
      { type: "result", result: JSON.stringify(inner) },
      {
        expectedRoleId: "A01",
        expectedJobId: "11111111-1111-4111-8111-111111111111",
      },
    );
    expect(bound.ok).toBe(true);

    const mismatch = validateRoleStructuredOutput(inner, {
      expectedRoleId: "A15",
      expectedJobId: inner.jobId,
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.code).toBe("ROLE_MISMATCH");
    }
  });

  it("rejects malformed nested proposals instead of throwing later", () => {
    const bad = validateRoleStructuredOutput({
      roleId: "A13",
      jobId: "11111111-1111-4111-8111-111111111111",
      status: "ok",
      summary: "x",
      proposedEffects: [{}],
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.code).toBe("INVALID_PROPOSAL");
    }

    const authorMismatch = validateRoleStructuredOutput({
      roleId: "A13",
      jobId: "11111111-1111-4111-8111-111111111111",
      status: "ok",
      summary: "x",
      proposedEffects: [
        {
          proposalId: "p1",
          authorRoleId: "A15",
          actionClass: "create",
          operation: "stage",
          assetId: "a",
          channelId: "c",
          payloadDigest: "d",
          evidenceArtifactIds: [],
        },
      ],
    });
    expect(authorMismatch.ok).toBe(false);
    if (!authorMismatch.ok) {
      expect(authorMismatch.code).toBe("AUTHOR_MISMATCH");
    }
  });
});
