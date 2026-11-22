/**
 * T-X059 — Duplicate platform attribution: one booking; separate claims.
 *
 * Multiple ad/analytics platforms may each claim the same CRM-verified booking.
 * Unique outcome count stays 1; per-platform claims remain separate ledger rows.
 * Never silently sum platform conversions into unique bookings.
 * Distinct from T-X052 (synthetic commerce exclusion) and T-X039 (denominators).
 * External effects: NONE. Fixture only — never invents live VERIFIED.
 */

export type PlatformAttributionClaim = {
  claimId: string;
  platformId: string;
  bookingId: string;
  claimedAtIso: string;
};

export type UniqueOutcomeProjection = {
  uniqueBookingIds: string[];
  uniqueBookingCount: number;
  platformClaimCount: number;
  claimsByPlatform: Record<string, number>;
  /** True when naive platform-sum would overstate unique bookings. */
  wouldDoubleCountIfSummed: boolean;
  reasons: string[];
};

/**
 * Project unique booking outcomes while retaining separate platform claims.
 */
export function projectUniqueOutcomes(
  claims: readonly PlatformAttributionClaim[],
): UniqueOutcomeProjection {
  const uniqueBookingIds = [...new Set(claims.map((c) => c.bookingId))].sort();
  const claimsByPlatform: Record<string, number> = {};
  for (const claim of claims) {
    claimsByPlatform[claim.platformId] =
      (claimsByPlatform[claim.platformId] ?? 0) + 1;
  }
  const platformClaimCount = claims.length;
  const uniqueBookingCount = uniqueBookingIds.length;
  const wouldDoubleCountIfSummed = platformClaimCount > uniqueBookingCount;
  const reasons = [
    `uniqueBookingCount=${uniqueBookingCount}`,
    `platformClaimCount=${platformClaimCount}`,
    wouldDoubleCountIfSummed
      ? "platform claims exceed unique bookings — keep claims separate; do not sum into unique outcomes"
      : "platform claim count matches unique bookings",
  ];
  return {
    uniqueBookingIds,
    uniqueBookingCount,
    platformClaimCount,
    claimsByPlatform,
    wouldDoubleCountIfSummed,
    reasons,
  };
}

export type SilentPlatformSumDecision =
  | {
      allowed: false;
      code: "SILENT_PLATFORM_SUM_REFUSED";
      uniqueBookingCount: number;
      platformClaimCount: number;
      reasons: string[];
    }
  | {
      allowed: true;
      code: null;
      uniqueBookingCount: number;
      platformClaimCount: number;
      reasons: string[];
    };

/**
 * Refuse treating summed platform conversions as unique booking outcomes (T-X059).
 */
export function refuseSilentPlatformSum(
  projection: UniqueOutcomeProjection,
): SilentPlatformSumDecision {
  if (projection.wouldDoubleCountIfSummed) {
    return {
      allowed: false,
      code: "SILENT_PLATFORM_SUM_REFUSED",
      uniqueBookingCount: projection.uniqueBookingCount,
      platformClaimCount: projection.platformClaimCount,
      reasons: [
        "Duplicate platform attribution must not inflate unique bookings",
        ...projection.reasons,
      ],
    };
  }
  return {
    allowed: true,
    code: null,
    uniqueBookingCount: projection.uniqueBookingCount,
    platformClaimCount: projection.platformClaimCount,
    reasons: projection.reasons,
  };
}

export const DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS = [
  "T-X059",
] as const;
