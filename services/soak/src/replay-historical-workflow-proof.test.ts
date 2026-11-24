import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { proofReplayHistoricalNoRepeatIo } from "./replay-historical-workflow-proof.js";

describe("proofReplayHistoricalNoRepeatIo", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("passes with second replay, empty-history fail-closed, and honesty stamps", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "soak-t-x013-"));
    dirs.push(stateDir);
    const proof = await proofReplayHistoricalNoRepeatIo(
      stateDir,
      "2026-11-21T19:05:20.000Z",
    );
    expect(proof.passed, proof.details.join(" | ")).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Second history replay → VERIFIED scheduledFromHistory=3"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Empty history fail-closed → FAILED"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Partial history fail-closed → FAILED"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Missing terminal after complete events → FAILED"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Claim/terminal opId cross-bind mismatch → FAILED"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Two-event truncation fail-closed → FAILED"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Claim applyAttemptCount drift → FAILED"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Negative terminal applyAttemptCount → FAILED"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Blank enqueue workflowId → FAILED"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Whitespace-padded terminal opId trims → VERIFIED"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Non-finite terminal applyAttemptCount → FAILED"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Verify matched=false → FAILED"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("honesty NOT_WIRED/NONE")),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("liveProviderSuccessClaimed=false catalogClaim=ACCEPTED≠VERIFIED"),
      ),
    ).toBe(true);
  });
});
