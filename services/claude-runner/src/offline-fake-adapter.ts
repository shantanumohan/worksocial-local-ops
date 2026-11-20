/**
 * Safe offline fake adapter for Claude structured outputs (M3).
 * Deterministic — no network, no accounts, no spend.
 * Explicit fixture-class simulator; never reports ACTUAL cost.
 */

import {
  ArtifactTrustLabel,
  evidenceCitationIds,
  proposeEffect,
  type AgentRoleId,
  type CompiledInputPackage,
  type EffectProposal,
  type RoleStructuredOutput,
  type ReviewBinding,
} from "@worksocial/domain";
import type { JobEnvelope } from "@worksocial/contracts";

export type OfflineFakeWriterInput = {
  envelope: JobEnvelope;
  package: CompiledInputPackage;
};

export type OfflineFakeReviewerInput = {
  envelope: JobEnvelope;
  binding: ReviewBinding;
  proposal: EffectProposal;
  draftSummary: string;
};

/**
 * Writer simulator: cites every measured/untrusted evidence id from the package.
 */
export function simulateWriterOutput(
  input: OfflineFakeWriterInput,
): RoleStructuredOutput {
  const roleId = input.envelope.roleId as AgentRoleId;
  const citations = evidenceCitationIds(input.package);
  const trusted = input.package.entries.filter(
    (e) => e.trustLabel === ArtifactTrustLabel.TRUSTED_INSTRUCTION,
  );
  const measured = input.package.entries.filter(
    (e) => e.trustLabel === ArtifactTrustLabel.MEASURED_EVIDENCE,
  );

  const citedFacts = measured
    .map((e) => `${e.artifactId}@${e.revision}: ${e.content ?? "(no inline)"}`)
    .join(" ");

  const summary =
    citations.length > 0
      ? `Offline fake draft for ${roleId} citing ${citations.join(", ")}. ${citedFacts}`.trim()
      : `Offline fake draft for ${roleId} (instruction-only package).`;

  const proposal: EffectProposal = {
    proposalId: `fake-prop-${input.envelope.jobId}`,
    authorRoleId: roleId,
    actionClass: "create",
    operation: "stage_artifact",
    assetId: input.envelope.assetId,
    channelId: "local-artifact",
    payloadDigest: `fake-${input.package.packageDigest}`,
    evidenceArtifactIds: [...citations],
  };

  // Gate proposal through domain proposeEffect — may still need A25 review.
  const decision = proposeEffect(proposal);
  const proposedEffects = decision.ok ? [proposal] : [];

  return {
    roleId,
    jobId: input.envelope.jobId,
    status: proposedEffects.length > 0 ? "needs_review" : "ok",
    summary,
    artifactIds: [
      `fake/${roleId}/${input.envelope.jobId}.json`,
      ...citations,
      ...trusted.map((t) => t.artifactId),
    ],
    proposedEffects,
    taskRequests: [],
    modelConfidence: null,
  };
}

/**
 * A25 reviewer simulator: approves only when binding identities match proposal.
 */
export function simulateReviewerOutput(
  input: OfflineFakeReviewerInput,
): RoleStructuredOutput {
  const approved =
    input.binding.proposalId === input.proposal.proposalId &&
    input.binding.authorRoleId === input.proposal.authorRoleId &&
    input.proposal.evidenceArtifactIds.every((id) =>
      input.binding.evidenceArtifactIds.includes(id),
    );

  const summary = approved
    ? `A25 offline fake review APPROVED for ${input.binding.proposalArtifactId}@${input.binding.proposalRevision} bound to evidence ${input.binding.evidencePackageDigest}. Draft: ${input.draftSummary.slice(0, 120)}`
    : `A25 offline fake review REJECTED — binding/proposal mismatch for ${input.binding.bindingId}`;

  return {
    roleId: "A25",
    jobId: input.envelope.jobId,
    status: approved ? "ok" : "error",
    summary,
    artifactIds: [
      `fake/A25/${input.envelope.jobId}.json`,
      input.binding.proposalArtifactId,
      ...input.binding.evidenceArtifactIds,
    ],
    proposedEffects: [],
    taskRequests: [],
    modelConfidence: null,
  };
}
