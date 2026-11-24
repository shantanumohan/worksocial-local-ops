/**
 * Unit coverage for T-X022 soak proof hillclimb.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED; live provider NOT_WIRED.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SoakProofKind } from "@worksocial/domain";
import {
  IDEMPOTENCY_PAYLOAD_MISMATCH_ADS_SOFT_SKIP,
  IDEMPOTENCY_PAYLOAD_MISMATCH_LIVE_WIRING,
} from "@worksocial/persistence";
import { proofIdempotencyKeyPayloadMismatch } from "./idempotency-key-payload-mismatch-proof.js";

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

describe("proofIdempotencyKeyPayloadMismatch (T-X022)", () => {
  it("passes with Conflict + retention + VERIFIED-path + honesty details", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "soak-tx022-"));
    dirs.push(stateDir);
    const proof = await proofIdempotencyKeyPayloadMismatch(
      stateDir,
      "2026-11-21T18:00:00.000Z",
    );
    expect(proof.passed).toBe(true);
    expect(proof.kind).toBe(SoakProofKind.IDEMPOTENCY_KEY_PAYLOAD_MISMATCH);
    expect(proof.fixtureOnly).toBe(true);
    expect(proof.applyAttemptCount).toBe(1);
    expect(proof.details.some((d) => d.includes("→ Conflict"))).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("whitespace-distinct payloadDigest → Conflict"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("after VERIFIED + different payloadDigest → Conflict"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("decision/effect/provider retain digest A"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Alt-op Conflict left no orphan effect/decision"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("case-distinct payloadDigest (byte-exact) → Conflict"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("empty payloadDigest → Conflict")),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("NUL-suffix payloadDigest (byte-exact) → Conflict"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("tab-padded payloadDigest (byte-exact) → Conflict"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("CRLF-padded payloadDigest (byte-exact) → Conflict"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Receipt integrity") && d.includes("digest A only"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Re-verify after VERIFIED Conflict") &&
        d.includes("applyCount=1"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Concurrent") && d.includes("all Conflict"),
      ),
    ).toBe(true);
    expect(
      proof.details.some(
        (d) =>
          d.includes("Same-digest new operationId control") &&
          d.includes("replay, not Conflict"),
      ),
    ).toBe(true);
    expect(
      proof.details.some(
        (d) =>
          d.includes("Concurrent") &&
          d.includes("same-digest accepts") &&
          d.includes("not Conflict"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Business-key mismatch ≠ payload-mismatch Conflict"),
      ),
    ).toBe(true);
    expect(
      proof.details.some(
        (d) =>
          d.includes("Wrong-digest verifyIndependent") &&
          d.includes("FAILED applyCount=1") &&
          d.includes("≠ payload-mismatch Conflict"),
      ),
    ).toBe(true);
    expect(
      proof.details.some(
        (d) =>
          d.includes(`liveProviderWiring=${IDEMPOTENCY_PAYLOAD_MISMATCH_LIVE_WIRING}`) &&
          d.includes("externalEffects=NONE") &&
          d.includes("ACCEPTED≠VERIFIED") &&
          d.includes(
            `chatgptAdsConnectSoftSkip=${IDEMPOTENCY_PAYLOAD_MISMATCH_ADS_SOFT_SKIP.join(",")}`,
          ),
      ),
    ).toBe(true);
    expect(IDEMPOTENCY_PAYLOAD_MISMATCH_LIVE_WIRING).toBe("NOT_WIRED");
  });
});
