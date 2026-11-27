/**
 * Fixture proof for T-X009 — CLI error despite exit 0 → job fails.
 * Claude `--output-format json` may set is_error while the process exits 0;
 * classification must fail the job before treating stdout as success.
 * External effects: NONE. Never invents live VERIFIED. Live CLI NOT_WIRED.
 */

import { randomUUID } from "node:crypto";
import {
  RoleRunStatus,
  SoakProofKind,
  DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  classifyClaudeCliCompletion,
  claudeCliLiveWiringStatus,
  cliReportsIsError,
  evaluateClaudeCliErrorRetryBudget,
  roleRunStatusForClaudeCliCompletion,
  shouldRecordClaudeCliAttemptOnBudgetDenial,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X009 fixture ACCEPTED.
 */
export function proofCliErrorDespiteExitZero(nowIso: string): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // 1. Exit 0 + is_error with a poisoned "ok" role payload → CLI_REPORTED_ERROR → FAILED.
  const poisoned = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: true,
      result: JSON.stringify({
        roleId: "A01",
        jobId: "11111111-1111-4111-8111-111111111111",
        status: "ok",
        summary: "must not succeed",
        artifactIds: [],
        proposedEffects: [],
        taskRequests: [],
      }),
    }),
  });
  if (
    !poisoned.ok &&
    poisoned.code === "CLI_REPORTED_ERROR" &&
    poisoned.jobShouldFail === true &&
    poisoned.exitCode === 0 &&
    poisoned.externalEffects === "NONE" &&
    roleRunStatusForClaudeCliCompletion(poisoned) === RoleRunStatus.FAILED
  ) {
    details.push(
      "Exit 0 + is_error (poisoned ok payload) → CLI_REPORTED_ERROR → job FAILED",
    );
  } else {
    passed = false;
    details.push(`Poisoned is_error unexpectedly ${JSON.stringify(poisoned)}`);
  }

  // 2. Exit 0 + subtype error → CLI_REPORTED_ERROR → FAILED.
  const subtype = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "error",
      result: "API Error: rate_limit",
    }),
  });
  if (
    !subtype.ok &&
    subtype.code === "CLI_REPORTED_ERROR" &&
    roleRunStatusForClaudeCliCompletion(subtype) === RoleRunStatus.FAILED
  ) {
    details.push("Exit 0 + subtype=error → CLI_REPORTED_ERROR → job FAILED");
  } else {
    passed = false;
    details.push(`Subtype error unexpectedly ${JSON.stringify(subtype)}`);
  }

  // 3. Exit 0 + type error → CLI_REPORTED_ERROR.
  const typeError = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "error",
      error: "authentication_failed",
    }),
  });
  if (!typeError.ok && typeError.code === "CLI_REPORTED_ERROR") {
    details.push("Exit 0 + type=error → CLI_REPORTED_ERROR");
  } else {
    passed = false;
    details.push(`Type error unexpectedly ${JSON.stringify(typeError)}`);
  }

  // 4. Clean exit 0 success envelope does not fail classification.
  const clean = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      result: '{"roleId":"A25","status":"ok"}',
    }),
  });
  if (
    clean.ok === true &&
    clean.jobShouldFail === false &&
    clean.externalEffects === "NONE"
  ) {
    details.push("Clean exit 0 success envelope does not force job fail");
  } else {
    passed = false;
    details.push(`Clean success unexpectedly ${JSON.stringify(clean)}`);
  }

  // 5. Nonzero exit still fails (orthogonal path).
  const nonzero = classifyClaudeCliCompletion({
    exitCode: 1,
    stdout: "",
    stderr: "process crashed",
  });
  if (
    !nonzero.ok &&
    nonzero.code === "NONZERO_EXIT" &&
    roleRunStatusForClaudeCliCompletion(nonzero) === RoleRunStatus.FAILED
  ) {
    details.push("Nonzero exit → NONZERO_EXIT → job FAILED");
  } else {
    passed = false;
    details.push(`Nonzero exit unexpectedly ${JSON.stringify(nonzero)}`);
  }

  // 6. String/alias is_error and case-insensitive type=ERROR fail closed.
  const stringIsError = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: " True ",
      result: "poisoned",
    }),
  });
  const typeCase = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({ type: "ERROR", message: "boom" }),
  });
  if (
    !stringIsError.ok &&
    stringIsError.code === "CLI_REPORTED_ERROR" &&
    cliReportsIsError(" True ") &&
    !typeCase.ok &&
    typeCase.code === "CLI_REPORTED_ERROR"
  ) {
    details.push(
      "is_error string/alias + type=ERROR → CLI_REPORTED_ERROR (fail-closed)",
    );
  } else {
    passed = false;
    details.push("Alias is_error / type=ERROR unexpectedly allowed");
  }

  // 7. success=false and non-empty error field fail closed.
  const successFalse = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      success: false,
      result: "nope",
    }),
  });
  const errorField = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      error: { message: "auth failed" },
    }),
  });
  if (
    !successFalse.ok &&
    successFalse.code === "CLI_REPORTED_ERROR" &&
    !errorField.ok &&
    errorField.code === "CLI_REPORTED_ERROR"
  ) {
    details.push(
      "success=false / error field present → CLI_REPORTED_ERROR (fail-closed)",
    );
  } else {
    passed = false;
    details.push("success=false / error field unexpectedly allowed");
  }

  // 8. NDJSON — last event with is_error wins.
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
  if (
    !ndjson.ok &&
    ndjson.code === "CLI_REPORTED_ERROR" &&
    roleRunStatusForClaudeCliCompletion(ndjson) === RoleRunStatus.FAILED
  ) {
    details.push("NDJSON last-event is_error → CLI_REPORTED_ERROR → job FAILED");
  } else {
    passed = false;
    details.push(`NDJSON unexpectedly ${JSON.stringify(ndjson)}`);
  }

  // 9. Deepen: isError camelCase / is_error "1", ok=false, status=failed, JSON array tail, BOM.
  const camel = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      isError: true,
      result: "camel",
    }),
  });
  const okFalse = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      ok: false,
      result: "nope",
    }),
  });
  const statusFailed = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      status: "failed",
      result: "x",
    }),
  });
  const arrayTail = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify([
      { type: "stream", partial: true },
      {
        type: "result",
        subtype: "success",
        is_error: "1",
        result: "array-tail",
      },
    ]),
  });
  const bom = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout:
      "\uFEFF" +
      JSON.stringify({
        type: "result",
        subtype: "success",
        failed: true,
        result: "bom-failed",
      }),
  });
  if (
    !camel.ok &&
    camel.code === "CLI_REPORTED_ERROR" &&
    !okFalse.ok &&
    okFalse.code === "CLI_REPORTED_ERROR" &&
    !statusFailed.ok &&
    statusFailed.code === "CLI_REPORTED_ERROR" &&
    !arrayTail.ok &&
    arrayTail.code === "CLI_REPORTED_ERROR" &&
    cliReportsIsError("1") &&
    !bom.ok &&
    bom.code === "CLI_REPORTED_ERROR" &&
    bom.externalEffects === "NONE"
  ) {
    details.push(
      "isError/ok=false/status=failed/array-tail/BOM+failed → CLI_REPORTED_ERROR (deepen)",
    );
  } else {
    passed = false;
    details.push("Deepen alias/array/BOM unexpectedly allowed");
  }

  // 10. E9 deepen: stderr-only, stop_reason, errors[], nested is_error, embedded exit_code, aborted.
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
  const stopReason = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      stop_reason: "refusal",
      result: "x",
    }),
  });
  const errorsArr = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      errors: [{ message: "boom" }],
      result: "x",
    }),
  });
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
  const embeddedExit = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      exit_code: "2",
      result: "x",
    }),
  });
  const cleanIgnoresStderr = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      result: '{"roleId":"A25","status":"ok"}',
    }),
    stderr: JSON.stringify({ is_error: true, result: "noise" }),
  });
  if (
    !stderrOnly.ok &&
    stderrOnly.code === "CLI_REPORTED_ERROR" &&
    !stopReason.ok &&
    stopReason.code === "CLI_REPORTED_ERROR" &&
    !errorsArr.ok &&
    errorsArr.code === "CLI_REPORTED_ERROR" &&
    !nestedPoison.ok &&
    nestedPoison.code === "CLI_REPORTED_ERROR" &&
    !embeddedExit.ok &&
    embeddedExit.code === "CLI_REPORTED_ERROR" &&
    cleanIgnoresStderr.ok === true &&
    cleanIgnoresStderr.externalEffects === "NONE"
  ) {
    details.push(
      "stderr/stop_reason/errors[]/nested/embedded-exit → CLI_REPORTED_ERROR; clean stdout ignores stderr (E9)",
    );
  } else {
    passed = false;
    details.push("E9 deepen signals unexpectedly allowed or clean stderr-poisoned");
  }

  // 11. E10 retry budget fence — refuse start past max without recording.
  const budgetFailed = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: true,
      result: "budget-poison",
    }),
  });
  const withinBudget = evaluateClaudeCliErrorRetryBudget({
    classification: budgetFailed,
    attemptCount: 1,
    startingNewAttempt: false,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  const exhausted = evaluateClaudeCliErrorRetryBudget({
    classification: budgetFailed,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !budgetFailed.ok &&
    withinBudget.allowed &&
    withinBudget.recordAttempt &&
    withinBudget.jobShouldFail &&
    withinBudget.externalEffects === "NONE" &&
    !exhausted.allowed &&
    exhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    exhausted.recordAttempt === false &&
    exhausted.attemptCount === 1 &&
    shouldRecordClaudeCliAttemptOnBudgetDenial(exhausted.code) === false &&
    exhausted.claudeCliLiveWiring === "NOT_WIRED"
  ) {
    details.push(
      "retry budget fence: attempt 1 recorded; start past max → RETRY_BUDGET_EXHAUSTED without recording (E10)",
    );
  } else {
    passed = false;
    details.push("Retry budget fence unexpectedly open or recorded past max");
  }

  // 11b. E11 — clean success never consumes retry budget (even after a recorded failure).
  const cleanAfterFailure = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      result: '{"roleId":"A01"}',
    }),
  });
  const cleanBudgetAfterFailure = evaluateClaudeCliErrorRetryBudget({
    classification: cleanAfterFailure,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    cleanAfterFailure.ok &&
    cleanBudgetAfterFailure.allowed &&
    cleanBudgetAfterFailure.code === null &&
    cleanBudgetAfterFailure.recordAttempt === false &&
    cleanBudgetAfterFailure.jobShouldFail === false &&
    cleanBudgetAfterFailure.externalEffects === "NONE" &&
    cleanBudgetAfterFailure.claudeCliLiveWiring === "NOT_WIRED"
  ) {
    details.push(
      "E11: clean CLI success does not consume retry budget after recorded failure",
    );
  } else {
    passed = false;
    details.push(
      `E11 clean budget unexpectedly ${JSON.stringify(cleanBudgetAfterFailure)}`,
    );
  }

  // 11b2. E14 — exhausted budget does not soften job status on CLI_REPORTED_ERROR.
  const poisonedE14 = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: true,
      result: "e14-poison",
    }),
  });
  const poisonedExhausted = evaluateClaudeCliErrorRetryBudget({
    classification: poisonedE14,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !poisonedE14.ok &&
    poisonedExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    roleRunStatusForClaudeCliCompletion(poisonedE14) === RoleRunStatus.FAILED &&
    poisonedExhausted.externalEffects === "NONE"
  ) {
    details.push(
      "E14: RETRY_BUDGET_EXHAUSTED still job FAILED on CLI_REPORTED_ERROR",
    );
  } else {
    passed = false;
    details.push(`E14 exhausted job status unexpectedly poisoned`);
  }

  // 11b1p0. E32 — with_error flag exhausted budget still FAILED.
  const withErrorE32 = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      with_error: true,
      result: "e32-with-error",
    }),
  });
  const withErrorExhausted = evaluateClaudeCliErrorRetryBudget({
    classification: withErrorE32,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !withErrorE32.ok &&
    withErrorE32.code === "CLI_REPORTED_ERROR" &&
    withErrorExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    roleRunStatusForClaudeCliCompletion(withErrorE32) === RoleRunStatus.FAILED &&
    withErrorExhausted.jobShouldFail &&
    withErrorExhausted.claudeCliLiveWiring === "NOT_WIRED" &&
    withErrorExhausted.externalEffects === "NONE"
  ) {
    details.push("E32: with_error=true exhausted budget still job FAILED");
  } else {
    passed = false;
    details.push(`E32 with_error flag unexpectedly`);
  }

  // 11b1p1. E31 — was_error / wasError flag exhausted budget still FAILED.
  const wasErrorE31 = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      was_error: true,
      result: "e31-was-error",
    }),
  });
  const wasErrorExhausted = evaluateClaudeCliErrorRetryBudget({
    classification: wasErrorE31,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !wasErrorE31.ok &&
    wasErrorE31.code === "CLI_REPORTED_ERROR" &&
    wasErrorExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    roleRunStatusForClaudeCliCompletion(wasErrorE31) === RoleRunStatus.FAILED &&
    wasErrorExhausted.jobShouldFail &&
    wasErrorExhausted.claudeCliLiveWiring === "NOT_WIRED" &&
    wasErrorExhausted.externalEffects === "NONE"
  ) {
    details.push("E31: was_error=true exhausted budget still job FAILED");
  } else {
    passed = false;
    details.push(`E31 was_error flag unexpectedly`);
  }

  // 11b1p. E30 — had_error flag exhausted budget still FAILED.
  const hadErrorE30 = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      had_error: true,
      result: "e30-had-error",
    }),
  });
  const hadErrorExhausted = evaluateClaudeCliErrorRetryBudget({
    classification: hadErrorE30,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !hadErrorE30.ok &&
    hadErrorE30.code === "CLI_REPORTED_ERROR" &&
    hadErrorExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    roleRunStatusForClaudeCliCompletion(hadErrorE30) === RoleRunStatus.FAILED &&
    hadErrorExhausted.jobShouldFail &&
    hadErrorExhausted.claudeCliLiveWiring === "NOT_WIRED" &&
    hadErrorExhausted.externalEffects === "NONE"
  ) {
    details.push("E30: had_error=true exhausted budget still job FAILED");
  } else {
    passed = false;
    details.push(`E30 had_error flag unexpectedly`);
  }

  // 11b1q. E29 — is_failed flag exhausted budget still FAILED.
  const isFailedE29 = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      is_failed: true,
      result: "e29-is-failed",
    }),
  });
  const isFailedExhausted = evaluateClaudeCliErrorRetryBudget({
    classification: isFailedE29,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !isFailedE29.ok &&
    isFailedE29.code === "CLI_REPORTED_ERROR" &&
    isFailedExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    roleRunStatusForClaudeCliCompletion(isFailedE29) === RoleRunStatus.FAILED &&
    isFailedExhausted.jobShouldFail &&
    isFailedExhausted.claudeCliLiveWiring === "NOT_WIRED" &&
    isFailedExhausted.externalEffects === "NONE"
  ) {
    details.push("E29: is_failed=true exhausted budget still job FAILED");
  } else {
    passed = false;
    details.push(`E29 is_failed flag unexpectedly`);
  }

  // 11b1r. E28 — is_failure flag exhausted budget still FAILED.
  const isFailureE28 = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      is_failure: true,
      result: "e28-is-failure",
    }),
  });
  const isFailureExhausted = evaluateClaudeCliErrorRetryBudget({
    classification: isFailureE28,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !isFailureE28.ok &&
    isFailureE28.code === "CLI_REPORTED_ERROR" &&
    isFailureExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    roleRunStatusForClaudeCliCompletion(isFailureE28) === RoleRunStatus.FAILED &&
    isFailureExhausted.jobShouldFail &&
    isFailureExhausted.claudeCliLiveWiring === "NOT_WIRED" &&
    isFailureExhausted.externalEffects === "NONE"
  ) {
    details.push("E28: is_failure=true exhausted budget still job FAILED");
  } else {
    passed = false;
    details.push(`E28 is_failure flag unexpectedly`);
  }

  // 11b1s. E27 — errored flag exhausted budget still FAILED.
  const erroredE27 = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      errored: true,
      result: "e27-errored",
    }),
  });
  const erroredExhausted = evaluateClaudeCliErrorRetryBudget({
    classification: erroredE27,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !erroredE27.ok &&
    erroredE27.code === "CLI_REPORTED_ERROR" &&
    erroredExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    roleRunStatusForClaudeCliCompletion(erroredE27) === RoleRunStatus.FAILED &&
    erroredExhausted.jobShouldFail &&
    erroredExhausted.claudeCliLiveWiring === "NOT_WIRED" &&
    erroredExhausted.externalEffects === "NONE"
  ) {
    details.push("E27: errored=true exhausted budget still job FAILED");
  } else {
    passed = false;
    details.push(`E27 errored flag unexpectedly`);
  }

  // 11b1t. E26 — failed flag exhausted budget still FAILED.
  const failedE26 = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      failed: true,
      result: "e26-failed",
    }),
  });
  const failedExhausted = evaluateClaudeCliErrorRetryBudget({
    classification: failedE26,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !failedE26.ok &&
    failedE26.code === "CLI_REPORTED_ERROR" &&
    failedExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    roleRunStatusForClaudeCliCompletion(failedE26) === RoleRunStatus.FAILED &&
    failedExhausted.jobShouldFail &&
    failedExhausted.claudeCliLiveWiring === "NOT_WIRED" &&
    failedExhausted.externalEffects === "NONE"
  ) {
    details.push("E26: failed=true exhausted budget still job FAILED");
  } else {
    passed = false;
    details.push(`E26 failed flag unexpectedly`);
  }

  // 11b1u. E25 — cancelled flag exhausted budget still FAILED.
  const cancelledE25 = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      cancelled: true,
      result: "e25-cancelled",
    }),
  });
  const cancelledExhausted = evaluateClaudeCliErrorRetryBudget({
    classification: cancelledE25,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !cancelledE25.ok &&
    cancelledE25.code === "CLI_REPORTED_ERROR" &&
    cancelledExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    roleRunStatusForClaudeCliCompletion(cancelledE25) === RoleRunStatus.FAILED &&
    cancelledExhausted.jobShouldFail &&
    cancelledExhausted.claudeCliLiveWiring === "NOT_WIRED" &&
    cancelledExhausted.externalEffects === "NONE"
  ) {
    details.push("E25: cancelled=true exhausted budget still job FAILED");
  } else {
    passed = false;
    details.push(`E25 cancelled unexpectedly`);
  }

  // 11b1v. E24 — has_error flag exhausted budget still FAILED.
  const hasErrorE24 = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      has_error: true,
      result: "e24-has-error",
    }),
  });
  const hasErrorExhausted = evaluateClaudeCliErrorRetryBudget({
    classification: hasErrorE24,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !hasErrorE24.ok &&
    hasErrorE24.code === "CLI_REPORTED_ERROR" &&
    hasErrorExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    roleRunStatusForClaudeCliCompletion(hasErrorE24) === RoleRunStatus.FAILED &&
    hasErrorExhausted.jobShouldFail &&
    hasErrorExhausted.claudeCliLiveWiring === "NOT_WIRED" &&
    hasErrorExhausted.externalEffects === "NONE"
  ) {
    details.push("E24: has_error=true exhausted budget still job FAILED");
  } else {
    passed = false;
    details.push(`E24 has_error unexpectedly`);
  }

  // 11b1w. E23 — aborted flag exhausted budget still FAILED.
  const abortedE23 = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      aborted: true,
      result: "e23-aborted",
    }),
  });
  const abortedExhausted = evaluateClaudeCliErrorRetryBudget({
    classification: abortedE23,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !abortedE23.ok &&
    abortedE23.code === "CLI_REPORTED_ERROR" &&
    abortedExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    roleRunStatusForClaudeCliCompletion(abortedE23) === RoleRunStatus.FAILED &&
    abortedExhausted.jobShouldFail &&
    abortedExhausted.claudeCliLiveWiring === "NOT_WIRED" &&
    abortedExhausted.externalEffects === "NONE"
  ) {
    details.push("E23: aborted=true exhausted budget still job FAILED");
  } else {
    passed = false;
    details.push(`E23 aborted unexpectedly`);
  }

  // 11b1x. E22 — errors[] exhausted budget still FAILED.
  const errorsE22 = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      errors: [{ message: "e22-policy" }],
      result: "e22-errors",
    }),
  });
  const errorsExhausted = evaluateClaudeCliErrorRetryBudget({
    classification: errorsE22,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !errorsE22.ok &&
    errorsE22.code === "CLI_REPORTED_ERROR" &&
    errorsExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    roleRunStatusForClaudeCliCompletion(errorsE22) === RoleRunStatus.FAILED &&
    errorsExhausted.jobShouldFail &&
    errorsExhausted.claudeCliLiveWiring === "NOT_WIRED" &&
    errorsExhausted.externalEffects === "NONE"
  ) {
    details.push("E22: errors[] exhausted budget still job FAILED");
  } else {
    passed = false;
    details.push(`E22 errors[] unexpectedly`);
  }

  // 11b1y. E21 — stop_reason error exhausted budget still FAILED.
  const stopE21 = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      stop_reason: "error",
      result: "e21-stop",
    }),
  });
  const stopExhausted = evaluateClaudeCliErrorRetryBudget({
    classification: stopE21,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !stopE21.ok &&
    stopE21.code === "CLI_REPORTED_ERROR" &&
    stopExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    roleRunStatusForClaudeCliCompletion(stopE21) === RoleRunStatus.FAILED &&
    stopExhausted.jobShouldFail &&
    stopExhausted.claudeCliLiveWiring === "NOT_WIRED" &&
    stopExhausted.externalEffects === "NONE"
  ) {
    details.push("E21: stop_reason error exhausted budget still job FAILED");
  } else {
    passed = false;
    details.push(`E21 stop_reason unexpectedly`);
  }

  // 11b1z. E20 — embedded exit_code exhausted budget still FAILED.
  const embeddedE20 = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      exit_code: 2,
      result: "e20-embedded-exit",
    }),
  });
  const embeddedExhausted = evaluateClaudeCliErrorRetryBudget({
    classification: embeddedE20,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !embeddedE20.ok &&
    embeddedE20.code === "CLI_REPORTED_ERROR" &&
    embeddedExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    roleRunStatusForClaudeCliCompletion(embeddedE20) === RoleRunStatus.FAILED &&
    embeddedExhausted.jobShouldFail &&
    embeddedExhausted.claudeCliLiveWiring === "NOT_WIRED" &&
    embeddedExhausted.externalEffects === "NONE"
  ) {
    details.push("E20: embedded exit_code exhausted budget still job FAILED");
  } else {
    passed = false;
    details.push(`E20 embedded exit unexpectedly`);
  }

  // 11b2-0. E19 — status=failed exhausted budget still FAILED.
  const statusFailedE19 = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      status: "failed",
      result: "e19-status-failed",
    }),
  });
  const statusExhausted = evaluateClaudeCliErrorRetryBudget({
    classification: statusFailedE19,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !statusFailedE19.ok &&
    statusFailedE19.code === "CLI_REPORTED_ERROR" &&
    statusExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    roleRunStatusForClaudeCliCompletion(statusFailedE19) === RoleRunStatus.FAILED &&
    statusExhausted.jobShouldFail &&
    statusExhausted.claudeCliLiveWiring === "NOT_WIRED" &&
    statusExhausted.externalEffects === "NONE"
  ) {
    details.push("E19: status=failed exhausted budget still job FAILED");
  } else {
    passed = false;
    details.push(`E19 status=failed exhausted unexpectedly`);
  }

  // 11b2-1. E18 — ok=false exhausted budget still FAILED.
  const okFalseE18 = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      ok: false,
      result: "e18-ok-false",
    }),
  });
  const okFalseExhausted = evaluateClaudeCliErrorRetryBudget({
    classification: okFalseE18,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !okFalseE18.ok &&
    okFalseE18.code === "CLI_REPORTED_ERROR" &&
    okFalseExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    roleRunStatusForClaudeCliCompletion(okFalseE18) === RoleRunStatus.FAILED &&
    okFalseExhausted.jobShouldFail &&
    okFalseExhausted.claudeCliLiveWiring === "NOT_WIRED" &&
    okFalseExhausted.externalEffects === "NONE"
  ) {
    details.push("E18: ok=false exhausted budget still job FAILED");
  } else {
    passed = false;
    details.push(`E18 ok=false exhausted unexpectedly`);
  }

  // 11b2a. E17 — success=false exhausted budget still FAILED.
  const successFalseE17 = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      success: false,
      result: "e17-fail",
    }),
  });
  const sfExhausted = evaluateClaudeCliErrorRetryBudget({
    classification: successFalseE17,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !successFalseE17.ok &&
    successFalseE17.code === "CLI_REPORTED_ERROR" &&
    sfExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    roleRunStatusForClaudeCliCompletion(successFalseE17) === RoleRunStatus.FAILED &&
    sfExhausted.jobShouldFail &&
    sfExhausted.claudeCliLiveWiring === "NOT_WIRED" &&
    sfExhausted.externalEffects === "NONE"
  ) {
    details.push("E17: success=false exhausted budget still job FAILED");
  } else {
    passed = false;
    details.push(`E17 success=false exhausted unexpectedly`);
  }

  // 11b2b. E16 — stderr-only error exhausted budget still FAILED (no recording).
  const stderrE16 = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: "",
    stderr: JSON.stringify({
      type: "result",
      is_error: true,
      result: "e16-stderr",
    }),
  });
  const stderrBudget = evaluateClaudeCliErrorRetryBudget({
    classification: stderrE16,
    attemptCount: 0,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  const stderrExhausted = evaluateClaudeCliErrorRetryBudget({
    classification: stderrE16,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !stderrE16.ok &&
    stderrE16.code === "CLI_REPORTED_ERROR" &&
    stderrBudget.recordAttempt &&
    stderrExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    roleRunStatusForClaudeCliCompletion(stderrE16) === RoleRunStatus.FAILED &&
    !shouldRecordClaudeCliAttemptOnBudgetDenial(stderrExhausted.code) &&
    stderrExhausted.claudeCliLiveWiring === "NOT_WIRED" &&
    stderrExhausted.externalEffects === "NONE"
  ) {
    details.push(
      "E16: stderr-only CLI error exhausted budget still FAILED (not recorded)",
    );
  } else {
    passed = false;
    details.push(`E16 stderr exhausted unexpectedly ${JSON.stringify(stderrExhausted)}`);
  }

  // 11b3. E15 — exhausted budget does not soften job status on NONZERO_EXIT.
  const nonzeroE15 = classifyClaudeCliCompletion({
    exitCode: 2,
    stdout: "",
  });
  const nonzeroExhaustedE15 = evaluateClaudeCliErrorRetryBudget({
    classification: nonzeroE15,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !nonzeroE15.ok &&
    nonzeroE15.code === "NONZERO_EXIT" &&
    nonzeroExhaustedE15.code === "RETRY_BUDGET_EXHAUSTED" &&
    roleRunStatusForClaudeCliCompletion(nonzeroE15) === RoleRunStatus.FAILED &&
    nonzeroExhaustedE15.jobShouldFail === true &&
    nonzeroExhaustedE15.claudeCliLiveWiring === "NOT_WIRED" &&
    nonzeroExhaustedE15.externalEffects === "NONE"
  ) {
    details.push(
      "E15: RETRY_BUDGET_EXHAUSTED still job FAILED on NONZERO_EXIT (cli NOT_WIRED)",
    );
  } else {
    passed = false;
    details.push(`E15 exhausted job status unexpectedly nonzero`);
  }

  // 11c. E13 — NONZERO_EXIT consumes retry budget like CLI_REPORTED_ERROR.
  const nonzeroE13 = classifyClaudeCliCompletion({
    exitCode: 1,
    stdout: JSON.stringify({ type: "result", subtype: "success", is_error: false }),
  });
  const nonzeroBudget = evaluateClaudeCliErrorRetryBudget({
    classification: nonzeroE13,
    attemptCount: 0,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  const nonzeroExhausted = evaluateClaudeCliErrorRetryBudget({
    classification: nonzeroE13,
    attemptCount: 1,
    startingNewAttempt: true,
    maxAttempts: DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS,
  });
  if (
    !nonzeroE13.ok &&
    nonzeroE13.code === "NONZERO_EXIT" &&
    nonzeroBudget.recordAttempt &&
    nonzeroBudget.jobShouldFail &&
    nonzeroExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    !nonzeroExhausted.recordAttempt
  ) {
    details.push(
      "E13: NONZERO_EXIT consumes retry budget; second start RETRY_BUDGET_EXHAUSTED",
    );
  } else {
    passed = false;
    details.push(`E13 NONZERO budget unexpectedly ${JSON.stringify(nonzeroExhausted)}`);
  }

  // 11d. E12 — is_error numeric 1 fails job despite exit 0.
  const numericIsError = classifyClaudeCliCompletion({
    exitCode: 0,
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: 1,
      result: "numeric-poison",
    }),
  });
  if (
    cliReportsIsError(1) &&
    !numericIsError.ok &&
    numericIsError.code === "CLI_REPORTED_ERROR" &&
    roleRunStatusForClaudeCliCompletion(numericIsError) === RoleRunStatus.FAILED &&
    numericIsError.externalEffects === "NONE"
  ) {
    details.push(
      "E12: is_error numeric 1 → CLI_REPORTED_ERROR → job FAILED (exit 0)",
    );
  } else {
    passed = false;
    details.push(`E12 numeric is_error unexpectedly ${JSON.stringify(numericIsError)}`);
  }

  // 12. Live CLI wiring honesty.
  if (claudeCliLiveWiringStatus() === "NOT_WIRED") {
    details.push("claudeCliLiveWiringStatus=NOT_WIRED");
  } else {
    passed = false;
    details.push("Live CLI wiring unexpectedly claimed");
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-cli-error-exit0-${randomUUID()}`,
    kind: SoakProofKind.CLI_ERROR_DESPITE_EXIT_ZERO,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-x009-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
