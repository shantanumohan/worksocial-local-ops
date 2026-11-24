/**
 * T-X059 / T-US-038 — Duplicate platform attribution / double-counted
 * attribution avoided: one booking; separate claims.
 *
 * Multiple ad/analytics platforms may each claim the same CRM-verified booking.
 * Unique outcome count stays 1; per-platform claims remain separate ledger rows.
 * Never silently sum platform conversions into unique bookings.
 * Distinct from T-X052 (synthetic commerce exclusion) and T-X039 (denominators).
 * External effects: NONE. Live provider wiring: NOT_WIRED.
 * Fixture only — never invents live VERIFIED.
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
  /** Distinct platforms that filed at least one retained claim. */
  distinctPlatformCount: number;
  /** Null-prototype record — platformId keys never collide with Object.prototype. */
  claimsByPlatform: Record<string, number>;
  /**
   * Retained individual claim rows (claimId / platformId / bookingId / claimedAtIso).
   * Sorted chronologically (claimedAtIso, then claimId). Proves claims stay
   * separate ledger identities, not only aggregate counts.
   */
  retainedClaims: PlatformAttributionClaim[];
  /** True when naive platform-sum would overstate unique bookings. */
  wouldDoubleCountIfSummed: boolean;
  /** Blank/whitespace claim fields after trim — never invent outcomes from them. */
  hasInvalidClaims: boolean;
  invalidClaimCount: number;
  reasons: string[];
  externalEffects: "NONE";
  liveProviderWiring: "NOT_WIRED";
};

function parseClaimedAtMs(claimedAtIso: string): number | null {
  // Require an explicit timezone so lexicographic ≠ chronology traps are avoided
  // for offsets; Date.parse accepts Z / ±HH:MM.
  if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(claimedAtIso)) {
    return null;
  }
  const ms = Date.parse(claimedAtIso);
  return Number.isFinite(ms) ? ms : null;
}

function normalizeClaim(
  claim: PlatformAttributionClaim,
):
  | { ok: true; claim: PlatformAttributionClaim; claimedAtMs: number }
  | { ok: false; reason: string } {
  const claimId = claim.claimId.trim();
  const platformId = claim.platformId.trim();
  const bookingId = claim.bookingId.trim();
  const claimedAtIso = claim.claimedAtIso.trim();
  if (!claimId || !platformId || !bookingId || !claimedAtIso) {
    return {
      ok: false,
      reason: `invalid claim fields (blank after trim) claimId=${JSON.stringify(claim.claimId)} platformId=${JSON.stringify(claim.platformId)} bookingId=${JSON.stringify(claim.bookingId)}`,
    };
  }
  const claimedAtMs = parseClaimedAtMs(claimedAtIso);
  if (claimedAtMs == null) {
    return {
      ok: false,
      reason: `invalid claimedAtIso=${JSON.stringify(claim.claimedAtIso)} — require parseable ISO-8601 with timezone (T-X059)`,
    };
  }
  return {
    ok: true,
    claim: { claimId, platformId, bookingId, claimedAtIso },
    claimedAtMs,
  };
}

/**
 * Project unique booking outcomes while retaining separate platform claims.
 */
export function projectUniqueOutcomes(
  claims: readonly PlatformAttributionClaim[],
): UniqueOutcomeProjection {
  const valid: Array<{ claim: PlatformAttributionClaim; claimedAtMs: number }> =
    [];
  const invalidReasons: string[] = [];
  for (const raw of claims) {
    const normalized = normalizeClaim(raw);
    if (!normalized.ok) {
      invalidReasons.push(normalized.reason);
      continue;
    }
    valid.push({
      claim: normalized.claim,
      claimedAtMs: normalized.claimedAtMs,
    });
  }

  const uniqueBookingIds = [
    ...new Set(valid.map((v) => v.claim.bookingId)),
  ].sort();
  const claimsByPlatform: Record<string, number> = Object.create(null);
  for (const { claim } of valid) {
    const prev = Object.prototype.hasOwnProperty.call(
      claimsByPlatform,
      claim.platformId,
    )
      ? claimsByPlatform[claim.platformId]!
      : 0;
    claimsByPlatform[claim.platformId] = prev + 1;
  }
  // Sort by parsed instant (not lexicographic strings) so offset timestamps
  // keep true chronology in retainedClaims / acceptance evidence.
  const retainedClaims = [...valid]
    .sort((a, b) => {
      const byTime = a.claimedAtMs - b.claimedAtMs;
      return byTime !== 0
        ? byTime
        : a.claim.claimId.localeCompare(b.claim.claimId);
    })
    .map((v) => v.claim);
  const platformClaimCount = retainedClaims.length;
  const uniqueBookingCount = uniqueBookingIds.length;
  const distinctPlatformCount = Object.keys(claimsByPlatform).length;
  const wouldDoubleCountIfSummed = platformClaimCount > uniqueBookingCount;
  const hasInvalidClaims = invalidReasons.length > 0;
  const reasons = [
    `uniqueBookingCount=${uniqueBookingCount}`,
    `platformClaimCount=${platformClaimCount}`,
    `distinctPlatformCount=${distinctPlatformCount}`,
    `retainedClaimIds=${retainedClaims.map((c) => c.claimId).join(",")}`,
    wouldDoubleCountIfSummed
      ? "platform claims exceed unique bookings — keep claims separate; do not sum into unique outcomes"
      : "platform claim count matches unique bookings",
    ...(hasInvalidClaims
      ? [
          `invalidClaimCount=${invalidReasons.length}`,
          ...invalidReasons,
        ]
      : []),
    "liveProviderWiring=NOT_WIRED externalEffects=NONE",
  ];
  return {
    uniqueBookingIds,
    uniqueBookingCount,
    platformClaimCount,
    distinctPlatformCount,
    claimsByPlatform,
    retainedClaims,
    wouldDoubleCountIfSummed,
    hasInvalidClaims,
    invalidClaimCount: invalidReasons.length,
    reasons,
    externalEffects: "NONE",
    liveProviderWiring: "NOT_WIRED",
  };
}

export type SilentPlatformSumDecision =
  | {
      allowed: false;
      code: "SILENT_PLATFORM_SUM_REFUSED" | "INVALID_ATTRIBUTION_CLAIM";
      uniqueBookingCount: number;
      platformClaimCount: number;
      reasons: string[];
      externalEffects: "NONE";
      liveProviderWiring: "NOT_WIRED";
    }
  | {
      allowed: true;
      code: null;
      uniqueBookingCount: number;
      platformClaimCount: number;
      reasons: string[];
      externalEffects: "NONE";
      liveProviderWiring: "NOT_WIRED";
    };

/**
 * Refuse treating summed platform conversions as unique booking outcomes (T-X059).
 * Also refuse when input claims had blank/invalid fields after trim.
 */
export function refuseSilentPlatformSum(
  projection: UniqueOutcomeProjection,
): SilentPlatformSumDecision {
  if (projection.hasInvalidClaims) {
    return {
      allowed: false,
      code: "INVALID_ATTRIBUTION_CLAIM",
      uniqueBookingCount: projection.uniqueBookingCount,
      platformClaimCount: projection.platformClaimCount,
      reasons: [
        "Blank/invalid attribution claim fields refused — never invent unique bookings (T-X059)",
        ...projection.reasons,
      ],
      externalEffects: "NONE",
      liveProviderWiring: "NOT_WIRED",
    };
  }
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
      externalEffects: "NONE",
      liveProviderWiring: "NOT_WIRED",
    };
  }
  return {
    allowed: true,
    code: null,
    uniqueBookingCount: projection.uniqueBookingCount,
    platformClaimCount: projection.platformClaimCount,
    reasons: projection.reasons,
    externalEffects: "NONE",
    liveProviderWiring: "NOT_WIRED",
  };
}

export const DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS = [
  "T-X059",
  "T-US-038",
] as const;
