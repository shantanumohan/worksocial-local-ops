/** M8 / NEXT-19 isolated evaluation worker — EVAL_ONLY Claude/Gemini fixtures. */

export {
  createEvaluationService,
  type EvaluationService,
} from "./service.js";

export {
  EVAL_GOLDEN_SUITE_ID,
  EVAL_CLAUDE_CONNECTION_ID,
  EVAL_GEMINI_CONNECTION_ID,
  EVAL_SUPPORTED_FACT_ID,
  EVAL_HYPOTHESIS_FACT_ID,
  EVAL_RESERVE_MINOR,
  buildFixtureEvalConnections,
  buildFixtureEvalSuite,
  fixtureCaseAnswer,
  fixtureEvalFactLabels,
} from "./fixtures.js";
