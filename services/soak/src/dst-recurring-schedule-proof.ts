/**
 * Fixture proof for T-X015 — DST recurring schedule.
 *
 * America/New_York daily civil schedule: spring-forward gap skipped;
 * fall-back ambiguous hour yields one occurrence key; second wall-tick
 * claim is DUPLICATE across a durable file reload (separate "worker").
 * Honesty fields on every resolve/claim path. External effects: NONE.
 * Never invents live VERIFIED. Soft-skip ChatGPT Ads ACCESS_BLOCKED.
 * Hillclimb: ±30m Lord Howe; third durable DUPLICATE; Europe/London spring/fall;
 * blank keys fail closed; LA spring gap; bad-zone key null; Phoenix no-DST;
 * inverted window; truncated primary recovers prior (G9). Evidence from a
 * single release:evidence run (Codex P2).
 */

import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  DEFAULT_BUSINESS_TIMEZONE,
  DurableOccurrenceClaimParseStatus,
  LocalCivilResolveCode,
  OccurrenceClaimCode,
  SoakProofKind,
  claimOccurrence,
  createDailySchedule,
  emptyOccurrenceClaimLedger,
  occurrenceClaimLedgerFromKeys,
  occurrenceKeyFromInstant,
  parseOccurrenceClaimDurableBody,
  planDailyOccurrences,
  recoverOccurrenceClaimDurableBodies,
  resolveLocalDateTime,
  serializeOccurrenceClaimDurableBody,
  type DstScheduleHonesty,
  type OccurrenceClaimLedger,
  type SoakProofRecord,
} from "@worksocial/domain";

function honestyOk(d: DstScheduleHonesty): boolean {
  return (
    d.liveProviderWiring === "NOT_WIRED" &&
    d.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    d.externalEffects === "NONE"
  );
}

function priorClaimPath(path: string): string {
  return `${path}.prev`;
}

function loadDurableClaimLedger(path: string): OccurrenceClaimLedger {
  const primaryRaw = existsSync(path) ? readFileSync(path, "utf8") : null;
  const priorRaw = existsSync(priorClaimPath(path))
    ? readFileSync(priorClaimPath(path), "utf8")
    : null;
  if (primaryRaw === null && priorRaw === null) {
    return emptyOccurrenceClaimLedger();
  }
  const recovered = recoverOccurrenceClaimDurableBodies({ primaryRaw, priorRaw });
  return occurrenceClaimLedgerFromKeys(recovered.keys);
}

/** Atomic persist: keep prior good body, stage tmp, rename (no partial final). */
function persistDurableClaimLedger(
  path: string,
  ledger: OccurrenceClaimLedger,
): void {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    copyFileSync(path, priorClaimPath(path));
  }
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, serializeOccurrenceClaimDurableBody(ledger), "utf8");
  renameSync(tmp, path);
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
  if (
    !gap.ok &&
    gap.code === LocalCivilResolveCode.NONEXISTENT_LOCAL_TIME &&
    honestyOk(gap)
  ) {
    details.push(
      "Spring-forward 02:30 America/New_York → NONEXISTENT_LOCAL_TIME; liveProviderWiring=NOT_WIRED",
    );
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
  if (fallAmbiguous.ok && fallAmbiguous.ambiguous === true && honestyOk(fallAmbiguous)) {
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

  // 2b. ±30m zone: earlier instant on ambiguous Lord Howe fall-back.
  const lordHowe = resolveLocalDateTime({
    timeZone: "Australia/Lord_Howe",
    localDate: "2025-04-06",
    hour: 1,
    minute: 45,
  });
  if (
    lordHowe.ok &&
    lordHowe.ambiguous === true &&
    lordHowe.fireAtIso === "2025-04-05T14:45:00.000Z" &&
    honestyOk(lordHowe)
  ) {
    details.push(
      "Australia/Lord_Howe ±30m fall-back selects earlier instant with honesty fields",
    );
  } else {
    passed = false;
    details.push(`Lord Howe unexpectedly ${JSON.stringify(lordHowe)}`);
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
    honestyOk(first.result) &&
    !second.result.ok &&
    second.result.code === OccurrenceClaimCode.DUPLICATE_OCCURRENCE &&
    honestyOk(second.result)
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

  persistDurableClaimLedger(claimPath, second.ledger);
  const worker3 = loadDurableClaimLedger(claimPath);
  const third = claimOccurrence(worker3, keyA ?? "missing-key");
  if (
    !third.result.ok &&
    third.result.code === OccurrenceClaimCode.DUPLICATE_OCCURRENCE &&
    honestyOk(third.result)
  ) {
    details.push(
      "Third durable reload claim still DUPLICATE_OCCURRENCE (no unbounded retries)",
    );
  } else {
    passed = false;
    details.push(`Third claim unexpectedly ${JSON.stringify(third.result)}`);
  }

  // 4. Europe/London spring-forward gap skipped (no compensatory duplicate).
  const londonGap = resolveLocalDateTime({
    timeZone: "Europe/London",
    localDate: "2025-03-30",
    hour: 1,
    minute: 30,
  });
  if (
    !londonGap.ok &&
    londonGap.code === LocalCivilResolveCode.NONEXISTENT_LOCAL_TIME &&
    honestyOk(londonGap)
  ) {
    details.push(
      "Europe/London spring-forward 01:30 → NONEXISTENT_LOCAL_TIME with honesty fields",
    );
  } else {
    passed = false;
    details.push(`London spring unexpectedly ${JSON.stringify(londonGap)}`);
  }

  const londonSched = createDailySchedule({
    scheduleId: "soak-x015-london",
    timezone: "Europe/London",
    localHour: 1,
    localMinute: 30,
  });
  const londonPlan = planDailyOccurrences({
    schedule: londonSched,
    fromIso: "2025-03-29T00:00:00.000Z",
    toIso: "2025-04-01T00:00:00.000Z",
  });
  const londonDates = londonPlan.map((o) => o.localDate);
  if (
    londonDates.length === 2 &&
    londonDates[0] === "2025-03-29" &&
    londonDates[1] === "2025-03-31" &&
    new Set(londonPlan.map((o) => o.occurrenceKey)).size === 2
  ) {
    details.push("London spring plan skips gap day; one key per existing local day");
  } else {
    passed = false;
    details.push(`London spring plan unexpected ${JSON.stringify(londonDates)}`);
  }

  // 5. Blank occurrence key never CLAIMED (fail closed); valid key still CLAIMED after.
  const blankLedger = emptyOccurrenceClaimLedger();
  const blankClaim = claimOccurrence(blankLedger, "   ");
  const afterBlank = claimOccurrence(
    blankClaim.ledger,
    occurrenceKeyFromInstant({
      scheduleId: "soak-x015-blank-ok",
      timeZone: tz,
      instantIso: "2025-06-01T13:00:00.000Z",
      localHour: 9,
      localMinute: 0,
    }) ?? "missing-key",
  );
  if (
    !blankClaim.result.ok &&
    blankClaim.result.code === OccurrenceClaimCode.DUPLICATE_OCCURRENCE &&
    honestyOk(blankClaim.result) &&
    blankClaim.ledger.claimedKeys.size === 0 &&
    afterBlank.result.ok &&
    afterBlank.result.code === OccurrenceClaimCode.CLAIMED &&
    honestyOk(afterBlank.result)
  ) {
    details.push(
      "Blank occurrence key fail-closed → DUPLICATE; subsequent valid key CLAIMED",
    );
  } else {
    passed = false;
    details.push(
      `Blank/after unexpectedly blank=${JSON.stringify(blankClaim.result)} after=${JSON.stringify(afterBlank.result)}`,
    );
  }

  // 6. Inverted window → empty plan (no silent invent).
  const inverted = planDailyOccurrences({
    schedule: createDailySchedule({
      scheduleId: "soak-x015-inverted",
      localHour: 9,
      localMinute: 0,
    }),
    fromIso: "2025-06-02T00:00:00.000Z",
    toIso: "2025-06-01T00:00:00.000Z",
  });
  if (inverted.length === 0) {
    details.push("Inverted from/to window → empty plan (no silent invent)");
  } else {
    passed = false;
    details.push(`Inverted window unexpectedly ${JSON.stringify(inverted)}`);
  }

  // 7. America/Los_Angeles spring gap (G8).
  const laGap = resolveLocalDateTime({
    timeZone: "America/Los_Angeles",
    localDate: "2025-03-09",
    hour: 2,
    minute: 15,
  });
  if (
    !laGap.ok &&
    laGap.code === LocalCivilResolveCode.NONEXISTENT_LOCAL_TIME &&
    honestyOk(laGap)
  ) {
    details.push(
      "America/Los_Angeles spring-forward 02:15 → NONEXISTENT_LOCAL_TIME with honesty fields",
    );
  } else {
    passed = false;
    details.push(`LA spring unexpectedly ${JSON.stringify(laGap)}`);
  }

  // 8. Europe/London fall-back — exactly one occurrence (G8).
  const londonFall = resolveLocalDateTime({
    timeZone: "Europe/London",
    localDate: "2025-10-26",
    hour: 1,
    minute: 30,
  });
  const londonFallSched = createDailySchedule({
    scheduleId: "soak-x015-london-fall",
    timezone: "Europe/London",
    localHour: 1,
    localMinute: 30,
  });
  const londonFallPlan = planDailyOccurrences({
    schedule: londonFallSched,
    fromIso: "2025-10-25T00:00:00.000Z",
    toIso: "2025-10-28T00:00:00.000Z",
  });
  const londonFallDay = londonFallPlan.filter((o) => o.localDate === "2025-10-26");
  if (
    londonFall.ok &&
    londonFall.ambiguous === true &&
    honestyOk(londonFall) &&
    londonFallDay.length === 1
  ) {
    details.push(
      "Europe/London fall-back 01:30 ambiguous; plan has exactly one occurrence",
    );
  } else {
    passed = false;
    details.push(
      `London fall unexpectedly resolve=${JSON.stringify(londonFall)} day=${JSON.stringify(londonFallDay)}`,
    );
  }

  // 9. Bad zone → null occurrence key (G8).
  const badKey = occurrenceKeyFromInstant({
    scheduleId: "soak-x015-bad",
    timeZone: "Bad/Zone",
    instantIso: nowIso,
    localHour: 9,
    localMinute: 0,
  });
  if (badKey === null) {
    details.push("Unsupported zone occurrenceKeyFromInstant → null (fail closed)");
  } else {
    passed = false;
    details.push(`Bad zone key unexpectedly ${badKey}`);
  }

  // 10. America/Phoenix no-DST — one key per calendar day across US spring weekend (G8).
  const phoenixPlan = planDailyOccurrences({
    schedule: createDailySchedule({
      scheduleId: "soak-x015-phoenix",
      timezone: "America/Phoenix",
      localHour: 9,
      localMinute: 0,
    }),
    fromIso: "2025-03-08T00:00:00.000Z",
    toIso: "2025-03-11T00:00:00.000Z",
  });
  const phoenixDates = phoenixPlan.map((o) => o.localDate);
  if (
    phoenixDates.length === 3 &&
    phoenixDates[0] === "2025-03-08" &&
    phoenixDates[1] === "2025-03-09" &&
    phoenixDates[2] === "2025-03-10" &&
    new Set(phoenixPlan.map((o) => o.occurrenceKey)).size === 3
  ) {
    details.push(
      "America/Phoenix no-DST: one occurrence per day across US spring-forward weekend",
    );
  } else {
    passed = false;
    details.push(`Phoenix plan unexpected ${JSON.stringify(phoenixDates)}`);
  }

  // 11. Partial primary write → recover prior good keys (G9).
  const partialDir = join(stateDir, "partial-write");
  mkdirSync(partialDir, { recursive: true });
  const partialPath = join(partialDir, "occurrence-claims.json");
  const partialKey =
    occurrenceKeyFromInstant({
      scheduleId: "soak-x015-partial",
      timeZone: tz,
      instantIso: "2025-11-02T05:30:00.000Z",
      localHour: 1,
      localMinute: 30,
    }) ?? "missing-partial-key";
  const partialFirst = claimOccurrence(emptyOccurrenceClaimLedger(), partialKey);
  persistDurableClaimLedger(partialPath, partialFirst.ledger);
  // Second persist copies primary → .prev then atomically rewrites primary.
  persistDurableClaimLedger(partialPath, partialFirst.ledger);
  const goodPrimary = readFileSync(partialPath, "utf8");
  writeFileSync(
    partialPath,
    goodPrimary.slice(0, Math.max(12, Math.floor(goodPrimary.length / 3))),
    "utf8",
  );
  const recoveredFromPrior = recoverOccurrenceClaimDurableBodies({
    primaryRaw: readFileSync(partialPath, "utf8"),
    priorRaw: readFileSync(priorClaimPath(partialPath), "utf8"),
  });
  const afterRecover = claimOccurrence(
    occurrenceClaimLedgerFromKeys(recoveredFromPrior.keys),
    partialKey,
  );
  // 12. Truncated primary, no prior → empty; same key CLAIMED (honest).
  const noPrior = recoverOccurrenceClaimDurableBodies({
    primaryRaw: '{"version":1,"claimedKeys":["orphan',
    priorRaw: null,
  });
  const reclaim = claimOccurrence(
    occurrenceClaimLedgerFromKeys(noPrior.keys),
    partialKey,
  );
  if (
    recoveredFromPrior.status ===
      DurableOccurrenceClaimParseStatus.RECOVERED_FROM_PRIOR &&
    recoveredFromPrior.keys.includes(partialKey) &&
    honestyOk(recoveredFromPrior) &&
    !afterRecover.result.ok &&
    afterRecover.result.code === OccurrenceClaimCode.DUPLICATE_OCCURRENCE &&
    noPrior.status === DurableOccurrenceClaimParseStatus.RECOVERED_EMPTY &&
    noPrior.keys.length === 0 &&
    honestyOk(noPrior) &&
    reclaim.result.ok &&
    reclaim.result.code === OccurrenceClaimCode.CLAIMED
  ) {
    details.push(
      "Partial primary write recovers prior keys (DUPLICATE); no-prior truncates → empty then CLAIMED",
    );
  } else {
    passed = false;
    details.push(
      `Partial-write recover unexpectedly recovered=${JSON.stringify(recoveredFromPrior)} after=${JSON.stringify(afterRecover.result)} noPrior=${JSON.stringify(noPrior)} reclaim=${JSON.stringify(reclaim.result)}`,
    );
  }

  // 13. Wrong durable version → prior recover (G10).
  const verKey =
    occurrenceKeyFromInstant({
      scheduleId: "soak-x015-ver",
      timeZone: tz,
      instantIso: "2025-07-04T13:00:00.000Z",
      localHour: 9,
      localMinute: 0,
    }) ?? "missing-ver-key";
  const verGood = serializeOccurrenceClaimDurableBody(
    claimOccurrence(emptyOccurrenceClaimLedger(), verKey).ledger,
  );
  const verWrong = JSON.stringify({ version: 2, claimedKeys: [verKey] });
  const verRecover = recoverOccurrenceClaimDurableBodies({
    primaryRaw: verWrong,
    priorRaw: verGood,
  });
  if (
    verRecover.status === DurableOccurrenceClaimParseStatus.RECOVERED_FROM_PRIOR &&
    verRecover.keys.includes(verKey) &&
    honestyOk(verRecover)
  ) {
    details.push(
      "Wrong durable version → CORRUPT; prior recover keys (never invent)",
    );
  } else {
    passed = false;
    details.push(`Wrong version recover unexpected ${JSON.stringify(verRecover)}`);
  }

  // 14. Dual-corrupt bodies → RECOVERED_EMPTY (G10).
  const dualEmpty = recoverOccurrenceClaimDurableBodies({
    primaryRaw: '{"version":2}',
    priorRaw: "{",
  });
  if (
    dualEmpty.status === DurableOccurrenceClaimParseStatus.RECOVERED_EMPTY &&
    dualEmpty.keys.length === 0 &&
    honestyOk(dualEmpty)
  ) {
    details.push(
      "Dual-corrupt durable primary+prior → RECOVERED_EMPTY; never invent keys",
    );
  } else {
    passed = false;
    details.push(`Dual-corrupt unexpected ${JSON.stringify(dualEmpty)}`);
  }

  // 15. Non-array claimedKeys → CORRUPT (G11).
  const nonArray = parseOccurrenceClaimDurableBody(
    JSON.stringify({ version: 1, claimedKeys: "bad" }),
  );
  if (
    nonArray.status === DurableOccurrenceClaimParseStatus.CORRUPT_OR_PARTIAL &&
    nonArray.keys.length === 0 &&
    honestyOk(nonArray)
  ) {
    details.push("Non-array claimedKeys → CORRUPT_OR_PARTIAL; never invent keys");
  } else {
    passed = false;
    details.push(`Non-array claimedKeys unexpected ${JSON.stringify(nonArray)}`);
  }

  // 16. Null primary + good prior → RECOVERED_FROM_PRIOR (G11).
  const nullPriKey =
    occurrenceKeyFromInstant({
      scheduleId: "soak-x015-null",
      timeZone: tz,
      instantIso: "2025-08-01T13:00:00.000Z",
      localHour: 9,
      localMinute: 0,
    }) ?? "missing-null-key";
  const nullPriorGood = serializeOccurrenceClaimDurableBody(
    claimOccurrence(emptyOccurrenceClaimLedger(), nullPriKey).ledger,
  );
  const nullPrimaryRecover = recoverOccurrenceClaimDurableBodies({
    primaryRaw: null,
    priorRaw: nullPriorGood,
  });
  if (
    nullPrimaryRecover.status ===
      DurableOccurrenceClaimParseStatus.RECOVERED_FROM_PRIOR &&
    nullPrimaryRecover.keys.includes(nullPriKey) &&
    honestyOk(nullPrimaryRecover)
  ) {
    details.push("Null primary + good prior → RECOVERED_FROM_PRIOR");
  } else {
    passed = false;
    details.push(`Null primary recover unexpected ${JSON.stringify(nullPrimaryRecover)}`);
  }

  // 17. Missing version field → CORRUPT (G12).
  const noVerKey =
    occurrenceKeyFromInstant({
      scheduleId: "soak-x015-no-ver",
      timeZone: tz,
      instantIso: "2025-10-01T13:00:00.000Z",
      localHour: 9,
      localMinute: 0,
    }) ?? "missing-no-ver-key";
  const noVersion = parseOccurrenceClaimDurableBody(
    JSON.stringify({ claimedKeys: [noVerKey] }),
  );
  if (
    noVersion.status === DurableOccurrenceClaimParseStatus.CORRUPT_OR_PARTIAL &&
    noVersion.keys.length === 0 &&
    honestyOk(noVersion)
  ) {
    details.push("Missing durable version → CORRUPT_OR_PARTIAL; never invent keys");
  } else {
    passed = false;
    details.push(`Missing version unexpected ${JSON.stringify(noVersion)}`);
  }

  // 18. Whitespace primary + good prior → RECOVERED_FROM_PRIOR (G12).
  const wsPriKey =
    occurrenceKeyFromInstant({
      scheduleId: "soak-x015-ws-pri",
      timeZone: tz,
      instantIso: "2025-10-02T13:00:00.000Z",
      localHour: 9,
      localMinute: 0,
    }) ?? "missing-ws-key";
  const wsPriorGood = serializeOccurrenceClaimDurableBody(
    claimOccurrence(emptyOccurrenceClaimLedger(), wsPriKey).ledger,
  );
  const wsPrimaryRecover = recoverOccurrenceClaimDurableBodies({
    primaryRaw: " \t\n ",
    priorRaw: wsPriorGood,
  });
  if (
    wsPrimaryRecover.status ===
      DurableOccurrenceClaimParseStatus.RECOVERED_FROM_PRIOR &&
    wsPrimaryRecover.keys.includes(wsPriKey) &&
    honestyOk(wsPrimaryRecover)
  ) {
    details.push("Whitespace-only primary + good prior → RECOVERED_FROM_PRIOR");
  } else {
    passed = false;
    details.push(`Whitespace primary recover unexpected ${JSON.stringify(wsPrimaryRecover)}`);
  }

  // 19. Array-root JSON → CORRUPT (G13).
  const arrayRoot = parseOccurrenceClaimDurableBody(
    JSON.stringify([{ version: 1, claimedKeys: [] }]),
  );
  if (
    arrayRoot.status === DurableOccurrenceClaimParseStatus.CORRUPT_OR_PARTIAL &&
    arrayRoot.keys.length === 0 &&
    honestyOk(arrayRoot)
  ) {
    details.push("Array-root durable JSON → CORRUPT_OR_PARTIAL");
  } else {
    passed = false;
    details.push(`Array-root unexpected ${JSON.stringify(arrayRoot)}`);
  }

  // 20. String version field → CORRUPT (G14).
  const strVer = parseOccurrenceClaimDurableBody(
    JSON.stringify({ version: "1", claimedKeys: [] }),
  );
  if (
    strVer.status === DurableOccurrenceClaimParseStatus.CORRUPT_OR_PARTIAL &&
    strVer.keys.length === 0 &&
    honestyOk(strVer)
  ) {
    details.push("String durable version field → CORRUPT_OR_PARTIAL");
  } else {
    passed = false;
    details.push(`String version unexpected ${JSON.stringify(strVer)}`);
  }

  // 21. Version zero → CORRUPT (G15).
  const verZero = parseOccurrenceClaimDurableBody(
    JSON.stringify({ version: 0, claimedKeys: [] }),
  );
  if (
    verZero.status === DurableOccurrenceClaimParseStatus.CORRUPT_OR_PARTIAL &&
    verZero.keys.length === 0 &&
    honestyOk(verZero)
  ) {
    details.push("Durable version 0 → CORRUPT_OR_PARTIAL");
  } else {
    passed = false;
    details.push(`Version zero unexpected ${JSON.stringify(verZero)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE deepen=G15",
  );

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
