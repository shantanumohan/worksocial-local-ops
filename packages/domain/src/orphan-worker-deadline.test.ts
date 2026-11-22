import { describe, expect, it } from "vitest";
import {
  alivePids,
  createWorkerProcessTree,
  isInWorkerProcessTree,
  stopProcessTreeOnDeadline,
  workerDeadlineExceeded,
  workerRootPid,
} from "./orphan-worker-deadline.js";

describe("orphan-worker-deadline", () => {
  const startedAtMs = Date.parse("2026-11-22T17:00:00.000Z");

  it("refuses stop before deadline and leaves the tree alive", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 60,
      workerPid: 100,
      childPids: [101, 102],
    });
    expect(workerDeadlineExceeded(tree, startedAtMs + 30_000)).toBe(false);
    const early = stopProcessTreeOnDeadline(tree, startedAtMs + 30_000);
    expect(early.ok).toBe(false);
    if (early.ok) throw new Error("expected DEADLINE_NOT_EXCEEDED");
    expect(early.code).toBe("DEADLINE_NOT_EXCEEDED");
    expect(early.remainingMs).toBe(30_000);
    expect(alivePids(early.tree)).toEqual([100, 101, 102]);
  });

  it("stops the full owned process tree after deadline (no orphans)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 60,
      workerPid: 100,
      childPids: [101, 102],
    });
    const after = stopProcessTreeOnDeadline(tree, startedAtMs + 61_000);
    expect(after.ok).toBe(true);
    if (!after.ok) throw new Error("expected PROCESS_TREE_STOPPED");
    expect(after.code).toBe("PROCESS_TREE_STOPPED");
    expect(after.stoppedPids.sort()).toEqual([100, 101, 102]);
    expect(alivePids(after.tree)).toEqual([]);
    expect(after.tree.outcome).toBe("timed_out_stopped");
    expect(after.skippedPids).toEqual([]);
  });

  it("skips foreign-generation and same-gen out-of-tree siblings", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 200,
      childPids: [201],
    });
    const sibling = {
      pid: 300,
      parentPid: null as number | null,
      kind: "worker" as const,
      generationId: "gen-a",
      alive: true,
    };
    const after = stopProcessTreeOnDeadline(tree, startedAtMs + 31_000, {
      extraNodes: [
        {
          pid: 999,
          parentPid: null,
          kind: "worker",
          generationId: "gen-foreign",
          alive: true,
        },
        sibling,
      ],
    });
    expect(after.ok).toBe(true);
    if (!after.ok) throw new Error("expected PROCESS_TREE_STOPPED");
    expect(after.stoppedPids.sort()).toEqual([200, 201]);
    expect(after.skippedPids.sort()).toEqual([300, 999]);
    expect(alivePids(after.tree)).toEqual([]);
    expect(workerRootPid(tree)).toBe(200);
    expect(
      isInWorkerProcessTree(sibling, 200, [...tree.nodes, sibling]),
    ).toBe(false);
  });
});
