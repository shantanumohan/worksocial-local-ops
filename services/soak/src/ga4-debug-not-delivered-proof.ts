/**
 * Fixture proof for T-US-008 / T-X032 — GA4 debug validation success is not a
 * delivered conversion / measured receipt. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
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
    /not a measured receipt|delivered conversion/i.test(ok.reasons.join(" "))
  ) {
    details.push(
      "Debug validation success → debugOk; deliveredConversionClaimed=false",
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
    rejected.deliveredConversionClaimed === false
  ) {
    details.push(
      "Debug validation reject → debugOk=false; still no delivered conversion claim",
    );
  } else {
    passed = false;
    details.push(`Rejected debug unexpectedly ${JSON.stringify(rejected)}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

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
