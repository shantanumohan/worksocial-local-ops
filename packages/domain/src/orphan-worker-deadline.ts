/**
 * Orphan worker on deadline — process tree stop (pure fixture model).
 *
 * When a worker exceeds its deadline, the entire owned process tree must stop
 * so no child processes remain alive as orphans. Membership is the worker root
 * plus the transitive parentPid chain (same-generation siblings are not in the
 * tree). Foreign-generation / out-of-tree nodes are skipped. Never invents
 * live VERIFIED.
 *
 * Honesty: every stop decision carries externalEffects=NONE +
 * liveProviderWiring=NOT_WIRED. Fixture+WIRED refuses inventing live host kill
 * success (LIVE_TRANSPORT_NOT_WIRED). ACCEPTED ≠ sandbox/prod VERIFIED.
 */

export const ORPHAN_WORKER_DEADLINE_RELATED_CASE_IDS = ["T-X012"] as const;

export type WorkerProcessNode = {
  pid: number;
  parentPid: number | null;
  kind: "worker" | "child";
  generationId: string;
  alive: boolean;
};

export type WorkerProcessTree = {
  generationId: string;
  startedAtMs: number;
  deadlineSeconds: number;
  nodes: readonly WorkerProcessNode[];
  /**
   * Honest run outcome after stop planning.
   * `timed_out_stopped` aligns with RoleRunStatus.TIMED_OUT — never VERIFIED.
   */
  outcome: "running" | "timed_out_stopped";
};

type OrphanHonesty = {
  externalEffects: "NONE";
  liveProviderWiring: "NOT_WIRED";
};

function orphanHonesty(): OrphanHonesty {
  return {
    externalEffects: "NONE",
    liveProviderWiring: "NOT_WIRED",
  };
}

export function createWorkerProcessTree(input: {
  generationId: string;
  startedAtMs: number;
  deadlineSeconds: number;
  workerPid: number;
  childPids?: readonly number[];
}): WorkerProcessTree {
  if (!input.generationId.trim()) {
    throw new Error("generationId must be non-empty (T-X012)");
  }
  if (!Number.isFinite(input.startedAtMs)) {
    throw new Error("startedAtMs must be a finite number (T-X012)");
  }
  if (!Number.isFinite(input.deadlineSeconds) || input.deadlineSeconds <= 0) {
    throw new Error("deadlineSeconds must be a positive finite number");
  }
  if (!Number.isInteger(input.workerPid) || input.workerPid <= 0) {
    throw new Error("workerPid must be a positive integer (T-X012)");
  }
  const seenPids = new Set<number>([input.workerPid]);
  for (const pid of input.childPids ?? []) {
    if (!Number.isInteger(pid) || pid <= 0) {
      throw new Error("childPids must be positive integers (T-X012)");
    }
    // B14: refuse ambiguous duplicate PIDs (no invented kill targeting).
    if (seenPids.has(pid)) {
      throw new Error(
        "duplicate pid in worker process tree — refuse inventing ambiguous stop targets (T-X012)",
      );
    }
    seenPids.add(pid);
  }
  const children = (input.childPids ?? []).map(
    (pid): WorkerProcessNode => ({
      pid,
      parentPid: input.workerPid,
      kind: "child",
      generationId: input.generationId.trim(),
      alive: true,
    }),
  );
  return {
    generationId: input.generationId.trim(),
    startedAtMs: input.startedAtMs,
    deadlineSeconds: input.deadlineSeconds,
    nodes: [
      {
        pid: input.workerPid,
        parentPid: null,
        kind: "worker",
        generationId: input.generationId.trim(),
        alive: true,
      },
      ...children,
    ],
    outcome: "running",
  };
}

export function workerDeadlineExceeded(
  tree: WorkerProcessTree,
  nowMs: number,
): boolean {
  // Inclusive boundary: a watchdog firing at exactly started+deadline must stop
  // the tree (T-X012) — orphans must not remain if no later tick is guaranteed.
  const deadlineMs = tree.startedAtMs + tree.deadlineSeconds * 1000;
  return nowMs >= deadlineMs;
}

export function alivePids(tree: WorkerProcessTree): number[] {
  return tree.nodes.filter((n) => n.alive).map((n) => n.pid);
}

export function workerRootPid(tree: WorkerProcessTree): number | null {
  const root = tree.nodes.find(
    (n) => n.kind === "worker" && n.parentPid === null,
  );
  return root?.pid ?? null;
}

/**
 * True when `node` is the worker root or reaches the worker via parentPid.
 */
export function isInWorkerProcessTree(
  node: WorkerProcessNode,
  workerPid: number,
  nodes: readonly WorkerProcessNode[],
): boolean {
  if (node.pid === workerPid) {
    return true;
  }
  const byPid = new Map(nodes.map((n) => [n.pid, n]));
  const seen = new Set<number>();
  let current: WorkerProcessNode | undefined = node;
  while (current) {
    if (current.pid === workerPid) {
      return true;
    }
    if (current.parentPid === null) {
      return false;
    }
    if (seen.has(current.pid)) {
      return false;
    }
    seen.add(current.pid);
    current = byPid.get(current.parentPid);
  }
  return false;
}

function defaultOwned(
  node: WorkerProcessNode,
  generationId: string,
): boolean {
  return node.generationId === generationId;
}

export type StopProcessTreeOnDeadlineResult =
  | ({
      ok: true;
      code: "PROCESS_TREE_STOPPED";
      tree: WorkerProcessTree;
      stoppedPids: number[];
      /** Foreign generation and same-gen out-of-tree siblings. */
      skippedPids: number[];
    } & OrphanHonesty)
  | ({
      ok: false;
      code:
        | "DEADLINE_NOT_EXCEEDED"
        | "LIVE_TRANSPORT_NOT_WIRED"
        | "INVALID_CLOCK"
        | "GENERATION_REQUIRED"
        | "TREE_REQUIRED";
      tree: WorkerProcessTree;
      remainingMs?: number;
      reason?: string;
    } & OrphanHonesty);

/**
 * Stop the owned process tree only when the deadline is exceeded.
 * Stops worker + transitive children (no orphans). Skips foreign generation
 * and same-generation processes that are not in the worker's parentPid tree.
 * Claimed WIRED paths refuse inventing live host-kill success.
 * B10 Codex harden: non-finite nowMs refuse inventing expiry; idempotent
 * re-stop on already timed_out_stopped (no invented second kill).
 * B12: non-finite startedAtMs → INVALID_CLOCK; clock-skew nowMs < startedAtMs
 * refuse inventing kill (DEADLINE_NOT_EXCEEDED).
 * B14: duplicate PIDs refused on create; worker already dead still stops
 * alive orphan children past deadline.
 * B15: non-finite deadlineSeconds → INVALID_CLOCK; nowMs === startedAtMs
 * refuse inventing kill (DEADLINE_NOT_EXCEEDED with full remaining).
 * B16: non-positive deadlineSeconds → INVALID_CLOCK; partial timed_out_stopped
 * with alive orphans still clears them (idempotent empty only when none alive).
 * B17: blank/whitespace generationId → GENERATION_REQUIRED (no invented kill).
 * B18: missing worker root → TREE_REQUIRED (no throw inventing kill); extras that
 * duplicate tree PIDs are skipped (no invented double-stop).
 * B19: invalid-PID extras (non-integer / non-positive) dropped before planning;
 * parentPid cycles cannot reach worker — cyclic host processes skipped (no kill).
 */
export function stopProcessTreeOnDeadline(
  tree: WorkerProcessTree,
  nowMs: number,
  options?: {
    isOwned?: (node: WorkerProcessNode, generationId: string) => boolean;
    /** Extra nodes visible in the same host process table (may be foreign). */
    extraNodes?: readonly WorkerProcessNode[];
    /** Live host kill wiring — fixture proofs keep NOT_WIRED. */
    liveProviderWiring?: "NOT_WIRED" | "WIRED";
  },
): StopProcessTreeOnDeadlineResult {
  if (typeof tree.generationId !== "string" || tree.generationId.trim() === "") {
    return {
      ok: false,
      code: "GENERATION_REQUIRED",
      tree,
      reason:
        "generationId must be non-empty — refuse inventing ownership or host kill (T-X012)",
      ...orphanHonesty(),
    };
  }

  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(tree.startedAtMs) ||
    !Number.isFinite(tree.deadlineSeconds) ||
    tree.deadlineSeconds <= 0
  ) {
    return {
      ok: false,
      code: "INVALID_CLOCK",
      tree,
      reason:
        "nowMs, startedAtMs must be finite and deadlineSeconds a positive finite number — refuse inventing deadline expiry or host kill (T-X012)",
      ...orphanHonesty(),
    };
  }

  // Clock skew: now before start must not invent a kill wave.
  if (nowMs < tree.startedAtMs) {
    const deadlineMs = tree.startedAtMs + tree.deadlineSeconds * 1000;
    return {
      ok: false,
      code: "DEADLINE_NOT_EXCEEDED",
      tree,
      remainingMs: Math.max(0, deadlineMs - nowMs),
      reason:
        "nowMs < startedAtMs — refuse inventing deadline expiry or host kill under clock skew (T-X012)",
      ...orphanHonesty(),
    };
  }

  // B15: at the exact start instant, deadline has not elapsed — refuse inventing kill.
  if (nowMs === tree.startedAtMs) {
    const deadlineMs = tree.startedAtMs + tree.deadlineSeconds * 1000;
    return {
      ok: false,
      code: "DEADLINE_NOT_EXCEEDED",
      tree,
      remainingMs: Math.max(0, deadlineMs - nowMs),
      reason:
        "nowMs === startedAtMs — refuse inventing deadline expiry at start instant (T-X012)",
      ...orphanHonesty(),
    };
  }

  if (!workerDeadlineExceeded(tree, nowMs)) {
    const deadlineMs = tree.startedAtMs + tree.deadlineSeconds * 1000;
    return {
      ok: false,
      code: "DEADLINE_NOT_EXCEEDED",
      tree,
      remainingMs: Math.max(0, deadlineMs - nowMs),
      ...orphanHonesty(),
    };
  }

  if ((options?.liveProviderWiring ?? "NOT_WIRED") !== "NOT_WIRED") {
    return {
      ok: false,
      code: "LIVE_TRANSPORT_NOT_WIRED",
      tree,
      reason:
        "Process-tree stop refused while liveProviderWiring=WIRED — live host kill NOT_WIRED; no invented live success (T-X012)",
      ...orphanHonesty(),
    };
  }

  // Idempotent: already stopped tree must not invent a second host kill wave.
  if (tree.outcome === "timed_out_stopped" && alivePids(tree).length === 0) {
    return {
      ok: true,
      code: "PROCESS_TREE_STOPPED",
      stoppedPids: [],
      skippedPids: [],
      tree,
      ...orphanHonesty(),
    };
  }

  const rootPid = workerRootPid(tree);
  if (rootPid === null) {
    return {
      ok: false,
      code: "TREE_REQUIRED",
      tree,
      reason:
        "Worker process tree has no worker root — refuse inventing stop targets (T-X012)",
      ...orphanHonesty(),
    };
  }

  const isOwned = options?.isOwned ?? defaultOwned;
  const treePids = new Set(tree.nodes.map((n) => n.pid));
  // B18/B19: drop invalid or duplicate extras — no invented double-stop or bogus targets.
  const extras = (options?.extraNodes ?? []).filter(
    (n) =>
      Number.isInteger(n.pid) &&
      n.pid > 0 &&
      !treePids.has(n.pid),
  );
  const allNodes = [...tree.nodes, ...extras];
  const stoppedPids: number[] = [];
  const skippedPids: number[] = [];

  const nextNodes = allNodes.map((node) => {
    if (!node.alive) {
      return node;
    }
    const inTree = isInWorkerProcessTree(node, rootPid, allNodes);
    const owned = isOwned(node, tree.generationId);
    if (!owned || !inTree) {
      skippedPids.push(node.pid);
      return node;
    }
    stoppedPids.push(node.pid);
    return { ...node, alive: false };
  });

  // Persist only the original tree's nodes (extras stay host-local).
  const treeNodeIds = new Set(tree.nodes.map((n) => n.pid));
  const updatedTreeNodes = nextNodes.filter((n) => treeNodeIds.has(n.pid));

  return {
    ok: true,
    code: "PROCESS_TREE_STOPPED",
    stoppedPids,
    skippedPids,
    tree: {
      ...tree,
      nodes: updatedTreeNodes,
      outcome: "timed_out_stopped",
    },
    ...orphanHonesty(),
  };
}
