import { describe, expect, it } from "vitest";
import {
  AnalyticsEnvironment,
  Ga4PropertyKind,
  assertGa4WrongPropertyKindHonest,
  assertGa4WrongPropertyKindReclaimIdempotent,
  attemptGuardedChatGptAdsProductionBind,
  classifyGscDemand,
  evaluateChatGptAdsAccess,
  evaluateGscDemandHonesty,
  inspectGscRowManifest,
  summarizeHonestGscDemand,
  GSC_ROW_MANIFEST_SCHEMA,
  GscRowManifestIntegrity,
  interpretGa4DebugValidation,
  reclaimGa4WrongPropertyKindDecision,
  validateGa4PropertyBinding,
} from "./analytics.js";

describe("analytics — GA4 property kind", () => {
  it("rejects Universal Analytics / wrong kinds (T-X031)", () => {
    const result = validateGa4PropertyBinding({
      propertyId: "UA-123",
      kind: Ga4PropertyKind.UA_PROPERTY,
      measurementId: null,
      displayName: "Legacy",
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("WRONG_PROPERTY_KIND");
    expect(result.liveProviderSuccessClaimed).toBe(false);
    expect(result.liveGa4Transport).toBe("NOT_WIRED");
    expect(result.externalEffects).toBe("NONE");
  });

  it("rejects measurement-id-only and unknown kinds (T-X031 hillclimb)", () => {
    const mid = validateGa4PropertyBinding({
      propertyId: "G-ONLY",
      kind: Ga4PropertyKind.MEASUREMENT_ID_ONLY,
      measurementId: "G-ONLY",
      displayName: "Mid only",
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(mid.ok).toBe(false);
    if (!mid.ok) expect(mid.code).toBe("WRONG_PROPERTY_KIND");

    const unknown = validateGa4PropertyBinding({
      propertyId: "999",
      kind: Ga4PropertyKind.UNKNOWN,
      measurementId: null,
      displayName: "Unknown",
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.code).toBe("WRONG_PROPERTY_KIND");
  });

  it("accepts fixture GA4 property without claiming live", () => {
    const result = validateGa4PropertyBinding({
      propertyId: "100000001",
      kind: Ga4PropertyKind.GA4_PROPERTY,
      measurementId: "G-FIXTURE",
      displayName: "WorkSocial fixture",
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(result.ok).toBe(true);
    expect(result.liveProviderSuccessClaimed).toBe(false);
    expect(assertGa4WrongPropertyKindHonest(result).ok).toBe(true);
  });

  it("refuses live GA4 bind and live VERIFIED claims while transport NOT_WIRED", () => {
    const result = validateGa4PropertyBinding({
      propertyId: "100000001",
      kind: Ga4PropertyKind.GA4_PROPERTY,
      measurementId: "G-LIVE",
      displayName: "Live attempt",
      environment: AnalyticsEnvironment.LIVE,
    });
    expect(result.ok).toBe(false);
    expect(result.liveGa4Transport).toBe("NOT_WIRED");

    const unavailable = validateGa4PropertyBinding({
      propertyId: "100000001",
      kind: Ga4PropertyKind.GA4_PROPERTY,
      measurementId: "G-UNAV",
      displayName: "Unavailable",
      environment: AnalyticsEnvironment.UNAVAILABLE,
    });
    expect(unavailable.ok).toBe(false);
    if (!unavailable.ok) expect(unavailable.code).toBe("WRONG_PROPERTY_KIND");

    const uaShaped = validateGa4PropertyBinding({
      propertyId: "UA-999999",
      kind: Ga4PropertyKind.GA4_PROPERTY,
      measurementId: null,
      displayName: "UA mislabeled as GA4",
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(uaShaped.ok).toBe(false);
    if (!uaShaped.ok) expect(uaShaped.code).toBe("WRONG_PROPERTY_KIND");

    const claimed = validateGa4PropertyBinding(
      {
        propertyId: "100000001",
        kind: Ga4PropertyKind.GA4_PROPERTY,
        measurementId: "G-FIXTURE",
        displayName: "Fixture claim live",
        environment: AnalyticsEnvironment.FIXTURE,
      },
      { claimLiveVerified: true },
    );
    expect(claimed.ok).toBe(false);
    if (!claimed.ok) expect(claimed.code).toBe("LIVE_CLAIM_REFUSED");

    const transport = validateGa4PropertyBinding(
      {
        propertyId: "100000001",
        kind: Ga4PropertyKind.GA4_PROPERTY,
        measurementId: "G-FIXTURE",
        displayName: "Request live transport",
        environment: AnalyticsEnvironment.FIXTURE,
      },
      { requestLiveGa4Transport: true },
    );
    expect(transport.ok).toBe(false);
    if (!transport.ok) expect(transport.code).toBe("LIVE_CLAIM_REFUSED");

    const dualClaim = validateGa4PropertyBinding(
      {
        propertyId: "100000001",
        kind: Ga4PropertyKind.GA4_PROPERTY,
        measurementId: "G-FIXTURE",
        displayName: "Dual claim",
        environment: AnalyticsEnvironment.FIXTURE,
      },
      { claimLiveVerified: true, requestLiveGa4Transport: true },
    );
    expect(dualClaim.ok).toBe(false);
    if (!dualClaim.ok) expect(dualClaim.code).toBe("LIVE_CLAIM_REFUSED");

    const padded = validateGa4PropertyBinding({
      propertyId: "  100000001  ",
      kind: Ga4PropertyKind.GA4_PROPERTY,
      measurementId: "G-FIXTURE",
      displayName: "Padded id",
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(padded.ok).toBe(false);
    if (!padded.ok) expect(padded.code).toBe("WRONG_PROPERTY_KIND");

    const midShaped = validateGa4PropertyBinding({
      propertyId: "G-ABC123",
      kind: Ga4PropertyKind.GA4_PROPERTY,
      measurementId: "G-ABC123",
      displayName: "Measurement id as property",
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(midShaped.ok).toBe(false);
    if (!midShaped.ok) expect(midShaped.code).toBe("WRONG_PROPERTY_KIND");
  });

  it("idempotent reclaim of wrong-kind refuse (T-X031 I8)", () => {
    const binding = {
      propertyId: "UA-123",
      kind: Ga4PropertyKind.UA_PROPERTY,
      measurementId: null,
      displayName: "Legacy",
      environment: AnalyticsEnvironment.FIXTURE,
    };
    const r1 = reclaimGa4WrongPropertyKindDecision(binding);
    const r2 = reclaimGa4WrongPropertyKindDecision(binding);
    const idem = assertGa4WrongPropertyKindReclaimIdempotent({
      first: r1,
      second: r2,
    });
    expect(idem.ok).toBe(true);
    expect(idem.code).toBe("GA4_KIND_RECLAIM_IDEMPOTENT");
    expect(r1.decision.ok).toBe(false);
    expect(r1.priorBindInvented).toBe(false);

    const afterClaim = reclaimGa4WrongPropertyKindDecision(
      {
        propertyId: "100000001",
        kind: Ga4PropertyKind.GA4_PROPERTY,
        measurementId: "G-FIXTURE",
        displayName: "After claim",
        environment: AnalyticsEnvironment.FIXTURE,
      },
      { claimLiveVerified: true },
    );
    expect(afterClaim.decision.ok).toBe(false);
    const reclaimClean = reclaimGa4WrongPropertyKindDecision({
      propertyId: "UA-123",
      kind: Ga4PropertyKind.UA_PROPERTY,
      measurementId: null,
      displayName: "Legacy reclaim",
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(reclaimClean.decision.ok).toBe(false);
    if (!reclaimClean.decision.ok) {
      expect(reclaimClean.decision.code).toBe("WRONG_PROPERTY_KIND");
    }
  });

  it("I13 edges: claim-on-padded refuse; invent closed dishonest; reclaim DRIFT", () => {
    const claimOnPadded = validateGa4PropertyBinding(
      {
        propertyId: "  100000001  ",
        kind: Ga4PropertyKind.GA4_PROPERTY,
        measurementId: "G-FIXTURE",
        displayName: "Claim on padded",
        environment: AnalyticsEnvironment.FIXTURE,
      },
      { claimLiveVerified: true },
    );
    expect(claimOnPadded.ok).toBe(false);
    if (!claimOnPadded.ok) expect(claimOnPadded.code).toBe("LIVE_CLAIM_REFUSED");

    const claimOnMid = validateGa4PropertyBinding(
      {
        propertyId: "G-ABC123",
        kind: Ga4PropertyKind.GA4_PROPERTY,
        measurementId: "G-ABC123",
        displayName: "Claim on mid-shaped",
        environment: AnalyticsEnvironment.FIXTURE,
      },
      { requestLiveGa4Transport: true },
    );
    expect(claimOnMid.ok).toBe(false);
    if (!claimOnMid.ok) expect(claimOnMid.code).toBe("LIVE_CLAIM_REFUSED");

    const inventClosed = assertGa4WrongPropertyKindHonest({
      ok: false,
      code: "WRONG_PROPERTY_KIND",
      reasons: [
        "live GA4 transport is now verified and delivered; property kind is now closed",
      ],
      liveProviderSuccessClaimed: false,
      liveGa4Transport: "NOT_WIRED",
      externalEffects: "NONE",
    });
    expect(inventClosed.ok).toBe(false);
    expect(inventClosed.code).toBe("GA4_KIND_DISHONEST");

    const uaBinding = {
      propertyId: "UA-123",
      kind: Ga4PropertyKind.UA_PROPERTY,
      measurementId: null,
      displayName: "Legacy",
      environment: AnalyticsEnvironment.FIXTURE,
    };
    const honest = reclaimGa4WrongPropertyKindDecision(uaBinding);
    const dishonest = {
      ...honest,
      priorBindInvented: false as const,
      decision: {
        ok: true as const,
        binding: {
          propertyId: "100000001",
          kind: Ga4PropertyKind.GA4_PROPERTY,
          measurementId: "G-FIXTURE",
          displayName: "Invented accept",
          environment: AnalyticsEnvironment.FIXTURE,
        },
        reasons: ["invented accept after refuse"],
        liveProviderSuccessClaimed: false as const,
        liveGa4Transport: "NOT_WIRED" as const,
        externalEffects: "NONE" as const,
      },
    };
    const drift = assertGa4WrongPropertyKindReclaimIdempotent({
      first: honest,
      second: dishonest,
    });
    expect(drift.ok).toBe(false);
    expect(drift.code).toBe("GA4_KIND_RECLAIM_DRIFT");
  });
});

describe("analytics — GA4 debug ≠ receipt", () => {
  it("never claims delivered conversion from debug validation (T-US-008 / T-X032)", () => {
    const ok = interpretGa4DebugValidation({ debugEndpointAccepted: true });
    expect(ok.debugOk).toBe(true);
    expect(ok.deliveredConversionClaimed).toBe(false);
    expect(ok.measuredReceiptClaimed).toBe(false);
    expect(ok.liveProviderWiring).toBe("NOT_WIRED");
    expect(ok.externalEffects).toBe("NONE");
    expect(ok.fixtureOnly).toBe(true);
    expect(ok.code).toBeNull();
  });

  it("refuses claimDeliveredConversion even when debug accepted", () => {
    const claimed = interpretGa4DebugValidation({
      debugEndpointAccepted: true,
      claimDeliveredConversion: true,
    });
    expect(claimed.debugOk).toBe(true);
    expect(claimed.deliveredConversionClaimed).toBe(false);
    expect(claimed.code).toBe("DELIVERED_CONVERSION_CLAIM_REFUSED");
  });

  it("refuses LIVE debug wiring as NOT_WIRED", () => {
    const live = interpretGa4DebugValidation({
      debugEndpointAccepted: true,
      environment: AnalyticsEnvironment.LIVE,
    });
    expect(live.debugOk).toBe(false);
    expect(live.deliveredConversionClaimed).toBe(false);
    expect(live.code).toBe("LIVE_DEBUG_WIRING_NOT_WIRED");
    expect(live.liveProviderWiring).toBe("NOT_WIRED");
    expect(live.environment).toBe(AnalyticsEnvironment.LIVE);
    expect(live.fixtureOnly).toBe(false);
  });

  it("sandbox debug is allowed but not fixtureOnly", () => {
    const sandbox = interpretGa4DebugValidation({
      debugEndpointAccepted: true,
      environment: AnalyticsEnvironment.SANDBOX,
    });
    expect(sandbox.debugOk).toBe(true);
    expect(sandbox.deliveredConversionClaimed).toBe(false);
    expect(sandbox.environment).toBe(AnalyticsEnvironment.SANDBOX);
    expect(sandbox.fixtureOnly).toBe(false);
  });

  it("rejected debug still never claims delivery", () => {
    const rejected = interpretGa4DebugValidation({
      debugEndpointAccepted: false,
    });
    expect(rejected.debugOk).toBe(false);
    expect(rejected.deliveredConversionClaimed).toBe(false);
    expect(rejected.measuredReceiptClaimed).toBe(false);
  });
});

describe("analytics — GSC omitted rows", () => {
  it("treats omitted rows as UNKNOWN demand, not zero (T-US-010 / T-X033)", () => {
    const classified = classifyGscDemand({
      query: "quiet desks jersey city",
      clicks: null,
      impressions: null,
      omitted: true,
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(classified.demandLabel).toBe("unknown");
    expect(classified.clicks.kind).toBe("missing");
    expect(classified.liveGscWiring).toBe("NOT_WIRED");
    expect(classified.externalEffects).toBe("NONE");
    expect(classified.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(classified.reasons.join(" ")).toMatch(/UNKNOWN|not zero/i);
  });

  it("keeps invented zeros on omitted rows as UNKNOWN (not measured)", () => {
    const invented = classifyGscDemand({
      query: "omitted-but-zeroed",
      clicks: 0,
      impressions: 0,
      omitted: true,
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(invented.demandLabel).toBe("unknown");
    expect(invented.clicks.kind).toBe("missing");
    expect(invented.reasons.join(" ")).toMatch(/invented zero/i);
  });

  it("rejects non-finite or negative clicks/impressions as UNKNOWN (not zero)", () => {
    const nanRow = classifyGscDemand({
      query: "nan-clicks",
      clicks: Number.NaN,
      impressions: 10,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(nanRow.demandLabel).toBe("unknown");
    expect(nanRow.liveProviderSuccessClaimed).toBe(false);

    const negative = classifyGscDemand({
      query: "neg-clicks",
      clicks: -1,
      impressions: 10,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(negative.demandLabel).toBe("unknown");
    expect(negative.clicks.kind).toBe("missing");
  });

  it("refuses LIVE environment rows as unavailable (not measured)", () => {
    const live = classifyGscDemand({
      query: "day pass",
      clicks: 42,
      impressions: 910,
      omitted: false,
      environment: AnalyticsEnvironment.LIVE,
    });
    expect(live.demandLabel).toBe("unavailable");
    expect(live.liveGscWiring).toBe("NOT_WIRED");

    const decision = evaluateGscDemandHonesty({
      row: {
        query: "day pass",
        clicks: 42,
        impressions: 910,
        omitted: false,
        environment: AnalyticsEnvironment.LIVE,
      },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("LIVE_GSC_CLAIM_REFUSED");
    expect(decision.countsAsMeasuredDemand).toBe(false);
  });

  it("refuses treatOmittedAsZero / live claims (T-X033)", () => {
    const omittedAsZero = evaluateGscDemandHonesty({
      row: {
        query: "quiet desks",
        clicks: null,
        impressions: null,
        omitted: true,
        environment: AnalyticsEnvironment.FIXTURE,
      },
      treatOmittedAsZero: true,
    });
    expect(omittedAsZero.allowed).toBe(false);
    expect(omittedAsZero.code).toBe("OMITTED_AS_ZERO_REFUSED");
    expect(omittedAsZero.countsAsMeasuredDemand).toBe(false);

    const live = evaluateGscDemandHonesty({
      row: {
        query: "day pass",
        clicks: 1,
        impressions: 10,
        omitted: false,
        environment: AnalyticsEnvironment.FIXTURE,
      },
      claimLiveVerified: true,
    });
    expect(live.allowed).toBe(false);
    expect(live.code).toBe("LIVE_GSC_CLAIM_REFUSED");

    const wire = evaluateGscDemandHonesty({
      row: {
        query: "day pass",
        clicks: 1,
        impressions: 10,
        omitted: false,
        environment: AnalyticsEnvironment.FIXTURE,
      },
      requestLiveGscWire: true,
    });
    expect(wire.allowed).toBe(false);
    expect(wire.code).toBe("LIVE_GSC_CLAIM_REFUSED");
  });

  it("summarizes honest GSC demand without inventing zeros for omitted", () => {
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
    expect(summary.measuredOrFixtureCount).toBe(1);
    expect(summary.unknownCount).toBe(2);
    expect(summary.unavailableCount).toBe(1);
    expect(summary.measuredClicksSum).toBe(42);
    expect(summary.liveGscWiring).toBe("NOT_WIRED");
    expect(summary.externalEffects).toBe("NONE");
  });

  it("keeps fixture ≠ sandbox ≠ live labels distinct", () => {
    const fixture = classifyGscDemand({
      query: "day pass",
      clicks: 42,
      impressions: 910,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(fixture.demandLabel).toBe("fixture");
    expect(fixture.liveGscWiring).toBe("NOT_WIRED");
    const sandbox = classifyGscDemand({
      query: "day pass",
      clicks: 42,
      impressions: 910,
      omitted: false,
      environment: AnalyticsEnvironment.SANDBOX,
    });
    expect(sandbox.demandLabel).toBe("fixture");
    expect(sandbox.reasons.join(" ")).toMatch(/SANDBOX|not live/i);
    const notWired = classifyGscDemand({
      query: "day pass",
      clicks: 0,
      impressions: 0,
      omitted: false,
      environment: AnalyticsEnvironment.NOT_WIRED,
    });
    expect(notWired.demandLabel).toBe("unavailable");
  });

  it("refuses invisible query, signed −0, sandbox invent, corrupt manifest (T-X033 J17)", () => {
    const zwsp = "\u200B\u200C";
    const invisible = classifyGscDemand({
      query: zwsp,
      clicks: 3,
      impressions: 40,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(invisible.demandLabel).toBe("unknown");
    const invisibleDecision = evaluateGscDemandHonesty({
      row: {
        query: zwsp,
        clicks: 3,
        impressions: 40,
        omitted: false,
        environment: AnalyticsEnvironment.FIXTURE,
      },
    });
    expect(invisibleDecision.allowed).toBe(false);
    expect(invisibleDecision.code).toBe("INVALID_GSC_QUERY");

    const signedZero = evaluateGscDemandHonesty({
      row: {
        query: "day pass",
        clicks: -0,
        impressions: 10,
        omitted: false,
        environment: AnalyticsEnvironment.FIXTURE,
      },
    });
    expect(signedZero.allowed).toBe(false);
    expect(signedZero.code).toBe("INVALID_GSC_COUNTS");

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
    expect(inventSandbox.allowed).toBe(false);
    expect(inventSandbox.code).toBe("INVENT_MEASURED_FROM_SANDBOX");

    const corrupt = inspectGscRowManifest({ raw: "[]" });
    expect(corrupt.integrity).toBe(GscRowManifestIntegrity.CORRUPT_JSON);
    const inventCorrupt = evaluateGscDemandHonesty({
      row: {
        query: "day pass",
        clicks: 3,
        impressions: 40,
        omitted: false,
        environment: AnalyticsEnvironment.FIXTURE,
      },
      inventMeasuredFromCorruptManifest: true,
      corruptManifestIntegrity: corrupt.integrity,
    });
    expect(inventCorrupt.allowed).toBe(false);
    expect(inventCorrupt.code).toBe("INVENT_FROM_CORRUPT_MANIFEST");
  });

  it("refuses truncated-manifest invent and NaN counts (T-X033 J19)", () => {
    const truncated = inspectGscRowManifest({
      raw: `{"schema":"${GSC_ROW_MANIFEST_SCHEMA}","query":"day`,
    });
    expect(truncated.integrity).toBe(GscRowManifestIntegrity.TRUNCATED);
    const inventTrunc = evaluateGscDemandHonesty({
      row: {
        query: "day pass",
        clicks: 3,
        impressions: 40,
        omitted: false,
        environment: AnalyticsEnvironment.FIXTURE,
      },
      inventMeasuredFromCorruptManifest: true,
      corruptManifestIntegrity: truncated.integrity,
    });
    expect(inventTrunc.allowed).toBe(false);
    expect(inventTrunc.code).toBe("INVENT_FROM_CORRUPT_MANIFEST");

    const nanCounts = evaluateGscDemandHonesty({
      row: {
        query: "day pass",
        clicks: Number.NaN,
        impressions: 10,
        omitted: false,
        environment: AnalyticsEnvironment.FIXTURE,
      },
    });
    expect(nanCounts.allowed).toBe(false);
    expect(nanCounts.code).toBe("INVALID_GSC_COUNTS");
  });

  it("refuses soft-hyphen-only query, zero-impression CTR invent, missing manifest invent (T-X033 J18)", () => {
    const softHyphen = "\u00AD\u00AD";
    const softOnly = classifyGscDemand({
      query: softHyphen,
      clicks: 1,
      impressions: 10,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(softOnly.demandLabel).toBe("unknown");
    const softDecision = evaluateGscDemandHonesty({
      row: {
        query: softHyphen,
        clicks: 1,
        impressions: 10,
        omitted: false,
        environment: AnalyticsEnvironment.FIXTURE,
      },
    });
    expect(softDecision.allowed).toBe(false);
    expect(softDecision.code).toBe("INVALID_GSC_QUERY");

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
    expect(inventZeroCtr.allowed).toBe(false);
    expect(inventZeroCtr.code).toBe("INVENT_CTR_FROM_ZERO_IMPRESSIONS");

    const missing = inspectGscRowManifest({ raw: null });
    expect(missing.integrity).toBe(
      GscRowManifestIntegrity.MISSING_REQUIRED_FIELDS,
    );
    const inventMissing = evaluateGscDemandHonesty({
      row: {
        query: "day pass",
        clicks: 3,
        impressions: 40,
        omitted: false,
        environment: AnalyticsEnvironment.FIXTURE,
      },
      inventMeasuredFromCorruptManifest: true,
      corruptManifestIntegrity: missing.integrity,
    });
    expect(inventMissing.allowed).toBe(false);
    expect(inventMissing.code).toBe("INVENT_FROM_CORRUPT_MANIFEST");
  });

  it("refuses blank query, clicks>impressions, and invent CTR/measured (T-X033)", () => {
    const blank = classifyGscDemand({
      query: "   ",
      clicks: 1,
      impressions: 10,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(blank.demandLabel).toBe("unknown");
    expect(blank.clicks.kind).toBe("missing");

    const blankDecision = evaluateGscDemandHonesty({
      row: {
        query: "",
        clicks: 1,
        impressions: 10,
        omitted: false,
        environment: AnalyticsEnvironment.FIXTURE,
      },
    });
    expect(blankDecision.allowed).toBe(false);
    expect(blankDecision.code).toBe("INVALID_GSC_QUERY");

    const impossible = classifyGscDemand({
      query: "day pass",
      clicks: 50,
      impressions: 10,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(impossible.demandLabel).toBe("unknown");
    expect(impossible.reasons.join(" ")).toMatch(/impossible|CTR/i);

    const impossibleDecision = evaluateGscDemandHonesty({
      row: {
        query: "day pass",
        clicks: 50,
        impressions: 10,
        omitted: false,
        environment: AnalyticsEnvironment.FIXTURE,
      },
    });
    expect(impossibleDecision.allowed).toBe(false);
    expect(impossibleDecision.code).toBe("IMPOSSIBLE_GSC_COUNTS");

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
    expect(inventCtr.allowed).toBe(false);
    expect(inventCtr.code).toBe("INVENT_CTR_REFUSED");

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
    expect(inventMeasured.allowed).toBe(false);
    expect(inventMeasured.code).toBe("INVENT_MEASURED_DESPITE_UNKNOWN");
  });

  it("refuses non-integer counts, negative honesty, invent-aggregate (T-X033 J15)", () => {
    const nonInt = classifyGscDemand({
      query: "day pass",
      clicks: 1.5,
      impressions: 10,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(nonInt.demandLabel).toBe("unknown");
    expect(nonInt.reasons.join(" ")).toMatch(/non-integer/i);

    const nonIntDecision = evaluateGscDemandHonesty({
      row: {
        query: "day pass",
        clicks: 1.5,
        impressions: 10,
        omitted: false,
        environment: AnalyticsEnvironment.FIXTURE,
      },
    });
    expect(nonIntDecision.allowed).toBe(false);
    expect(nonIntDecision.code).toBe("NON_INTEGER_GSC_COUNTS");
    expect(nonIntDecision.countsAsMeasuredDemand).toBe(false);

    const negativeDecision = evaluateGscDemandHonesty({
      row: {
        query: "day pass",
        clicks: -1,
        impressions: 10,
        omitted: false,
        environment: AnalyticsEnvironment.FIXTURE,
      },
    });
    expect(negativeDecision.allowed).toBe(false);
    expect(negativeDecision.code).toBe("INVALID_GSC_COUNTS");

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
    expect(inventAgg.allowed).toBe(false);
    expect(inventAgg.code).toBe("INVENT_AGGREGATE_FROM_UNKNOWN");
  });

  it("refuses unsafe counts, invent-position, invent-measured-from-fixture (T-X033 J16)", () => {
    const unsafeClicks = Number.MAX_SAFE_INTEGER + 1;
    const unsafe = classifyGscDemand({
      query: "day pass",
      clicks: unsafeClicks,
      impressions: unsafeClicks,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(unsafe.demandLabel).toBe("unknown");
    expect(unsafe.reasons.join(" ")).toMatch(/safe integer/i);

    const unsafeDecision = evaluateGscDemandHonesty({
      row: {
        query: "day pass",
        clicks: unsafeClicks,
        impressions: unsafeClicks,
        omitted: false,
        environment: AnalyticsEnvironment.FIXTURE,
      },
    });
    expect(unsafeDecision.allowed).toBe(false);
    expect(unsafeDecision.code).toBe("UNSAFE_GSC_COUNTS");

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
    expect(inventPos.allowed).toBe(false);
    expect(inventPos.code).toBe("INVENT_POSITION_REFUSED");

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
    expect(inventFromFixture.allowed).toBe(false);
    expect(inventFromFixture.code).toBe("INVENT_MEASURED_FROM_FIXTURE");
    expect(inventFromFixture.countsAsMeasuredDemand).toBe(false);
  });

  it("refuses wrong/truncated GSC row wait-manifest schema (T-X033)", () => {
    const wrong = classifyGscDemand({
      query: "day pass",
      clicks: 42,
      impressions: 910,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
      schema: "gsc-row-v0",
    });
    expect(wrong.demandLabel).toBe("unknown");
    expect(wrong.clicks.kind).toBe("missing");
    expect(wrong.reasons.join(" ")).toMatch(/schema/i);

    const invent = evaluateGscDemandHonesty({
      row: {
        query: "day pass",
        clicks: 42,
        impressions: 910,
        omitted: false,
        environment: AnalyticsEnvironment.FIXTURE,
        schema: "gsc-row-v0",
      },
      inventMeasuredFromWrongSchema: true,
    });
    expect(invent.allowed).toBe(false);
    expect(invent.code).toBe("WRONG_GSC_ROW_SCHEMA");
    expect(invent.countsAsMeasuredDemand).toBe(false);

    const truncated = inspectGscRowManifest({
      raw: `{"schema":"${GSC_ROW_MANIFEST_SCHEMA}","query":"day`,
    });
    expect(truncated.integrity).toBe(GscRowManifestIntegrity.TRUNCATED);

    const ok = inspectGscRowManifest({
      raw: JSON.stringify({
        schema: GSC_ROW_MANIFEST_SCHEMA,
        query: "day pass",
        clicks: 42,
        impressions: 910,
        omitted: false,
        environment: AnalyticsEnvironment.FIXTURE,
      }),
    });
    expect(ok.integrity).toBe(GscRowManifestIntegrity.OK);
    expect(ok.row?.schema).toBe(GSC_ROW_MANIFEST_SCHEMA);

    const wrongSchemaInspect = inspectGscRowManifest({
      raw: JSON.stringify({
        schema: "gsc-row-v0",
        query: "day pass",
        clicks: 42,
        impressions: 910,
        omitted: false,
        environment: AnalyticsEnvironment.FIXTURE,
      }),
    });
    expect(wrongSchemaInspect.integrity).toBe(
      GscRowManifestIntegrity.WRONG_SCHEMA,
    );
  });
});

describe("analytics — ChatGPT Ads gate", () => {
  it("blocks Ads without verified transport/entitlement", () => {
    const decision = evaluateChatGptAdsAccess({
      localTransportVerified: false,
      entitlementVerified: false,
      authVerified: false,
      projectEnvironment: AnalyticsEnvironment.FIXTURE,
      requestedEnvironment: AnalyticsEnvironment.LIVE,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.environment).toBe(AnalyticsEnvironment.NOT_WIRED);
  });

  it("blocks test-only Ads project binding production (T-X034)", () => {
    const decision = evaluateChatGptAdsAccess({
      localTransportVerified: true,
      entitlementVerified: true,
      authVerified: true,
      projectEnvironment: AnalyticsEnvironment.SANDBOX,
      requestedEnvironment: AnalyticsEnvironment.LIVE,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("ADS_TEST_PROJECT_MISMATCH");
    expect(decision.environment).toBe(AnalyticsEnvironment.NOT_WIRED);
    expect(decision.reasons.some((r) => /T-X034/.test(r))).toBe(true);
  });

  it("guarded production bind never invokes binder on T-X034 mismatch", () => {
    let calls = 0;
    const result = attemptGuardedChatGptAdsProductionBind({
      access: {
        localTransportVerified: true,
        entitlementVerified: true,
        authVerified: true,
        projectEnvironment: AnalyticsEnvironment.SANDBOX,
        requestedEnvironment: AnalyticsEnvironment.LIVE,
      },
      projectId: "ads-test-sandbox",
      productionBind: () => {
        calls += 1;
      },
    });
    expect(result.bound).toBe(false);
    expect(result.decision.code).toBe("ADS_TEST_PROJECT_MISMATCH");
    expect(result.productionBindCallCount).toBe(0);
    expect(result.externalEffects).toBe("NONE");
    expect(calls).toBe(0);
  });
});
