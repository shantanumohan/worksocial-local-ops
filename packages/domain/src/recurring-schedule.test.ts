import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUSINESS_TIMEZONE,
  OccurrenceClaimCode,
  LocalCivilResolveCode,
  claimOccurrence,
  createDailySchedule,
  emptyOccurrenceClaimLedger,
  isSupportedTimeZone,
  occurrenceClaimLedgerFromKeys,
  occurrenceClaimKeys,
  occurrenceKeyFor,
  occurrenceKeyFromInstant,
  planDailyOccurrences,
  resolveLocalCivilTime,
  resolveLocalDateTime,
} from "./recurring-schedule.js";

describe("recurring-schedule (T-X015 DST)", () => {
  const tz = DEFAULT_BUSINESS_TIMEZONE;

  it("resolves a normal America/New_York civil time once", () => {
    const resolved = resolveLocalCivilTime({
      timeZone: tz,
      year: 2025,
      month: 6,
      day: 15,
      hour: 9,
      minute: 30,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.ambiguous).toBe(false);
    // 09:30 EDT = 13:30 UTC
    expect(resolved.fireAtIso).toBe("2025-06-15T13:30:00.000Z");
  });

  it("rejects unsupported time zones without throwing", () => {
    expect(isSupportedTimeZone("Bad/Zone")).toBe(false);
    const bad = resolveLocalCivilTime({
      timeZone: "Bad/Zone",
      year: 2025,
      month: 6,
      day: 15,
      hour: 9,
      minute: 30,
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.code).toBe(LocalCivilResolveCode.INVALID_INPUT);
    expect(
      planDailyOccurrences({
        schedule: createDailySchedule({
          scheduleId: "bad-zone",
          timezone: "Bad/Zone",
          localHour: 9,
          localMinute: 0,
        }),
        fromIso: "2025-01-01T00:00:00.000Z",
        toIso: "2025-01-05T00:00:00.000Z",
      }),
    ).toEqual([]);
  });

  it("skips spring-forward nonexistent local time (no compensatory duplicate)", () => {
    // 2025-03-09: clocks jump 02:00 → 03:00 EDT; 02:30 does not exist.
    const gap = resolveLocalDateTime({
      timeZone: tz,
      localDate: "2025-03-09",
      hour: 2,
      minute: 30,
    });
    expect(gap.ok).toBe(false);
    if (gap.ok) return;
    expect(gap.code).toBe(LocalCivilResolveCode.NONEXISTENT_LOCAL_TIME);

    const schedule = createDailySchedule({
      scheduleId: "sched-spring",
      localHour: 2,
      localMinute: 30,
    });
    const planned = planDailyOccurrences({
      schedule,
      fromIso: "2025-03-08T00:00:00.000Z",
      toIso: "2025-03-11T00:00:00.000Z",
    });
    // 03-08 and 03-10 exist; 03-09 gap skipped — never two runs for the gap day.
    expect(planned.map((o) => o.localDate)).toEqual(["2025-03-08", "2025-03-10"]);
    expect(new Set(planned.map((o) => o.occurrenceKey)).size).toBe(2);
  });

  it("plans one occurrence across fall-back (no unintended duplicates)", () => {
    // 2025-11-02: clocks fall back 02:00 → 01:00 EST; 01:30 is ambiguous.
    const ambiguous = resolveLocalDateTime({
      timeZone: tz,
      localDate: "2025-11-02",
      hour: 1,
      minute: 30,
    });
    expect(ambiguous.ok).toBe(true);
    if (!ambiguous.ok) return;
    expect(ambiguous.ambiguous).toBe(true);

    const schedule = createDailySchedule({
      scheduleId: "sched-fall",
      localHour: 1,
      localMinute: 30,
    });
    const planned = planDailyOccurrences({
      schedule,
      fromIso: "2025-11-01T00:00:00.000Z",
      toIso: "2025-11-04T00:00:00.000Z",
    });
    const fallDay = planned.filter((o) => o.localDate === "2025-11-02");
    expect(fallDay).toHaveLength(1);
    expect(fallDay[0]!.occurrenceKey).toBe(
      occurrenceKeyFor("sched-fall", "2025-11-02", 1, 30),
    );
  });

  it("selects the earlier instant for non-hour fall-back (Australia/Lord_Howe)", () => {
    // 2025-04-06: Lord Howe falls back 02:00 → 01:30 (+30m). 01:45 occurs twice.
    const resolved = resolveLocalDateTime({
      timeZone: "Australia/Lord_Howe",
      localDate: "2025-04-06",
      hour: 1,
      minute: 45,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.ambiguous).toBe(true);
    expect(resolved.fireAtIso).toBe("2025-04-05T14:45:00.000Z");
  });

  it("plans a multi-year range without silent truncation", () => {
    const schedule = createDailySchedule({
      scheduleId: "sched-long",
      localHour: 9,
      localMinute: 0,
    });
    const planned = planDailyOccurrences({
      schedule,
      fromIso: "2025-01-01T00:00:00.000Z",
      toIso: "2027-01-01T00:00:00.000Z",
    });
    // Two full years of daily 09:00 America/New_York (2025 non-leap, 2026 non-leap).
    expect(planned.length).toBe(365 + 365);
    expect(planned[0]!.localDate).toBe("2025-01-01");
    expect(planned[planned.length - 1]!.localDate).toBe("2026-12-31");
  });

  it("refuses duplicate claim when two wall ticks share local civil identity", () => {
    const scheduleId = "sched-claim";
    // First and second 01:30 on fall-back day (EDT then EST).
    const firstTick = "2025-11-02T05:30:00.000Z"; // 01:30 EDT
    const secondTick = "2025-11-02T06:30:00.000Z"; // 01:30 EST
    const keyA = occurrenceKeyFromInstant({
      scheduleId,
      timeZone: tz,
      instantIso: firstTick,
      localHour: 1,
      localMinute: 30,
    });
    const keyB = occurrenceKeyFromInstant({
      scheduleId,
      timeZone: tz,
      instantIso: secondTick,
      localHour: 1,
      localMinute: 30,
    });
    expect(keyA).toBe(keyB);
    expect(keyA).not.toBeNull();

    let ledger = emptyOccurrenceClaimLedger();
    const first = claimOccurrence(ledger, keyA!);
    expect(first.result.ok).toBe(true);
    expect(first.result.code).toBe(OccurrenceClaimCode.CLAIMED);
    ledger = first.ledger;

    // Simulate durable reload in a second worker / after restart.
    const reloaded = occurrenceClaimLedgerFromKeys(occurrenceClaimKeys(ledger));
    const second = claimOccurrence(reloaded, keyB!);
    expect(second.result.ok).toBe(false);
    expect(second.result.code).toBe(OccurrenceClaimCode.DUPLICATE_OCCURRENCE);
  });
});
