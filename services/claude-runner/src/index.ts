/** @worksocial/claude-runner — R1-04 thirty-role Claude Code runtime. */

export {
  FORBIDDEN_CLI_FLAGS,
  ALLOWED_CLI_FLAGS,
  DEFAULT_LIVE_CLI_TOOLS,
  defaultClaudeExecutableCandidates,
  validateCliArgs,
  isRegisteredAgentName,
  planClaudeCliInvocation,
  detectClaudeCli,
  invokeClaudeCli,
  assessStdoutBound,
  quarantineStdoutDelivery,
  type ClaudeCliDetection,
  type ClaudeCliInvokeRequest,
  type ClaudeCliInvokeResult,
  type ClaudeCliInvocationPlan,
  type PlanClaudeCliInvocationInput,
  type StdoutBoundAssessment,
} from "./cli-adapter.js";

export {
  runRoleFixture,
  runAllRoleFixtureEvaluations,
  type FixtureRunInput,
  type FixtureRunResult,
} from "./fixture-runner.js";

export {
  BoundedQueue,
  type QueueJob,
  type QueueResult,
  type BoundedQueueOptions,
} from "./queue.js";

export {
  createClaudeRunner,
  type ClaudeRunner,
  type ClaudeRunnerOptions,
  type RoleJobRequest,
  type RoleJobResult,
} from "./runner.js";

export {
  simulateWriterOutput,
  simulateReviewerOutput,
  type OfflineFakeWriterInput,
  type OfflineFakeReviewerInput,
} from "./offline-fake-adapter.js";

export {
  runEvidenceCycle,
  invalidateBindingAfterEdit,
  type ProposalArtifactRecord,
  type EvidenceCycleUsage,
  type EvidenceCycleRequest,
  type EvidenceCycleResult,
} from "./evidence-cycle.js";

export const packageName = "@worksocial/claude-runner" as const;
