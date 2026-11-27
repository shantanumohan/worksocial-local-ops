/**
 * Fixture proof for T-US-008 / T-X032 — GA4 debug validation success is not a
 * delivered conversion / measured receipt. External effects: NONE.
 * Live wiring NOT_WIRED. Hillclimb: honesty stamps, refuse delivered-conversion
 * claim, refuse LIVE debug wiring.
 */

import { randomUUID } from "node:crypto";
import {
  AnalyticsEnvironment,
  Ga4ValidationKind,
  SoakProofKind,
  interpretGa4DebugValidation,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-008 + T-X032 fixture ACCEPTED.
 */
export function proofGa4DebugNotDeliveredConversion(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const ok = interpretGa4DebugValidation({ debugEndpointAccepted: true });
  if (
    ok.kind === Ga4ValidationKind.DEBUG_VALIDATION &&
    ok.debugOk === true &&
    ok.deliveredConversionClaimed === false &&
    ok.measuredReceiptClaimed === false &&
    ok.liveProviderWiring === "NOT_WIRED" &&
    ok.externalEffects === "NONE" &&
    ok.fixtureOnly === true &&
    ok.environment === AnalyticsEnvironment.FIXTURE &&
    ok.code === null &&
    /not a measured receipt|delivered conversion/i.test(ok.reasons.join(" "))
  ) {
    details.push(
      "Debug validation success → debugOk; deliveredConversionClaimed=false; measuredReceiptClaimed=false; liveProviderWiring=NOT_WIRED; environment=FIXTURE",
    );
  } else {
    passed = false;
    details.push(`Accepted debug unexpectedly ${JSON.stringify(ok)}`);
  }

  const rejected = interpretGa4DebugValidation({
    debugEndpointAccepted: false,
  });
  if (
    rejected.kind === Ga4ValidationKind.DEBUG_VALIDATION &&
    rejected.debugOk === false &&
    rejected.deliveredConversionClaimed === false &&
    rejected.measuredReceiptClaimed === false &&
    rejected.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "Debug validation reject → debugOk=false; still no delivered conversion claim",
    );
  } else {
    passed = false;
    details.push(`Rejected debug unexpectedly ${JSON.stringify(rejected)}`);
  }

  const claimRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimDeliveredConversion: true,
  });
  if (
    claimRefused.code === "DELIVERED_CONVERSION_CLAIM_REFUSED" &&
    claimRefused.deliveredConversionClaimed === false &&
    claimRefused.measuredReceiptClaimed === false
  ) {
    details.push(
      "claimDeliveredConversion=true → DELIVERED_CONVERSION_CLAIM_REFUSED; deliveredConversionClaimed=false",
    );
  } else {
    passed = false;
    details.push(
      `Delivered-conversion claim unexpectedly ${JSON.stringify(claimRefused)}`,
    );
  }

  const liveRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    environment: AnalyticsEnvironment.LIVE,
  });
  if (
    liveRefused.code === "LIVE_DEBUG_WIRING_NOT_WIRED" &&
    liveRefused.debugOk === false &&
    liveRefused.deliveredConversionClaimed === false &&
    liveRefused.liveProviderWiring === "NOT_WIRED" &&
    liveRefused.fixtureOnly === false &&
    liveRefused.environment === AnalyticsEnvironment.LIVE
  ) {
    details.push(
      "LIVE debug → LIVE_DEBUG_WIRING_NOT_WIRED; debugOk=false; no delivered conversion",
    );
  } else {
    passed = false;
    details.push(`LIVE debug unexpectedly ${JSON.stringify(liveRefused)}`);
  }

  const sandboxOk = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    environment: AnalyticsEnvironment.SANDBOX,
  });
  if (
    sandboxOk.debugOk === true &&
    sandboxOk.fixtureOnly === false &&
    sandboxOk.environment === AnalyticsEnvironment.SANDBOX &&
    sandboxOk.deliveredConversionClaimed === false
  ) {
    details.push(
      "SANDBOX debug → debugOk; fixtureOnly=false (not collapsed into fixture)",
    );
  } else {
    passed = false;
    details.push(`SANDBOX debug unexpectedly ${JSON.stringify(sandboxOk)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );

  return {
    proofId: `proof-ga4-debug-${randomUUID()}`,
    kind: SoakProofKind.GA4_DEBUG_NOT_DELIVERED_CONVERSION,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-ga4-debug-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
