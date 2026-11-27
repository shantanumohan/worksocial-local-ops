import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUSINESS_TIMEZONE,
  DurableOccurrenceClaimParseStatus,
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
  parseOccurrenceClaimDurableBody,
  planDailyOccurrences,
  recoverOccurrenceClaimDurableBodies,
  resolveLocalCivilTime,
  resolveLocalDateTime,
  serializeOccurrenceClaimDurableBody,
} from "./recurring-schedule.js";

describe("recurring-schedule (T-X015 DST)", () => {
  const tz = DEFAULT_BUSINESS_TIMEZONE;

  function expectHonesty(d: {
    liveProviderWiring: string;
    chatgptAdsAccess: string;
    externalEffects: string;
  }) {
    expect(d.liveProviderWiring).toBe("NOT_WIRED");
    expect(d.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(d.externalEffects).toBe("NONE");
  }

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
    expectHonesty(resolved);
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
    expectHonesty(gap);

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
    expectHonesty(ambiguous);

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
    expectHonesty(resolved);
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
    expectHonesty(first.result);
    ledger = first.ledger;

    // Simulate durable reload in a second worker / after restart.
    const reloaded = occurrenceClaimLedgerFromKeys(occurrenceClaimKeys(ledger));
    const second = claimOccurrence(reloaded, keyB!);
    expect(second.result.ok).toBe(false);
    expect(second.result.code).toBe(OccurrenceClaimCode.DUPLICATE_OCCURRENCE);
    expectHonesty(second.result);

    // Third claim after another reload still DUPLICATE (no unbounded retries).
    const reloadedAgain = occurrenceClaimLedgerFromKeys(
      occurrenceClaimKeys(second.ledger),
    );
    const third = claimOccurrence(reloadedAgain, keyA!);
    expect(third.result.ok).toBe(false);
    expect(third.result.code).toBe(OccurrenceClaimCode.DUPLICATE_OCCURRENCE);
    expectHonesty(third.result);
  });

  it("returns empty plan for inverted window (no silent invent)", () => {
    const schedule = createDailySchedule({
      scheduleId: "sched-empty",
      localHour: 9,
      localMinute: 0,
    });
    expect(
      planDailyOccurrences({
        schedule,
        fromIso: "2025-06-02T00:00:00.000Z",
        toIso: "2025-06-01T00:00:00.000Z",
      }),
    ).toEqual([]);
  });

  it("skips Europe/London spring-forward gap (no compensatory duplicate)", () => {
    // 2025-03-30: UK clocks jump 01:00 → 02:00; 01:30 does not exist.
    const gap = resolveLocalDateTime({
      timeZone: "Europe/London",
      localDate: "2025-03-30",
      hour: 1,
      minute: 30,
    });
    expect(gap.ok).toBe(false);
    if (gap.ok) return;
    expect(gap.code).toBe(LocalCivilResolveCode.NONEXISTENT_LOCAL_TIME);
    expectHonesty(gap);

    const schedule = createDailySchedule({
      scheduleId: "sched-london-spring",
      timezone: "Europe/London",
      localHour: 1,
      localMinute: 30,
    });
    const planned = planDailyOccurrences({
      schedule,
      fromIso: "2025-03-29T00:00:00.000Z",
      toIso: "2025-04-01T00:00:00.000Z",
    });
    expect(planned.map((o) => o.localDate)).toEqual([
      "2025-03-29",
      "2025-03-31",
    ]);
    expect(new Set(planned.map((o) => o.occurrenceKey)).size).toBe(2);
  });

  it("refuses blank occurrence keys (fail closed, never CLAIMED)", () => {
    const ledger = emptyOccurrenceClaimLedger();
    for (const blank of ["", "   ", "\t"]) {
      const claim = claimOccurrence(ledger, blank);
      expect(claim.result.ok).toBe(false);
      expect(claim.result.code).toBe(OccurrenceClaimCode.DUPLICATE_OCCURRENCE);
      expectHonesty(claim.result);
      expect(claim.ledger.claimedKeys.size).toBe(0);
    }
    // Valid key still CLAIMED after blank refuses (ledger unchanged).
    const ok = claimOccurrence(ledger, occurrenceKeyFor("sched-blank", "2025-06-01", 9, 0));
    expect(ok.result.ok).toBe(true);
    expect(ok.result.code).toBe(OccurrenceClaimCode.CLAIMED);
    expectHonesty(ok.result);
  });

  it("skips America/Los_Angeles spring-forward gap (G8)", () => {
    // 2025-03-09: Pacific clocks jump 02:00 → 03:00; 02:15 does not exist.
    const gap = resolveLocalDateTime({
      timeZone: "America/Los_Angeles",
      localDate: "2025-03-09",
      hour: 2,
      minute: 15,
    });
    expect(gap.ok).toBe(false);
    if (gap.ok) return;
    expect(gap.code).toBe(LocalCivilResolveCode.NONEXISTENT_LOCAL_TIME);
    expectHonesty(gap);
  });

  it("plans one Europe/London fall-back occurrence (G8)", () => {
    // 2025-10-26: UK clocks fall back 02:00 → 01:00; 01:30 is ambiguous.
    const ambiguous = resolveLocalDateTime({
      timeZone: "Europe/London",
      localDate: "2025-10-26",
      hour: 1,
      minute: 30,
    });
    expect(ambiguous.ok).toBe(true);
    if (!ambiguous.ok) return;
    expect(ambiguous.ambiguous).toBe(true);
    expectHonesty(ambiguous);

    const schedule = createDailySchedule({
      scheduleId: "sched-london-fall",
      timezone: "Europe/London",
      localHour: 1,
      localMinute: 30,
    });
    const planned = planDailyOccurrences({
      schedule,
      fromIso: "2025-10-25T00:00:00.000Z",
      toIso: "2025-10-28T00:00:00.000Z",
    });
    const fallDay = planned.filter((o) => o.localDate === "2025-10-26");
    expect(fallDay).toHaveLength(1);
  });

  it("returns null occurrence key for unsupported zone instant (G8)", () => {
    expect(
      occurrenceKeyFromInstant({
        scheduleId: "sched-bad",
        timeZone: "Bad/Zone",
        instantIso: "2025-06-15T12:00:00.000Z",
        localHour: 9,
        localMinute: 0,
      }),
    ).toBeNull();
  });

  it("keeps one occurrence per day in no-DST America/Phoenix (G8)", () => {
    const schedule = createDailySchedule({
      scheduleId: "sched-phoenix",
      timezone: "America/Phoenix",
      localHour: 9,
      localMinute: 0,
    });
    // Span includes US spring-forward weekend; Phoenix does not jump.
    const planned = planDailyOccurrences({
      schedule,
      fromIso: "2025-03-08T00:00:00.000Z",
      toIso: "2025-03-11T00:00:00.000Z",
    });
    expect(planned.map((o) => o.localDate)).toEqual([
      "2025-03-08",
      "2025-03-09",
      "2025-03-10",
    ]);
    expect(new Set(planned.map((o) => o.occurrenceKey)).size).toBe(3);
  });

  it("recovers durable claim body from prior after truncated primary (G9)", () => {
    const key = occurrenceKeyFor("sched-partial", "2025-11-02", 1, 30);
    const claimed = claimOccurrence(emptyOccurrenceClaimLedger(), key);
    const goodBody = serializeOccurrenceClaimDurableBody(claimed.ledger);
    expect(parseOccurrenceClaimDurableBody(goodBody).status).toBe(
      DurableOccurrenceClaimParseStatus.OK,
    );

    // Truncated mid-write (partial JSON) — never invent keys from debris.
    const truncated = goodBody.slice(0, Math.max(8, Math.floor(goodBody.length / 3)));
    const bad = parseOccurrenceClaimDurableBody(truncated);
    expect(bad.status).toBe(DurableOccurrenceClaimParseStatus.CORRUPT_OR_PARTIAL);
    expect(bad.keys).toEqual([]);
    expectHonesty(bad);

    const recovered = recoverOccurrenceClaimDurableBodies({
      primaryRaw: truncated,
      priorRaw: goodBody,
    });
    expect(recovered.status).toBe(
      DurableOccurrenceClaimParseStatus.RECOVERED_FROM_PRIOR,
    );
    expect(recovered.keys).toEqual([key]);
    expectHonesty(recovered);

    const ledger = occurrenceClaimLedgerFromKeys(recovered.keys);
    const again = claimOccurrence(ledger, key);
    expect(again.result.ok).toBe(false);
    expect(again.result.code).toBe(OccurrenceClaimCode.DUPLICATE_OCCURRENCE);
  });

  it("fail-closes to empty when primary truncated and no prior (G9)", () => {
    const truncated = '{"version":1,"claimedKeys":["sched-x:2025-01-01:09:0';
    const empty = recoverOccurrenceClaimDurableBodies({
      primaryRaw: truncated,
      priorRaw: null,
    });
    expect(empty.status).toBe(DurableOccurrenceClaimParseStatus.RECOVERED_EMPTY);
    expect(empty.keys).toEqual([]);
    expectHonesty(empty);
    // Honest: key never durable → CLAIMED allowed (no invented DUPLICATE).
    const key = occurrenceKeyFor("sched-x", "2025-01-01", 9, 0);
    const claim = claimOccurrence(occurrenceClaimLedgerFromKeys(empty.keys), key);
    expect(claim.result.ok).toBe(true);
    expect(claim.result.code).toBe(OccurrenceClaimCode.CLAIMED);
  });

  it("rejects wrong durable version and recovers from prior (G10)", () => {
    const key = occurrenceKeyFor("sched-ver", "2025-07-04", 9, 0);
    const goodBody = serializeOccurrenceClaimDurableBody(
      claimOccurrence(emptyOccurrenceClaimLedger(), key).ledger,
    );
    const wrongVersion = JSON.stringify({ version: 2, claimedKeys: [key] });
    const bad = parseOccurrenceClaimDurableBody(wrongVersion);
    expect(bad.status).toBe(DurableOccurrenceClaimParseStatus.CORRUPT_OR_PARTIAL);
    expect(bad.keys).toEqual([]);
    expectHonesty(bad);

    const recovered = recoverOccurrenceClaimDurableBodies({
      primaryRaw: wrongVersion,
      priorRaw: goodBody,
    });
    expect(recovered.status).toBe(
      DurableOccurrenceClaimParseStatus.RECOVERED_FROM_PRIOR,
    );
    expect(recovered.keys).toEqual([key]);
    expectHonesty(recovered);
  });

  it("fail-closes empty when primary and prior both corrupt (G10)", () => {
    const bothBad = recoverOccurrenceClaimDurableBodies({
      primaryRaw: '{"version":2}',
      priorRaw: "not-json",
    });
    expect(bothBad.status).toBe(DurableOccurrenceClaimParseStatus.RECOVERED_EMPTY);
    expect(bothBad.keys).toEqual([]);
    expectHonesty(bothBad);
  });

  it("filters whitespace-only durable claimedKeys entries (G10)", () => {
    const raw = JSON.stringify({
      version: 1,
      claimedKeys: ["   ", "", "\t"],
    });
    const parsed = parseOccurrenceClaimDurableBody(raw);
    expect(parsed.status).toBe(DurableOccurrenceClaimParseStatus.OK);
    expect(parsed.keys).toEqual([]);
    expectHonesty(parsed);
  });

  it("rejects non-array claimedKeys in durable body (G11)", () => {
    const raw = JSON.stringify({ version: 1, claimedKeys: "not-an-array" });
    const parsed = parseOccurrenceClaimDurableBody(raw);
    expect(parsed.status).toBe(DurableOccurrenceClaimParseStatus.CORRUPT_OR_PARTIAL);
    expect(parsed.keys).toEqual([]);
    expectHonesty(parsed);
  });

  it("recovers from prior when primary is null (G11)", () => {
    const key = occurrenceKeyFor("sched-null", "2025-08-01", 9, 0);
    const priorBody = serializeOccurrenceClaimDurableBody(
      claimOccurrence(emptyOccurrenceClaimLedger(), key).ledger,
    );
    const recovered = recoverOccurrenceClaimDurableBodies({
      primaryRaw: null,
      priorRaw: priorBody,
    });
    expect(recovered.status).toBe(
      DurableOccurrenceClaimParseStatus.RECOVERED_FROM_PRIOR,
    );
    expect(recovered.keys).toEqual([key]);
    expectHonesty(recovered);
  });

  it("filters non-string claimedKeys entries (G11)", () => {
    const key = occurrenceKeyFor("sched-mix", "2025-09-01", 9, 0);
    const raw = JSON.stringify({
      version: 1,
      claimedKeys: [key, 42, null, "   "],
    });
    const parsed = parseOccurrenceClaimDurableBody(raw);
    expect(parsed.status).toBe(DurableOccurrenceClaimParseStatus.OK);
    expect(parsed.keys).toEqual([key]);
    expectHonesty(parsed);
  });

  it("rejects durable body missing version field (G12)", () => {
    const key = occurrenceKeyFor("sched-noversion", "2025-10-01", 9, 0);
    const raw = JSON.stringify({ claimedKeys: [key] });
    const parsed = parseOccurrenceClaimDurableBody(raw);
    expect(parsed.status).toBe(DurableOccurrenceClaimParseStatus.CORRUPT_OR_PARTIAL);
    expect(parsed.keys).toEqual([]);
    expectHonesty(parsed);
  });

  it("recovers from prior when primary is whitespace-only (G12)", () => {
    const key = occurrenceKeyFor("sched-ws", "2025-10-02", 9, 0);
    const priorBody = serializeOccurrenceClaimDurableBody(
      claimOccurrence(emptyOccurrenceClaimLedger(), key).ledger,
    );
    const recovered = recoverOccurrenceClaimDurableBodies({
      primaryRaw: "   \n\t  ",
      priorRaw: priorBody,
    });
    expect(recovered.status).toBe(
      DurableOccurrenceClaimParseStatus.RECOVERED_FROM_PRIOR,
    );
    expect(recovered.keys).toEqual([key]);
    expectHonesty(recovered);
  });

  it("dedupes duplicate durable claimedKeys on ledger reload (G12)", () => {
    const key = occurrenceKeyFor("sched-dup", "2025-10-03", 9, 0);
    const raw = JSON.stringify({
      version: 1,
      claimedKeys: [key, key, `  ${key}  `],
    });
    const parsed = parseOccurrenceClaimDurableBody(raw);
    expect(parsed.status).toBe(DurableOccurrenceClaimParseStatus.OK);
    expect(parsed.keys).toEqual([key, key, key]);
    const ledger = occurrenceClaimLedgerFromKeys(parsed.keys);
    expect([...ledger.claimedKeys]).toEqual([key]);
    const again = claimOccurrence(ledger, key);
    expect(again.result.ok).toBe(false);
    expect(again.result.code).toBe(OccurrenceClaimCode.DUPLICATE_OCCURRENCE);
    expectHonesty(again.result);
  });

  it("rejects array-root durable JSON (G13)", () => {
    const key = occurrenceKeyFor("sched-arr", "2025-11-01", 9, 0);
    const parsed = parseOccurrenceClaimDurableBody(
      JSON.stringify([{ version: 1, claimedKeys: [key] }]),
    );
    expect(parsed.status).toBe(DurableOccurrenceClaimParseStatus.CORRUPT_OR_PARTIAL);
    expect(parsed.keys).toEqual([]);
    expectHonesty(parsed);
  });

  it("rejects empty-object durable body without version (G13)", () => {
    const parsed = parseOccurrenceClaimDurableBody("{}");
    expect(parsed.status).toBe(DurableOccurrenceClaimParseStatus.CORRUPT_OR_PARTIAL);
    expect(parsed.keys).toEqual([]);
    expectHonesty(parsed);
  });

  it("rejects string durable version field (G14)", () => {
    const key = occurrenceKeyFor("sched-strver", "2025-11-05", 9, 0);
    const parsed = parseOccurrenceClaimDurableBody(
      JSON.stringify({ version: "1", claimedKeys: [key] }),
    );
    expect(parsed.status).toBe(DurableOccurrenceClaimParseStatus.CORRUPT_OR_PARTIAL);
    expect(parsed.keys).toEqual([]);
    expectHonesty(parsed);
  });

  it("rejects null claimedKeys in durable body (G14)", () => {
    const parsed = parseOccurrenceClaimDurableBody(
      JSON.stringify({ version: 1, claimedKeys: null }),
    );
    expect(parsed.status).toBe(DurableOccurrenceClaimParseStatus.CORRUPT_OR_PARTIAL);
    expect(parsed.keys).toEqual([]);
    expectHonesty(parsed);
  });

  it("rejects numeric-root durable JSON (G14)", () => {
    const parsed = parseOccurrenceClaimDurableBody("42");
    expect(parsed.status).toBe(DurableOccurrenceClaimParseStatus.CORRUPT_OR_PARTIAL);
    expect(parsed.keys).toEqual([]);
    expectHonesty(parsed);
  });

  it("rejects durable version zero (G15)", () => {
    const parsed = parseOccurrenceClaimDurableBody(
      JSON.stringify({ version: 0, claimedKeys: [] }),
    );
    expect(parsed.status).toBe(DurableOccurrenceClaimParseStatus.CORRUPT_OR_PARTIAL);
    expect(parsed.keys).toEqual([]);
    expectHonesty(parsed);
  });

  it("rejects boolean-root durable JSON (G15)", () => {
    const parsed = parseOccurrenceClaimDurableBody("true");
    expect(parsed.status).toBe(DurableOccurrenceClaimParseStatus.CORRUPT_OR_PARTIAL);
    expect(parsed.keys).toEqual([]);
    expectHonesty(parsed);
  });

  it("rejects NaN durable version field (T-X015 idle C22 edge)", () => {
    const key = occurrenceKeyFor("sched-nanver", "2025-11-06", 9, 0);
    const parsed = parseOccurrenceClaimDurableBody(
      JSON.stringify({ version: Number.NaN, claimedKeys: [key] }),
    );
    expect(parsed.status).toBe(DurableOccurrenceClaimParseStatus.CORRUPT_OR_PARTIAL);
    expect(parsed.keys).toEqual([]);
    expectHonesty(parsed);
  });

  it("rejects +Infinity durable version field (T-X015 wipe15)", () => {
    const key = occurrenceKeyFor("sched-posinf", "2025-11-07", 9, 0);
    const parsed = parseOccurrenceClaimDurableBody(
      JSON.stringify({ version: Number.POSITIVE_INFINITY, claimedKeys: [key] }),
    );
    expect(parsed.status).toBe(DurableOccurrenceClaimParseStatus.CORRUPT_OR_PARTIAL);
    expect(parsed.keys).toEqual([]);
    expectHonesty(parsed);
  });

  it("rejects -Infinity durable version field (T-X015 wipe15)", () => {
    const key = occurrenceKeyFor("sched-neginf", "2025-11-08", 9, 0);
    const parsed = parseOccurrenceClaimDurableBody(
      JSON.stringify({ version: Number.NEGATIVE_INFINITY, claimedKeys: [key] }),
    );
    expect(parsed.status).toBe(DurableOccurrenceClaimParseStatus.CORRUPT_OR_PARTIAL);
    expect(parsed.keys).toEqual([]);
    expectHonesty(parsed);
  });

  it("rejects fractional durable version field (T-X015 wipe15 321b71b2)", () => {
    const key = occurrenceKeyFor("sched-frac", "2025-11-09", 9, 0);
    const parsed = parseOccurrenceClaimDurableBody(
      JSON.stringify({ version: 1.5, claimedKeys: [key] }),
    );
    expect(parsed.status).toBe(DurableOccurrenceClaimParseStatus.CORRUPT_OR_PARTIAL);
    expect(parsed.keys).toEqual([]);
    expectHonesty(parsed);
  });
});
