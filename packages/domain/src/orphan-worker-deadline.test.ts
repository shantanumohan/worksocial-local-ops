import { describe, expect, it } from "vitest";
import {
  alivePids,
  createWorkerProcessTree,
  isInWorkerProcessTree,
  stopProcessTreeOnDeadline,
  workerDeadlineExceeded,
  workerRootPid,
  type WorkerProcessTree,
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
    expect(early.externalEffects).toBe("NONE");
    expect(early.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("stops the tree at exact deadline boundary (inclusive expiry)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 60,
      workerPid: 100,
      childPids: [101],
    });
    const atBoundary = startedAtMs + 60_000;
    expect(workerDeadlineExceeded(tree, atBoundary)).toBe(true);
    const result = stopProcessTreeOnDeadline(tree, atBoundary);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected PROCESS_TREE_STOPPED");
    expect(result.code).toBe("PROCESS_TREE_STOPPED");
    expect(result.stoppedPids.sort()).toEqual([100, 101]);
    expect(alivePids(result.tree)).toEqual([]);
    expect(result.tree.outcome).toBe("timed_out_stopped");
    expect(result.liveProviderWiring).toBe("NOT_WIRED");
    expect(result.externalEffects).toBe("NONE");
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
    expect(after.externalEffects).toBe("NONE");
    expect(after.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("stops transitive grandchildren via parentPid chain", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const grandchild = {
      pid: 102,
      parentPid: 101,
      kind: "child" as const,
      generationId: "gen-a",
      alive: true,
    };
    const withGrandchild = {
      ...tree,
      nodes: [...tree.nodes, grandchild],
    };
    const after = stopProcessTreeOnDeadline(
      withGrandchild,
      startedAtMs + 31_000,
    );
    expect(after.ok).toBe(true);
    if (!after.ok) throw new Error("expected PROCESS_TREE_STOPPED");
    expect(after.stoppedPids.sort()).toEqual([100, 101, 102]);
    expect(alivePids(after.tree)).toEqual([]);
    expect(after.externalEffects).toBe("NONE");
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
    expect(after.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("refuses inventing live stop when liveProviderWiring=WIRED", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const refused = stopProcessTreeOnDeadline(tree, startedAtMs + 31_000, {
      liveProviderWiring: "WIRED",
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("expected LIVE_TRANSPORT_NOT_WIRED");
    expect(refused.code).toBe("LIVE_TRANSPORT_NOT_WIRED");
    expect(alivePids(refused.tree)).toEqual([100, 101]);
    expect(refused.tree.outcome).toBe("running");
    expect(refused.externalEffects).toBe("NONE");
    expect(refused.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("rejects blank generationId and invalid workerPid on create", () => {
    expect(() =>
      createWorkerProcessTree({
        generationId: "   ",
        startedAtMs,
        deadlineSeconds: 30,
        workerPid: 100,
      }),
    ).toThrow(/generationId/);
    expect(() =>
      createWorkerProcessTree({
        generationId: "gen-a",
        startedAtMs,
        deadlineSeconds: 30,
        workerPid: 0,
      }),
    ).toThrow(/workerPid/);
    expect(() =>
      createWorkerProcessTree({
        generationId: "gen-a",
        startedAtMs,
        deadlineSeconds: 0,
        workerPid: 100,
      }),
    ).toThrow(/deadlineSeconds/);
  });

  it("refuses inventing expiry or kill when nowMs is non-finite (B10)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const refused = stopProcessTreeOnDeadline(tree, bad);
      expect(refused.ok).toBe(false);
      if (refused.ok) throw new Error("expected INVALID_CLOCK");
      expect(refused.code).toBe("INVALID_CLOCK");
      expect(alivePids(refused.tree)).toEqual([100, 101]);
      expect(refused.externalEffects).toBe("NONE");
      expect(refused.liveProviderWiring).toBe("NOT_WIRED");
    }
  });

  it("idempotent re-stop after timed_out_stopped invents no second kill (B10)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const first = stopProcessTreeOnDeadline(tree, startedAtMs + 31_000);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("expected PROCESS_TREE_STOPPED");
    expect(first.stoppedPids.sort()).toEqual([100, 101]);

    const second = stopProcessTreeOnDeadline(first.tree, startedAtMs + 40_000);
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("expected idempotent PROCESS_TREE_STOPPED");
    expect(second.stoppedPids).toEqual([]);
    expect(alivePids(second.tree)).toEqual([]);
    expect(second.tree.outcome).toBe("timed_out_stopped");
    expect(second.externalEffects).toBe("NONE");
    expect(second.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("rejects non-finite startedAtMs on create (B12)", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() =>
        createWorkerProcessTree({
          generationId: "gen-a",
          startedAtMs: bad,
          deadlineSeconds: 30,
          workerPid: 100,
        }),
      ).toThrow(/startedAtMs/);
    }
  });

  it("clock-skew nowMs < startedAtMs refuses inventing kill (B12)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const skewed = stopProcessTreeOnDeadline(tree, startedAtMs - 1);
    expect(skewed.ok).toBe(false);
    if (skewed.ok) throw new Error("expected DEADLINE_NOT_EXCEEDED");
    expect(skewed.code).toBe("DEADLINE_NOT_EXCEEDED");
    expect(skewed.reason).toMatch(/clock skew/i);
    expect(alivePids(skewed.tree)).toEqual([100, 101]);
    expect(skewed.externalEffects).toBe("NONE");
    expect(skewed.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("refuses inventing kill when tree.startedAtMs is non-finite (B12)", () => {
    const tree = {
      ...createWorkerProcessTree({
        generationId: "gen-a",
        startedAtMs,
        deadlineSeconds: 30,
        workerPid: 100,
        childPids: [101],
      }),
      startedAtMs: Number.NaN,
    };
    const refused = stopProcessTreeOnDeadline(tree, startedAtMs + 31_000);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("expected INVALID_CLOCK");
    expect(refused.code).toBe("INVALID_CLOCK");
    expect(alivePids(refused.tree)).toEqual([100, 101]);
    expect(refused.externalEffects).toBe("NONE");
  });

  it("rejects duplicate PIDs on create (B14)", () => {
    expect(() =>
      createWorkerProcessTree({
        generationId: "gen-a",
        startedAtMs,
        deadlineSeconds: 30,
        workerPid: 100,
        childPids: [100],
      }),
    ).toThrow(/duplicate pid/i);
    expect(() =>
      createWorkerProcessTree({
        generationId: "gen-a",
        startedAtMs,
        deadlineSeconds: 30,
        workerPid: 100,
        childPids: [101, 101],
      }),
    ).toThrow(/duplicate pid/i);
  });

  it("stops alive orphan children when worker already dead past deadline (B14)", () => {
    const base = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101, 102],
    });
    const workerDead = {
      ...base,
      nodes: base.nodes.map((n) =>
        n.pid === 100 ? { ...n, alive: false } : n,
      ),
    };
    const stopped = stopProcessTreeOnDeadline(
      workerDead,
      startedAtMs + 31_000,
    );
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) throw new Error("expected PROCESS_TREE_STOPPED");
    expect(stopped.stoppedPids.sort()).toEqual([101, 102]);
    expect(alivePids(stopped.tree)).toEqual([]);
    expect(stopped.tree.outcome).toBe("timed_out_stopped");
    expect(stopped.externalEffects).toBe("NONE");
    expect(stopped.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("refuses inventing kill when deadlineSeconds is non-finite (B15)", () => {
    const tree = {
      ...createWorkerProcessTree({
        generationId: "gen-a",
        startedAtMs,
        deadlineSeconds: 30,
        workerPid: 100,
        childPids: [101],
      }),
      deadlineSeconds: Number.NaN,
    };
    const refused = stopProcessTreeOnDeadline(tree, startedAtMs + 31_000);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("expected INVALID_CLOCK");
    expect(refused.code).toBe("INVALID_CLOCK");
    expect(alivePids(refused.tree)).toEqual([100, 101]);
    expect(refused.externalEffects).toBe("NONE");
  });

  it("refuses inventing kill at exact start instant nowMs === startedAtMs (B15)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const atStart = stopProcessTreeOnDeadline(tree, startedAtMs);
    expect(atStart.ok).toBe(false);
    if (atStart.ok) throw new Error("expected DEADLINE_NOT_EXCEEDED");
    expect(atStart.code).toBe("DEADLINE_NOT_EXCEEDED");
    expect(atStart.remainingMs).toBe(30_000);
    expect(atStart.reason).toMatch(/start instant/i);
    expect(alivePids(atStart.tree)).toEqual([100, 101]);
    expect(atStart.externalEffects).toBe("NONE");
  });

  it("refuses inventing expiry when deadlineSeconds is non-positive (B16)", () => {
    const base = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    for (const bad of [0, -1, Number.NEGATIVE_INFINITY]) {
      const refused = stopProcessTreeOnDeadline(
        { ...base, deadlineSeconds: bad },
        startedAtMs + 31_000,
      );
      expect(refused.ok).toBe(false);
      if (refused.ok) throw new Error("expected INVALID_CLOCK");
      expect(refused.code).toBe("INVALID_CLOCK");
      expect(alivePids(refused.tree)).toEqual([100, 101]);
    }
  });

  it("partial timed_out_stopped with alive orphans still clears them (B16)", () => {
    const base = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101, 102],
    });
    const partial = {
      ...base,
      outcome: "timed_out_stopped" as const,
      nodes: base.nodes.map((n) =>
        n.pid === 100 ? { ...n, alive: false } : n,
      ),
    };
    expect(alivePids(partial)).toEqual([101, 102]);
    const cleared = stopProcessTreeOnDeadline(
      partial,
      startedAtMs + 31_000,
    );
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) throw new Error("expected PROCESS_TREE_STOPPED");
    expect(cleared.stoppedPids.sort()).toEqual([101, 102]);
    expect(alivePids(cleared.tree)).toEqual([]);
    expect(cleared.tree.outcome).toBe("timed_out_stopped");
    expect(cleared.externalEffects).toBe("NONE");
  });

  it("refuses inventing kill when generationId is blank (B17)", () => {
    const base = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const blank = stopProcessTreeOnDeadline(
      { ...base, generationId: "   " },
      startedAtMs + 31_000,
    );
    expect(blank.ok).toBe(false);
    if (blank.ok) throw new Error("expected GENERATION_REQUIRED");
    expect(blank.code).toBe("GENERATION_REQUIRED");
    expect(alivePids(blank.tree)).toEqual([100, 101]);
    expect(blank.externalEffects).toBe("NONE");
    expect(blank.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("skips foreign extra that shares worker parentPid (B17)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const stopped = stopProcessTreeOnDeadline(tree, startedAtMs + 31_000, {
      extraNodes: [
        {
          pid: 777,
          parentPid: 100,
          kind: "child",
          generationId: "gen-foreign",
          alive: true,
        },
      ],
    });
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) throw new Error("expected PROCESS_TREE_STOPPED");
    expect(stopped.stoppedPids.sort()).toEqual([100, 101]);
    expect(stopped.skippedPids).toEqual([777]);
    expect(alivePids(stopped.tree)).toEqual([]);
    expect(stopped.externalEffects).toBe("NONE");
  });

  it("refuses inventing kill when worker root is missing (B18)", () => {
    const base = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const noRoot = {
      ...base,
      nodes: base.nodes.filter((n) => n.kind !== "worker"),
    };
    const refused = stopProcessTreeOnDeadline(noRoot, startedAtMs + 31_000);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("expected TREE_REQUIRED");
    expect(refused.code).toBe("TREE_REQUIRED");
    expect(alivePids(refused.tree)).toEqual([101]);
    expect(refused.externalEffects).toBe("NONE");
  });

  it("ignores extras that duplicate tree PIDs — no invented double-stop (B18)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const stopped = stopProcessTreeOnDeadline(tree, startedAtMs + 31_000, {
      extraNodes: [
        {
          pid: 100,
          parentPid: null,
          kind: "worker",
          generationId: "gen-a",
          alive: true,
        },
        {
          pid: 888,
          parentPid: null,
          kind: "worker",
          generationId: "gen-foreign",
          alive: true,
        },
      ],
    });
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) throw new Error("expected PROCESS_TREE_STOPPED");
    expect(stopped.stoppedPids.sort()).toEqual([100, 101]);
    expect(stopped.skippedPids).toEqual([888]);
    expect(stopped.stoppedPids.filter((p) => p === 100)).toHaveLength(1);
    expect(alivePids(stopped.tree)).toEqual([]);
  });

  it("drops invalid-PID extras — no invented stop targets (B19)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const after = stopProcessTreeOnDeadline(tree, startedAtMs + 31_000, {
      extraNodes: [
        {
          pid: 0,
          parentPid: null,
          kind: "worker",
          generationId: "gen-a",
          alive: true,
        },
        {
          pid: -5,
          parentPid: 100,
          kind: "child",
          generationId: "gen-a",
          alive: true,
        },
        {
          pid: 1.5 as number,
          parentPid: null,
          kind: "worker",
          generationId: "gen-a",
          alive: true,
        },
        {
          pid: 999,
          parentPid: null,
          kind: "worker",
          generationId: "gen-foreign",
          alive: true,
        },
      ],
    });
    expect(after.ok).toBe(true);
    if (!after.ok) throw new Error("expected PROCESS_TREE_STOPPED");
    expect(after.stoppedPids.sort()).toEqual([100, 101]);
    expect(after.skippedPids).toEqual([999]);
  });

  it("skips extras in a parentPid cycle that never reaches the worker (B19)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 200,
      childPids: [201],
    });
    const cyclicA = {
      pid: 501,
      parentPid: 502,
      kind: "child" as const,
      generationId: "gen-a",
      alive: true,
    };
    const cyclicB = {
      pid: 502,
      parentPid: 501,
      kind: "child" as const,
      generationId: "gen-a",
      alive: true,
    };
    expect(
      isInWorkerProcessTree(cyclicA, 200, [cyclicA, cyclicB, ...tree.nodes]),
    ).toBe(false);
    const after = stopProcessTreeOnDeadline(tree, startedAtMs + 31_000, {
      extraNodes: [cyclicA, cyclicB],
    });
    expect(after.ok).toBe(true);
    if (!after.ok) throw new Error("expected PROCESS_TREE_STOPPED");
    expect(after.stoppedPids.sort()).toEqual([200, 201]);
    expect(after.skippedPids.sort()).toEqual([501, 502]);
    expect(alivePids(after.tree)).toEqual([]);
  });

  it("refuses stop when process tree has no nodes (B20)", () => {
    const empty: WorkerProcessTree = {
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      nodes: [],
      outcome: "running",
    };
    const refused = stopProcessTreeOnDeadline(empty, startedAtMs + 31_000);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("expected TREE_REQUIRED");
    expect(refused.code).toBe("TREE_REQUIRED");
    expect(refused.externalEffects).toBe("NONE");
  });

  it("refuses inventing kill when deadlineSeconds is Infinity (B21)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const corrupt = { ...tree, deadlineSeconds: Number.POSITIVE_INFINITY };
    const refused = stopProcessTreeOnDeadline(corrupt, startedAtMs + 31_000);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("expected INVALID_CLOCK");
    expect(refused.code).toBe("INVALID_CLOCK");
    expect(refused.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("refuses inventing kill when deadlineSeconds is NaN (B22)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const corrupt = { ...tree, deadlineSeconds: Number.NaN };
    const refused = stopProcessTreeOnDeadline(corrupt, startedAtMs + 31_000);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("expected INVALID_CLOCK");
    expect(refused.code).toBe("INVALID_CLOCK");
    expect(refused.externalEffects).toBe("NONE");
  });

  it("refuses inventing kill when nowMs is NaN (B23)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const refused = stopProcessTreeOnDeadline(tree, Number.NaN);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("expected INVALID_CLOCK");
    expect(refused.code).toBe("INVALID_CLOCK");
    expect(refused.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("refuses inventing kill when startedAtMs is NaN (B24)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const corrupt = { ...tree, startedAtMs: Number.NaN };
    const refused = stopProcessTreeOnDeadline(corrupt, startedAtMs + 31_000);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("expected INVALID_CLOCK");
    expect(refused.code).toBe("INVALID_CLOCK");
    expect(refused.externalEffects).toBe("NONE");
  });

  it("refuses inventing kill when deadlineSeconds is zero (B25)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const corrupt = { ...tree, deadlineSeconds: 0 };
    const refused = stopProcessTreeOnDeadline(corrupt, startedAtMs + 1_000);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("expected INVALID_CLOCK");
    expect(refused.code).toBe("INVALID_CLOCK");
    expect(refused.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("refuses inventing kill when deadlineSeconds is negative (B26)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const corrupt = { ...tree, deadlineSeconds: -5 };
    const refused = stopProcessTreeOnDeadline(corrupt, startedAtMs + 31_000);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("expected INVALID_CLOCK");
    expect(refused.code).toBe("INVALID_CLOCK");
    expect(refused.externalEffects).toBe("NONE");
  });

  it("refuses inventing kill when nowMs is positive Infinity (B27)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const refused = stopProcessTreeOnDeadline(tree, Number.POSITIVE_INFINITY);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("expected INVALID_CLOCK");
    expect(refused.code).toBe("INVALID_CLOCK");
    expect(refused.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("refuses inventing kill when nowMs is negative Infinity (B28)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const refused = stopProcessTreeOnDeadline(tree, Number.NEGATIVE_INFINITY);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("expected INVALID_CLOCK");
    expect(refused.code).toBe("INVALID_CLOCK");
    expect(refused.externalEffects).toBe("NONE");
  });

  it("refuses inventing kill when startedAtMs is positive Infinity (B29)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const corrupt = { ...tree, startedAtMs: Number.POSITIVE_INFINITY };
    const refused = stopProcessTreeOnDeadline(corrupt, startedAtMs + 31_000);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("expected INVALID_CLOCK");
    expect(refused.code).toBe("INVALID_CLOCK");
    expect(refused.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("refuses inventing kill when startedAtMs is negative Infinity (B30)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const corrupt = { ...tree, startedAtMs: Number.NEGATIVE_INFINITY };
    const refused = stopProcessTreeOnDeadline(corrupt, startedAtMs + 31_000);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("expected INVALID_CLOCK");
    expect(refused.code).toBe("INVALID_CLOCK");
    expect(refused.externalEffects).toBe("NONE");
  });

  it("refuses inventing kill when deadlineSeconds is negative Infinity (B31)", () => {
    const tree = createWorkerProcessTree({
      generationId: "gen-a",
      startedAtMs,
      deadlineSeconds: 30,
      workerPid: 100,
      childPids: [101],
    });
    const corrupt = { ...tree, deadlineSeconds: Number.NEGATIVE_INFINITY };
    const refused = stopProcessTreeOnDeadline(corrupt, startedAtMs + 31_000);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("expected INVALID_CLOCK");
    expect(refused.code).toBe("INVALID_CLOCK");
    expect(refused.liveProviderWiring).toBe("NOT_WIRED");
  });
});
