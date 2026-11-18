import { describe, expect, it } from "vitest";
import { OutcomeLabel } from "./production-mapping.js";
import {
  MAX_DELEGATION_DEPTH,
  RoleExecutionMode,
  RoleRunStatus,
  acceptReviewVerdict,
  createRoleRunOutcome,
  evaluateIndependentReviewGate,
  listRoleOutcomesForLearning,
  proposeEffect,
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
