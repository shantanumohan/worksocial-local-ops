/**
 * Orphan worker on deadline — process tree stop (pure fixture model).
 *
 * When a worker exceeds its deadline, the entire owned process tree must stop
 * so no child processes remain alive as orphans. Membership is the worker root
 * plus the transitive parentPid chain (same-generation siblings are not in the
 * tree). Foreign-generation / out-of-tree nodes are skipped. Never invents
 * live VERIFIED.
 */

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

export function createWorkerProcessTree(input: {
  generationId: string;
  startedAtMs: number;
  deadlineSeconds: number;
  workerPid: number;
  childPids?: readonly number[];
}): WorkerProcessTree {
  if (input.deadlineSeconds <= 0) {
    throw new Error("deadlineSeconds must be positive");
  }
  const children = (input.childPids ?? []).map(
    (pid): WorkerProcessNode => ({
      pid,
      parentPid: input.workerPid,
      kind: "child",
      generationId: input.generationId,
      alive: true,
    }),
  );
  return {
    generationId: input.generationId,
    startedAtMs: input.startedAtMs,
    deadlineSeconds: input.deadlineSeconds,
    nodes: [
      {
        pid: input.workerPid,
        parentPid: null,
        kind: "worker",
        generationId: input.generationId,
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
  const deadlineMs = tree.startedAtMs + tree.deadlineSeconds * 1000;
  return nowMs > deadlineMs;
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
  | {
      ok: true;
      code: "PROCESS_TREE_STOPPED";
      tree: WorkerProcessTree;
      stoppedPids: number[];
      /** Foreign generation and same-gen out-of-tree siblings. */
      skippedPids: number[];
    }
  | {
      ok: false;
      code: "DEADLINE_NOT_EXCEEDED";
      tree: WorkerProcessTree;
      remainingMs: number;
    };

/**
 * Stop the owned process tree only when the deadline is exceeded.
 * Stops worker + transitive children (no orphans). Skips foreign generation
 * and same-generation processes that are not in the worker's parentPid tree.
 */
export function stopProcessTreeOnDeadline(
  tree: WorkerProcessTree,
  nowMs: number,
  options?: {
    isOwned?: (node: WorkerProcessNode, generationId: string) => boolean;
    /** Extra nodes visible in the same host process table (may be foreign). */
    extraNodes?: readonly WorkerProcessNode[];
  },
): StopProcessTreeOnDeadlineResult {
  if (!workerDeadlineExceeded(tree, nowMs)) {
    const deadlineMs = tree.startedAtMs + tree.deadlineSeconds * 1000;
    return {
      ok: false,
      code: "DEADLINE_NOT_EXCEEDED",
      tree,
      remainingMs: Math.max(0, deadlineMs - nowMs),
    };
  }

  const rootPid = workerRootPid(tree);
  if (rootPid === null) {
    throw new Error("Worker process tree has no worker root");
  }

  const isOwned = options?.isOwned ?? defaultOwned;
  const allNodes = [...tree.nodes, ...(options?.extraNodes ?? [])];
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
  };
}
