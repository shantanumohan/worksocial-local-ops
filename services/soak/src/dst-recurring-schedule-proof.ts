/**
 * Fixture proof for T-X015 — DST recurring schedule.
 *
 * America/New_York daily civil schedule: spring-forward gap skipped;
 * fall-back ambiguous hour yields one occurrence key; second wall-tick
 * claim is DUPLICATE across a durable file reload (separate "worker").
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_BUSINESS_TIMEZONE,
  LocalCivilResolveCode,
  OccurrenceClaimCode,
  SoakProofKind,
  claimOccurrence,
  createDailySchedule,
  emptyOccurrenceClaimLedger,
  occurrenceClaimKeys,
  occurrenceClaimLedgerFromKeys,
  occurrenceKeyFromInstant,
  planDailyOccurrences,
  resolveLocalDateTime,
  type OccurrenceClaimLedger,
  type SoakProofRecord,
} from "@worksocial/domain";

type DurableClaimFile = {
  version: 1;
  claimedKeys: string[];
};

function loadDurableClaimLedger(path: string): OccurrenceClaimLedger {
  if (!existsSync(path)) return emptyOccurrenceClaimLedger();
  const raw = JSON.parse(readFileSync(path, "utf8")) as DurableClaimFile;
  return occurrenceClaimLedgerFromKeys(raw.claimedKeys ?? []);
}

function persistDurableClaimLedger(
  path: string,
  ledger: OccurrenceClaimLedger,
): void {
  const payload: DurableClaimFile = {
    version: 1,
    claimedKeys: occurrenceClaimKeys(ledger),
  };
  writeFileSync(path, JSON.stringify(payload, null, 2), "utf8");
}

/**
 * Complete expected proof set for T-X015 fixture ACCEPTED.
 * Uses file-backed claim state so a second process image sees prior claims.
 */
export async function proofDstRecurringScheduleNoDuplicates(
  stateDir: string,
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  let passed = true;
  const tz = DEFAULT_BUSINESS_TIMEZONE;

  // 1. Spring-forward gap: nonexistent local time skipped (no compensatory dup).
  const gap = resolveLocalDateTime({
    timeZone: tz,
    localDate: "2025-03-09",
    hour: 2,
    minute: 30,
  });
  if (!gap.ok && gap.code === LocalCivilResolveCode.NONEXISTENT_LOCAL_TIME) {
    details.push("Spring-forward 02:30 America/New_York → NONEXISTENT_LOCAL_TIME");
  } else {
    passed = false;
    details.push(`Spring-forward unexpectedly ${JSON.stringify(gap)}`);
  }

  const springSched = createDailySchedule({
    scheduleId: "soak-x015-spring",
    localHour: 2,
    localMinute: 30,
  });
  const springPlan = planDailyOccurrences({
    schedule: springSched,
    fromIso: "2025-03-08T00:00:00.000Z",
    toIso: "2025-03-11T00:00:00.000Z",
  });
  const springDates = springPlan.map((o) => o.localDate);
  if (
    springDates.length === 2 &&
    springDates[0] === "2025-03-08" &&
    springDates[1] === "2025-03-10" &&
    new Set(springPlan.map((o) => o.occurrenceKey)).size === 2
  ) {
    details.push("Spring plan skips gap day; one key per existing local day");
  } else {
    passed = false;
    details.push(`Spring plan unexpected ${JSON.stringify(springDates)}`);
  }

  // 2. Fall-back: ambiguous 01:30 → exactly one planned occurrence.
  const fallAmbiguous = resolveLocalDateTime({
    timeZone: tz,
    localDate: "2025-11-02",
    hour: 1,
    minute: 30,
  });
  if (fallAmbiguous.ok && fallAmbiguous.ambiguous === true) {
    details.push("Fall-back 01:30 America/New_York marked ambiguous");
  } else {
    passed = false;
    details.push(`Fall-back resolve unexpectedly ${JSON.stringify(fallAmbiguous)}`);
  }

  const fallSched = createDailySchedule({
    scheduleId: "soak-x015-fall",
    localHour: 1,
    localMinute: 30,
  });
  const fallPlan = planDailyOccurrences({
    schedule: fallSched,
    fromIso: "2025-11-01T00:00:00.000Z",
    toIso: "2025-11-04T00:00:00.000Z",
  });
  const fallDay = fallPlan.filter((o) => o.localDate === "2025-11-02");
  if (fallDay.length === 1) {
    details.push("Fall-back day plans exactly one occurrence (no unintended duplicate)");
  } else {
    passed = false;
    details.push(`Fall-back day count=${fallDay.length} ${JSON.stringify(fallDay)}`);
  }

  // 3. Durable claim across "worker restart": first tick CLAIMED; reload; second DUPLICATE.
  const scheduleId = "soak-x015-claim";
  const firstTick = "2025-11-02T05:30:00.000Z";
  const secondTick = "2025-11-02T06:30:00.000Z";
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
  if (keyA !== null && keyA === keyB) {
    details.push("Fall-back wall ticks share one occurrenceKey");
  } else {
    passed = false;
    details.push(`Occurrence keys diverged ${keyA} vs ${keyB}`);
  }

  mkdirSync(stateDir, { recursive: true });
  const claimPath = join(stateDir, "occurrence-claims.json");
  const worker1 = loadDurableClaimLedger(claimPath);
  const first = claimOccurrence(worker1, keyA ?? "missing-key");
  persistDurableClaimLedger(claimPath, first.ledger);

  // Second process image: empty memory, reload durable keys only.
  const worker2 = loadDurableClaimLedger(claimPath);
  const second = claimOccurrence(worker2, keyB ?? "missing-key");

  if (
    first.result.ok &&
    first.result.code === OccurrenceClaimCode.CLAIMED &&
    !second.result.ok &&
    second.result.code === OccurrenceClaimCode.DUPLICATE_OCCURRENCE
  ) {
    details.push(
      "Durable claim ledger: first tick CLAIMED; reloaded worker second tick → DUPLICATE_OCCURRENCE",
    );
  } else {
    passed = false;
    details.push(
      `Durable claim unexpectedly first=${JSON.stringify(first.result)} second=${JSON.stringify(second.result)}`,
    );
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-dst-recurring-${randomUUID()}`,
    kind: SoakProofKind.DST_RECURRING_SCHEDULE_NO_DUPLICATES,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-x015-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
