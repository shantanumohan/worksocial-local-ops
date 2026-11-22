/**
 * DST-safe recurring schedule (T-X015).
 *
 * Pure civil-time planning for IANA zones (default America/New_York).
 * Occurrence identity is local calendar date + local HH:MM — never two
 * dispatches for the same logical day across fall-back ambiguous hours.
 * Spring-forward gaps skip nonexistent local times (no compensatory duplicate).
 * External effects: NONE. No Temporal / network / credentials.
 */

export const RecurringScheduleFrequency = {
  DAILY: "daily",
} as const;

export type RecurringScheduleFrequencyValue =
  (typeof RecurringScheduleFrequency)[keyof typeof RecurringScheduleFrequency];

export const DEFAULT_BUSINESS_TIMEZONE = "America/New_York";

export type RecurringScheduleDefinition = {
  scheduleId: string;
  timezone: string;
  /** Local hour 0–23 in `timezone`. */
  localHour: number;
  /** Local minute 0–59 in `timezone`. */
  localMinute: number;
  frequency: RecurringScheduleFrequencyValue;
};

export type ScheduleOccurrence = {
  /** `${scheduleId}:${localDate}:${HH:MM}` — unique per logical run. */
  occurrenceKey: string;
  scheduleId: string;
  localDate: string;
  localTime: string;
  /** Canonical UTC fire instant (earlier instant when fall-back is ambiguous). */
  fireAtIso: string;
};

export const LocalCivilResolveCode = {
  OK: "OK",
  NONEXISTENT_LOCAL_TIME: "NONEXISTENT_LOCAL_TIME",
  INVALID_INPUT: "INVALID_INPUT",
} as const;

export type LocalCivilResolveCodeValue =
  (typeof LocalCivilResolveCode)[keyof typeof LocalCivilResolveCode];

export type LocalCivilResolveResult =
  | {
      ok: true;
      code: typeof LocalCivilResolveCode.OK;
      fireAtIso: string;
      /** True when the local civil time is ambiguous (fall-back hour). */
      ambiguous: boolean;
    }
  | {
      ok: false;
      code:
        | typeof LocalCivilResolveCode.NONEXISTENT_LOCAL_TIME
        | typeof LocalCivilResolveCode.INVALID_INPUT;
      reason: string;
    };

export const OccurrenceClaimCode = {
  CLAIMED: "CLAIMED",
  DUPLICATE_OCCURRENCE: "DUPLICATE_OCCURRENCE",
} as const;

export type OccurrenceClaimCodeValue =
  (typeof OccurrenceClaimCode)[keyof typeof OccurrenceClaimCode];

export type OccurrenceClaimResult =
  | { ok: true; code: typeof OccurrenceClaimCode.CLAIMED; occurrenceKey: string }
  | {
      ok: false;
      code: typeof OccurrenceClaimCode.DUPLICATE_OCCURRENCE;
      occurrenceKey: string;
    };

export type OccurrenceClaimLedger = {
  claimedKeys: ReadonlySet<string>;
};

/** Window large enough for ±1h US DST and ±30m zones (e.g. Australia/Lord_Howe). */
const CIVIL_MATCH_WINDOW_MINUTES = 240;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatLocalTime(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

export function occurrenceKeyFor(
  scheduleId: string,
  localDate: string,
  localHour: number,
  localMinute: number,
): string {
  return `${scheduleId}:${localDate}:${formatLocalTime(localHour, localMinute)}`;
}

export function createDailySchedule(input: {
  scheduleId: string;
  timezone?: string;
  localHour: number;
  localMinute: number;
}): RecurringScheduleDefinition {
  return {
    scheduleId: input.scheduleId,
    timezone: input.timezone ?? DEFAULT_BUSINESS_TIMEZONE,
    localHour: input.localHour,
    localMinute: input.localMinute,
    frequency: RecurringScheduleFrequency.DAILY,
  };
}

/** Fail-closed IANA zone check — never throws to callers. */
export function isSupportedTimeZone(timeZone: string): boolean {
  if (!timeZone.trim()) return false;
  try {
    // Throws RangeError for unsupported identifiers.
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

function zonedParts(
  timeZone: string,
  instantMs: number,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instantMs));
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number.parseInt(get("year"), 10),
    month: Number.parseInt(get("month"), 10),
    day: Number.parseInt(get("day"), 10),
    hour: Number.parseInt(get("hour"), 10),
    minute: Number.parseInt(get("minute"), 10),
  };
}

function partsMatch(
  got: { year: number; month: number; day: number; hour: number; minute: number },
  want: { year: number; month: number; day: number; hour: number; minute: number },
): boolean {
  return (
    got.year === want.year &&
    got.month === want.month &&
    got.day === want.day &&
    got.hour === want.hour &&
    got.minute === want.minute
  );
}

/**
 * Resolve a local civil date+time in `timeZone` to a UTC ISO instant.
 * Ambiguous fall-back times take the earlier instant (any offset step size).
 * Nonexistent spring-forward gap times fail closed.
 * Unsupported IANA zones → INVALID_INPUT (never throw).
 */
export function resolveLocalCivilTime(input: {
  timeZone: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}): LocalCivilResolveResult {
  const { timeZone, year, month, day, hour, minute } = input;
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    !isSupportedTimeZone(timeZone)
  ) {
    return {
      ok: false,
      code: LocalCivilResolveCode.INVALID_INPUT,
      reason: "Invalid civil time or timezone",
    };
  }

  const want = { year, month, day, hour, minute };
  // UTC guess as if the civil fields were UTC, then correct by zone offset.
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  for (let i = 0; i < 4; i++) {
    const got = zonedParts(timeZone, guess);
    const asUtc = Date.UTC(
      got.year,
      got.month - 1,
      got.day,
      got.hour,
      got.minute,
      0,
      0,
    );
    const wantUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const delta = wantUtc - asUtc;
    if (delta === 0) break;
    guess += delta;
  }

  const collectMatches = (centerMs: number, stepMin: number): number[] => {
    const found: number[] = [];
    for (
      let deltaMin = -CIVIL_MATCH_WINDOW_MINUTES;
      deltaMin <= CIVIL_MATCH_WINDOW_MINUTES;
      deltaMin += stepMin
    ) {
      const candidate = centerMs + deltaMin * 60_000;
      if (partsMatch(zonedParts(timeZone, candidate), want)) {
        found.push(candidate);
      }
    }
    return [...new Set(found)].sort((a, b) => a - b);
  };

  // Prefer coarse offsets first (±30m / ±60m / …) so non-hour DST is covered
  // without a full minute scan on every resolve.
  let unique = collectMatches(guess, 30);
  if (unique.length === 0) {
    unique = collectMatches(guess, 1);
  }
  if (unique.length === 0) {
    return {
      ok: false,
      code: LocalCivilResolveCode.NONEXISTENT_LOCAL_TIME,
      reason: `Local ${year}-${pad2(month)}-${pad2(day)} ${formatLocalTime(hour, minute)} does not exist in ${timeZone} (DST gap)`,
    };
  }
  return {
    ok: true,
    code: LocalCivilResolveCode.OK,
    fireAtIso: new Date(unique[0]!).toISOString(),
    ambiguous: unique.length > 1,
  };
}

function parseLocalDate(localDate: string): {
  year: number;
  month: number;
  day: number;
} | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!m) return null;
  return {
    year: Number.parseInt(m[1]!, 10),
    month: Number.parseInt(m[2]!, 10),
    day: Number.parseInt(m[3]!, 10),
  };
}

function addLocalCalendarDays(
  year: number,
  month: number,
  day: number,
  days: number,
): { year: number; month: number; day: number } {
  // Noon UTC avoids zone edge issues when stepping civil dates.
  const ms = Date.UTC(year, month - 1, day + days, 12, 0, 0, 0);
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function formatLocalDate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/**
 * Local calendar date (YYYY-MM-DD) for an instant in `timeZone`.
 * Returns null when the zone is unsupported or the instant is invalid.
 */
export function localDateInZone(
  timeZone: string,
  instantIso: string,
): string | null {
  if (!isSupportedTimeZone(timeZone)) return null;
  const ms = Date.parse(instantIso);
  if (Number.isNaN(ms)) return null;
  const parts = zonedParts(timeZone, ms);
  return formatLocalDate(parts.year, parts.month, parts.day);
}

/**
 * Plan daily occurrences whose fire instant falls in [fromIso, toIso).
 * Deduplicates by occurrenceKey — fall-back cannot emit two runs for one day.
 * Iterates the full requested civil-date span (no silent truncation).
 */
export function planDailyOccurrences(input: {
  schedule: RecurringScheduleDefinition;
  fromIso: string;
  toIso: string;
}): ScheduleOccurrence[] {
  const fromMs = Date.parse(input.fromIso);
  const toMs = Date.parse(input.toIso);
  if (
    Number.isNaN(fromMs) ||
    Number.isNaN(toMs) ||
    toMs <= fromMs ||
    input.schedule.frequency !== RecurringScheduleFrequency.DAILY ||
    !isSupportedTimeZone(input.schedule.timezone)
  ) {
    return [];
  }

  const startLocal = zonedParts(
    input.schedule.timezone,
    fromMs - 36 * 3600_000,
  );
  const endLocal = zonedParts(input.schedule.timezone, toMs + 36 * 3600_000);
  let cursor = {
    year: startLocal.year,
    month: startLocal.month,
    day: startLocal.day,
  };
  const endKey = formatLocalDate(endLocal.year, endLocal.month, endLocal.day);
  const startKeyMs = Date.UTC(
    startLocal.year,
    startLocal.month - 1,
    startLocal.day,
  );
  const endKeyMs = Date.UTC(endLocal.year, endLocal.month - 1, endLocal.day);
  const daySpan = Math.max(
    0,
    Math.floor((endKeyMs - startKeyMs) / 86_400_000),
  );
  const seen = new Set<string>();
  const out: ScheduleOccurrence[] = [];

  for (let i = 0; i <= daySpan; i++) {
    const localDate = formatLocalDate(cursor.year, cursor.month, cursor.day);
    const resolved = resolveLocalCivilTime({
      timeZone: input.schedule.timezone,
      year: cursor.year,
      month: cursor.month,
      day: cursor.day,
      hour: input.schedule.localHour,
      minute: input.schedule.localMinute,
    });
    if (resolved.ok) {
      const fireMs = Date.parse(resolved.fireAtIso);
      if (fireMs >= fromMs && fireMs < toMs) {
        const key = occurrenceKeyFor(
          input.schedule.scheduleId,
          localDate,
          input.schedule.localHour,
          input.schedule.localMinute,
        );
        if (!seen.has(key)) {
          seen.add(key);
          out.push({
            occurrenceKey: key,
            scheduleId: input.schedule.scheduleId,
            localDate,
            localTime: formatLocalTime(
              input.schedule.localHour,
              input.schedule.localMinute,
            ),
            fireAtIso: resolved.fireAtIso,
          });
        }
      }
    }
    if (localDate >= endKey) break;
    cursor = addLocalCalendarDays(cursor.year, cursor.month, cursor.day, 1);
  }

  return out.sort((a, b) => Date.parse(a.fireAtIso) - Date.parse(b.fireAtIso));
}

export function emptyOccurrenceClaimLedger(): OccurrenceClaimLedger {
  return { claimedKeys: new Set() };
}

/** Rebuild a ledger from durable key list (file / store reload). */
export function occurrenceClaimLedgerFromKeys(
  keys: readonly string[],
): OccurrenceClaimLedger {
  return { claimedKeys: new Set(keys) };
}

export function occurrenceClaimKeys(
  ledger: OccurrenceClaimLedger,
): string[] {
  return [...ledger.claimedKeys].sort();
}

/**
 * Claim a logical occurrence once. Second claim with the same key is DUPLICATE.
 */
export function claimOccurrence(
  ledger: OccurrenceClaimLedger,
  occurrenceKey: string,
): { ledger: OccurrenceClaimLedger; result: OccurrenceClaimResult } {
  if (ledger.claimedKeys.has(occurrenceKey)) {
    return {
      ledger,
      result: {
        ok: false,
        code: OccurrenceClaimCode.DUPLICATE_OCCURRENCE,
        occurrenceKey,
      },
    };
  }
  const next = new Set(ledger.claimedKeys);
  next.add(occurrenceKey);
  return {
    ledger: { claimedKeys: next },
    result: {
      ok: true,
      code: OccurrenceClaimCode.CLAIMED,
      occurrenceKey,
    },
  };
}

/**
 * Derive occurrence key from a wall-clock tick using zone civil parts.
 * Two UTC instants that share the same local date+HH:MM (fall-back) share one key.
 */
export function occurrenceKeyFromInstant(input: {
  scheduleId: string;
  timeZone: string;
  instantIso: string;
  localHour: number;
  localMinute: number;
}): string | null {
  const localDate = localDateInZone(input.timeZone, input.instantIso);
  if (localDate === null) return null;
  return occurrenceKeyFor(
    input.scheduleId,
    localDate,
    input.localHour,
    input.localMinute,
  );
}

/** Parse helper for tests / callers that already have YYYY-MM-DD. */
export function resolveLocalDateTime(input: {
  timeZone: string;
  localDate: string;
  hour: number;
  minute: number;
}): LocalCivilResolveResult {
  const parsed = parseLocalDate(input.localDate);
  if (!parsed) {
    return {
      ok: false,
      code: LocalCivilResolveCode.INVALID_INPUT,
      reason: `Invalid localDate ${input.localDate}`,
    };
  }
  return resolveLocalCivilTime({
    timeZone: input.timeZone,
    year: parsed.year,
    month: parsed.month,
    day: parsed.day,
    hour: input.hour,
    minute: input.minute,
  });
}
