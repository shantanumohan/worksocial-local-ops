/**
 * Contract: thirty roles registered; fixture mode; no uncontrolled recursion;
 * unauthorized / self-approved effects denied; no permission bypass.
 */
import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  AGENT_ROLE_IDS,
  assertThirtyRolesRegistered,
  evaluateIndependentReviewGate,
  validateRoleStructuredOutput,
  validateTypedDelegation,
  MAX_DELEGATION_DEPTH,
} from "@worksocial/domain";
import {
  createClaudeRunner,
  FORBIDDEN_CLI_FLAGS,
  isRegisteredAgentName,
  validateCliArgs,
} from "@worksocial/claude-runner";

function uuid(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

describe("contract: thirty-role-runtime", () => {
  it("registers exactly thirty roles", () => {
    expect(() => assertThirtyRolesRegistered()).not.toThrow();
    expect(AGENT_ROLE_IDS).toHaveLength(30);
  });

  it("runs all thirty role evaluations offline in fixture mode", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: true,
    });
    const results = await runner.evaluateAllRolesFixture();
    expect(results).toHaveLength(30);
    expect(new Set(results.map((r) => r.roleId)).size).toBe(30);
    expect(results.every((r) => r.executionMode === "fixture")).toBe(true);
    expect(results.every((r) => r.permissionBypassUsed === false)).toBe(true);
  });

  it("denies uncontrolled recursion", () => {
    const denied = validateTypedDelegation({
      requestId: "c-recur",
      fromRoleId: "A01",
      toRoleId: "A13",
      objective: "keep improving everything",
      inputArtifactIds: [],
      parentDepth: MAX_DELEGATION_DEPTH,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.code).toBe("UNCONTROLLED_RECURSION");
    }
  });

  it("denies unauthorized self-approval of effects", () => {
    const gate = evaluateIndependentReviewGate({
      proposal: {
        proposalId: "c-prop",
        authorRoleId: "A15",
        actionClass: "routine_publish",
        operation: "publish_page",
        assetId: "page-home",
        channelId: "owned-site",
        payloadDigest: "x",
        evidenceArtifactIds: [],
        selfApprovalAttempted: true,
      },
    });
    expect(gate.ok).toBe(false);
  });

  it("refuses blanket permission bypass flags", () => {
    for (const flag of FORBIDDEN_CLI_FLAGS) {
      expect(validateCliArgs([flag]).ok).toBe(false);
    }
  });

  it("runner denies permission-bypass requests", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: true,
    });
    const result = await runner.enqueue({
      envelope: {
        jobId: uuid(),
        roleId: "A24",
        workflowId: "wf-contract",
        siteId: "worksocial",
        assetId: "asset",
        trigger: "contract",
        policyVersion: "r1-04",
        inputArtifactIds: [],
        capabilityGrantId: "g",
        sourceRevision: "r",
        deadlineSeconds: 30,
        idempotencyKey: `contract/${uuid()}`,
        expectedOutcome: "denied",
      },
      requestPermissionBypass: true,
    });
    expect(result.status).toBe("denied");
    expect(result.permissionBypassUsed).toBe(false);
  });

  it("forces fixture evaluate-all; binds identities; rejects path agents", async () => {
    expect(isRegisteredAgentName("A01")).toBe(true);
    expect(isRegisteredAgentName("/abs/A01.md")).toBe(false);

    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: false,
    });
    const results = await runner.evaluateAllRolesFixture();
    expect(results.every((r) => r.executionMode === "fixture")).toBe(true);

    const jobId = "22222222-2222-4222-8222-222222222222";
    const spoof = validateRoleStructuredOutput(
      {
        type: "result",
        result: JSON.stringify({
          roleId: "A15",
          jobId,
          status: "ok",
          summary: "nope",
          proposedEffects: [],
          taskRequests: [],
        }),
      },
      { expectedRoleId: "A01", expectedJobId: jobId },
    );
    expect(spoof.ok).toBe(false);
  });
});
