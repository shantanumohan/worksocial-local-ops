import { describe, expect, it } from "vitest";
import { aggregateCurrencyTimezoneSeries } from "./currency-timezone-aggregation.js";

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

  it("refuses empty series as silent zero", () => {
    const result = aggregateCurrencyTimezoneSeries([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("EMPTY_SERIES");
      expect(result.totalMinor).toBeNull();
    }
  });
});
