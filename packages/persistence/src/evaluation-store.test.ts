/**
 * Memory/file evaluation store — fixture honesty; no live VERIFIED claims.
 */

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EvalCapability,
  EvalProvider,
  EvalRunStatus,
  availableBudgetMinor,
  createEvalConnection,
  emptyEvaluationState,
  evalChatGptAdsProbe,
  reserveBudget,
} from "@worksocial/domain";
import {
  createFileEvaluationStore,
  createMemoryEvaluationStore,
  openEvaluationStore,
} from "./evaluation-store.js";

const now = "2026-11-21T22:00:00.000Z";

describe("evaluation store (memory/file)", () => {
  let dir: string;
  const dirs: string[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-eval-store-"));
    dirs.push(dir);
  });

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("memory store persists connections across read and keeps wiring NOT_WIRED", async () => {
    const store = createMemoryEvaluationStore(emptyEvaluationState(now));
    const connection = createEvalConnection({
      connectionId: "conn-1",
      provider: EvalProvider.CLAUDE,
      displayName: "Claude EVAL_ONLY",
      nowIso: now,
    });
    await store.upsertConnection(connection);
    const state = await store.read();
    expect(state.connections).toHaveLength(1);
    expect(state.liveEvalWiring).toBe("NOT_WIRED");
    expect(state.chatgptAdsWiring).toBe("NOT_WIRED");
    expect(state.isolation.learningCannotExpandEffects).toBe(true);
    const status = await store.status();
    expect(status.backend).toBe("memory");
    expect(status.liveEvalWiring).toBe("NOT_WIRED");
  });

  it("file store reloads runs after a new store instance (restart)", async () => {
    const first = createFileEvaluationStore(dir);
    await first.upsertSuite({
      suiteId: "suite-1",
      title: "Golden",
      cases: [],
      fixtureOnly: true,
      createdAtIso: now,
    });
    await first.addRun({
      runId: "run-1",
      suiteId: "suite-1",
      provider: EvalProvider.GEMINI,
      capability: EvalCapability.EVAL_ONLY,
      status: EvalRunStatus.COMPLETED,
      reservationId: null,
      reservedMinor: 0,
      settledMinor: 0,
      results: [],
      fixtureOnly: true,
      chatgptAdsDecision: evalChatGptAdsProbe(),
      createdAtIso: now,
      completedAtIso: now,
    });

    const second = createFileEvaluationStore(dir);
    const runs = await second.listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]?.runId).toBe("run-1");
    expect(runs[0]?.fixtureOnly).toBe(true);
    expect(runs[0]?.chatgptAdsDecision.allowed).toBe(false);
    const status = await second.status();
    expect(status.backend).toBe("file");
    expect(status.chatgptAdsWiring).toBe("NOT_WIRED");
  });

  it("normalizes legacy file budgets missing heldMinor/heldReservations", async () => {
    const evalDir = join(dir, "evaluation");
    mkdirSync(evalDir, { recursive: true });
    const statePath = join(evalDir, "evaluation-state.json");
    writeFileSync(
      statePath,
      JSON.stringify({
        version: 1,
        updatedAtIso: now,
        connections: [],
        suites: [],
        runs: [],
        budget: {
          dayKey: "2026-11-21",
          currency: "USD",
          limitMinor: 1000,
          reservedMinor: 0,
          settledMinor: 0,
          openReservations: {},
          settledReservations: {},
        },
        liveEvalWiring: "NOT_WIRED",
        chatgptAdsWiring: "NOT_WIRED",
      }),
      "utf8",
    );
    const store = createFileEvaluationStore(dir);
    const state = await store.read();
    expect(state.budget.heldMinor).toBe(0);
    expect(state.budget.heldReservations).toEqual({});
    expect(state.budget.limitMinor).toBe(1000);
    const reserved = reserveBudget(state.budget, "legacy-ok", 100);
    expect(reserved.ok).toBe(true);
    if (reserved.ok) {
      expect(availableBudgetMinor(reserved.account)).toBe(900);
    }
    // Ensure the on-disk shape really omitted the new fields.
    const raw = JSON.parse(readFileSync(statePath, "utf8")) as {
      budget: Record<string, unknown>;
    };
    expect(raw.budget.heldMinor).toBeUndefined();
  });

  it("derives heldMinor from heldReservations map when omitted or stale (T-X027)", async () => {
    const evalDir = join(dir, "evaluation");
    mkdirSync(evalDir, { recursive: true });
    const statePath = join(evalDir, "evaluation-state.json");
    writeFileSync(
      statePath,
      JSON.stringify({
        version: 1,
        updatedAtIso: now,
        connections: [],
        suites: [],
        runs: [],
        budget: {
          dayKey: "2026-11-21",
          currency: "USD",
          limitMinor: 1000,
          reservedMinor: 0,
          settledMinor: 0,
          // Stale/omitted heldMinor must not invent zero capacity.
          heldMinor: 0,
          openReservations: {},
          heldReservations: { "legacy-hold": 450 },
          settledReservations: {},
        },
        liveEvalWiring: "NOT_WIRED",
        chatgptAdsWiring: "NOT_WIRED",
      }),
      "utf8",
    );
    const store = createFileEvaluationStore(dir);
    const state = await store.read();
    expect(state.budget.heldReservations).toEqual({ "legacy-hold": 450 });
    expect(state.budget.heldMinor).toBe(450);
    expect(availableBudgetMinor(state.budget)).toBe(550);
    expect(state.chatgptAdsWiring).toBe("NOT_WIRED");
    expect(state.liveEvalWiring).toBe("NOT_WIRED");
    const blocked = reserveBudget(state.budget, "over", 600);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.code).toBe("BUDGET_EXHAUSTED");
      expect(blocked.availableMinor).toBe(550);
    }
  });

  it("openEvaluationStore forceMemory ignores DATABASE_URL", () => {
    const opened = openEvaluationStore({
      stateDir: dir,
      forceMemory: true,
      connectionString: "postgres://ignored",
    });
    expect(opened.backend).toBe("memory");
    expect(opened.pool).toBeNull();
  });

  it("openEvaluationStore forceFile ignores DATABASE_URL", () => {
    const opened = openEvaluationStore({
      stateDir: dir,
      forceFile: true,
      connectionString: "postgres://ignored",
    });
    expect(opened.backend).toBe("file");
    expect(opened.pool).toBeNull();
  });
});
