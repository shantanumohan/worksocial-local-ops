/**
 * Fixture proof for T-X060 — Currency/timezone mismatch; no silent sum.
 * External effects: NONE. Live wiring NOT_WIRED.
 * Hillclimb: whitespace-normalized match, dual mismatch (currency first),
 * blank INVALID_DIMENSION, empty series, honesty stamps.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  aggregateCurrencyTimezoneSeries,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X060 fixture ACCEPTED.
 */
export function proofCurrencyTimezoneMismatchNoSilentSum(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // Positive control: matched currency + timezone may sum (incl. padding).
  const matched = aggregateCurrencyTimezoneSeries([
    {
      observationId: `obs-${randomUUID().slice(0, 8)}`,
      amountMinor: 400,
      currency: " USD ",
      reportingTimezone: " America/New_York",
    },
    {
      observationId: `obs-${randomUUID().slice(0, 8)}`,
      amountMinor: 150,
      currency: "usd",
      reportingTimezone: "America/New_York  ",
    },
  ]);
  if (
    matched.ok === true &&
    matched.code === "AGGREGATED" &&
    matched.totalMinor === 550 &&
    matched.currency === "USD" &&
    matched.reportingTimezone === "America/New_York" &&
    matched.liveProviderWiring === "NOT_WIRED" &&
    matched.externalEffects === "NONE" &&
    matched.fixtureOnly === true
  ) {
    details.push(
      "Matched USD / America/New_York (whitespace-normalized) → AGGREGATED totalMinor=550; liveProviderWiring=NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Matched aggregate unexpectedly ${JSON.stringify(matched)}`);
  }

  // Currency mismatch → refuse silent sum.
  const currencyMismatch = aggregateCurrencyTimezoneSeries([
    {
      observationId: `obs-${randomUUID().slice(0, 8)}`,
      amountMinor: 100,
      currency: "USD",
      reportingTimezone: "America/New_York",
    },
    {
      observationId: `obs-${randomUUID().slice(0, 8)}`,
      amountMinor: 100,
      currency: "EUR",
      reportingTimezone: "America/New_York",
    },
  ]);
  if (
    currencyMismatch.ok === false &&
    currencyMismatch.code === "CURRENCY_MISMATCH" &&
    currencyMismatch.totalMinor === null &&
    currencyMismatch.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "USD+EUR → CURRENCY_MISMATCH; totalMinor=null (no silent sum)",
    );
  } else {
    passed = false;
    details.push(
      `Currency mismatch unexpectedly ${JSON.stringify(currencyMismatch)}`,
    );
  }

  // Timezone mismatch → refuse silent sum.
  const tzMismatch = aggregateCurrencyTimezoneSeries([
    {
      observationId: `obs-${randomUUID().slice(0, 8)}`,
      amountMinor: 100,
      currency: "USD",
      reportingTimezone: "America/New_York",
    },
    {
      observationId: `obs-${randomUUID().slice(0, 8)}`,
      amountMinor: 100,
      currency: "USD",
      reportingTimezone: "Europe/London",
    },
  ]);
  if (
    tzMismatch.ok === false &&
    tzMismatch.code === "TIMEZONE_MISMATCH" &&
    tzMismatch.totalMinor === null &&
    tzMismatch.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "America/New_York+Europe/London → TIMEZONE_MISMATCH; totalMinor=null",
    );
  } else {
    passed = false;
    details.push(`Timezone mismatch unexpectedly ${JSON.stringify(tzMismatch)}`);
  }

  // Dual mismatch: currency checked before timezone — still totalMinor=null.
  const dualMismatch = aggregateCurrencyTimezoneSeries([
    {
      observationId: `obs-${randomUUID().slice(0, 8)}`,
      amountMinor: 100,
      currency: "USD",
      reportingTimezone: "America/New_York",
    },
    {
      observationId: `obs-${randomUUID().slice(0, 8)}`,
      amountMinor: 100,
      currency: "GBP",
      reportingTimezone: "Europe/London",
    },
  ]);
  if (
    dualMismatch.ok === false &&
    dualMismatch.code === "CURRENCY_MISMATCH" &&
    dualMismatch.totalMinor === null &&
    dualMismatch.currencies.includes("USD") &&
    dualMismatch.currencies.includes("GBP") &&
    dualMismatch.reportingTimezones.includes("America/New_York") &&
    dualMismatch.reportingTimezones.includes("Europe/London")
  ) {
    details.push(
      "USD/NY + GBP/London → CURRENCY_MISMATCH (currency-first); totalMinor=null; both dimension sets recorded",
    );
  } else {
    passed = false;
    details.push(`Dual mismatch unexpectedly ${JSON.stringify(dualMismatch)}`);
  }

  // Blank dimension → INVALID_DIMENSION (not silent zero).
  const blank = aggregateCurrencyTimezoneSeries([
    {
      observationId: `obs-${randomUUID().slice(0, 8)}`,
      amountMinor: 10,
      currency: "   ",
      reportingTimezone: "America/New_York",
    },
  ]);
  if (
    blank.ok === false &&
    blank.code === "INVALID_DIMENSION" &&
    blank.totalMinor === null
  ) {
    details.push("Blank currency → INVALID_DIMENSION; totalMinor=null");
  } else {
    passed = false;
    details.push(`Blank dimension unexpectedly ${JSON.stringify(blank)}`);
  }

  // Empty series → EMPTY_SERIES (not silent zero).
  const empty = aggregateCurrencyTimezoneSeries([]);
  if (
    empty.ok === false &&
    empty.code === "EMPTY_SERIES" &&
    empty.totalMinor === null &&
    empty.externalEffects === "NONE"
  ) {
    details.push("Empty series → EMPTY_SERIES; totalMinor=null");
  } else {
    passed = false;
    details.push(`Empty series unexpectedly ${JSON.stringify(empty)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );

  return {
    proofId: `proof-currency-tz-${randomUUID().slice(0, 8)}`,
    kind: SoakProofKind.CURRENCY_TIMEZONE_MISMATCH_NO_SILENT_SUM,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-currency-tz-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
