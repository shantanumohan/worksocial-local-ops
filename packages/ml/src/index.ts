export {
  ModelFamily,
  ModelRuntimeMode,
  PINNED_OPEN_SOURCE_MODELS,
  assertMultiModelRegistry,
  getPinnedModel,
  listPinnedModels,
  type ModelFamilyValue,
  type ModelRuntimeModeValue,
  type PinnedOpenSourceModel,
} from "./registry.js";

export {
  LearningExampleKind,
  extractLearningExamples,
  extractRoleRunExamples,
  extractWritePathExamples,
  hashToken,
  isUnverifiedModelClaimLabel,
  vectorizeExample,
  type FeatureExtractionOptions,
  type LearningExample,
  type LearningExampleKindValue,
  type LearningFeatureVector,
} from "./features.js";

export {
  FEATURE_DIM,
  evaluateWeights,
  fixtureBaselineWeights,
  predictWithWeights,
  trainBernoulliNb,
  trainLogisticL2,
  trainModel,
  type PredictResult,
  type TrainedModelWeights,
} from "./models.js";

export {
  FORBIDDEN_AUTHORITY_EXPANSION_KEYS,
  FIXED_NON_EXPANDING_AUTHORITY,
  assertAuthorityNonExpansion,
  assertLearningWorkerIsolation,
  type AuthorityImpactFlags,
  type LearningIsolationContext,
} from "./authority-guard.js";

export {
  LearningProposalKind,
  LearningProposalStatus,
  createLearningProposal,
  listProposalsAwaitingReview,
  nextArtifactVersion,
  type LearningProposal,
  type LearningProposalKindValue,
  type LearningProposalStatusValue,
  type LearningRunMetrics,
  type LearningTrainingRun,
} from "./proposals.js";

export { runTrainLoop, type TrainLoopInput, type TrainLoopResult } from "./train.js";

export const packageName = "@worksocial/ml" as const;
