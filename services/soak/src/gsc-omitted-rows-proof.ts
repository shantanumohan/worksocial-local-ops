/**
 * Fixture proof for T-US-010 / T-X033 — omitted/missing GSC rows are UNKNOWN
 * demand, never invent zero. Live GSC wiring stays NOT_WIRED. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  AnalyticsEnvironment,
  GSC_ROW_MANIFEST_SCHEMA,
  GscRowManifestIntegrity,
  SoakProofKind,
  classifyGscDemand,
  evaluateGscDemandHonesty,
  inspectGscRowManifest,
  summarizeHonestGscDemand,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-010 + T-X033 fixture ACCEPTED.
 */
export function proofGscOmittedRowsUnknownNotZero(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // Omitted row → UNKNOWN demand, not zero.
  const omitted = classifyGscDemand({
    query: "quiet desks jersey city",
    clicks: null,
    impressions: null,
    omitted: true,
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (
    omitted.demandLabel === "unknown" &&
    omitted.clicks.kind === "missing" &&
    omitted.impressions.kind === "missing" &&
    omitted.liveGscWiring === "NOT_WIRED" &&
    omitted.externalEffects === "NONE" &&
    /UNKNOWN|not zero/i.test(omitted.reasons.join(" "))
  ) {
    details.push("Omitted GSC row → UNKNOWN demand (not zero)");
  } else {
    passed = false;
    details.push(`Omitted classification unexpectedly ${JSON.stringify(omitted)}`);
  }

  // Incomplete row (null clicks) also UNKNOWN — never invent 0.
  const incomplete = classifyGscDemand({
    query: "coworking near me",
    clicks: null,
    impressions: 100,
    omitted: false,
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (
    incomplete.demandLabel === "unknown" &&
    incomplete.clicks.kind === "missing"
  ) {
    details.push("Incomplete GSC clicks → UNKNOWN (not invented zero)");
  } else {
    passed = false;
    details.push(
      `Incomplete classification unexpectedly ${JSON.stringify(incomplete)}`,
    );
  }

  // Invented zeros on omitted rows stay UNKNOWN.
  const invented = classifyGscDemand({
    query: "omitted-but-zeroed",
    clicks: 0,
    impressions: 0,
    omitted: true,
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (
    invented.demandLabel === "unknown" &&
    invented.clicks.kind === "missing" &&
    /invented zero/i.test(invented.reasons.join(" "))
  ) {
    details.push("Omitted row with invented zeros → UNKNOWN (inventing zero refused)");
  } else {
    passed = false;
    details.push(
      `Invented-zero classification unexpectedly ${JSON.stringify(invented)}`,
    );
  }

  // Non-finite / negative → UNKNOWN, not invented zero.
  const nonFinite = classifyGscDemand({
    query: "nan-clicks",
    clicks: Number.NaN,
    impressions: 10,
    omitted: false,
    environment: AnalyticsEnvironment.FIXTURE,
  });
  const negative = classifyGscDemand({
    query: "neg-clicks",
    clicks: -3,
    impressions: 10,
    omitted: false,
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (
    nonFinite.demandLabel === "unknown" &&
    negative.demandLabel === "unknown"
  ) {
    details.push(
      "Non-finite/negative GSC clicks → UNKNOWN (not invented zero)",
    );
  } else {
    passed = false;
    details.push(
      `Malformed numeric classification unexpectedly nonFinite=${JSON.stringify(nonFinite)} negative=${JSON.stringify(negative)}`,
    );
  }

  // LIVE environment refused even without advisory claimLiveVerified flag.
  const liveRow = classifyGscDemand({
    query: "day pass",
    clicks: 42,
    impressions: 910,
    omitted: false,
    environment: AnalyticsEnvironment.LIVE,
  });
  const liveDecision = evaluateGscDemandHonesty({
    row: {
      query: "day pass",
      clicks: 42,
      impressions: 910,
      omitted: false,
      environment: AnalyticsEnvironment.LIVE,
    },
  });
  if (
    liveRow.demandLabel === "unavailable" &&
    liveDecision.code === "LIVE_GSC_CLAIM_REFUSED" &&
    liveDecision.countsAsMeasuredDemand === false
  ) {
    details.push(
      "LIVE GSC row → unavailable + LIVE_GSC_CLAIM_REFUSED (no measured bypass)",
    );
  } else {
    passed = false;
    details.push(
      `LIVE gate unexpectedly row=${JSON.stringify(liveRow)} decision=${liveDecision.code}`,
    );
  }

  // Positive control: complete fixture row stays fixture-labeled measured path.
  const complete = classifyGscDemand({
    query: "day pass",
    clicks: 42,
    impressions: 910,
    omitted: false,
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (
    complete.demandLabel === "fixture" &&
    complete.clicks.kind === "measured" &&
    complete.clicks.value === 42 &&
    complete.chatgptAdsAccess === "ACCESS_BLOCKED"
  ) {
    details.push("Complete fixture row → fixture demandLabel with measured clicks");
  } else {
    passed = false;
    details.push(`Complete classification unexpectedly ${JSON.stringify(complete)}`);
  }

  // NOT_WIRED stays unavailable — distinct from omitted-unknown.
  const notWired = classifyGscDemand({
    query: "day pass",
    clicks: 0,
    impressions: 0,
    omitted: false,
    environment: AnalyticsEnvironment.NOT_WIRED,
  });
  if (notWired.demandLabel === "unavailable") {
    details.push("NOT_WIRED GSC → unavailable (distinct from omitted UNKNOWN)");
  } else {
    passed = false;
    details.push(
      `NOT_WIRED classification unexpectedly ${JSON.stringify(notWired)}`,
    );
  }

  // Refuse treatOmittedAsZero / live claims.
  const refuseZero = evaluateGscDemandHonesty({
    row: {
      query: "quiet desks",
      clicks: null,
      impressions: null,
      omitted: true,
      environment: AnalyticsEnvironment.FIXTURE,
    },
    treatOmittedAsZero: true,
  });
  const refuseLive = evaluateGscDemandHonesty({
    row: {
      query: "day pass",
      clicks: 1,
      impressions: 10,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    },
    claimLiveVerified: true,
  });
  if (
    refuseZero.code === "OMITTED_AS_ZERO_REFUSED" &&
    refuseLive.code === "LIVE_GSC_CLAIM_REFUSED" &&
    refuseZero.liveGscWiring === "NOT_WIRED"
  ) {
    details.push(
      "evaluateGscDemandHonesty → OMITTED_AS_ZERO_REFUSED + LIVE_GSC_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `honesty evaluate unexpectedly zero=${refuseZero.code} live=${refuseLive.code}`,
    );
  }

  // Blank query / clicks>impressions / invent CTR or measured from unknown.
  const blankQuery = classifyGscDemand({
    query: "  ",
    clicks: 1,
    impressions: 10,
    omitted: false,
    environment: AnalyticsEnvironment.FIXTURE,
  });
  const blankDecision = evaluateGscDemandHonesty({
    row: {
      query: "",
      clicks: 1,
      impressions: 10,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    },
  });
  const impossible = evaluateGscDemandHonesty({
    row: {
      query: "day pass",
      clicks: 50,
      impressions: 10,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    },
  });
  const inventCtr = evaluateGscDemandHonesty({
    row: {
      query: "quiet desks",
      clicks: null,
      impressions: null,
      omitted: true,
      environment: AnalyticsEnvironment.FIXTURE,
    },
    inventCtrFromOmitted: true,
  });
  const inventMeasured = evaluateGscDemandHonesty({
    row: {
      query: "quiet desks",
      clicks: null,
      impressions: null,
      omitted: true,
      environment: AnalyticsEnvironment.FIXTURE,
    },
    inventMeasuredDespiteUnknown: true,
  });
  if (
    blankQuery.demandLabel === "unknown" &&
    blankDecision.code === "INVALID_GSC_QUERY" &&
    impossible.code === "IMPOSSIBLE_GSC_COUNTS" &&
    inventCtr.code === "INVENT_CTR_REFUSED" &&
    inventMeasured.code === "INVENT_MEASURED_DESPITE_UNKNOWN"
  ) {
    details.push(
      "Blank query / clicks>impressions / invent CTR|measured → INVALID_GSC_QUERY + IMPOSSIBLE_GSC_COUNTS + INVENT_CTR_REFUSED + INVENT_MEASURED_DESPITE_UNKNOWN",
    );
  } else {
    passed = false;
    details.push(
      `Edge honesty unexpectedly blank=${blankDecision.code} impossible=${impossible.code} ctr=${inventCtr.code} measured=${inventMeasured.code}`,
    );
  }

  // J15: non-integer / negative honesty / invent-aggregate-from-unknown.
  const nonInt = evaluateGscDemandHonesty({
    row: {
      query: "day pass",
      clicks: 1.5,
      impressions: 10,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    },
  });
  const negativeHonesty = evaluateGscDemandHonesty({
    row: {
      query: "day pass",
      clicks: -1,
      impressions: 10,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    },
  });
  const inventAgg = evaluateGscDemandHonesty({
    row: {
      query: "quiet desks",
      clicks: null,
      impressions: null,
      omitted: true,
      environment: AnalyticsEnvironment.FIXTURE,
    },
    inventAggregateFromUnknown: true,
  });
  if (
    nonInt.code === "NON_INTEGER_GSC_COUNTS" &&
    negativeHonesty.code === "INVALID_GSC_COUNTS" &&
    inventAgg.code === "INVENT_AGGREGATE_FROM_UNKNOWN"
  ) {
    details.push(
      "Domain J15: non-integer / negative / invent-aggregate → NON_INTEGER_GSC_COUNTS + INVALID_GSC_COUNTS + INVENT_AGGREGATE_FROM_UNKNOWN",
    );
  } else {
    passed = false;
    details.push(
      `J15 edge refuse unexpectedly nonInt=${nonInt.code} neg=${negativeHonesty.code} agg=${inventAgg.code}`,
    );
  }

  // J16: unsafe counts / invent-position / invent-measured-from-fixture.
  const unsafeClicks = Number.MAX_SAFE_INTEGER + 1;
  const unsafe = evaluateGscDemandHonesty({
    row: {
      query: "day pass",
      clicks: unsafeClicks,
      impressions: unsafeClicks,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    },
  });
  const inventPos = evaluateGscDemandHonesty({
    row: {
      query: "quiet desks",
      clicks: null,
      impressions: null,
      omitted: true,
      environment: AnalyticsEnvironment.FIXTURE,
    },
    inventPositionFromUnknown: true,
  });
  const inventFromFixture = evaluateGscDemandHonesty({
    row: {
      query: "day pass",
      clicks: 3,
      impressions: 40,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    },
    inventMeasuredFromFixture: true,
  });
  if (
    unsafe.code === "UNSAFE_GSC_COUNTS" &&
    inventPos.code === "INVENT_POSITION_REFUSED" &&
    inventFromFixture.code === "INVENT_MEASURED_FROM_FIXTURE"
  ) {
    details.push(
      "Domain J16: unsafe counts / invent-position / invent-from-fixture → UNSAFE_GSC_COUNTS + INVENT_POSITION_REFUSED + INVENT_MEASURED_FROM_FIXTURE",
    );
  } else {
    passed = false;
    details.push(
      `J16 edge refuse unexpectedly unsafe=${unsafe.code} pos=${inventPos.code} fixture=${inventFromFixture.code}`,
    );
  }

  // J17: invisible query / signed −0 / invent-from-sandbox / invent-from-corrupt-manifest.
  const zwspQuery = "\u200B\u200C\uFEFF";
  const invisible = evaluateGscDemandHonesty({
    row: {
      query: zwspQuery,
      clicks: 3,
      impressions: 40,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    },
  });
  const signedZero = evaluateGscDemandHonesty({
    row: {
      query: "day pass",
      clicks: -0,
      impressions: 10,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    },
  });
  const inventSandbox = evaluateGscDemandHonesty({
    row: {
      query: "day pass",
      clicks: 3,
      impressions: 40,
      omitted: false,
      environment: AnalyticsEnvironment.SANDBOX,
    },
    inventMeasuredFromSandbox: true,
  });
  const corruptManifest = inspectGscRowManifest({ raw: "[]" });
  const inventCorrupt = evaluateGscDemandHonesty({
    row: {
      query: "day pass",
      clicks: 3,
      impressions: 40,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    },
    inventMeasuredFromCorruptManifest: true,
    corruptManifestIntegrity: corruptManifest.integrity,
  });
  if (
    invisible.code === "INVALID_GSC_QUERY" &&
    signedZero.code === "INVALID_GSC_COUNTS" &&
    inventSandbox.code === "INVENT_MEASURED_FROM_SANDBOX" &&
    corruptManifest.integrity === GscRowManifestIntegrity.CORRUPT_JSON &&
    inventCorrupt.code === "INVENT_FROM_CORRUPT_MANIFEST"
  ) {
    details.push(
      "Domain J17: invisible / signed−0 / invent-sandbox / invent-corrupt-manifest → INVALID_GSC_QUERY + INVALID_GSC_COUNTS + INVENT_MEASURED_FROM_SANDBOX + INVENT_FROM_CORRUPT_MANIFEST",
    );
  } else {
    passed = false;
    details.push(
      `J17 edge refuse unexpectedly inv=${invisible.code} z=${signedZero.code} sandbox=${inventSandbox.code} corrupt=${corruptManifest.integrity}/${inventCorrupt.code}`,
    );
  }

  // J18: soft-hyphen-only query / invent CTR from zero impressions / invent from missing wait-manifest.
  const softHyphenQuery = "\u00AD\u2060";
  const softHyphen = evaluateGscDemandHonesty({
    row: {
      query: softHyphenQuery,
      clicks: 1,
      impressions: 10,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    },
  });
  const inventZeroCtr = evaluateGscDemandHonesty({
    row: {
      query: "day pass",
      clicks: 0,
      impressions: 0,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    },
    inventCtrFromZeroImpressions: true,
  });
  const missingManifest = inspectGscRowManifest({ raw: null });
  const inventMissing = evaluateGscDemandHonesty({
    row: {
      query: "day pass",
      clicks: 3,
      impressions: 40,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    },
    inventMeasuredFromCorruptManifest: true,
    corruptManifestIntegrity: missingManifest.integrity,
  });
  if (
    softHyphen.code === "INVALID_GSC_QUERY" &&
    inventZeroCtr.code === "INVENT_CTR_FROM_ZERO_IMPRESSIONS" &&
    missingManifest.integrity ===
      GscRowManifestIntegrity.MISSING_REQUIRED_FIELDS &&
    inventMissing.code === "INVENT_FROM_CORRUPT_MANIFEST"
  ) {
    details.push(
      "Domain J18: soft-hyphen / zero-impression CTR / missing-manifest invent → INVALID_GSC_QUERY + INVENT_CTR_FROM_ZERO_IMPRESSIONS + INVENT_FROM_CORRUPT_MANIFEST",
    );
  } else {
    passed = false;
    details.push(
      `J18 edge refuse unexpectedly soft=${softHyphen.code} zeroCtr=${inventZeroCtr.code} missing=${missingManifest.integrity}/${inventMissing.code}`,
    );
  }

  // J19: truncated wait-manifest invent / NaN counts in honesty evaluator.
  const truncatedJ19 = inspectGscRowManifest({
    raw: `{"schema":"${GSC_ROW_MANIFEST_SCHEMA}","query":"day`,
  });
  const inventTruncJ19 = evaluateGscDemandHonesty({
    row: {
      query: "day pass",
      clicks: 3,
      impressions: 40,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    },
    inventMeasuredFromCorruptManifest: true,
    corruptManifestIntegrity: truncatedJ19.integrity,
  });
  const nanHonestyJ19 = evaluateGscDemandHonesty({
    row: {
      query: "day pass",
      clicks: Number.NaN,
      impressions: 10,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    },
  });
  if (
    truncatedJ19.integrity === GscRowManifestIntegrity.TRUNCATED &&
    inventTruncJ19.code === "INVENT_FROM_CORRUPT_MANIFEST" &&
    nanHonestyJ19.code === "INVALID_GSC_COUNTS"
  ) {
    details.push(
      "Domain J19: truncated-manifest invent / NaN counts → INVENT_FROM_CORRUPT_MANIFEST + INVALID_GSC_COUNTS",
    );
  } else {
    passed = false;
    details.push(
      `J19 edge refuse unexpectedly trunc=${truncatedJ19.integrity}/${inventTruncJ19.code} nan=${nanHonestyJ19.code}`,
    );
  }

  // Wrong / truncated GSC row wait-manifest schema → UNKNOWN, never invent measured.
  const wrongSchema = classifyGscDemand({
    query: "schema-mismatch",
    clicks: 42,
    impressions: 910,
    omitted: false,
    environment: AnalyticsEnvironment.FIXTURE,
    schema: "gsc-row-v0",
  });
  const inventWrong = evaluateGscDemandHonesty({
    row: {
      query: "schema-mismatch",
      clicks: 42,
      impressions: 910,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
      schema: "gsc-row-v0",
    },
    inventMeasuredFromWrongSchema: true,
  });
  const truncatedManifest = inspectGscRowManifest({
    raw: `{"schema":"${GSC_ROW_MANIFEST_SCHEMA}","query":"day`,
  });
  const okManifest = inspectGscRowManifest({
    raw: JSON.stringify({
      schema: GSC_ROW_MANIFEST_SCHEMA,
      query: "day pass",
      clicks: 42,
      impressions: 910,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    }),
  });
  if (
    wrongSchema.demandLabel === "unknown" &&
    inventWrong.code === "WRONG_GSC_ROW_SCHEMA" &&
    inventWrong.countsAsMeasuredDemand === false &&
    truncatedManifest.integrity === GscRowManifestIntegrity.TRUNCATED &&
    okManifest.integrity === GscRowManifestIntegrity.OK
  ) {
    details.push(
      "Wrong/truncated GSC row wait-manifest schema → UNKNOWN + WRONG_GSC_ROW_SCHEMA (no invent measured)",
    );
  } else {
    passed = false;
    details.push(
      `Schema honesty unexpectedly wrong=${JSON.stringify(wrongSchema)} invent=${inventWrong.code} trunc=${truncatedManifest.integrity} ok=${okManifest.integrity}`,
    );
  }

  // Honest summary never invents zeros for omitted/unknown.
  const summary = summarizeHonestGscDemand([
    {
      query: "measured",
      clicks: 42,
      impressions: 910,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    },
    {
      query: "omitted",
      clicks: null,
      impressions: null,
      omitted: true,
      environment: AnalyticsEnvironment.FIXTURE,
    },
    {
      query: "invented-zero",
      clicks: 0,
      impressions: 0,
      omitted: true,
      environment: AnalyticsEnvironment.FIXTURE,
    },
    {
      query: "not-wired",
      clicks: 0,
      impressions: 0,
      omitted: false,
      environment: AnalyticsEnvironment.NOT_WIRED,
    },
  ]);
  if (
    summary.measuredOrFixtureCount === 1 &&
    summary.unknownCount === 2 &&
    summary.unavailableCount === 1 &&
    summary.measuredClicksSum === 42 &&
    summary.liveGscWiring === "NOT_WIRED" &&
    summary.externalEffects === "NONE"
  ) {
    details.push(
      "summarizeHonestGscDemand → measuredClicksSum=42 (omitted/invented-zero/unavailable excluded)",
    );
  } else {
    passed = false;
    details.push(`honest summary unexpectedly ${JSON.stringify(summary)}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-gsc-omitted-${randomUUID()}`,
    kind: SoakProofKind.GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-gsc-omitted-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
