/** @worksocial/claude-runner — R1-04 thirty-role Claude Code runtime. */

export {
  FORBIDDEN_CLI_FLAGS,
  ALLOWED_CLI_FLAGS,
  defaultClaudeExecutableCandidates,
  validateCliArgs,
  detectClaudeCli,
  invokeClaudeCli,
  type ClaudeCliDetection,
  type ClaudeCliInvokeRequest,
  type ClaudeCliInvokeResult,
} from "./cli-adapter.js";

export {
  runRoleFixture,
  runAllRoleFixtureEvaluations,
  type FixtureRunInput,
  type FixtureRunResult,
} from "./fixture-runner.js";

export { BoundedQueue, type QueueJob, type QueueResult } from "./queue.js";

export {
  createClaudeRunner,
  type ClaudeRunner,
  type ClaudeRunnerOptions,
  type RoleJobRequest,
  type RoleJobResult,
} from "./runner.js";

export const packageName = "@worksocial/claude-runner" as const;
