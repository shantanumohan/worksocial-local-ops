import { describe, expect, it } from "vitest";
import {
  aggregateCurrencyTimezoneSeries,
  CurrencyTimezoneLiveOutcome,
  evaluateCurrencyTimezoneLiveClaim,
  normalizeCurrency,
  normalizeTimezone,
} from "./currency-timezone-aggregation.js";

describe("currency-timezone aggregation (T-X060)", () => {
  it("aggregates when currency and timezone match", () => {
    const result = aggregateCurrencyTimezoneSeries([
      {
        observationId: "a",
        amountMinor: 100,
        currency: "USD",
        reportingTimezone: "America/New_York",
      },
      {
        observationId: "b",
        amountMinor: 250,
        currency: "usd",
        reportingTimezone: "America/New_York",
      },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.code).toBe("AGGREGATED");
      expect(result.totalMinor).toBe(350);
      expect(result.currency).toBe("USD");
      expect(result.reportingTimezone).toBe("America/New_York");
      expect(result.liveProviderWiring).toBe("NOT_WIRED");
      expect(result.externalEffects).toBe("NONE");
      expect(result.fixtureOnly).toBe(true);
    }
  });

  it("collapses whitespace-padded currency/timezone into a match", () => {
    expect(normalizeCurrency(" usd ")).toBe("USD");
    expect(normalizeTimezone("  America/New_York ")).toBe("America/New_York");
    const result = aggregateCurrencyTimezoneSeries([
      {
        observationId: "a",
        amountMinor: 100,
        currency: " USD ",
        reportingTimezone: " America/New_York",
      },
      {
        observationId: "b",
        amountMinor: 50,
        currency: "usd",
        reportingTimezone: "America/New_York  ",
      },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.totalMinor).toBe(150);
      expect(result.currency).toBe("USD");
      expect(result.reportingTimezone).toBe("America/New_York");
    }
  });

  it("refuses silent sum on currency mismatch", () => {
    const result = aggregateCurrencyTimezoneSeries([
      {
        observationId: "a",
        amountMinor: 100,
        currency: "USD",
        reportingTimezone: "America/New_York",
      },
      {
        observationId: "b",
        amountMinor: 200,
        currency: "EUR",
        reportingTimezone: "America/New_York",
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CURRENCY_MISMATCH");
      expect(result.totalMinor).toBeNull();
      expect(result.currencies).toEqual(["USD", "EUR"]);
      expect(result.liveProviderWiring).toBe("NOT_WIRED");
    }
  });

  it("refuses silent sum on timezone mismatch", () => {
    const result = aggregateCurrencyTimezoneSeries([
      {
        observationId: "a",
        amountMinor: 100,
        currency: "USD",
        reportingTimezone: "America/New_York",
      },
      {
        observationId: "b",
        amountMinor: 200,
        currency: "USD",
        reportingTimezone: "UTC",
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("TIMEZONE_MISMATCH");
      expect(result.totalMinor).toBeNull();
      expect(result.reportingTimezones).toEqual(["America/New_York", "UTC"]);
    }
  });

  it("prefers CURRENCY_MISMATCH when both currency and timezone differ", () => {
    const result = aggregateCurrencyTimezoneSeries([
      {
        observationId: "a",
        amountMinor: 100,
        currency: "USD",
        reportingTimezone: "America/New_York",
      },
      {
        observationId: "b",
        amountMinor: 200,
        currency: "GBP",
        reportingTimezone: "Europe/London",
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CURRENCY_MISMATCH");
      expect(result.totalMinor).toBeNull();
      expect(result.currencies).toEqual(["USD", "GBP"]);
      expect(result.reportingTimezones).toEqual([
        "America/New_York",
        "Europe/London",
      ]);
    }
  });

  it("refuses blank currency/timezone as INVALID_DIMENSION", () => {
    const result = aggregateCurrencyTimezoneSeries([
      {
        observationId: "a",
        amountMinor: 100,
        currency: "   ",
        reportingTimezone: "America/New_York",
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_DIMENSION");
      expect(result.totalMinor).toBeNull();
      expect(result.liveProviderWiring).toBe("NOT_WIRED");
    }
  });

  it("refuses fractional amountMinor as INVALID_DIMENSION", () => {
    const result = aggregateCurrencyTimezoneSeries([
      {
        observationId: "a",
        amountMinor: 100,
        currency: "USD",
        reportingTimezone: "America/New_York",
      },
      {
        observationId: "b",
        amountMinor: 50.5,
        currency: "USD",
        reportingTimezone: "America/New_York",
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_DIMENSION");
      expect(result.totalMinor).toBeNull();
    }
  });

  it("refuses empty series as silent zero", () => {
    const result = aggregateCurrencyTimezoneSeries([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("EMPTY_SERIES");
      expect(result.totalMinor).toBeNull();
      expect(result.externalEffects).toBe("NONE");
    }
  });

  it("G35: evaluateCurrencyTimezoneLiveClaim honesty gates", () => {
    expect(
      evaluateCurrencyTimezoneLiveClaim({
        claimedAggregatedPass: true,
        measuredCode: "AGGREGATED",
        totalMinor: 100,
        expectedTotalMinor: 100,
      }),
    ).toBeNull();
    expect(
      evaluateCurrencyTimezoneLiveClaim({
        claimedAggregatedPass: true,
        measuredCode: "AGGREGATED",
        totalMinor: 100,
      })?.code,
    ).toBe(CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_PASS_REFUSED);
    expect(
      evaluateCurrencyTimezoneLiveClaim({
        claimedAggregatedPass: true,
        measuredCode: "CURRENCY_MISMATCH",
        totalMinor: null,
      })?.code,
    ).toBe(CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_PASS_REFUSED);
    expect(
      evaluateCurrencyTimezoneLiveClaim({
        claimedAggregatedPass: true,
        measuredCode: "AGGREGATED",
      })?.code,
    ).toBe(CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_PASS_REFUSED);
    expect(
      evaluateCurrencyTimezoneLiveClaim({ claimSilentSumOnMismatch: true })
        ?.code,
    ).toBe(CurrencyTimezoneLiveOutcome.SILENT_SUM_ON_MISMATCH_REFUSED);
    expect(
      evaluateCurrencyTimezoneLiveClaim({ claimLiveVerified: true })?.code,
    ).toBe(CurrencyTimezoneLiveOutcome.LIVE_WIRING_CLAIM_REFUSED);
    expect(
      evaluateCurrencyTimezoneLiveClaim({
        claimedAggregatedPass: true,
        measuredCode: "AGGREGATED",
        totalMinor: 999,
        expectedTotalMinor: 550,
      })?.code,
    ).toBe(CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_TOTAL_MISMATCH_REFUSED);
    expect(
      evaluateCurrencyTimezoneLiveClaim({
        claimedAggregatedPass: true,
        measuredCode: "AGGREGATED",
        totalMinor: 100.5,
        expectedTotalMinor: 100.5,
      })?.code,
    ).toBe(CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_PASS_REFUSED);
    expect(
      evaluateCurrencyTimezoneLiveClaim({
        claimedAggregatedPass: true,
        measuredCode: "AGGREGATED",
        totalMinor: 100,
        expectedTotalMinor: 100.25,
      })?.code,
    ).toBe(CurrencyTimezoneLiveOutcome.FALSE_AGGREGATED_PASS_REFUSED);
  });
});
