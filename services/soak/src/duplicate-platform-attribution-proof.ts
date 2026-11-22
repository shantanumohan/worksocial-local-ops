/**
 * Fixture proof for T-X059 — Duplicate platform attribution.
 *
 * Two platforms claim the same CRM-verified booking. Unique outcome count
 * stays 1; platform claims remain separate. Silent sum into unique bookings
 * is refused. External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  projectUniqueOutcomes,
  refuseSilentPlatformSum,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X059 fixture ACCEPTED.
 */
export function proofDuplicatePlatformAttributionOneBooking(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const bookingId = `booking-${randomUUID().slice(0, 8)}`;

  // 1. Two platforms claim the same booking.
  const claims = [
    {
      claimId: `claim-google-${randomUUID().slice(0, 8)}`,
      platformId: "google_ads",
      bookingId,
      claimedAtIso: nowIso,
    },
    {
      claimId: `claim-meta-${randomUUID().slice(0, 8)}`,
      platformId: "meta_ads",
      bookingId,
      claimedAtIso: nowIso,
    },
  ];
  const projection = projectUniqueOutcomes(claims);
  if (
    projection.uniqueBookingCount === 1 &&
    projection.platformClaimCount === 2 &&
    projection.claimsByPlatform.google_ads === 1 &&
    projection.claimsByPlatform.meta_ads === 1 &&
    projection.wouldDoubleCountIfSummed
  ) {
    details.push(
      "two platform claims → uniqueBookingCount=1; claimsByPlatform kept separate",
    );
  } else {
    passed = false;
    details.push(
      `duplicate attribution projection unexpectedly ${JSON.stringify(projection)}`,
    );
  }

  // 2. Silent sum into unique bookings refused.
  const refuse = refuseSilentPlatformSum(projection);
  if (!refuse.allowed && refuse.code === "SILENT_PLATFORM_SUM_REFUSED") {
    details.push(
      "SILENT_PLATFORM_SUM_REFUSED — platform conversions not summed into unique bookings",
    );
  } else {
    passed = false;
    details.push(
      `silent sum unexpectedly allowed: ${JSON.stringify(refuse)}`,
    );
  }

  // 3. Counterfactual: naive platform sum would overstate unique outcomes.
  const naivePlatformSum = claims.length;
  if (naivePlatformSum === 2 && projection.uniqueBookingCount === 1) {
    details.push(
      "counterfactual: naive platform sum 2 ≠ unique booking 1 (double-count blocked)",
    );
  } else {
    passed = false;
    details.push(
      `counterfactual failed: naive=${naivePlatformSum} unique=${projection.uniqueBookingCount}`,
    );
  }

  // 4. Positive control: single-platform claim is not double-count.
  const single = projectUniqueOutcomes([
    {
      claimId: `claim-single-${randomUUID().slice(0, 8)}`,
      platformId: "google_ads",
      bookingId: `booking-single-${randomUUID().slice(0, 8)}`,
      claimedAtIso: nowIso,
    },
  ]);
  const singleDecision = refuseSilentPlatformSum(single);
  if (
    single.uniqueBookingCount === 1 &&
    single.platformClaimCount === 1 &&
    singleDecision.allowed
  ) {
    details.push(
      "single-platform claim → unique=1 allowed (no false double-count)",
    );
  } else {
    passed = false;
    details.push(
      `single-platform control unexpectedly ${JSON.stringify({ single, singleDecision })}`,
    );
  }

  return {
    proofId: `proof-dup-platform-attr-${randomUUID()}`,
    kind: SoakProofKind.DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-dup-platform-attr-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
