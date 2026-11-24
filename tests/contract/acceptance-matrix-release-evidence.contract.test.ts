/**
 * Contract: acceptance-matrix summary freshness + release:evidence ledger honesty.
 * Additive hardening (AA-209 slot J) — no new catalog IDs; ACCEPTED ≠ VERIFIED.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CHATGPT_ADS_GATE_CASE_IDS,
  CHATGPT_ADS_TRANSPORT_ENTITLEMENT_GATE,
  validateChatGptAdsGateRetention,
  validateMatrixSummaryFreshness,
  validateReleaseEvidenceLedgerHonesty,
} from "@worksocial/domain";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const matrixPath = resolve(root, "tests/acceptance-matrix-v6.json");
const ledgerPath = resolve(
  root,
  "tests/acceptance-evidence/fixture/evidence-ledger.json",
);

describe("contract: acceptance-matrix + release:evidence honesty", () => {
  it("keeps matrix totals and summary.byStatus fresh vs cases[]", () => {
    const matrix = JSON.parse(readFileSync(matrixPath, "utf8")) as {
      cases: { id: string; status: string; gates?: string[] }[];
      totals: { all: number; notRun?: number; accepted?: number };
      summary?: { total?: number; byStatus?: Record<string, number> };
    };

    const freshness = validateMatrixSummaryFreshness({
      cases: matrix.cases,
      totals: matrix.totals,
      summary: matrix.summary,
    });
    expect(freshness.ok).toBe(true);
    if (!freshness.ok) return;
    expect(freshness.counts.all).toBe(159);
    expect(
      freshness.counts.notRun +
        freshness.counts.accepted +
        freshness.counts.blocked +
        freshness.counts.failed +
        freshness.counts.other,
    ).toBe(freshness.counts.all);
    expect(freshness.counts.verifiedForbidden).toBe(0);

    const ads = validateChatGptAdsGateRetention({ cases: matrix.cases });
    expect(ads).toEqual({ ok: true });
    for (const id of CHATGPT_ADS_GATE_CASE_IDS) {
      const row = matrix.cases.find((c) => c.id === id);
      expect(row?.status).toBe("ACCEPTED");
      expect(row?.gates).toContain(CHATGPT_ADS_TRANSPORT_ENTITLEMENT_GATE);
      expect(row?.resultEnvironment).toBe("fixture");
      expect(row?.evidenceArtifactId).toBeTruthy();
    }
  });

  it("keeps on-disk release:evidence ledger fixture-honest", () => {
    const ledger = JSON.parse(readFileSync(ledgerPath, "utf8")) as {
      environment?: string;
      externalEffects?: string;
      r1CompleteClaimed?: boolean;
      chatgptAds?: { allowed?: boolean; wiring?: string };
      liveWiring?: Record<string, string>;
      cases?: { status: string }[];
      artifacts?: {
        liveProviderSuccessClaimed?: boolean;
        externalEffects?: string;
        redacted?: boolean;
      }[];
    };

    const check = validateReleaseEvidenceLedgerHonesty(ledger);
    expect(check).toEqual({ ok: true });
    expect(ledger.environment).toBe("fixture");
    expect(ledger.externalEffects).toBe("NONE");
    expect(ledger.chatgptAds?.allowed).toBe(false);
    expect(ledger.chatgptAds?.wiring).toBe("NOT_WIRED");
  });
});
