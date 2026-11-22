/**
 * Fixture proof for T-X060 — Currency/timezone mismatch; no silent sum.
 * External effects: NONE.
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

  // Positive control: matched currency + timezone may sum.
  const matched = aggregateCurrencyTimezoneSeries([
    {
      observationId: `obs-${randomUUID().slice(0, 8)}`,
      amountMinor: 400,
      currency: "USD",
      reportingTimezone: "America/New_York",
    },
    {
      observationId: `obs-${randomUUID().slice(0, 8)}`,
      amountMinor: 150,
      currency: "USD",
      reportingTimezone: "America/New_York",
    },
  ]);
  if (
    matched.ok === true &&
    matched.code === "AGGREGATED" &&
    matched.totalMinor === 550 &&
    matched.currency === "USD"
  ) {
    details.push(
      "Matched USD / America/New_York → AGGREGATED totalMinor=550",
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
    currencyMismatch.totalMinor === null
  ) {
    details.push("USD+EUR → CURRENCY_MISMATCH; totalMinor=null (no silent sum)");
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
    tzMismatch.totalMinor === null
  ) {
    details.push(
      "America/New_York+Europe/London → TIMEZONE_MISMATCH; totalMinor=null",
    );
  } else {
    passed = false;
    details.push(`Timezone mismatch unexpectedly ${JSON.stringify(tzMismatch)}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

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
