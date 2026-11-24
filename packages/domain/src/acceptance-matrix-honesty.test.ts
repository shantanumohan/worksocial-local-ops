import { describe, expect, it } from "vitest";
import {
  CHATGPT_ADS_GATE_CASE_IDS,
  CHATGPT_ADS_TRANSPORT_ENTITLEMENT_GATE,
  countAcceptanceStatusesByCase,
  validateChatGptAdsGateRetention,
  validateMatrixSummaryFreshness,
  validateReleaseEvidenceLedgerHonesty,
} from "./acceptance-matrix-honesty.js";

describe("acceptance-matrix-honesty", () => {
  it("counts statuses from cases and flags forbidden VERIFIED", () => {
    const counts = countAcceptanceStatusesByCase([
      { status: "NOT_RUN" },
      { status: "ACCEPTED" },
      { status: "ACCEPTED" },
      { status: "BLOCKED" },
      { status: "FAILED" },
      { status: "VERIFIED" },
      { status: "weird" },
    ]);
    expect(counts).toEqual({
      notRun: 1,
      accepted: 2,
      blocked: 1,
      failed: 1,
      verifiedForbidden: 1,
      other: 1,
      all: 7,
    });
  });

  it("detects stale summary.byStatus vs cases (scout drift shape)", () => {
    const cases = [
      ...Array.from({ length: 6 }, () => ({ status: "NOT_RUN" })),
      ...Array.from({ length: 153 }, () => ({ status: "ACCEPTED" })),
    ];
    const stale = validateMatrixSummaryFreshness({
      cases,
      totals: { all: 159, notRun: 6, accepted: 153 },
      summary: {
        total: 159,
        byStatus: { NOT_RUN: 7, ACCEPTED: 152 },
      },
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.reasons.some((r) => /summary\.byStatus\.NOT_RUN/.test(r))).toBe(
      true,
    );
    expect(
      stale.reasons.some((r) => /summary\.byStatus\.ACCEPTED/.test(r)),
    ).toBe(true);
  });

  it("passes when totals and summary match cases", () => {
    const cases = [
      { status: "NOT_RUN" },
      { status: "NOT_RUN" },
      { status: "ACCEPTED" },
    ];
    const ok = validateMatrixSummaryFreshness({
      cases,
      totals: { all: 3, notRun: 2, accepted: 1 },
      summary: { total: 3, byStatus: { NOT_RUN: 2, ACCEPTED: 1 } },
    });
    expect(ok).toEqual({
      ok: true,
      counts: {
        notRun: 2,
        accepted: 1,
        blocked: 0,
        failed: 0,
        verifiedForbidden: 0,
        other: 0,
        all: 3,
      },
    });
  });

  it("rejects swapped BLOCKED/FAILED summary buckets", () => {
    const cases = [{ status: "BLOCKED" }, { status: "ACCEPTED" }];
    const swapped = validateMatrixSummaryFreshness({
      cases,
      totals: { all: 2, notRun: 0, accepted: 1 },
      summary: { total: 2, byStatus: { ACCEPTED: 1, FAILED: 1 } },
    });
    expect(swapped.ok).toBe(false);
    if (swapped.ok) return;
    expect(swapped.reasons.some((r) => /summary\.byStatus\.BLOCKED/.test(r))).toBe(
      true,
    );
    expect(swapped.reasons.some((r) => /summary\.byStatus\.FAILED/.test(r))).toBe(
      true,
    );
  });

  it("retains ChatGPT Ads transport/entitlement gates and refuses ACCEPTED", () => {
    const missing = validateChatGptAdsGateRetention({
      cases: [
        {
          id: "T-F07",
          status: "NOT_RUN",
          gates: [],
        },
      ],
    });
    expect(missing.ok).toBe(false);

    const accepted = validateChatGptAdsGateRetention({
      cases: CHATGPT_ADS_GATE_CASE_IDS.map((id) => ({
        id,
        status: "ACCEPTED",
        gates: [CHATGPT_ADS_TRANSPORT_ENTITLEMENT_GATE],
      })),
    });
    expect(accepted.ok).toBe(false);

    const ok = validateChatGptAdsGateRetention({
      cases: CHATGPT_ADS_GATE_CASE_IDS.map((id) => ({
        id,
        status: "NOT_RUN",
        gates: [CHATGPT_ADS_TRANSPORT_ENTITLEMENT_GATE],
      })),
    });
    expect(ok).toEqual({ ok: true });
  });

  it("enforces release:evidence ledger honesty invariants", () => {
    const bad = validateReleaseEvidenceLedgerHonesty({
      environment: "authorized_production",
      externalEffects: "MUTATED",
      r1CompleteClaimed: true,
      chatgptAds: { allowed: true, wiring: "LIVE" },
      liveWiring: { cms: "LIVE" },
      cases: [{ status: "VERIFIED" }],
      artifacts: [
        {
          liveProviderSuccessClaimed: true,
          externalEffects: "MUTATED",
          redacted: false,
        },
      ],
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.reasons.length).toBeGreaterThanOrEqual(5);

    const omittedAds = validateReleaseEvidenceLedgerHonesty({
      environment: "fixture",
      externalEffects: "NONE",
      r1CompleteClaimed: false,
      chatgptAds: null,
      liveWiring: { cms: "NOT_WIRED" },
      cases: [{ status: "ACCEPTED" }],
      artifacts: [
        {
          liveProviderSuccessClaimed: false,
          externalEffects: "NONE",
          redacted: true,
        },
      ],
    });
    expect(omittedAds.ok).toBe(false);
    if (omittedAds.ok) return;
    expect(omittedAds.reasons.some((r) => /chatgptAds must be present/.test(r))).toBe(
      true,
    );

    const ok = validateReleaseEvidenceLedgerHonesty({
      environment: "fixture",
      externalEffects: "NONE",
      r1CompleteClaimed: false,
      chatgptAds: { allowed: false, wiring: "NOT_WIRED" },
      liveWiring: { cms: "NOT_WIRED", gsc: "NOT_WIRED" },
      cases: [{ status: "ACCEPTED" }, { status: "NOT_RUN" }],
      artifacts: [
        {
          liveProviderSuccessClaimed: false,
          externalEffects: "NONE",
          redacted: true,
        },
      ],
    });
    expect(ok).toEqual({ ok: true });
  });
});
