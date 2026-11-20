import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ProbeKind,
  ProbeMode,
  ProbeVerdict,
  type ProbeRunRecord,
} from "@worksocial/domain";
import { createFileProbeStore } from "./probe-store.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("probe-store", () => {
  it("persists runs and reports honest Zoho wiring", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-probe-"));
    dirs.push(dir);
    const store = createFileProbeStore(dir);
    const now = "2026-11-18T16:00:00.000Z";
    const run: ProbeRunRecord = {
      runId: "run-1",
      kind: ProbeKind.HTTP,
      mode: ProbeMode.FIXTURE,
      targetId: "fixture-contact",
      verdict: ProbeVerdict.SUCCESS,
      startedAtIso: now,
      finishedAtIso: now,
      evidence: {
        evidenceId: "ev-1",
        kind: ProbeKind.HTTP,
        mode: ProbeMode.FIXTURE,
        summary: "ok",
        facts: { status: 200 },
        recordedAtIso: now,
      },
      reconciliation: null,
      outcomeId: null,
      writePathId: null,
      operationId: null,
      gatewayDecisionId: null,
      acceptanceCaseIds: ["T-F20"],
    };
    store.recordRun(run);
    expect(store.lastRun(ProbeKind.HTTP)?.runId).toBe("run-1");
    expect(store.status().liveZohoWiring).toBe("NOT_WIRED");
    expect(store.status().runCount).toBe(1);
  });
});
