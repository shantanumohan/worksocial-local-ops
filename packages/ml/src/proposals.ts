/**
 * Versioned playbook / ranking / risk artifacts under review.
 * Proposals only — never auto-apply authority or external effects.
 */

import {
  assertAuthorityNonExpansion,
  FIXED_NON_EXPANDING_AUTHORITY,
  type AuthorityImpactFlags,
} from "./authority-guard.js";
import type { TrainedModelWeights } from "./models.js";

export const LearningProposalKind = {
  PLAYBOOK: "playbook",
  RANKING: "ranking",
  RISK: "risk",
} as const;

export type LearningProposalKindValue =
  (typeof LearningProposalKind)[keyof typeof LearningProposalKind];

export const LearningProposalStatus = {
  AWAITING_REVIEW: "awaiting_review",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
} as const;

export type LearningProposalStatusValue =
  (typeof LearningProposalStatus)[keyof typeof LearningProposalStatus];

export type LearningRunMetrics = {
  sampleCount: number;
  heldOutCount: number;
  accuracy: number | null;
  successRate: number | null;
  meanScore: number | null;
  fixtureExcludedCount: number;
  modelIds: readonly string[];
  /**
   * When train/holdout reuse would be required (samples too small), metrics are
   * labeled INSUFFICIENT_DATA rather than silently reused as holdout scores.
   */
  dataAdequacy: "OK" | "INSUFFICIENT_DATA";
  dataAdequacyReason: string | null;
};

export type LearningProposal = {
  proposalId: string;
  artifactVersion: string;
  kind: LearningProposalKindValue;
  status: LearningProposalStatusValue;
  modelIds: readonly string[];
  trainingRunId: string;
  summary: string;
  metrics: LearningRunMetrics;
  authorityImpact: AuthorityImpactFlags;
  /** Non-authority scoring / playbook hint payload only. */
  payload: Readonly<Record<string, unknown>>;
  createdAtIso: string;
};

export type LearningTrainingRun = {
  runId: string;
  startedAtIso: string;
  finishedAtIso: string;
  runtimeMode: "offline_fixture" | "local_trained";
  metrics: LearningRunMetrics;
  modelWeights: readonly TrainedModelWeights[];
  proposalIds: readonly string[];
  note: string;
};

let proposalSeq = 0;

export function nextArtifactVersion(nowIso: string, kind: LearningProposalKindValue): string {
  proposalSeq += 1;
  const stamp = nowIso.replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${kind}-v${stamp}-${proposalSeq}`;
}

export function createLearningProposal(input: {
  proposalId: string;
  kind: LearningProposalKindValue;
  modelIds: readonly string[];
  trainingRunId: string;
  summary: string;
  metrics: LearningRunMetrics;
  payload: Readonly<Record<string, unknown>>;
  createdAtIso: string;
  artifactVersion?: string;
}): LearningProposal {
  const authorityImpact = { ...FIXED_NON_EXPANDING_AUTHORITY };
  assertAuthorityNonExpansion(authorityImpact, input.payload);
  return {
    proposalId: input.proposalId,
    artifactVersion:
      input.artifactVersion ?? nextArtifactVersion(input.createdAtIso, input.kind),
    kind: input.kind,
    status: LearningProposalStatus.AWAITING_REVIEW,
    modelIds: [...input.modelIds],
    trainingRunId: input.trainingRunId,
    summary: input.summary,
    metrics: input.metrics,
    authorityImpact,
    payload: { ...input.payload },
    createdAtIso: input.createdAtIso,
  };
}

export function listProposalsAwaitingReview(
  proposals: readonly LearningProposal[],
): LearningProposal[] {
  return proposals.filter(
    (p) => p.status === LearningProposalStatus.AWAITING_REVIEW,
  );
}
