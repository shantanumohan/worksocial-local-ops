/**
 * T-X060 — Currency/timezone mismatch: no silent sum.
 *
 * Analytics / revenue series from heterogeneous currency or reporting
 * timezone contexts must not be silently summed. Matching dimensions may
 * aggregate; mismatches refuse with an explicit code (never invent a total).
 * Whitespace around currency/timezone is normalized so padding cannot invent
 * a mismatch or a match against blanks. Live provider wiring: NOT_WIRED.
 * External effects: NONE. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 *
 * Hillclimb G35: evaluateCurrencyTimezoneLiveClaim — refuse live VERIFIED /
 * silent-sum-on-mismatch claims; FALSE_AGGREGATED_PASS when claimed PASS
 * without measured AGGREGATED + totalMinor.
 */

export type CurrencyTimezoneObservation = {
  observationId: string;
  /** Amount in minor units of `currency` (never cross-currency converted here). */
  amountMinor: number;
  currency: string;
  reportingTimezone: string;
};

export type CurrencyTimezoneAggregateCode =
  | "AGGREGATED"
  | "CURRENCY_MISMATCH"
  | "TIMEZONE_MISMATCH"
  | "EMPTY_SERIES"
  | "INVALID_DIMENSION";

export type CurrencyTimezoneAggregateResult =
  | {
      ok: true;
      code: "AGGREGATED";
      totalMinor: number;
      currency: string;
      reportingTimezone: string;
      reasons: string[];
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
    }
  | {
      ok: false;
      code: Exclude<CurrencyTimezoneAggregateCode, "AGGREGATED">;
      totalMinor: null;
      currencies: string[];
      reportingTimezones: string[];
      reasons: string[];
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
    };

/** Normalize currency codes so case/padding cannot invent a parallel series. */
export function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

/** Normalize reporting timezone; trim only — IANA ids are case-sensitive. */
export function normalizeTimezone(tz: string): string {
  return tz.trim();
}

const honesty = {
  liveProviderWiring: "NOT_WIRED" as const,
  externalEffects: "NONE" as const,
  fixtureOnly: true as const,
};

/**
 * Sum observations only when every row shares the same currency and
 * reporting timezone. Otherwise refuse — no silent cross-dimension total,
 * no FX conversion, no inventing a zero from empty/invalid series.
 */
export function aggregateCurrencyTimezoneSeries(
  observations: readonly CurrencyTimezoneObservation[],
): CurrencyTimezoneAggregateResult {
  if (observations.length === 0) {
    return {
      ok: false,
      code: "EMPTY_SERIES",
      totalMinor: null,
      currencies: [],
      reportingTimezones: [],
      reasons: ["Empty series — refuse silent zero total"],
      ...honesty,
    };
  }

  const currencies = [
    ...new Set(observations.map((o) => normalizeCurrency(o.currency))),
  ];
  const reportingTimezones = [
    ...new Set(observations.map((o) => normalizeTimezone(o.reportingTimezone))),
  ];

  if (currencies.includes("") || reportingTimezones.includes("")) {
    return {
      ok: false,
      code: "INVALID_DIMENSION",
      totalMinor: null,
      currencies,
      reportingTimezones,
      reasons: [
        "Blank currency or reportingTimezone after normalize — refuse silent sum (T-X060)",
      ],
      ...honesty,
    };
  }

  if (currencies.length > 1) {
    return {
      ok: false,
      code: "CURRENCY_MISMATCH",
      totalMinor: null,
      currencies,
      reportingTimezones,
      reasons: [
        `Currency mismatch across series (${currencies.join(", ")}) — refuse silent sum (T-X060)`,
      ],
      ...honesty,
    };
  }

  if (reportingTimezones.length > 1) {
    return {
      ok: false,
      code: "TIMEZONE_MISMATCH",
      totalMinor: null,
      currencies,
      reportingTimezones,
      reasons: [
        `Reporting timezone mismatch across series (${reportingTimezones.join(", ")}) — refuse silent sum (T-X060)`,
      ],
      ...honesty,
    };
  }

  const hasNonIntegerMinor = observations.some(
    (o) => !Number.isFinite(o.amountMinor) || !Number.isInteger(o.amountMinor),
  );
  if (hasNonIntegerMinor) {
    return {
      ok: false,
      code: "INVALID_DIMENSION",
      totalMinor: null,
      currencies,
      reportingTimezones,
      reasons: [
        "Non-integer or non-finite amountMinor — refuse silent sum (T-X060 G35 wipe15)",
      ],
      ...honesty,
    };
  }

  const currency = currencies[0]!;
  const reportingTimezone = reportingTimezones[0]!;
  const totalMinor = observations.reduce((sum, o) => sum + o.amountMinor, 0);

  return {
    ok: true,
    code: "AGGREGATED",
    totalMinor,
    currency,
    reportingTimezone,
    reasons: [
      `Aggregated ${observations.length} observations in ${currency} / ${reportingTimezone} (matched dimensions)`,
    ],
    ...honesty,
  };
}

export const CURRENCY_TIMEZONE_AGGREGATION_RELATED_CASE_IDS = [
  "T-X060",
] as const;

export const CurrencyTimezoneLiveOutcome = {
  LIVE_WIRING_CLAIM_REFUSED: "LIVE_WIRING_CLAIM_REFUSED",
  LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED: "LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED",
  FIXTURE_ACCEPTED_AS_VERIFIED_REFUSED: "FIXTURE_ACCEPTED_AS_VERIFIED_REFUSED",
  SILENT_SUM_ON_MISMATCH_REFUSED: "SILENT_SUM_ON_MISMATCH_REFUSED",
  FALSE_AGGREGATED_PASS_REFUSED: "FALSE_AGGREGATED_PASS_REFUSED",
  /** Wipe15 G35 edge: claimed PASS with measured total ≠ series sum. */
  FALSE_AGGREGATED_TOTAL_MISMATCH_REFUSED:
    "FALSE_AGGREGATED_TOTAL_MISMATCH_REFUSED",
} as const;

export type CurrencyTimezoneLiveClaimDecision = {
  code:
    | (typeof CurrencyTimezoneLiveOutcome)[keyof typeof CurrencyTimezoneLiveOutcome];
  reasons: string[];
  liveProviderWiring: "NOT_WIRED";
  externalEffects: "NONE";
  fixtureOnly: true;
  fixtureAcceptedNotVerified: true;
};

function currencyTimezoneHonesty() {
  return {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    fixtureAcceptedNotVerified: true as const,
  };
}

function liveClaimRefuse(
  code: CurrencyTimezoneLiveClaimDecision["code"],
  reasons: string[],
): CurrencyTimezoneLiveClaimDecision {
  const honesty = currencyTimezoneHonesty();
  return { code, reasons, ...honesty };
}

/**
 * Refuse live-VERIFIED / silent-sum / false aggregated PASS on T-X060 fixture path.
 */
export function evaluateCurrencyTimezoneLiveClaim(input: {
  claimLiveVerified?: boolean;
  requestLiveWire?: boolean;
  fixtureOnly?: boolean;
  liveWiring?: "NOT_WIRED" | "WIRED";
  claimLiveProviderSuccess?: boolean;
  claimFixtureAcceptedIsVerified?: boolean;
  /** Forbidden — must not invent a total across currency/timezone mismatch. */
  claimSilentSumOnMismatch?: boolean;
  /**
   * Claimed AGGREGATED PASS — only when measuredCode is AGGREGATED and
   * totalMinor is a finite number (G35).
   */
  claimedAggregatedPass?: boolean;
  measuredCode?: CurrencyTimezoneAggregateCode;
  totalMinor?: number | null;
  /** Measured sum from aggregateCurrencyTimezoneSeries — must match totalMinor for PASS. */
  expectedTotalMinor?: number;
}): CurrencyTimezoneLiveClaimDecision | null {
  const honesty = currencyTimezoneHonesty();
  if (input.claimFixtureAcceptedIsVerified === true) {
    return liveClaimRefuse(
      CurrencyTimezoneLiveOutcome.FIXTURE_ACCEPTED_AS_VERIFIED_REFUSED,
      [
        "FIXTURE_ACCEPTED_AS_VERIFIED_REFUSED — T-X060 ACCEPTED must not be equated to sandbox/prod VERIFIED",
        `fixtureAcceptedNotVerified=${honesty.fixtureAcceptedNotVerified}`,
      ],
    );
  }
  if (input.claimLiveProviderSuccess === true) {
    return liveClaimRefuse(
      CurrencyTimezoneLiveOutcome.LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED,
      [
        "LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED — fixture currency/timezone soak must not claim live provider SUCCESS (T-X060)",
        `liveProviderWiring=${honesty.liveProviderWiring} externalEffects=${honesty.externalEffects}`,
      ],
    );
  }
  if (input.claimLiveVerified === true || input.requestLiveWire === true) {
    return liveClaimRefuse(CurrencyTimezoneLiveOutcome.LIVE_WIRING_CLAIM_REFUSED, [
      "Live VERIFIED / live-wire refused on T-X060 fixture path — ACCEPTED≠VERIFIED",
      `liveProviderWiring=${honesty.liveProviderWiring}`,
    ]);
  }
  if (input.fixtureOnly === false || input.liveWiring === "WIRED") {
    return liveClaimRefuse(CurrencyTimezoneLiveOutcome.LIVE_WIRING_CLAIM_REFUSED, [
      "Non-fixture or claimed WIRED refused — T-X060 liveProviderWiring=NOT_WIRED",
      `liveProviderWiring=${honesty.liveProviderWiring} externalEffects=${honesty.externalEffects}`,
    ]);
  }
  if (input.claimSilentSumOnMismatch === true) {
    return liveClaimRefuse(
      CurrencyTimezoneLiveOutcome.SILENT_SUM_ON_MISMATCH_REFUSED,
      [
        "SILENT_SUM_ON_MISMATCH_REFUSED — heterogeneous currency/timezone must not silently sum (T-X060)",
        `totalMinor=null enforced on mismatch; externalEffects=${honesty.externalEffects}`,
      ],
    );
  }
  if (input.claimedAggregatedPass === true) {
    const code = input.measuredCode;
    const minor = input.totalMinor;
    if (
      code !== "AGGREGATED" ||
      minor === null ||
      minor === undefined ||
      !Number.isFinite(minor)
    ) {
      return liveClaimRefuse(
        CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_PASS_REFUSED,
        [
          "FALSE_AGGREGATED_PASS_REFUSED — claimed AGGREGATED PASS without measured AGGREGATED totalMinor (T-X060)",
          `measuredCode=${code ?? "unmeasured"} totalMinor=${minor ?? "unmeasured"} ACCEPTED≠VERIFIED`,
        ],
      );
    }
    if (!Number.isInteger(minor)) {
      return liveClaimRefuse(
        CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_PASS_REFUSED,
        [
          "FALSE_AGGREGATED_PASS_REFUSED — totalMinor must be integer minor units, not fractional (T-X060 G35 wipe15)",
          `totalMinor=${minor} ACCEPTED≠VERIFIED`,
        ],
      );
    }
    if (input.expectedTotalMinor === undefined) {
      return liveClaimRefuse(
        CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_PASS_REFUSED,
        [
          "FALSE_AGGREGATED_PASS_REFUSED — claimed AGGREGATED PASS without measured expectedTotalMinor (T-X060 G35 wipe15)",
          `totalMinor=${minor} expectedTotalMinor=unmeasured ACCEPTED≠VERIFIED`,
        ],
      );
    }
    if (
      !Number.isFinite(input.expectedTotalMinor) ||
      !Number.isInteger(input.expectedTotalMinor)
    ) {
      return liveClaimRefuse(
        CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_PASS_REFUSED,
        [
          "FALSE_AGGREGATED_PASS_REFUSED — expectedTotalMinor must be integer minor units, not fractional (T-X060 G35 wipe15)",
          `totalMinor=${minor} expectedTotalMinor=${input.expectedTotalMinor} ACCEPTED≠VERIFIED`,
        ],
      );
    }
    if (minor !== input.expectedTotalMinor) {
      return liveClaimRefuse(
        CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_TOTAL_MISMATCH_REFUSED,
        [
          "FALSE_AGGREGATED_TOTAL_MISMATCH_REFUSED — claimed AGGREGATED PASS while totalMinor ≠ measured series sum (T-X060 G35 edge)",
          `totalMinor=${minor} expectedTotalMinor=${input.expectedTotalMinor} ACCEPTED≠VERIFIED`,
        ],
      );
    }
  }
  return null;
}
