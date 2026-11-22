/**
 * T-X060 — Currency/timezone mismatch: no silent sum.
 *
 * Analytics / revenue series from heterogeneous currency or reporting
 * timezone contexts must not be silently summed. Matching dimensions may
 * aggregate; mismatches refuse with an explicit code (never invent a total).
 * External effects: NONE. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
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
  | "EMPTY_SERIES";

export type CurrencyTimezoneAggregateResult =
  | {
      ok: true;
      code: "AGGREGATED";
      totalMinor: number;
      currency: string;
      reportingTimezone: string;
      reasons: string[];
    }
  | {
      ok: false;
      code: Exclude<CurrencyTimezoneAggregateCode, "AGGREGATED">;
      totalMinor: null;
      currencies: string[];
      reportingTimezones: string[];
      reasons: string[];
    };

function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

function normalizeTimezone(tz: string): string {
  return tz.trim();
}

/**
 * Sum observations only when every row shares the same currency and
 * reporting timezone. Otherwise refuse — no silent cross-dimension total.
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
    };
  }

  const currencies = [
    ...new Set(observations.map((o) => normalizeCurrency(o.currency))),
  ];
  const reportingTimezones = [
    ...new Set(observations.map((o) => normalizeTimezone(o.reportingTimezone))),
  ];

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
  };
}

export const CURRENCY_TIMEZONE_AGGREGATION_RELATED_CASE_IDS = [
  "T-X060",
] as const;
