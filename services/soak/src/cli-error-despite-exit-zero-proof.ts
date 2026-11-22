/**
 * Fixture proof for T-X009 — CLI error despite exit 0 → job fails.
 * Claude `--output-format json` may set is_error while the process exits 0;
 * classification must fail the job before treating stdout as success.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  RoleRunStatus,
  SoakProofKind,
  classifyClaudeCliCompletion,
  roleRunStatusForClaudeCliCompletion,
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
  if (clean.ok === true && clean.jobShouldFail === false) {
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
