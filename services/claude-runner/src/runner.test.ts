import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import type { JobEnvelope } from "@worksocial/contracts";
import {
  AGENT_ROLE_IDS,
  RoleExecutionMode,
  RoleRunStatus,
  createBudgetAccount,
  validateRoleStructuredOutput,
} from "@worksocial/domain";
import {
  validateCliArgs,
  FORBIDDEN_CLI_FLAGS,
  isRegisteredAgentName,
  DEFAULT_LIVE_CLI_TOOLS,
} from "./cli-adapter.js";
import { createClaudeRunner } from "./runner.js";
import { runAllRoleFixtureEvaluations } from "./fixture-runner.js";
import { BoundedQueue } from "./queue.js";

function uuid(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function envelopeFor(roleId: string, overrides?: Partial<JobEnvelope>): JobEnvelope {
  return {
    jobId: uuid(),
    roleId,
    workflowId: `wf-${roleId}`,
    siteId: "worksocial",
    assetId: "asset-1",
    trigger: "unit_test",
    policyVersion: "r1-04",
    inputArtifactIds: ["in-1"],
    capabilityGrantId: "grant-fixture",
    sourceRevision: "rev-1",
    maxAttempts: 1,
    deadlineSeconds: 60,
    idempotencyKey: `unit/${roleId}/${uuid()}`,
    expectedOutcome: "fixture-ok",
    ...overrides,
  };
}

describe("claude-runner (R1-04)", () => {
  it("refuses permission-bypass flags", () => {
    for (const flag of FORBIDDEN_CLI_FLAGS) {
      expect(validateCliArgs([flag]).ok).toBe(false);
    }
    expect(validateCliArgs(["--print", "--output-format", "json"]).ok).toBe(true);
  });

  it("accepts only registered agent names, not paths", () => {
    expect(isRegisteredAgentName("A01")).toBe(true);
    expect(isRegisteredAgentName("/tmp/.claude/agents/A01.md")).toBe(false);
    expect(DEFAULT_LIVE_CLI_TOOLS).toBe("");
  });

  it("runs all 30 roles in fixture mode", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: true,
    });
    const results = await runner.evaluateAllRolesFixture();
    expect(results).toHaveLength(30);
    expect(results.map((r) => r.roleId).sort()).toEqual([...AGENT_ROLE_IDS].sort());
    for (const r of results) {
      expect(r.executionMode).toBe(RoleExecutionMode.FIXTURE);
      expect(r.permissionBypassUsed).toBe(false);
      expect(r.temporalEnqueue.status).toBe("NOT_WIRED");
      expect(r.startedAtIso.length).toBeGreaterThan(0);
      expect(r.finishedAtIso.length).toBeGreaterThan(0);
      expect(r.outcome.label === "SUCCESS" || r.outcome.label === "FAILURE").toBe(
        true,
      );
    }
  });

  it("evaluateAllRolesFixture forces fixture even when runner is live-capable", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: false,
    });
    const results = await runner.evaluateAllRolesFixture();
    expect(results.every((r) => r.executionMode === RoleExecutionMode.FIXTURE)).toBe(
      true,
    );
  });

  it("denies unauthorized effect attempts in fixture path", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: true,
    });
    const result = await runner.enqueue({
      envelope: envelopeFor("A13"),
      attemptUnauthorizedEffect: true,
    });
    expect(result.deniedEffects.length).toBeGreaterThan(0);
    expect(result.permissionBypassUsed).toBe(false);
  });

  it("denies self-approval attempts", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: true,
    });
    const result = await runner.enqueue({
      envelope: envelopeFor("A15"),
      attemptSelfApproval: true,
    });
    expect(result.deniedEffects.some((d) => d.code.includes("SELF"))).toBe(true);
    expect(result.status).toBe(RoleRunStatus.DENIED);
  });

  it("blocks uncontrolled recursion attempts", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: true,
    });
    const result = await runner.enqueue({
      envelope: envelopeFor("A01"),
      attemptUncontrolledRecursion: true,
    });
    expect(
      result.deniedDelegations.some((d) => d.code === "UNCONTROLLED_RECURSION"),
    ).toBe(true);
  });

  it("never enables permission bypass even when requested", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: true,
    });
    const result = await runner.enqueue({
      envelope: envelopeFor("A24"),
      requestPermissionBypass: true,
    });
    expect(result.permissionBypassUsed).toBe(false);
    expect(result.status).toBe(RoleRunStatus.DENIED);
  });

  it("reserves a concurrency lane for urgent P0/P1 work", async () => {
    const q = new BoundedQueue<number, number>({
      concurrency: 4,
      reservedUrgentSlots: 1,
      urgentMaxPriority: 1,
    });
    let maxNonUrgent = 0;
    let activeNonUrgent = 0;
    const slow = (n: number, priority: number) =>
      q.run({ id: String(n), priority, payload: n }, async (x) => {
        if (priority > 1) {
          activeNonUrgent += 1;
          maxNonUrgent = Math.max(maxNonUrgent, activeNonUrgent);
        }
        await new Promise((r) => setTimeout(r, 40));
        if (priority > 1) {
          activeNonUrgent -= 1;
        }
        return x;
      });

    const jobs = [
      slow(1, 4),
      slow(2, 4),
      slow(3, 4),
      slow(4, 4),
      slow(5, 0),
    ];
    await Promise.all(jobs);
    // Non-urgent cannot fill all 4 slots — reserved lane holds one.
    expect(maxNonUrgent).toBeLessThanOrEqual(3);
  });

  it("coalesces retries by idempotencyKey", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: true,
    });
    const key = `idem/${uuid()}`;
    const env = envelopeFor("A03", { idempotencyKey: key });
    const first = await runner.enqueue({ envelope: env });
    const second = await runner.enqueue({
      envelope: { ...env, jobId: uuid() },
    });
    expect(second.idempotentReplay).toBe(true);
    expect(second.runId).toBe(first.runId);
  });

  it("rolls daily budget when dayKey changes", async () => {
    const yesterday = createBudgetAccount({
      dayKey: "2020-01-01",
      currency: "USD",
      limitMinor: 50,
    });
    // Exhaust yesterday's account
    const { reserveBudget } = await import("@worksocial/domain");
    const exhausted = reserveBudget(yesterday, "old-res", 50);
    expect(exhausted.ok).toBe(true);

    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: true,
      budgetAccount: exhausted.ok ? exhausted.account : yesterday,
    });
    // getBudgetAccount rotates to today with fresh limit.
    const account = runner.getBudgetAccount();
    expect(account.dayKey).not.toBe("2020-01-01");
    expect(account.reservedMinor).toBe(0);
    expect(account.settledMinor).toBe(0);
  });

  it("enforces aggregate fanout across task list", async () => {
    const { validateTypedDelegation, getAgentRoleContract } = await import(
      "@worksocial/domain"
    );
    const max = getAgentRoleContract("A01").resourceLimits.maxDelegationFanout;
    let accepted = 0;
    let denied = 0;
    for (let i = 0; i < max + 2; i += 1) {
      const d = validateTypedDelegation(
        {
          requestId: `t-${i}`,
          fromRoleId: "A01",
          toRoleId: "A12",
          objective: "x",
          inputArtifactIds: [],
          parentDepth: 0,
        },
        { currentFanout: accepted },
      );
      if (d.ok) {
        accepted += 1;
      } else {
        denied += 1;
        expect(d.code).toBe("FANOUT_EXCEEDED");
      }
    }
    expect(accepted).toBe(max);
    expect(denied).toBe(2);
  });

  it("binds envelope identities and rejects Claude envelope mismatch", () => {
    const jobId = "11111111-1111-4111-8111-111111111111";
    const payload = {
      type: "result",
      result: JSON.stringify({
        roleId: "A15",
        jobId,
        status: "ok",
        summary: "spoofed",
        proposedEffects: [],
        taskRequests: [],
      }),
    };
    const validated = validateRoleStructuredOutput(payload, {
      expectedRoleId: "A01",
      expectedJobId: jobId,
    });
    expect(validated.ok).toBe(false);
  });

  it("runAllRoleFixtureEvaluations covers thirty roles", () => {
    const all = runAllRoleFixtureEvaluations((roleId) => envelopeFor(roleId));
    expect(all).toHaveLength(30);
  });
});
