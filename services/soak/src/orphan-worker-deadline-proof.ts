/**
 * Fixture proof for T-X012 — orphan worker on deadline → process tree stopped.
 *
 * Domain model: pre-deadline refuse; post-deadline worker+children stop;
 * foreign gen and same-gen out-of-tree siblings skipped.
 * Runtime: spawn a real fixture worker tree through invokeClaudeCli; on
 * timeout the adapter SIGKILLs the process group; verify descendants are gone.
 * Outcome timed_out_stopped — never live VERIFIED. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RoleRunStatus,
  SoakProofKind,
  alivePids,
  createWorkerProcessTree,
  stopProcessTreeOnDeadline,
  workerDeadlineExceeded,
  type SoakProofRecord,
} from "@worksocial/domain";
import { invokeClaudeCli } from "@worksocial/claude-runner";

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return predicate();
}

/**
 * Complete expected proof set for T-X012 fixture ACCEPTED.
 */
export async function proofOrphanWorkerDeadlineTreeStopped(
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  let passed = true;
  const startedAtMs = Date.parse(nowIso);
  const generationId = `gen-x012-${randomUUID().slice(0, 8)}`;
  const workDir = mkdtempSync(join(tmpdir(), "ws-orphan-worker-"));

  try {
    const tree = createWorkerProcessTree({
      generationId,
      startedAtMs,
      deadlineSeconds: 45,
      workerPid: 4100,
      childPids: [4101, 4102],
    });

    // 1. Before deadline — refuse stop; tree remains alive.
    const beforeMs = startedAtMs + 20_000;
    if (workerDeadlineExceeded(tree, beforeMs) !== false) {
      passed = false;
      details.push("Expected deadline not exceeded at +20s");
    } else {
      details.push("Deadline not exceeded at +20s");
    }

    const early = stopProcessTreeOnDeadline(tree, beforeMs);
    if (
      early.ok === false &&
      early.code === "DEADLINE_NOT_EXCEEDED" &&
      alivePids(early.tree).length === 3
    ) {
      details.push(
        "Pre-deadline stop refused; worker+children still alive (no premature kill)",
      );
    } else {
      passed = false;
      details.push(`Pre-deadline stop unexpectedly ${JSON.stringify(early)}`);
    }

    // 2. After deadline — stop owned tree only (skip foreign + same-gen sibling).
    const afterMs = startedAtMs + 46_000;
    const stopped = stopProcessTreeOnDeadline(tree, afterMs, {
      extraNodes: [
        {
          pid: 9999,
          parentPid: null,
          kind: "worker",
          generationId: "gen-foreign",
          alive: true,
        },
        {
          pid: 4200,
          parentPid: null,
          kind: "worker",
          generationId,
          alive: true,
        },
      ],
    });

    if (
      stopped.ok &&
      stopped.code === "PROCESS_TREE_STOPPED" &&
      stopped.stoppedPids.slice().sort((a, b) => a - b).join(",") ===
        "4100,4101,4102" &&
      alivePids(stopped.tree).length === 0 &&
      stopped.tree.outcome === "timed_out_stopped" &&
      stopped.skippedPids.slice().sort((a, b) => a - b).join(",") ===
        "4200,9999"
    ) {
      details.push(
        "Post-deadline PROCESS_TREE_STOPPED: tree dead; foreign+sibling skipped",
      );
    } else {
      passed = false;
      details.push(`Post-deadline stop unexpectedly ${JSON.stringify(stopped)}`);
    }

    // 3. Real OS process tree via invokeClaudeCli (detached group leader).
    const pidFile = join(workDir, "tree-pids.json");
    const treeScript = join(workDir, "tree-worker.mjs");
    writeFileSync(
      treeScript,
      [
        "#!/usr/bin/env node",
        "import { spawn } from 'node:child_process';",
        "import { writeFileSync } from 'node:fs';",
        `const pidFile = ${JSON.stringify(pidFile)};`,
        "const child = spawn(process.execPath, ['-e', 'setInterval(()=>{}, 1000)'], {",
        "  stdio: 'ignore',",
        "  detached: false,",
        "});",
        "writeFileSync(pidFile, JSON.stringify({ workerPid: process.pid, childPid: child.pid }));",
        "process.stdout.write('tree-ready\\n');",
        "setInterval(() => {}, 1000);",
        "",
      ].join("\n"),
      "utf8",
    );
    chmodSync(treeScript, 0o755);

    const invoke = await invokeClaudeCli({
      executablePath: treeScript,
      agentName: "A01",
      cwd: workDir,
      modelId: "fixture-model",
      prompt: "orphan-worker-deadline",
      timeoutMs: 400,
      maxOutputBytes: 64_000,
    });

    if (!invoke.ok && invoke.code === "TIMEOUT") {
      details.push("invokeClaudeCli tree-worker → TIMEOUT (deadline)");
    } else {
      passed = false;
      details.push(`Tree invoke unexpectedly ${JSON.stringify(invoke)}`);
    }

    const pidsReady = await waitUntil(() => existsSync(pidFile), 2_000);
    if (!pidsReady) {
      passed = false;
      details.push("tree-pids.json never written");
    } else {
      const pids = JSON.parse(readFileSync(pidFile, "utf8")) as {
        workerPid: number;
        childPid: number;
      };
      const dead = await waitUntil(
        () => !isAlive(pids.workerPid) && !isAlive(pids.childPid),
        3_000,
      );
      if (dead) {
        details.push(
          `OS process tree stopped worker=${pids.workerPid} child=${pids.childPid}`,
        );
      } else {
        passed = false;
        details.push(
          `Orphan remained workerAlive=${isAlive(pids.workerPid)} childAlive=${isAlive(pids.childPid)}`,
        );
        // Best-effort cleanup so CI hosts are not left with sleepers.
        for (const pid of [pids.childPid, pids.workerPid]) {
          try {
            process.kill(-pid, "SIGKILL");
          } catch {
            try {
              process.kill(pid, "SIGKILL");
            } catch {
              /* gone */
            }
          }
        }
      }
    }

    if (RoleRunStatus.TIMED_OUT === "timed_out") {
      details.push(
        "Outcome timed_out_stopped aligns with RoleRunStatus.TIMED_OUT (not VERIFIED)",
      );
    } else {
      passed = false;
      details.push("RoleRunStatus.TIMED_OUT constant drifted");
    }

    details.push("liveProviderSuccessClaimed=false externalEffects=NONE");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  return {
    proofId: `proof-orphan-worker-deadline-${randomUUID()}`,
    kind: SoakProofKind.ORPHAN_WORKER_DEADLINE_TREE_STOPPED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-x012-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
