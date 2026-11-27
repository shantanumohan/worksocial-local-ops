/**
 * Fixture proof for T-X060 — Currency/timezone mismatch; no silent sum.
 * External effects: NONE. Live wiring NOT_WIRED.
 * Hillclimb: whitespace-normalized match, dual mismatch (currency first),
 * blank INVALID_DIMENSION, empty series, honesty stamps.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  CurrencyTimezoneLiveOutcome,
  aggregateCurrencyTimezoneSeries,
  evaluateCurrencyTimezoneLiveClaim,
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

  const unsafeTotal = aggregateCurrencyTimezoneSeries([
    {
      observationId: `obs-${randomUUID().slice(0, 8)}`,
      amountMinor: Number.MAX_SAFE_INTEGER - 50,
      currency: "USD",
      reportingTimezone: "America/New_York",
    },
    {
      observationId: `obs-${randomUUID().slice(0, 8)}`,
      amountMinor: 100,
      currency: "USD",
      reportingTimezone: "America/New_York",
    },
  ]);
  if (
    unsafeTotal.ok === false &&
    unsafeTotal.code === "INVALID_DIMENSION" &&
    unsafeTotal.totalMinor === null
  ) {
    details.push(
      "Overflow totalMinor → INVALID_DIMENSION; totalMinor=null (G37)",
    );
  } else {
    passed = false;
    details.push(`Unsafe total unexpectedly ${JSON.stringify(unsafeTotal)}`);
  }

  const negativeMinor = aggregateCurrencyTimezoneSeries([
    {
      observationId: `obs-${randomUUID().slice(0, 8)}`,
      amountMinor: -5,
      currency: "USD",
      reportingTimezone: "America/New_York",
    },
  ]);
  if (
    negativeMinor.ok === false &&
    negativeMinor.code === "INVALID_DIMENSION" &&
    negativeMinor.totalMinor === null
  ) {
    details.push("Negative amountMinor → INVALID_DIMENSION; totalMinor=null (G38)");
  } else {
    passed = false;
    details.push(`Negative minor unexpectedly ${JSON.stringify(negativeMinor)}`);
  }

  const blankObservationId = aggregateCurrencyTimezoneSeries([
    {
      observationId: "   ",
      amountMinor: 50,
      currency: "USD",
      reportingTimezone: "America/New_York",
    },
  ]);
  if (
    blankObservationId.ok === false &&
    blankObservationId.code === "INVALID_DIMENSION" &&
    blankObservationId.totalMinor === null
  ) {
    details.push(
      "Blank observationId → INVALID_DIMENSION; totalMinor=null (G43)",
    );
  } else {
    passed = false;
    details.push(
      `Blank observationId unexpectedly ${JSON.stringify(blankObservationId)}`,
    );
  }

  const signedZeroMinor = aggregateCurrencyTimezoneSeries([
    {
      observationId: `obs-${randomUUID().slice(0, 8)}`,
      amountMinor: -0,
      currency: "USD",
      reportingTimezone: "America/New_York",
    },
  ]);
  if (
    signedZeroMinor.ok === false &&
    signedZeroMinor.code === "INVALID_DIMENSION" &&
    signedZeroMinor.totalMinor === null
  ) {
    details.push(
      "Signed-zero amountMinor → INVALID_DIMENSION; totalMinor=null (G44)",
    );
  } else {
    passed = false;
    details.push(
      `Signed-zero amountMinor unexpectedly ${JSON.stringify(signedZeroMinor)}`,
    );
  }

  const fractionalMinor = aggregateCurrencyTimezoneSeries([
    {
      observationId: `obs-${randomUUID().slice(0, 8)}`,
      amountMinor: 100.25,
      currency: "USD",
      reportingTimezone: "America/New_York",
    },
  ]);
  if (
    fractionalMinor.ok === false &&
    fractionalMinor.code === "INVALID_DIMENSION" &&
    fractionalMinor.totalMinor === null
  ) {
    details.push("Fractional amountMinor → INVALID_DIMENSION; totalMinor=null");
  } else {
    passed = false;
    details.push(`Fractional minor unexpectedly ${JSON.stringify(fractionalMinor)}`);
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

  const measuredTotal = matched.ok ? matched.totalMinor : -1;
  const falseAggregatedPass = evaluateCurrencyTimezoneLiveClaim({
    claimedAggregatedPass: true,
    measuredCode: "CURRENCY_MISMATCH",
    totalMinor: null,
  });
  const falseAggregatedUnmeasured = evaluateCurrencyTimezoneLiveClaim({
    claimedAggregatedPass: true,
  });
  const falseExpectedUnmeasured = evaluateCurrencyTimezoneLiveClaim({
    claimedAggregatedPass: true,
    measuredCode: "AGGREGATED",
    totalMinor: measuredTotal,
  });
  const silentSumClaim = evaluateCurrencyTimezoneLiveClaim({
    claimSilentSumOnMismatch: true,
  });
  const aggCurrency = matched.ok ? matched.currency : "USD";
  const aggTz = matched.ok ? matched.reportingTimezone : "America/New_York";
  const aggregatedPassOk =
    evaluateCurrencyTimezoneLiveClaim({
      claimedAggregatedPass: true,
      measuredCode: "AGGREGATED",
      totalMinor: measuredTotal,
      expectedTotalMinor: measuredTotal,
      measuredCurrency: aggCurrency,
      measuredReportingTimezone: aggTz,
      claimedCurrency: ` ${aggCurrency} `,
      claimedReportingTimezone: aggTz,
    }) === null;
  const falseDimensionMismatch = evaluateCurrencyTimezoneLiveClaim({
    claimedAggregatedPass: true,
    measuredCode: "AGGREGATED",
    totalMinor: measuredTotal,
    expectedTotalMinor: measuredTotal,
    measuredCurrency: aggCurrency,
    measuredReportingTimezone: aggTz,
    claimedCurrency: aggCurrency,
    claimedReportingTimezone: "UTC",
  });
  const falseTotalMismatch = evaluateCurrencyTimezoneLiveClaim({
    claimedAggregatedPass: true,
    measuredCode: "AGGREGATED",
    totalMinor: measuredTotal + 1,
    expectedTotalMinor: measuredTotal,
  });
  const falseFractionalMinor = evaluateCurrencyTimezoneLiveClaim({
    claimedAggregatedPass: true,
    measuredCode: "AGGREGATED",
    totalMinor: measuredTotal + 0.5,
    expectedTotalMinor: measuredTotal + 0.5,
  });
  const falseNegativeTotal = evaluateCurrencyTimezoneLiveClaim({
    claimedAggregatedPass: true,
    measuredCode: "AGGREGATED",
    totalMinor: -1,
    expectedTotalMinor: -1,
  });
  const unsafeClaimMinor = Number.MAX_SAFE_INTEGER + 1;
  const falseUnsafeTotal = evaluateCurrencyTimezoneLiveClaim({
    claimedAggregatedPass: true,
    measuredCode: "AGGREGATED",
    totalMinor: unsafeClaimMinor,
    expectedTotalMinor: unsafeClaimMinor,
  });
  const falseFractionalExpected = evaluateCurrencyTimezoneLiveClaim({
    claimedAggregatedPass: true,
    measuredCode: "AGGREGATED",
    totalMinor: measuredTotal,
    expectedTotalMinor: measuredTotal + 0.25,
  });
  const falseNegativeExpected = evaluateCurrencyTimezoneLiveClaim({
    claimedAggregatedPass: true,
    measuredCode: "AGGREGATED",
    totalMinor: measuredTotal,
    expectedTotalMinor: -1,
  });
  const falseBlankDimensionPass = evaluateCurrencyTimezoneLiveClaim({
    claimedAggregatedPass: true,
    measuredCode: "AGGREGATED",
    totalMinor: measuredTotal,
    expectedTotalMinor: measuredTotal,
    measuredCurrency: "   ",
    measuredReportingTimezone: "   ",
    claimedCurrency: "   ",
    claimedReportingTimezone: "   ",
  });
  const falseSignedZeroTotal = evaluateCurrencyTimezoneLiveClaim({
    claimedAggregatedPass: true,
    measuredCode: "AGGREGATED",
    totalMinor: -0,
    expectedTotalMinor: 0,
  });
  const falseSignedZeroExpected = evaluateCurrencyTimezoneLiveClaim({
    claimedAggregatedPass: true,
    measuredCode: "AGGREGATED",
    totalMinor: 0,
    expectedTotalMinor: -0,
  });

  if (
    falseAggregatedPass?.code ===
      CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_PASS_REFUSED &&
    falseAggregatedUnmeasured?.code ===
      CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_PASS_REFUSED &&
    falseExpectedUnmeasured?.code ===
      CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_PASS_REFUSED &&
    silentSumClaim?.code ===
      CurrencyTimezoneLiveOutcome.SILENT_SUM_ON_MISMATCH_REFUSED &&
    falseTotalMismatch?.code ===
      CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_TOTAL_MISMATCH_REFUSED &&
    falseFractionalMinor?.code ===
      CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_PASS_REFUSED &&
    falseFractionalExpected?.code ===
      CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_PASS_REFUSED &&
    falseNegativeExpected?.code ===
      CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_PASS_REFUSED &&
    falseNegativeTotal?.code ===
      CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_PASS_REFUSED &&
    falseUnsafeTotal?.code ===
      CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_PASS_REFUSED &&
    falseBlankDimensionPass?.code ===
      CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_PASS_REFUSED &&
    falseSignedZeroTotal?.code ===
      CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_PASS_REFUSED &&
    falseSignedZeroExpected?.code ===
      CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_PASS_REFUSED &&
    falseDimensionMismatch?.code ===
      CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_DIMENSION_MISMATCH_REFUSED &&
    aggregatedPassOk
  ) {
    details.push(
      "G35–G44 liveClaim: FALSE_AGGREGATED_PASS/DIMENSION_MISMATCH; SILENT_SUM refused",
    );
  } else {
    passed = false;
    details.push("G35–G44 liveClaim gates unexpectedly failed");
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE deepen=G44",
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
