/**
 * Fixture proof for T-X059 / T-US-038 — Duplicate platform attribution /
 * double-counted attribution avoided in unique outcomes.
 *
 * Additive hillclimb: liveProviderWiring=NOT_WIRED; chronological retain;
 * three-platform same booking; blank claim refuse; trim; empty input.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  projectUniqueOutcomes,
  refuseSilentPlatformSum,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X059 + T-US-038 fixture ACCEPTED.
 */
export function proofDuplicatePlatformAttributionOneBooking(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const bookingId = `booking-${randomUUID().slice(0, 8)}`;
  const googleClaimId = `claim-google-${randomUUID().slice(0, 8)}`;
  const metaClaimId = `claim-meta-${randomUUID().slice(0, 8)}`;

  // 1. Two platforms claim the same booking — retain separate claim identities.
  const claims = [
    {
      claimId: googleClaimId,
      platformId: "google_ads",
      bookingId,
      claimedAtIso: nowIso,
    },
    {
      claimId: metaClaimId,
      platformId: "meta_ads",
      bookingId,
      claimedAtIso: nowIso,
    },
  ];
  const projection = projectUniqueOutcomes(claims);
  const retainedIds = projection.retainedClaims.map((c) => c.claimId).sort();
  const expectedIds = [googleClaimId, metaClaimId].sort();
  if (
    projection.uniqueBookingCount === 1 &&
    projection.platformClaimCount === 2 &&
    projection.distinctPlatformCount === 2 &&
    projection.claimsByPlatform.google_ads === 1 &&
    projection.claimsByPlatform.meta_ads === 1 &&
    projection.wouldDoubleCountIfSummed &&
    retainedIds.join(",") === expectedIds.join(",") &&
    projection.retainedClaims.every(
      (c) =>
        c.bookingId === bookingId &&
        typeof c.claimedAtIso === "string" &&
        c.claimedAtIso.length > 0,
    ) &&
    new Set(projection.retainedClaims.map((c) => c.platformId)).size === 2 &&
    projection.externalEffects === "NONE" &&
    projection.liveProviderWiring === "NOT_WIRED" &&
    projection.hasInvalidClaims === false
  ) {
    details.push(
      `two platform claims retained separately (${googleClaimId}, ${metaClaimId}) → uniqueBookingCount=1; liveProviderWiring=NOT_WIRED`,
    );
  } else {
    passed = false;
    details.push(
      `duplicate attribution projection unexpectedly ${JSON.stringify(projection)}`,
    );
  }

  // 2. Silent sum into unique bookings refused.
  const refuse = refuseSilentPlatformSum(projection);
  if (
    !refuse.allowed &&
    refuse.code === "SILENT_PLATFORM_SUM_REFUSED" &&
    refuse.externalEffects === "NONE" &&
    refuse.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "SILENT_PLATFORM_SUM_REFUSED — platform conversions not summed into unique bookings; liveProviderWiring=NOT_WIRED",
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
  const singleClaimId = `claim-single-${randomUUID().slice(0, 8)}`;
  const single = projectUniqueOutcomes([
    {
      claimId: singleClaimId,
      platformId: "google_ads",
      bookingId: `booking-single-${randomUUID().slice(0, 8)}`,
      claimedAtIso: nowIso,
    },
  ]);
  const singleDecision = refuseSilentPlatformSum(single);
  if (
    single.uniqueBookingCount === 1 &&
    single.platformClaimCount === 1 &&
    single.retainedClaims[0]?.claimId === singleClaimId &&
    singleDecision.allowed &&
    single.liveProviderWiring === "NOT_WIRED"
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

  // 5. Three platforms → still one unique booking (hillclimb).
  const tripleBooking = `booking-triple-${randomUUID().slice(0, 8)}`;
  const triple = projectUniqueOutcomes([
    {
      claimId: "c-late",
      platformId: "google_ads",
      bookingId: tripleBooking,
      claimedAtIso: "2026-11-22T19:00:03.000Z",
    },
    {
      claimId: "c-early",
      platformId: "meta_ads",
      bookingId: tripleBooking,
      claimedAtIso: "2026-11-22T19:00:01.000Z",
    },
    {
      claimId: "c-mid",
      platformId: "linkedin_ads",
      bookingId: tripleBooking,
      claimedAtIso: "2026-11-22T19:00:02.000Z",
    },
  ]);
  if (
    triple.uniqueBookingCount === 1 &&
    triple.platformClaimCount === 3 &&
    triple.distinctPlatformCount === 3 &&
    triple.wouldDoubleCountIfSummed &&
    triple.retainedClaims.map((c) => c.claimId).join(",") ===
      "c-early,c-mid,c-late" &&
    refuseSilentPlatformSum(triple).code === "SILENT_PLATFORM_SUM_REFUSED"
  ) {
    details.push(
      "three platforms one booking → unique=1 platformClaimCount=3; chronological retainedClaims; silent sum refused",
    );
  } else {
    passed = false;
    details.push(`triple unexpectedly ${JSON.stringify(triple)}`);
  }

  // 6. Blank + malformed claimedAtIso refused (hillclimb / Codex P2).
  const invalid = projectUniqueOutcomes([
    {
      claimId: "  ",
      platformId: "google_ads",
      bookingId: bookingId,
      claimedAtIso: nowIso,
    },
    {
      claimId: "c-bad-ts",
      platformId: "meta_ads",
      bookingId: bookingId,
      claimedAtIso: "not-a-date",
    },
  ]);
  const invalidDecision = refuseSilentPlatformSum(invalid);
  if (
    invalid.hasInvalidClaims &&
    invalid.invalidClaimCount === 2 &&
    invalid.platformClaimCount === 0 &&
    !invalidDecision.allowed &&
    invalidDecision.code === "INVALID_ATTRIBUTION_CLAIM" &&
    invalidDecision.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "blank claimId + malformed claimedAtIso → INVALID_ATTRIBUTION_CLAIM; never invent unique bookings",
    );
  } else {
    passed = false;
    details.push(
      `invalid claim unexpectedly ${JSON.stringify({ invalid, invalidDecision })}`,
    );
  }

  // 6b. Chronology uses parsed instants across offsets (Codex P2).
  const sharedOff = `booking-off-shared-${randomUUID().slice(0, 8)}`;
  const offsetChrono = projectUniqueOutcomes([
    {
      claimId: "c-later-lex",
      platformId: "google_ads",
      bookingId: sharedOff,
      claimedAtIso: "2026-11-22T18:00:00Z",
    },
    {
      claimId: "c-earlier-offset",
      platformId: "meta_ads",
      bookingId: sharedOff,
      claimedAtIso: "2026-11-22T19:30:00+02:00",
    },
  ]);
  if (
    offsetChrono.retainedClaims.map((c) => c.claimId).join(",") ===
      "c-earlier-offset,c-later-lex" &&
    offsetChrono.uniqueBookingCount === 1 &&
    offsetChrono.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "offset timestamps sorted by parsed instant (19:30+02 before 18:00Z); not lexicographic",
    );
  } else {
    passed = false;
    details.push(
      `offset chronology unexpectedly ${JSON.stringify(offsetChrono)}`,
    );
  }

  // 7. Empty input honest zero (hillclimb).
  const empty = projectUniqueOutcomes([]);
  if (
    empty.uniqueBookingCount === 0 &&
    empty.platformClaimCount === 0 &&
    empty.externalEffects === "NONE" &&
    empty.liveProviderWiring === "NOT_WIRED" &&
    refuseSilentPlatformSum(empty).allowed
  ) {
    details.push("empty claims → unique=0 allowed; liveProviderWiring=NOT_WIRED");
  } else {
    passed = false;
    details.push(`empty unexpectedly ${JSON.stringify(empty)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE ACCEPTED≠VERIFIED",
  );

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
