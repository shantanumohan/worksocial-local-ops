/**
 * Fixture proof for T-X031 — wrong GA4 property kind refused.
 * Hillclimb deepen I8: idempotent reclaim; UA-shaped id mislabeled as GA4;
 * UNAVAILABLE env refuse; measurement-id-only / unknown refuse; live VERIFIED
 * claim refused; liveGa4Transport NOT_WIRED; ACCEPTED≠VERIFIED.
 * External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  AnalyticsEnvironment,
  Ga4PropertyKind,
  SoakProofKind,
  assertGa4WrongPropertyKindHonest,
  assertGa4WrongPropertyKindReclaimIdempotent,
  reclaimGa4WrongPropertyKindDecision,
  validateGa4PropertyBinding,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X031 fixture ACCEPTED.
 */
export function proofGa4WrongPropertyKindRefused(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const ua = validateGa4PropertyBinding({
    propertyId: "UA-123",
    kind: Ga4PropertyKind.UA_PROPERTY,
    measurementId: null,
    displayName: "Legacy UA",
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (
    !ua.ok &&
    ua.code === "WRONG_PROPERTY_KIND" &&
    ua.liveProviderSuccessClaimed === false &&
    ua.liveGa4Transport === "NOT_WIRED"
  ) {
    details.push("UA property kind → WRONG_PROPERTY_KIND refuse");
  } else {
    passed = false;
    details.push(`UA bind unexpectedly ${JSON.stringify(ua)}`);
  }

  const midOnly = validateGa4PropertyBinding({
    propertyId: "G-ONLY",
    kind: Ga4PropertyKind.MEASUREMENT_ID_ONLY,
    measurementId: "G-ONLY",
    displayName: "Measurement id only",
    environment: AnalyticsEnvironment.FIXTURE,
  });
  const unknown = validateGa4PropertyBinding({
    propertyId: "999",
    kind: Ga4PropertyKind.UNKNOWN,
    measurementId: null,
    displayName: "Unknown kind",
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (
    !midOnly.ok &&
    midOnly.code === "WRONG_PROPERTY_KIND" &&
    !unknown.ok &&
    unknown.code === "WRONG_PROPERTY_KIND"
  ) {
    details.push(
      "measurement_id_only + unknown kinds → WRONG_PROPERTY_KIND refuse",
    );
  } else {
    passed = false;
    details.push(
      `mid/unknown unexpectedly mid=${JSON.stringify(midOnly)} unknown=${JSON.stringify(unknown)}`,
    );
  }

  const fixtureGa4 = validateGa4PropertyBinding({
    propertyId: "100000001",
    kind: Ga4PropertyKind.GA4_PROPERTY,
    measurementId: "G-FIXTURE",
    displayName: "WorkSocial fixture",
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (
    fixtureGa4.ok === true &&
    fixtureGa4.liveProviderSuccessClaimed === false &&
    fixtureGa4.externalEffects === "NONE"
  ) {
    details.push("Fixture GA4 property accepted (not live metrics)");
  } else {
    passed = false;
    details.push(`Fixture GA4 unexpectedly ${JSON.stringify(fixtureGa4)}`);
  }

  const sandboxGa4 = validateGa4PropertyBinding({
    propertyId: "100000002",
    kind: Ga4PropertyKind.GA4_PROPERTY,
    measurementId: "G-SANDBOX",
    displayName: "Sandbox distinct",
    environment: AnalyticsEnvironment.SANDBOX,
  });
  if (sandboxGa4.ok === true && sandboxGa4.binding.environment === "SANDBOX") {
    details.push("Sandbox GA4 accepted as distinct label (≠ fixture ≠ live)");
  } else {
    passed = false;
    details.push(`Sandbox GA4 unexpectedly ${JSON.stringify(sandboxGa4)}`);
  }

  const live = validateGa4PropertyBinding({
    propertyId: "100000001",
    kind: Ga4PropertyKind.GA4_PROPERTY,
    measurementId: "G-LIVE",
    displayName: "Live attempt",
    environment: AnalyticsEnvironment.LIVE,
  });
  if (
    !live.ok &&
    live.code === "WRONG_PROPERTY_KIND" &&
    live.liveGa4Transport === "NOT_WIRED"
  ) {
    details.push("Live GA4 bind refused while transport NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live bind unexpectedly ${JSON.stringify(live)}`);
  }

  const liveClaim = validateGa4PropertyBinding(
    {
      propertyId: "100000001",
      kind: Ga4PropertyKind.GA4_PROPERTY,
      measurementId: "G-FIXTURE",
      displayName: "Claim live verified",
      environment: AnalyticsEnvironment.FIXTURE,
    },
    { claimLiveVerified: true },
  );
  const liveTransport = validateGa4PropertyBinding(
    {
      propertyId: "100000001",
      kind: Ga4PropertyKind.GA4_PROPERTY,
      measurementId: "G-FIXTURE",
      displayName: "Request live transport",
      environment: AnalyticsEnvironment.FIXTURE,
    },
    { requestLiveGa4Transport: true },
  );
  if (
    !liveClaim.ok &&
    liveClaim.code === "LIVE_CLAIM_REFUSED" &&
    !liveTransport.ok &&
    liveTransport.code === "LIVE_CLAIM_REFUSED"
  ) {
    details.push(
      "claimLiveVerified / requestLiveGa4Transport → LIVE_CLAIM_REFUSED (NOT_WIRED)",
    );
  } else {
    passed = false;
    details.push(
      `live claims unexpectedly claim=${JSON.stringify(liveClaim)} transport=${JSON.stringify(liveTransport)}`,
    );
  }

  const missing = validateGa4PropertyBinding({
    propertyId: "   ",
    kind: Ga4PropertyKind.GA4_PROPERTY,
    measurementId: "G-EMPTY",
    displayName: "Missing id",
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (!missing.ok && missing.code === "MISSING_PROPERTY") {
    details.push("Empty property id → MISSING_PROPERTY");
  } else {
    passed = false;
    details.push(`Missing id unexpectedly ${JSON.stringify(missing)}`);
  }

  const honesty = assertGa4WrongPropertyKindHonest(ua);
  const honestyOk = assertGa4WrongPropertyKindHonest(fixtureGa4);
  if (honesty.ok && honestyOk.ok) {
    details.push(
      `assertGa4WrongPropertyKindHonest → ${honesty.code}; ACCEPTED≠VERIFIED`,
    );
  } else {
    passed = false;
    details.push(
      `honesty failed ua=${honesty.reasons.join("; ")} ok=${honestyOk.reasons.join("; ")}`,
    );
  }

  // I8: UA-shaped id labeled ga4_property + UNAVAILABLE env refuse.
  const uaShaped = validateGa4PropertyBinding({
    propertyId: "UA-555555",
    kind: Ga4PropertyKind.GA4_PROPERTY,
    measurementId: null,
    displayName: "UA mislabeled",
    environment: AnalyticsEnvironment.FIXTURE,
  });
  const unavailable = validateGa4PropertyBinding({
    propertyId: "100000003",
    kind: Ga4PropertyKind.GA4_PROPERTY,
    measurementId: "G-UNAV",
    displayName: "Unavailable",
    environment: AnalyticsEnvironment.UNAVAILABLE,
  });
  if (
    !uaShaped.ok &&
    uaShaped.code === "WRONG_PROPERTY_KIND" &&
    !unavailable.ok &&
    unavailable.code === "WRONG_PROPERTY_KIND"
  ) {
    details.push(
      "UA-shaped id + UNAVAILABLE env → WRONG_PROPERTY_KIND refuse",
    );
  } else {
    passed = false;
    details.push(
      `uaShaped/unavailable unexpectedly ua=${JSON.stringify(uaShaped)} unav=${JSON.stringify(unavailable)}`,
    );
  }

  // I8: idempotent reclaim — double UA refuse agrees; post-live-claim reclaim still refuses UA.
  const uaBinding = {
    propertyId: "UA-123",
    kind: Ga4PropertyKind.UA_PROPERTY,
    measurementId: null,
    displayName: "Legacy UA",
    environment: AnalyticsEnvironment.FIXTURE,
  } as const;
  const reclaim1 = reclaimGa4WrongPropertyKindDecision(uaBinding);
  const reclaim2 = reclaimGa4WrongPropertyKindDecision(uaBinding);
  const reclaimIdem = assertGa4WrongPropertyKindReclaimIdempotent({
    first: reclaim1,
    second: reclaim2,
  });
  const afterLiveClaim = reclaimGa4WrongPropertyKindDecision(
    {
      propertyId: "100000001",
      kind: Ga4PropertyKind.GA4_PROPERTY,
      measurementId: "G-FIXTURE",
      displayName: "Claim live",
      environment: AnalyticsEnvironment.FIXTURE,
    },
    { claimLiveVerified: true },
  );
  const reclaimAfterClaim = reclaimGa4WrongPropertyKindDecision(uaBinding);
  if (
    reclaimIdem.ok &&
    reclaimIdem.code === "GA4_KIND_RECLAIM_IDEMPOTENT" &&
    reclaim1.decision.ok === false &&
    reclaim1.priorBindInvented === false &&
    afterLiveClaim.decision.ok === false &&
    afterLiveClaim.decision.code === "LIVE_CLAIM_REFUSED" &&
    reclaimAfterClaim.decision.ok === false &&
    reclaimAfterClaim.decision.code === "WRONG_PROPERTY_KIND"
  ) {
    details.push(
      "idempotent reclaim: double UA refuse agrees; post-live-claim reclaim still WRONG_PROPERTY_KIND (no invent bind)",
    );
  } else {
    passed = false;
    details.push(
      `idempotent reclaim unexpectedly idem=${JSON.stringify(reclaimIdem)} r1=${JSON.stringify(reclaim1)} afterClaim=${JSON.stringify(afterLiveClaim)} after=${JSON.stringify(reclaimAfterClaim)}`,
    );
  }

  details.push(
    "liveProviderSuccessClaimed=false externalEffects=NONE catalogClaim=ACCEPTED≠VERIFIED",
  );

  return {
    proofId: `proof-ga4-kind-${randomUUID()}`,
    kind: SoakProofKind.GA4_WRONG_PROPERTY_KIND_REFUSED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-ga4-kind-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
