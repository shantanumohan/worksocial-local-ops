/**
 * Honesty helpers for acceptance-matrix validation and release:evidence ledgers.
 * Pure domain — no I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 * externalEffects must remain NONE for offline evidence; live wiring NOT_WIRED.
 */

export const CHATGPT_ADS_GATE_CASE_IDS = [
  "T-F07",
  "T-US-013",
  "T-US-014",
] as const;

export type ChatGptAdsGateCaseId = (typeof CHATGPT_ADS_GATE_CASE_IDS)[number];

export const CHATGPT_ADS_TRANSPORT_ENTITLEMENT_GATE =
  "chatgpt_ads_transport_entitlement";

export const RELEASE_EVIDENCE_EXTERNAL_EFFECTS_NONE = "NONE" as const;

export type AcceptanceStatusCounts = {
  notRun: number;
  accepted: number;
  blocked: number;
  failed: number;
  verifiedForbidden: number;
  other: number;
  all: number;
};

export function countAcceptanceStatusesByCase(
  cases: readonly { status: string }[],
): AcceptanceStatusCounts {
  const counts: AcceptanceStatusCounts = {
    notRun: 0,
    accepted: 0,
    blocked: 0,
    failed: 0,
    verifiedForbidden: 0,
    other: 0,
    all: cases.length,
  };
  for (const c of cases) {
    const status = String(c.status ?? "").toUpperCase();
    if (status === "VERIFIED") {
      counts.verifiedForbidden += 1;
      continue;
    }
    if (status === "NOT_RUN") {
      counts.notRun += 1;
      continue;
    }
    if (status === "ACCEPTED") {
      counts.accepted += 1;
      continue;
    }
    if (status === "BLOCKED") {
      counts.blocked += 1;
      continue;
    }
    if (status === "FAILED") {
      counts.failed += 1;
      continue;
    }
    counts.other += 1;
  }
  return counts;
}

/**
 * When `totals` / `summary.byStatus` are present they must match `cases[]`.
 * Scout drift (stale summary NOT_RUN:7 / ACCEPTED:152 while cases are 6/153)
 * must fail closed — trust cases first, then totals, then summary.
 */
export function validateMatrixSummaryFreshness(input: {
  cases: readonly { status: string }[];
  totals?: {
    all?: number;
    notRun?: number;
    accepted?: number;
  };
  summary?: {
    total?: number;
    byStatus?: Record<string, number>;
  };
}):
  | { ok: true; counts: AcceptanceStatusCounts }
  | { ok: false; reasons: string[]; counts: AcceptanceStatusCounts } {
  const counts = countAcceptanceStatusesByCase(input.cases);
  const reasons: string[] = [];

  if (counts.verifiedForbidden > 0) {
    reasons.push(
      `cases contain ${counts.verifiedForbidden} VERIFIED row(s) — never silently VERIFIED for live`,
    );
  }

  if (input.totals?.all !== undefined && input.totals.all !== counts.all) {
    reasons.push(
      `totals.all expected ${counts.all} from cases, got ${input.totals.all}`,
    );
  }
  if (
    input.totals?.notRun !== undefined &&
    input.totals.notRun !== counts.notRun
  ) {
    reasons.push(
      `totals.notRun expected ${counts.notRun} from cases, got ${input.totals.notRun}`,
    );
  }
  if (
    input.totals?.accepted !== undefined &&
    input.totals.accepted !== counts.accepted
  ) {
    reasons.push(
      `totals.accepted expected ${counts.accepted} from cases, got ${input.totals.accepted}`,
    );
  }

  if (input.summary?.total !== undefined && input.summary.total !== counts.all) {
    reasons.push(
      `summary.total expected ${counts.all} from cases, got ${input.summary.total}`,
    );
  }

  const byStatus = input.summary?.byStatus;
  if (byStatus) {
    const expectedBuckets: Array<{
      key: string;
      expected: number;
    }> = [
      { key: "NOT_RUN", expected: counts.notRun },
      { key: "ACCEPTED", expected: counts.accepted },
      { key: "BLOCKED", expected: counts.blocked },
      { key: "FAILED", expected: counts.failed },
    ];
    for (const { key, expected } of expectedBuckets) {
      const reported = byStatus[key] ?? 0;
      if (reported !== expected) {
        reasons.push(
          `summary.byStatus.${key} expected ${expected} from cases, got ${reported} (stale summary)`,
        );
      }
    }
    if ((byStatus.VERIFIED ?? 0) !== 0) {
      reasons.push(
        `summary.byStatus.VERIFIED must be 0 — ACCEPTED ≠ VERIFIED; never silently VERIFIED for live`,
      );
    }
    for (const [status, n] of Object.entries(byStatus)) {
      if (!Number.isInteger(n) || n < 0) {
        reasons.push(
          `summary.byStatus.${status} must be a non-negative integer, got ${JSON.stringify(n)}`,
        );
      }
      if (
        status !== "NOT_RUN" &&
        status !== "ACCEPTED" &&
        status !== "BLOCKED" &&
        status !== "FAILED" &&
        status !== "VERIFIED" &&
        n !== 0
      ) {
        reasons.push(
          `summary.byStatus.${status} is unsupported (must be 0 or omitted), got ${n}`,
        );
      }
    }
    const summed = Object.values(byStatus).reduce((a, b) => a + b, 0);
    if (summed !== counts.all) {
      reasons.push(
        `summary.byStatus sums to ${summed}, expected ${counts.all} from cases`,
      );
    }
  }

  return reasons.length === 0
    ? { ok: true, counts }
    : { ok: false, reasons, counts };
}

export function validateChatGptAdsGateRetention(input: {
  cases: readonly {
    id: string;
    status: string;
    gates?: string[];
  }[];
}): { ok: true } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  for (const id of CHATGPT_ADS_GATE_CASE_IDS) {
    const c = input.cases.find((x) => x.id === id);
    if (!c) {
      reasons.push(`${id} missing from matrix — ChatGPT Ads gate required`);
      continue;
    }
    if (!c.gates?.includes(CHATGPT_ADS_TRANSPORT_ENTITLEMENT_GATE)) {
      reasons.push(
        `${id} must retain ${CHATGPT_ADS_TRANSPORT_ENTITLEMENT_GATE} gate`,
      );
    }
    if (c.status === "ACCEPTED") {
      reasons.push(
        `${id} ChatGPT Ads case must not be ACCEPTED without transport/entitlement`,
      );
    }
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

/**
 * release:evidence ledger honesty — fixture-only package invariants.
 */
export function validateReleaseEvidenceLedgerHonesty(input: {
  environment?: string | null;
  externalEffects?: string | null;
  r1CompleteClaimed?: boolean;
  chatgptAds?: { allowed?: boolean; wiring?: string | null } | null;
  liveWiring?: Record<string, string> | null;
  cases?: readonly { status: string }[] | null;
  artifacts?:
    | readonly {
        liveProviderSuccessClaimed?: boolean;
        externalEffects?: string;
        redacted?: boolean;
      }[]
    | null;
}): { ok: true } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];

  if (input.environment !== "fixture") {
    reasons.push(
      `release:evidence ledger environment must be fixture, got ${JSON.stringify(input.environment)}`,
    );
  }
  if (input.externalEffects !== RELEASE_EVIDENCE_EXTERNAL_EFFECTS_NONE) {
    reasons.push(
      `release:evidence externalEffects must be NONE, got ${JSON.stringify(input.externalEffects)}`,
    );
  }
  if (input.r1CompleteClaimed === true) {
    reasons.push("release:evidence must not claim R1-complete");
  }
  if (!input.chatgptAds) {
    reasons.push(
      "release:evidence chatgptAds must be present with allowed=false and wiring=NOT_WIRED",
    );
  } else {
    if (input.chatgptAds.allowed !== false) {
      reasons.push(
        `release:evidence ChatGPT Ads must remain ACCESS_BLOCKED (allowed=false), got ${JSON.stringify(input.chatgptAds.allowed)}`,
      );
    }
    if (String(input.chatgptAds.wiring ?? "").toUpperCase() !== "NOT_WIRED") {
      reasons.push(
        `release:evidence chatgptAds.wiring must be NOT_WIRED, got ${JSON.stringify(input.chatgptAds.wiring)}`,
      );
    }
  }
  if (input.liveWiring) {
    for (const [k, v] of Object.entries(input.liveWiring)) {
      if (String(v).toUpperCase() !== "NOT_WIRED") {
        reasons.push(
          `release:evidence liveWiring.${k} must be NOT_WIRED, got ${JSON.stringify(v)}`,
        );
      }
    }
  }
  for (const c of input.cases ?? []) {
    if (String(c.status).toUpperCase() === "VERIFIED") {
      reasons.push(
        "release:evidence ledger must not contain VERIFIED case status",
      );
      break;
    }
  }
  for (const art of input.artifacts ?? []) {
    if (art.liveProviderSuccessClaimed === true) {
      reasons.push(
        "release:evidence artifacts must not claim live provider success",
      );
      break;
    }
    if (
      art.externalEffects != null &&
      art.externalEffects !== RELEASE_EVIDENCE_EXTERNAL_EFFECTS_NONE
    ) {
      reasons.push(
        `release:evidence artifact externalEffects must be NONE, got ${JSON.stringify(art.externalEffects)}`,
      );
      break;
    }
    if (art.redacted === false) {
      reasons.push("release:evidence artifacts must be redacted");
      break;
    }
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
