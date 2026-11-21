/**
 * Fixture proof for T-X031 — wrong GA4 property kind refused.
 * Universal Analytics / non-GA4 kinds cannot bind. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  AnalyticsEnvironment,
  Ga4PropertyKind,
  SoakProofKind,
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
  if (!ua.ok && ua.code === "WRONG_PROPERTY_KIND") {
    details.push("UA property kind → WRONG_PROPERTY_KIND refuse");
  } else {
    passed = false;
    details.push(`UA bind unexpectedly ${JSON.stringify(ua)}`);
  }

  const fixtureGa4 = validateGa4PropertyBinding({
    propertyId: "100000001",
    kind: Ga4PropertyKind.GA4_PROPERTY,
    measurementId: "G-FIXTURE",
    displayName: "WorkSocial fixture",
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (fixtureGa4.ok === true) {
    details.push("Fixture GA4 property accepted (not live metrics)");
  } else {
    passed = false;
    details.push(`Fixture GA4 unexpectedly ${JSON.stringify(fixtureGa4)}`);
  }

  const live = validateGa4PropertyBinding({
    propertyId: "100000001",
    kind: Ga4PropertyKind.GA4_PROPERTY,
    measurementId: "G-LIVE",
    displayName: "Live attempt",
    environment: AnalyticsEnvironment.LIVE,
  });
  if (!live.ok && live.code === "WRONG_PROPERTY_KIND") {
    details.push("Live GA4 bind refused while transport NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live bind unexpectedly ${JSON.stringify(live)}`);
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

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

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
