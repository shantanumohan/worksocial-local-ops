import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import type { JobEnvelope } from "@worksocial/contracts";
import { AGENT_ROLE_IDS, RoleExecutionMode, RoleRunStatus } from "@worksocial/domain";
import { validateCliArgs, FORBIDDEN_CLI_FLAGS } from "./cli-adapter.js";
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

function envelopeFor(roleId: string): JobEnvelope {
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
  };
}

describe("claude-runner (R1-04)", () => {
  it("refuses permission-bypass flags", () => {
    for (const flag of FORBIDDEN_CLI_FLAGS) {
      expect(validateCliArgs([flag]).ok).toBe(false);
    }
    expect(validateCliArgs(["--print", "--output-format", "json"]).ok).toBe(true);
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
      expect(r.outcome.label === "SUCCESS" || r.outcome.label === "FAILURE").toBe(
        true,
      );
    }
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

  it("bounds queue concurrency", async () => {
    const q = new BoundedQueue<number, number>(2);
    let maxActive = 0;
    let active = 0;
    const jobs = [1, 2, 3, 4].map((n) =>
      q.run({ id: String(n), priority: n, payload: n }, async (x) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 30));
        active -= 1;
        return x;
      }),
    );
    const results = await Promise.all(jobs);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("runAllRoleFixtureEvaluations covers thirty roles", () => {
    const all = runAllRoleFixtureEvaluations((roleId) => envelopeFor(roleId));
    expect(all).toHaveLength(30);
  });
});
