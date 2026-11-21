/**
 * Memory/file evaluation store — fixture honesty; no live VERIFIED claims.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EvalCapability,
  EvalProvider,
  EvalRunStatus,
  createEvalConnection,
  emptyEvaluationState,
  evalChatGptAdsProbe,
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
