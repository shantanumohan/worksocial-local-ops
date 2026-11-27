/**
 * Fixture proof for T-X012 — orphan worker on deadline → process tree stopped.
 *
 * Domain model: pre-deadline refuse; post-deadline worker+children stop;
 * foreign gen and same-gen out-of-tree siblings skipped.
 * Runtime: spawn a real fixture worker tree through invokeClaudeCli; on
 * timeout the adapter SIGKILLs the process group; verify descendants are gone.
 * Outcome timed_out_stopped — never live VERIFIED. External effects: NONE.
 * Additive hillclimb: honesty fields; inclusive exact-boundary stop;
 * domain + OS grandchild stop; fixture+WIRED refuse; ACCEPTED≠VERIFIED trailer.
 * B10 Codex harden: non-finite nowMs → INVALID_CLOCK; idempotent re-stop
 * invents no second kill wave.
 * B12: clock-skew nowMs < startedAtMs refuse; non-finite startedAtMs INVALID_CLOCK.
 * B14: duplicate PIDs refused on create; worker-dead still stops orphan children.
 * B15: non-finite deadlineSeconds INVALID_CLOCK; nowMs===startedAtMs refuse kill.
 * B16: non-positive deadlineSeconds INVALID_CLOCK; partial timed_out_stopped clears orphans.
 * B17: blank generationId → GENERATION_REQUIRED; foreign parentPid-sharing extra skipped.
 * B18: missing worker root → TREE_REQUIRED; duplicate-PID extras ignored (no double-stop).
 * B19: invalid-PID extras dropped; parentPid-cycle extras skipped (no invented kill).
 * A1 idle / A2 wipe15: corrupt ±Infinity deadlineSeconds → INVALID_CLOCK;
 * worker+children untouched (3 alive in proof tree).
 * A3 wipe15 retrain: idempotent repeat +Infinity INVALID_CLOCK on 3-node tree.
 * A4 wipe15 train: idempotent repeat -Infinity INVALID_CLOCK on 3-node tree.
 * A5 wipe15 train: triple repeat +Infinity INVALID_CLOCK on 3-node tree.
 * A6 wipe15 train: triple repeat -Infinity INVALID_CLOCK on 3-node tree.
 * A7 wipe15 train: ±Infinity on proof tree both INVALID_CLOCK (3 alive).
 * A8 wipe15 train: corrupt ±Infinity startedAtMs → INVALID_CLOCK (3 alive).
 * A9 wipe15 train: triple repeat +Infinity startedAtMs INVALID_CLOCK on 3-node tree.
 * A10 wipe15 train: triple repeat -Infinity startedAtMs INVALID_CLOCK on 3-node tree.
 * A11 wipe15 train: double repeat +Infinity startedAtMs INVALID_CLOCK on 3-node tree.
 * A12 wipe15 train: double repeat -Infinity startedAtMs INVALID_CLOCK on 3-node tree.
 * A13 wipe15 train: ±Infinity startedAtMs on single-child tree INVALID_CLOCK (2 alive).
 * A14 wipe15 train: compound ±∞ deadlineSeconds+startedAtMs INVALID_CLOCK (3-node).
 * A15 tip-moved-272 train: mixed ±∞ deadline vs startedAtMs INVALID_CLOCK (3-node).
 * A16 tip-moved-273 train: repeat mixed ±∞ clocks INVALID_CLOCK idempotent (3-node).
 * A17 wipe15 timer train: repeat -∞ deadline + +∞ startedAt INVALID_CLOCK idempotent.
 * A18 tip-moved-274 train: triple repeat mixed ±∞ clocks INVALID_CLOCK (3-node).
 * A19 tip-moved-275 train: triple -∞ deadline + +∞ startedAt INVALID_CLOCK (3-node).
 */

import { spawn } from "node:child_process";
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
import {
  invokeClaudeCli,
  stopProcessTree,
} from "@worksocial/claude-runner";

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
    // Tight poll — soak harness vitest budget is 5s for the full proof set.
    await new Promise((r) => setTimeout(r, 5));
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
      alivePids(early.tree).length === 3 &&
      early.externalEffects === "NONE" &&
      early.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Pre-deadline stop refused; worker+children still alive (no premature kill); honesty externalEffects=NONE liveProviderWiring=NOT_WIRED",
      );
    } else {
      passed = false;
      details.push(`Pre-deadline stop unexpectedly ${JSON.stringify(early)}`);
    }

    const atBoundary = stopProcessTreeOnDeadline(
      tree,
      startedAtMs + 45_000,
    );
    if (
      atBoundary.ok &&
      atBoundary.code === "PROCESS_TREE_STOPPED" &&
      alivePids(atBoundary.tree).length === 0 &&
      atBoundary.tree.outcome === "timed_out_stopped" &&
      atBoundary.externalEffects === "NONE"
    ) {
      details.push(
        "Exact deadline boundary inclusive expiry → PROCESS_TREE_STOPPED (watchdog at deadline cannot leave orphans)",
      );
    } else {
      passed = false;
      details.push(
        `Exact-boundary stop unexpectedly ${JSON.stringify(atBoundary)}`,
      );
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
        "4200,9999" &&
      stopped.externalEffects === "NONE" &&
      stopped.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Post-deadline PROCESS_TREE_STOPPED: tree dead; foreign+sibling skipped; honesty NOT_WIRED/NONE",
      );
    } else {
      passed = false;
      details.push(`Post-deadline stop unexpectedly ${JSON.stringify(stopped)}`);
    }

    const withGrandchild = {
      ...tree,
      nodes: [
        ...tree.nodes,
        {
          pid: 4103,
          parentPid: 4101,
          kind: "child" as const,
          generationId,
          alive: true,
        },
      ],
    };
    const grandchildStopped = stopProcessTreeOnDeadline(
      withGrandchild,
      afterMs,
    );
    if (
      grandchildStopped.ok &&
      grandchildStopped.stoppedPids.slice().sort((a, b) => a - b).join(",") ===
        "4100,4101,4102,4103" &&
      alivePids(grandchildStopped.tree).length === 0
    ) {
      details.push(
        "Transitive grandchild via parentPid chain stopped (no orphans)",
      );
    } else {
      passed = false;
      details.push(
        `Grandchild stop unexpectedly ${JSON.stringify(grandchildStopped)}`,
      );
    }

    const wiredRefuse = stopProcessTreeOnDeadline(tree, afterMs, {
      liveProviderWiring: "WIRED",
    });
    if (
      wiredRefuse.ok === false &&
      wiredRefuse.code === "LIVE_TRANSPORT_NOT_WIRED" &&
      alivePids(wiredRefuse.tree).length === 3 &&
      wiredRefuse.tree.outcome === "running" &&
      wiredRefuse.externalEffects === "NONE" &&
      wiredRefuse.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Fixture+WIRED refuse LIVE_TRANSPORT_NOT_WIRED; tree untouched; no invented live host kill",
      );
    } else {
      passed = false;
      details.push(`WIRED refuse unexpectedly ${JSON.stringify(wiredRefuse)}`);
    }

    // B10: non-finite clock refuse inventing expiry/kill.
    const badClock = stopProcessTreeOnDeadline(tree, Number.NaN);
    if (
      badClock.ok === false &&
      badClock.code === "INVALID_CLOCK" &&
      alivePids(badClock.tree).length === 3 &&
      badClock.externalEffects === "NONE" &&
      badClock.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Non-finite nowMs → INVALID_CLOCK; tree untouched; no invented expiry or host kill (B10)",
      );
    } else {
      passed = false;
      details.push(`INVALID_CLOCK unexpectedly ${JSON.stringify(badClock)}`);
    }

    // B12: clock skew refuse inventing kill.
    const skewed = stopProcessTreeOnDeadline(tree, startedAtMs - 1);
    if (
      skewed.ok === false &&
      skewed.code === "DEADLINE_NOT_EXCEEDED" &&
      typeof skewed.reason === "string" &&
      /clock skew/i.test(skewed.reason) &&
      alivePids(skewed.tree).length === 3 &&
      skewed.externalEffects === "NONE" &&
      skewed.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Clock-skew nowMs < startedAtMs → DEADLINE_NOT_EXCEEDED; no invented kill (B12)",
      );
    } else {
      passed = false;
      details.push(`Clock-skew unexpectedly ${JSON.stringify(skewed)}`);
    }

    const badStart = stopProcessTreeOnDeadline(
      { ...tree, startedAtMs: Number.NaN },
      afterMs,
    );
    if (
      badStart.ok === false &&
      badStart.code === "INVALID_CLOCK" &&
      alivePids(badStart.tree).length === 3 &&
      badStart.externalEffects === "NONE"
    ) {
      details.push(
        "Non-finite startedAtMs → INVALID_CLOCK; tree untouched (B12)",
      );
    } else {
      passed = false;
      details.push(
        `Non-finite startedAtMs unexpectedly ${JSON.stringify(badStart)}`,
      );
    }

    // B14: duplicate PIDs refuse inventing ambiguous stop targets.
    let duplicateRefused = false;
    try {
      createWorkerProcessTree({
        generationId,
        startedAtMs,
        deadlineSeconds: 45,
        workerPid: 4100,
        childPids: [4100],
      });
    } catch (err) {
      duplicateRefused =
        err instanceof Error && /duplicate pid/i.test(err.message);
    }
    if (duplicateRefused) {
      details.push(
        "Duplicate PID on create refused — no invented ambiguous stop targets (B14)",
      );
    } else {
      passed = false;
      details.push("Duplicate PID create unexpectedly allowed");
    }

    // B14: worker already dead → still stop alive orphan children.
    const workerDeadTree = {
      ...tree,
      nodes: tree.nodes.map((n) =>
        n.pid === 4100 ? { ...n, alive: false } : n,
      ),
    };
    const orphanClear = stopProcessTreeOnDeadline(workerDeadTree, afterMs);
    if (
      orphanClear.ok &&
      orphanClear.code === "PROCESS_TREE_STOPPED" &&
      orphanClear.stoppedPids.slice().sort((a, b) => a - b).join(",") ===
        "4101,4102" &&
      alivePids(orphanClear.tree).length === 0 &&
      orphanClear.externalEffects === "NONE" &&
      orphanClear.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Worker already dead past deadline → orphan children stopped (B14)",
      );
    } else {
      passed = false;
      details.push(
        `Worker-dead orphan clear unexpectedly ${JSON.stringify(orphanClear)}`,
      );
    }

    // B15: non-finite deadlineSeconds refuse; exact start instant refuse.
    const badDeadline = stopProcessTreeOnDeadline(
      { ...tree, deadlineSeconds: Number.NaN },
      afterMs,
    );
    if (
      badDeadline.ok === false &&
      badDeadline.code === "INVALID_CLOCK" &&
      alivePids(badDeadline.tree).length === 3 &&
      badDeadline.externalEffects === "NONE"
    ) {
      details.push(
        "Non-finite deadlineSeconds → INVALID_CLOCK; no invented expiry (B15)",
      );
    } else {
      passed = false;
      details.push(
        `Non-finite deadline unexpectedly ${JSON.stringify(badDeadline)}`,
      );
    }

    const atStart = stopProcessTreeOnDeadline(tree, startedAtMs);
    if (
      atStart.ok === false &&
      atStart.code === "DEADLINE_NOT_EXCEEDED" &&
      atStart.remainingMs === 45_000 &&
      typeof atStart.reason === "string" &&
      /start instant/i.test(atStart.reason) &&
      alivePids(atStart.tree).length === 3
    ) {
      details.push(
        "nowMs === startedAtMs → DEADLINE_NOT_EXCEEDED; no invented kill at start (B15)",
      );
    } else {
      passed = false;
      details.push(`Start-instant unexpectedly ${JSON.stringify(atStart)}`);
    }

    // B16: non-positive deadlineSeconds refuse; partial timed_out_stopped clears orphans.
    const zeroDeadline = stopProcessTreeOnDeadline(
      { ...tree, deadlineSeconds: 0 },
      afterMs,
    );
    if (
      zeroDeadline.ok === false &&
      zeroDeadline.code === "INVALID_CLOCK" &&
      alivePids(zeroDeadline.tree).length === 3
    ) {
      details.push(
        "Non-positive deadlineSeconds → INVALID_CLOCK; no invented expiry (B16)",
      );
    } else {
      passed = false;
      details.push(
        `Non-positive deadline unexpectedly ${JSON.stringify(zeroDeadline)}`,
      );
    }

    const partialTimedOut = {
      ...tree,
      outcome: "timed_out_stopped" as const,
      nodes: tree.nodes.map((n) =>
        n.pid === 4100 ? { ...n, alive: false } : n,
      ),
    };
    const partialClear = stopProcessTreeOnDeadline(partialTimedOut, afterMs);
    if (
      partialClear.ok &&
      partialClear.stoppedPids.slice().sort((a, b) => a - b).join(",") ===
        "4101,4102" &&
      alivePids(partialClear.tree).length === 0 &&
      partialClear.externalEffects === "NONE"
    ) {
      details.push(
        "Partial timed_out_stopped with alive orphans → children cleared (B16)",
      );
    } else {
      passed = false;
      details.push(
        `Partial timed_out_stopped unexpectedly ${JSON.stringify(partialClear)}`,
      );
    }

    // B17: blank generationId refuse; foreign extra sharing parentPid skipped.
    const blankGen = stopProcessTreeOnDeadline(
      { ...tree, generationId: "  " },
      afterMs,
    );
    if (
      blankGen.ok === false &&
      blankGen.code === "GENERATION_REQUIRED" &&
      alivePids(blankGen.tree).length === 3 &&
      blankGen.externalEffects === "NONE"
    ) {
      details.push(
        "Blank generationId → GENERATION_REQUIRED; no invented ownership/kill (B17)",
      );
    } else {
      passed = false;
      details.push(
        `Blank generation unexpectedly ${JSON.stringify(blankGen)}`,
      );
    }

    const foreignChild = stopProcessTreeOnDeadline(tree, afterMs, {
      extraNodes: [
        {
          pid: 7777,
          parentPid: 4100,
          kind: "child",
          generationId: "gen-foreign",
          alive: true,
        },
      ],
    });
    if (
      foreignChild.ok &&
      foreignChild.stoppedPids.slice().sort((a, b) => a - b).join(",") ===
        "4100,4101,4102" &&
      foreignChild.skippedPids.includes(7777) &&
      alivePids(foreignChild.tree).length === 0
    ) {
      details.push(
        "Foreign extra sharing worker parentPid skipped; owned tree stopped (B17)",
      );
    } else {
      passed = false;
      details.push(
        `Foreign parentPid-sharing unexpectedly ${JSON.stringify(foreignChild)}`,
      );
    }

    // B18: missing worker root refuse; duplicate-PID extras ignored.
    const noRoot = stopProcessTreeOnDeadline(
      { ...tree, nodes: tree.nodes.filter((n) => n.kind !== "worker") },
      afterMs,
    );
    if (
      noRoot.ok === false &&
      noRoot.code === "TREE_REQUIRED" &&
      alivePids(noRoot.tree).length === 2 &&
      noRoot.externalEffects === "NONE"
    ) {
      details.push(
        "Missing worker root → TREE_REQUIRED; no invented stop targets (B18)",
      );
    } else {
      passed = false;
      details.push(`Missing root unexpectedly ${JSON.stringify(noRoot)}`);
    }

    const dupExtra = stopProcessTreeOnDeadline(tree, afterMs, {
      extraNodes: [
        {
          pid: 4100,
          parentPid: null,
          kind: "worker",
          generationId,
          alive: true,
        },
        {
          pid: 8888,
          parentPid: null,
          kind: "worker",
          generationId: "gen-foreign",
          alive: true,
        },
      ],
    });
    if (
      dupExtra.ok &&
      dupExtra.stoppedPids.slice().sort((a, b) => a - b).join(",") ===
        "4100,4101,4102" &&
      dupExtra.stoppedPids.filter((p) => p === 4100).length === 1 &&
      dupExtra.skippedPids.includes(8888) &&
      alivePids(dupExtra.tree).length === 0
    ) {
      details.push(
        "Duplicate-PID extras ignored; foreign extra skipped; owned tree stopped once (B18)",
      );
    } else {
      passed = false;
      details.push(
        `Duplicate-PID extras unexpectedly ${JSON.stringify(dupExtra)}`,
      );
    }

    // B19: invalid-PID extras ignored; parentPid cycle extras skipped (no kill).
    const invalidExtras = stopProcessTreeOnDeadline(tree, afterMs, {
      extraNodes: [
        {
          pid: 0,
          parentPid: null,
          kind: "worker",
          generationId,
          alive: true,
        },
        {
          pid: 777,
          parentPid: 778,
          kind: "child",
          generationId,
          alive: true,
        },
        {
          pid: 778,
          parentPid: 777,
          kind: "child",
          generationId,
          alive: true,
        },
      ],
    });
    if (
      invalidExtras.ok &&
      invalidExtras.stoppedPids.slice().sort((a, b) => a - b).join(",") ===
        "4100,4101,4102" &&
      invalidExtras.skippedPids.slice().sort((a, b) => a - b).join(",") ===
        "777,778" &&
      alivePids(invalidExtras.tree).length === 0
    ) {
      details.push(
        "Invalid-PID extras dropped; parentPid cycle skipped — owned tree stopped (B19)",
      );
    } else {
      passed = false;
      details.push(
        `Invalid/cycle extras unexpectedly ${JSON.stringify(invalidExtras)}`,
      );
    }

    const emptyTree = stopProcessTreeOnDeadline(
      {
        generationId,
        startedAtMs: tree.startedAtMs,
        deadlineSeconds: tree.deadlineSeconds,
        nodes: [],
        outcome: "running",
      },
      afterMs,
    );
    if (
      emptyTree.ok === false &&
      emptyTree.code === "TREE_REQUIRED" &&
      emptyTree.externalEffects === "NONE"
    ) {
      details.push("Empty process tree → TREE_REQUIRED; no invented stop (B20)");
    } else {
      passed = false;
      details.push(`Empty tree unexpectedly ${JSON.stringify(emptyTree)}`);
    }

    const negInfDeadline = stopProcessTreeOnDeadline(
      { ...tree, deadlineSeconds: Number.NEGATIVE_INFINITY },
      afterMs,
    );
    const posInfDeadline = stopProcessTreeOnDeadline(
      { ...tree, deadlineSeconds: Number.POSITIVE_INFINITY },
      afterMs,
    );
    if (
      negInfDeadline.ok === false &&
      negInfDeadline.code === "INVALID_CLOCK" &&
      negInfDeadline.externalEffects === "NONE" &&
      posInfDeadline.ok === false &&
      posInfDeadline.code === "INVALID_CLOCK" &&
      alivePids(posInfDeadline.tree).length === 3 &&
      alivePids(negInfDeadline.tree).length === 3 &&
      posInfDeadline.tree.outcome === "running" &&
      posInfDeadline.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Corrupt ±Infinity deadlineSeconds → INVALID_CLOCK; worker+2 children still running (A1/A2 wipe15)",
      );
    } else {
      passed = false;
      details.push(
        `Corrupt ±Infinity deadline unexpectedly neg=${JSON.stringify(negInfDeadline)} pos=${JSON.stringify(posInfDeadline)}`,
      );
    }

    const posInfRepeat = stopProcessTreeOnDeadline(posInfDeadline.tree, afterMs);
    const negInfRepeat = stopProcessTreeOnDeadline(negInfDeadline.tree, afterMs);
    if (
      posInfDeadline.ok === false &&
      posInfRepeat.ok === false &&
      posInfRepeat.code === "INVALID_CLOCK" &&
      alivePids(posInfRepeat.tree).length === 3 &&
      posInfRepeat.tree.outcome === "running" &&
      posInfRepeat.externalEffects === "NONE"
    ) {
      details.push(
        "A3 wipe15 retrain: repeat +Infinity INVALID_CLOCK idempotent (worker+2 children running)",
      );
    } else {
      passed = false;
      details.push(
        `A3 +Infinity repeat unexpectedly ${JSON.stringify(posInfRepeat)}`,
      );
    }
    if (
      negInfDeadline.ok === false &&
      negInfRepeat.ok === false &&
      negInfRepeat.code === "INVALID_CLOCK" &&
      alivePids(negInfRepeat.tree).length === 3 &&
      negInfRepeat.tree.outcome === "running" &&
      negInfRepeat.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "A4 wipe15 train: repeat -Infinity INVALID_CLOCK idempotent (worker+2 children running)",
      );
    } else {
      passed = false;
      details.push(
        `A4 -Infinity repeat unexpectedly ${JSON.stringify(negInfRepeat)}`,
      );
    }
    const posInfTriple2 = stopProcessTreeOnDeadline(posInfRepeat.tree, afterMs);
    const posInfTriple3 = stopProcessTreeOnDeadline(
      posInfTriple2.ok === false ? posInfTriple2.tree : posInfDeadline.tree,
      afterMs + 1,
    );
    if (
      posInfRepeat.ok === false &&
      posInfTriple2.ok === false &&
      posInfTriple3.ok === false &&
      posInfTriple3.code === "INVALID_CLOCK" &&
      alivePids(posInfTriple3.tree).length === 3 &&
      posInfTriple3.tree.outcome === "running"
    ) {
      details.push(
        "A5 wipe15 train: triple +Infinity INVALID_CLOCK idempotent (worker+2 children running)",
      );
    } else {
      passed = false;
      details.push(
        `A5 +Infinity triple repeat unexpectedly ${JSON.stringify({ posInfTriple2, posInfTriple3 })}`,
      );
    }
    const negInfTriple2 = stopProcessTreeOnDeadline(negInfRepeat.tree, afterMs);
    const negInfTriple3 = stopProcessTreeOnDeadline(
      negInfTriple2.ok === false ? negInfTriple2.tree : negInfDeadline.tree,
      afterMs + 1,
    );
    if (
      negInfRepeat.ok === false &&
      negInfTriple2.ok === false &&
      negInfTriple3.ok === false &&
      negInfTriple3.code === "INVALID_CLOCK" &&
      alivePids(negInfTriple3.tree).length === 3 &&
      negInfTriple3.externalEffects === "NONE"
    ) {
      details.push(
        "A6 wipe15 train: triple -Infinity INVALID_CLOCK idempotent (worker+2 children running)",
      );
    } else {
      passed = false;
      details.push(
        `A6 -Infinity triple repeat unexpectedly ${JSON.stringify({ negInfTriple2, negInfTriple3 })}`,
      );
    }
    if (
      negInfDeadline.ok === false &&
      posInfDeadline.ok === false &&
      negInfDeadline.code === "INVALID_CLOCK" &&
      posInfDeadline.code === "INVALID_CLOCK" &&
      alivePids(negInfDeadline.tree).length === 3 &&
      alivePids(posInfDeadline.tree).length === 3
    ) {
      details.push(
        "A7 wipe15 train: ±Infinity pair INVALID_CLOCK on same 3-node tree (no invented stop)",
      );
    } else {
      passed = false;
      details.push(
        `A7 ±Infinity pair unexpectedly neg=${JSON.stringify(negInfDeadline)} pos=${JSON.stringify(posInfDeadline)}`,
      );
    }
    const posInfStartedAt = stopProcessTreeOnDeadline(
      { ...tree, startedAtMs: Number.POSITIVE_INFINITY },
      afterMs,
    );
    const negInfStartedAt = stopProcessTreeOnDeadline(
      { ...tree, startedAtMs: Number.NEGATIVE_INFINITY },
      afterMs,
    );
    if (
      posInfStartedAt.ok === false &&
      negInfStartedAt.ok === false &&
      posInfStartedAt.code === "INVALID_CLOCK" &&
      negInfStartedAt.code === "INVALID_CLOCK" &&
      alivePids(posInfStartedAt.tree).length === 3 &&
      alivePids(negInfStartedAt.tree).length === 3
    ) {
      details.push(
        "A8 wipe15 train: corrupt ±Infinity startedAtMs INVALID_CLOCK (worker+2 children running)",
      );
    } else {
      passed = false;
      details.push(
        `A8 ±Infinity startedAtMs unexpectedly pos=${JSON.stringify(posInfStartedAt)} neg=${JSON.stringify(negInfStartedAt)}`,
      );
    }
    const posInfStartedTriple2 = stopProcessTreeOnDeadline(posInfStartedAt.tree, afterMs);
    const posInfStartedTriple3 = stopProcessTreeOnDeadline(
      posInfStartedTriple2.ok === false ? posInfStartedTriple2.tree : tree,
      afterMs + 1,
    );
    if (
      posInfStartedAt.ok === false &&
      posInfStartedTriple2.ok === false &&
      posInfStartedTriple3.ok === false &&
      posInfStartedTriple3.code === "INVALID_CLOCK" &&
      alivePids(posInfStartedTriple3.tree).length === 3 &&
      posInfStartedTriple3.tree.outcome === "running"
    ) {
      details.push(
        "A9 wipe15 train: triple +Infinity startedAtMs INVALID_CLOCK idempotent (worker+2 children running)",
      );
    } else {
      passed = false;
      details.push(
        `A9 +Infinity startedAtMs triple unexpectedly ${JSON.stringify({ posInfStartedTriple2, posInfStartedTriple3 })}`,
      );
    }
    const negInfStartedTriple2 = stopProcessTreeOnDeadline(negInfStartedAt.tree, afterMs);
    const negInfStartedTriple3 = stopProcessTreeOnDeadline(
      negInfStartedTriple2.ok === false ? negInfStartedTriple2.tree : tree,
      afterMs + 1,
    );
    if (
      negInfStartedAt.ok === false &&
      negInfStartedTriple2.ok === false &&
      negInfStartedTriple3.ok === false &&
      negInfStartedTriple3.code === "INVALID_CLOCK" &&
      alivePids(negInfStartedTriple3.tree).length === 3 &&
      negInfStartedTriple3.externalEffects === "NONE"
    ) {
      details.push(
        "A10 wipe15 train: triple -Infinity startedAtMs INVALID_CLOCK idempotent (worker+2 children running)",
      );
    } else {
      passed = false;
      details.push(
        `A10 -Infinity startedAtMs triple unexpectedly ${JSON.stringify({ negInfStartedTriple2, negInfStartedTriple3 })}`,
      );
    }
    const posInfStartedRepeat = stopProcessTreeOnDeadline(posInfStartedAt.tree, afterMs);
    const negInfStartedRepeat = stopProcessTreeOnDeadline(negInfStartedAt.tree, afterMs);
    if (
      posInfStartedAt.ok === false &&
      posInfStartedRepeat.ok === false &&
      posInfStartedRepeat.code === "INVALID_CLOCK" &&
      alivePids(posInfStartedRepeat.tree).length === 3 &&
      posInfStartedRepeat.tree.outcome === "running" &&
      posInfStartedRepeat.externalEffects === "NONE"
    ) {
      details.push(
        "A11 wipe15 train: repeat +Infinity startedAtMs INVALID_CLOCK idempotent (worker+2 children running)",
      );
    } else {
      passed = false;
      details.push(
        `A11 +Infinity startedAtMs repeat unexpectedly ${JSON.stringify(posInfStartedRepeat)}`,
      );
    }
    if (
      negInfStartedAt.ok === false &&
      negInfStartedRepeat.ok === false &&
      negInfStartedRepeat.code === "INVALID_CLOCK" &&
      alivePids(negInfStartedRepeat.tree).length === 3 &&
      negInfStartedRepeat.tree.outcome === "running" &&
      negInfStartedRepeat.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "A12 wipe15 train: repeat -Infinity startedAtMs INVALID_CLOCK idempotent (worker+2 children running)",
      );
    } else {
      passed = false;
      details.push(
        `A12 -Infinity startedAtMs repeat unexpectedly ${JSON.stringify(negInfStartedRepeat)}`,
      );
    }
    const singleChild = createWorkerProcessTree({
      generationId: tree.generationId,
      startedAtMs: tree.startedAtMs,
      deadlineSeconds: tree.deadlineSeconds,
      workerPid: 4100,
      childPids: [4101],
    });
    const posInfStartedSingle = stopProcessTreeOnDeadline(
      { ...singleChild, startedAtMs: Number.POSITIVE_INFINITY },
      afterMs,
    );
    const negInfStartedSingle = stopProcessTreeOnDeadline(
      { ...singleChild, startedAtMs: Number.NEGATIVE_INFINITY },
      afterMs,
    );
    if (
      posInfStartedSingle.ok === false &&
      negInfStartedSingle.ok === false &&
      posInfStartedSingle.code === "INVALID_CLOCK" &&
      negInfStartedSingle.code === "INVALID_CLOCK" &&
      alivePids(posInfStartedSingle.tree).length === 2 &&
      alivePids(negInfStartedSingle.tree).length === 2
    ) {
      details.push(
        "A13 wipe15 train: ±Infinity startedAtMs INVALID_CLOCK on single-child tree (worker+1 running)",
      );
    } else {
      passed = false;
      details.push(
        `A13 ±Infinity startedAtMs single-child unexpectedly pos=${JSON.stringify(posInfStartedSingle)} neg=${JSON.stringify(negInfStartedSingle)}`,
      );
    }
    const compoundPos = stopProcessTreeOnDeadline(
      {
        ...tree,
        deadlineSeconds: Number.POSITIVE_INFINITY,
        startedAtMs: Number.POSITIVE_INFINITY,
      },
      afterMs,
    );
    const compoundNeg = stopProcessTreeOnDeadline(
      {
        ...tree,
        deadlineSeconds: Number.NEGATIVE_INFINITY,
        startedAtMs: Number.NEGATIVE_INFINITY,
      },
      afterMs,
    );
    if (
      compoundPos.ok === false &&
      compoundNeg.ok === false &&
      compoundPos.code === "INVALID_CLOCK" &&
      compoundNeg.code === "INVALID_CLOCK" &&
      alivePids(compoundPos.tree).length === 3 &&
      alivePids(compoundNeg.tree).length === 3
    ) {
      details.push(
        "A14 wipe15 train: compound ±Infinity deadline+startedAtMs INVALID_CLOCK (worker+2 children running)",
      );
    } else {
      passed = false;
      details.push(
        `A14 compound ±Infinity unexpectedly pos=${JSON.stringify(compoundPos)} neg=${JSON.stringify(compoundNeg)}`,
      );
    }
    const mixedPosNeg = stopProcessTreeOnDeadline(
      {
        ...tree,
        deadlineSeconds: Number.POSITIVE_INFINITY,
        startedAtMs: Number.NEGATIVE_INFINITY,
      },
      afterMs,
    );
    const mixedNegPos = stopProcessTreeOnDeadline(
      {
        ...tree,
        deadlineSeconds: Number.NEGATIVE_INFINITY,
        startedAtMs: Number.POSITIVE_INFINITY,
      },
      afterMs,
    );
    if (
      mixedPosNeg.ok === false &&
      mixedNegPos.ok === false &&
      mixedPosNeg.code === "INVALID_CLOCK" &&
      mixedNegPos.code === "INVALID_CLOCK" &&
      alivePids(mixedPosNeg.tree).length === 3 &&
      alivePids(mixedNegPos.tree).length === 3
    ) {
      details.push(
        "A15 tip-moved-272 train: mixed ±Infinity deadline vs startedAtMs INVALID_CLOCK (worker+2 children running)",
      );
    } else {
      passed = false;
      details.push(
        `A15 mixed ±Infinity unexpectedly posNeg=${JSON.stringify(mixedPosNeg)} negPos=${JSON.stringify(mixedNegPos)}`,
      );
    }
    const mixedRepeat = stopProcessTreeOnDeadline(mixedPosNeg.tree, afterMs);
    if (
      mixedPosNeg.ok === false &&
      mixedRepeat.ok === false &&
      mixedRepeat.code === "INVALID_CLOCK" &&
      alivePids(mixedRepeat.tree).length === 3 &&
      mixedRepeat.tree.outcome === "running" &&
      mixedRepeat.externalEffects === "NONE"
    ) {
      details.push(
        "A16 tip-moved-273 train: repeat mixed ±Infinity clocks INVALID_CLOCK idempotent (worker+2 children running)",
      );
    } else {
      passed = false;
      details.push(`A16 mixed repeat unexpectedly ${JSON.stringify(mixedRepeat)}`);
    }
    const mixedNegPosRepeat = stopProcessTreeOnDeadline(mixedNegPos.tree, afterMs);
    if (
      mixedNegPos.ok === false &&
      mixedNegPosRepeat.ok === false &&
      mixedNegPosRepeat.code === "INVALID_CLOCK" &&
      alivePids(mixedNegPosRepeat.tree).length === 3 &&
      mixedNegPosRepeat.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "A17 wipe15 timer train: repeat -∞ deadline + +∞ startedAt INVALID_CLOCK idempotent (worker+2 children running)",
      );
    } else {
      passed = false;
      details.push(`A17 negPos mixed repeat unexpectedly ${JSON.stringify(mixedNegPosRepeat)}`);
    }
    const mixedTriple2 = stopProcessTreeOnDeadline(mixedRepeat.tree, afterMs);
    const mixedTriple3 = stopProcessTreeOnDeadline(
      mixedTriple2.ok === false ? mixedTriple2.tree : tree,
      afterMs + 1,
    );
    if (
      mixedRepeat.ok === false &&
      mixedTriple2.ok === false &&
      mixedTriple3.ok === false &&
      mixedTriple3.code === "INVALID_CLOCK" &&
      alivePids(mixedTriple3.tree).length === 3
    ) {
      details.push(
        "A18 tip-moved-274 train: triple mixed ±Infinity clocks INVALID_CLOCK idempotent (worker+2 children running)",
      );
    } else {
      passed = false;
      details.push(
        `A18 mixed triple unexpectedly ${JSON.stringify({ mixedTriple2, mixedTriple3 })}`,
      );
    }
    const negPosTriple2 = stopProcessTreeOnDeadline(mixedNegPosRepeat.tree, afterMs);
    const negPosTriple3 = stopProcessTreeOnDeadline(
      negPosTriple2.ok === false ? negPosTriple2.tree : tree,
      afterMs + 1,
    );
    if (
      mixedNegPosRepeat.ok === false &&
      negPosTriple2.ok === false &&
      negPosTriple3.ok === false &&
      negPosTriple3.code === "INVALID_CLOCK" &&
      alivePids(negPosTriple3.tree).length === 3
    ) {
      details.push(
        "A19 tip-moved-275 train: triple -∞ deadline + +∞ startedAt INVALID_CLOCK (worker+2 children running)",
      );
    } else {
      passed = false;
      details.push(
        `A19 negPos triple unexpectedly ${JSON.stringify({ negPosTriple2, negPosTriple3 })}`,
      );
    }

    // B10: idempotent re-stop after first kill invents no second wave.
    const firstStop = stopProcessTreeOnDeadline(tree, afterMs);
    const reStop =
      firstStop.ok && firstStop.code === "PROCESS_TREE_STOPPED"
        ? stopProcessTreeOnDeadline(firstStop.tree, afterMs + 1_000)
        : null;
    if (
      firstStop.ok &&
      reStop &&
      reStop.ok &&
      reStop.code === "PROCESS_TREE_STOPPED" &&
      reStop.stoppedPids.length === 0 &&
      alivePids(reStop.tree).length === 0 &&
      reStop.tree.outcome === "timed_out_stopped" &&
      reStop.externalEffects === "NONE" &&
      reStop.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Idempotent re-stop after timed_out_stopped: stoppedPids=[]; no invented second kill (B10)",
      );
    } else {
      passed = false;
      details.push(
        `Idempotent re-stop unexpectedly first=${JSON.stringify(firstStop)} second=${JSON.stringify(reStop)}`,
      );
    }

    // 3. Real OS process tree (worker → child → grandchild).
    // CI harden: spawn via process.execPath + plain .mjs children (no nested -e),
    // wait until pidfile ready, THEN stopProcessTree (same helper as invoke TIMEOUT).
    // Separately assert invokeClaudeCli TIMEOUT on a sleeper.
    const pidFile = join(workDir, "tree-pids.json");
    const leafScript = join(workDir, "leaf.mjs");
    const childScript = join(workDir, "child.mjs");
    const treeScript = join(workDir, "tree-worker.mjs");
    const sleeperScript = join(workDir, "sleeper.mjs");
    writeFileSync(
      leafScript,
      ["setInterval(() => {}, 1000);", ""].join("\n"),
      "utf8",
    );
    writeFileSync(
      childScript,
      [
        "import { spawn } from 'node:child_process';",
        "import { writeFileSync } from 'node:fs';",
        `const leaf = spawn(process.execPath, [${JSON.stringify(leafScript)}], { stdio: 'ignore', detached: false });`,
        `writeFileSync(${JSON.stringify(join(workDir, "grandchild.pid"))}, String(leaf.pid));`,
        "setInterval(() => {}, 1000);",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      treeScript,
      [
        "import { spawn } from 'node:child_process';",
        "import { writeFileSync, readFileSync, existsSync } from 'node:fs';",
        `const pidFile = ${JSON.stringify(pidFile)};`,
        `const grandchildPidFile = ${JSON.stringify(join(workDir, "grandchild.pid"))};`,
        `const child = spawn(process.execPath, [${JSON.stringify(childScript)}], { stdio: 'ignore', detached: false });`,
        "const flush = () => {",
        "  let grandchildPid = null;",
        "  if (existsSync(grandchildPidFile)) {",
        "    const n = Number(readFileSync(grandchildPidFile, 'utf8').trim());",
        "    if (Number.isInteger(n) && n > 0) grandchildPid = n;",
        "  }",
        "  writeFileSync(pidFile, JSON.stringify({",
        "    workerPid: process.pid,",
        "    childPid: child.pid,",
        "    grandchildPid,",
        "  }));",
        "};",
        "flush();",
        "setInterval(flush, 5);",
        "setInterval(() => {}, 1000);",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      sleeperScript,
      ["#!/usr/bin/env node", "setInterval(() => {}, 1000);", ""].join("\n"),
      "utf8",
    );
    chmodSync(sleeperScript, 0o755);

    const readTreePids = (): {
      workerPid?: number;
      childPid?: number;
      grandchildPid?: number | null;
    } | null => {
      if (!existsSync(pidFile)) return null;
      try {
        return JSON.parse(readFileSync(pidFile, "utf8")) as {
          workerPid?: number;
          childPid?: number;
          grandchildPid?: number | null;
        };
      } catch {
        return null;
      }
    };

    const treePidsReady = (): boolean => {
      const pids = readTreePids();
      return (
        !!pids &&
        typeof pids.workerPid === "number" &&
        typeof pids.childPid === "number" &&
        typeof pids.grandchildPid === "number" &&
        pids.grandchildPid > 0
      );
    };

    // Spawn via execPath+detached (same group-kill shape as invokeClaudeCli).
    const treeChild = spawn(process.execPath, [treeScript], {
      stdio: ["ignore", "ignore", "ignore"],
      shell: false,
      detached: true,
      cwd: workDir,
    });
    const treeRootPid = treeChild.pid;
    if (typeof treeRootPid !== "number") {
      passed = false;
      details.push("Failed to spawn OS tree-worker (no pid)");
    } else {
      const pidsReady = await waitUntil(treePidsReady, 12_000);
      if (!pidsReady) {
        passed = false;
        details.push(
          `tree-pids.json never recorded worker+child+grandchild before kill last=${JSON.stringify(readTreePids())}`,
        );
        stopProcessTree(treeRootPid, "SIGKILL");
      } else {
        const pids = readTreePids();
        if (
          !pids ||
          typeof pids.workerPid !== "number" ||
          typeof pids.childPid !== "number" ||
          typeof pids.grandchildPid !== "number" ||
          pids.grandchildPid <= 0
        ) {
          passed = false;
          details.push(
            `tree-pids.json lost worker/child/grandchild before OS stop last=${JSON.stringify(readTreePids())}`,
          );
          stopProcessTree(treeRootPid, "SIGKILL");
        } else {
          const {
            workerPid,
            childPid,
            grandchildPid,
          } = pids;
          stopProcessTree(treeRootPid, "SIGKILL");
          const dead = await waitUntil(
            () =>
              !isAlive(workerPid) &&
              !isAlive(childPid) &&
              !isAlive(grandchildPid),
            8_000,
          );
          if (dead) {
            details.push(
              `OS process tree stopped via stopProcessTree worker=${workerPid} child=${childPid} grandchild=${grandchildPid}`,
            );
          } else {
            passed = false;
            details.push(
              `Orphan remained workerAlive=${isAlive(workerPid)} childAlive=${isAlive(childPid)} grandchildAlive=${isAlive(grandchildPid)}`,
            );
            for (const pid of [grandchildPid, childPid, workerPid]) {
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
      }
    }

    // Separate: invokeClaudeCli deadline → TIMEOUT (no spawn-race with grandchild).
    const invoke = await invokeClaudeCli({
      executablePath: sleeperScript,
      agentName: "A01",
      cwd: workDir,
      modelId: "fixture-model",
      prompt: "orphan-worker-deadline",
      timeoutMs: 200,
      maxOutputBytes: 64_000,
    });
    if (!invoke.ok && invoke.code === "TIMEOUT") {
      details.push("invokeClaudeCli sleeper → TIMEOUT (deadline)");
    } else {
      passed = false;
      details.push(`Sleeper invoke unexpectedly ${JSON.stringify(invoke)}`);
    }

    if (RoleRunStatus.TIMED_OUT === "timed_out") {
      details.push(
        "Outcome timed_out_stopped aligns with RoleRunStatus.TIMED_OUT (not VERIFIED)",
      );
    } else {
      passed = false;
      details.push("RoleRunStatus.TIMED_OUT constant drifted");
    }

    details.push(
      "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE ACCEPTED≠VERIFIED",
    );
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
