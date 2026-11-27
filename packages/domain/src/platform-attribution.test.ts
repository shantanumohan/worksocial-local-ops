import { describe, expect, it } from "vitest";
import {
  DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS,
  projectUniqueOutcomes,
  refuseSilentPlatformSum,
} from "./platform-attribution.js";

describe("platform-attribution (T-X059)", () => {
  const nowIso = "2026-11-22T19:00:00.000Z";

  it("keeps one unique booking when two platforms claim the same booking", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-google",
        platformId: "google_ads",
        bookingId: "booking-1",
        claimedAtIso: nowIso,
      },
      {
        claimId: "c-meta",
        platformId: "meta_ads",
        bookingId: "booking-1",
        claimedAtIso: nowIso,
      },
    ]);
    expect(projection.uniqueBookingCount).toBe(1);
    expect(projection.platformClaimCount).toBe(2);
    expect(projection.distinctPlatformCount).toBe(2);
    expect(projection.claimsByPlatform.google_ads).toBe(1);
    expect(projection.claimsByPlatform.meta_ads).toBe(1);
    expect(projection.retainedClaims.map((c) => c.claimId)).toEqual([
      "c-google",
      "c-meta",
    ]);
    expect(projection.wouldDoubleCountIfSummed).toBe(true);
    expect(projection.externalEffects).toBe("NONE");
    expect(projection.liveProviderWiring).toBe("NOT_WIRED");

    const decision = refuseSilentPlatformSum(projection);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("SILENT_PLATFORM_SUM_REFUSED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("allows matching claim and unique counts without double-count", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-only",
        platformId: "google_ads",
        bookingId: "booking-2",
        claimedAtIso: nowIso,
      },
    ]);
    expect(projection.uniqueBookingCount).toBe(1);
    expect(projection.platformClaimCount).toBe(1);
    expect(projection.distinctPlatformCount).toBe(1);
    expect(projection.wouldDoubleCountIfSummed).toBe(false);
    const decision = refuseSilentPlatformSum(projection);
    expect(decision.allowed).toBe(true);
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("counts prototype-key platformIds without inheritance collision", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-toString",
        platformId: "toString",
        bookingId: "booking-proto",
        claimedAtIso: nowIso,
      },
      {
        claimId: "c-proto",
        platformId: "__proto__",
        bookingId: "booking-proto",
        claimedAtIso: nowIso,
      },
    ]);
    expect(projection.claimsByPlatform.toString).toBe(1);
    expect(projection.claimsByPlatform.__proto__).toBe(1);
    expect(projection.platformClaimCount).toBe(2);
    expect(projection.uniqueBookingCount).toBe(1);
    expect(projection.retainedClaims).toHaveLength(2);
    expect(projection.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("keeps uniqueBookingCount=1 for three platforms claiming one booking", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-g",
        platformId: "google_ads",
        bookingId: "booking-triple",
        claimedAtIso: "2026-11-22T19:00:02.000Z",
      },
      {
        claimId: "c-m",
        platformId: "meta_ads",
        bookingId: "booking-triple",
        claimedAtIso: "2026-11-22T19:00:00.000Z",
      },
      {
        claimId: "c-l",
        platformId: "linkedin_ads",
        bookingId: "booking-triple",
        claimedAtIso: "2026-11-22T19:00:01.000Z",
      },
    ]);
    expect(projection.uniqueBookingCount).toBe(1);
    expect(projection.platformClaimCount).toBe(3);
    expect(projection.distinctPlatformCount).toBe(3);
    expect(projection.wouldDoubleCountIfSummed).toBe(true);
    expect(projection.retainedClaims.map((c) => c.claimId)).toEqual([
      "c-m",
      "c-l",
      "c-g",
    ]);
    expect(refuseSilentPlatformSum(projection).code).toBe(
      "SILENT_PLATFORM_SUM_REFUSED",
    );
  });

  it("counts two distinct bookings across platforms without double-count", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-a",
        platformId: "google_ads",
        bookingId: "booking-a",
        claimedAtIso: nowIso,
      },
      {
        claimId: "c-b",
        platformId: "meta_ads",
        bookingId: "booking-b",
        claimedAtIso: nowIso,
      },
    ]);
    expect(projection.uniqueBookingCount).toBe(2);
    expect(projection.platformClaimCount).toBe(2);
    expect(projection.wouldDoubleCountIfSummed).toBe(false);
    expect(refuseSilentPlatformSum(projection).allowed).toBe(true);
  });

  it("trims claim fields and sorts retainedClaims chronologically", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "  c-late  ",
        platformId: "  google_ads ",
        bookingId: " booking-trim ",
        claimedAtIso: "2026-11-22T19:00:05.000Z",
      },
      {
        claimId: "c-early",
        platformId: "meta_ads",
        bookingId: "booking-trim",
        claimedAtIso: "2026-11-22T19:00:01.000Z",
      },
    ]);
    expect(projection.retainedClaims.map((c) => c.claimId)).toEqual([
      "c-early",
      "c-late",
    ]);
    expect(projection.retainedClaims[1]?.platformId).toBe("google_ads");
    expect(projection.uniqueBookingIds).toEqual(["booking-trim"]);
  });

  it("refuses blank/invalid claim fields — never invents unique bookings", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "   ",
        platformId: "google_ads",
        bookingId: "booking-x",
        claimedAtIso: nowIso,
      },
      {
        claimId: "c-ok",
        platformId: "meta_ads",
        bookingId: "booking-x",
        claimedAtIso: nowIso,
      },
    ]);
    expect(projection.hasInvalidClaims).toBe(true);
    expect(projection.invalidClaimCount).toBe(1);
    expect(projection.platformClaimCount).toBe(1);
    expect(projection.uniqueBookingCount).toBe(1);
    const decision = refuseSilentPlatformSum(projection);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("INVALID_ATTRIBUTION_CLAIM");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("rejects malformed claimedAtIso instead of accepting the claim", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-bad-ts",
        platformId: "google_ads",
        bookingId: "booking-bad-ts",
        claimedAtIso: "not-a-date",
      },
    ]);
    expect(projection.hasInvalidClaims).toBe(true);
    expect(projection.invalidClaimCount).toBe(1);
    expect(projection.platformClaimCount).toBe(0);
    expect(projection.uniqueBookingCount).toBe(0);
    expect(refuseSilentPlatformSum(projection).code).toBe(
      "INVALID_ATTRIBUTION_CLAIM",
    );
  });

  it("sorts retainedClaims by parsed UTC instant across offsets", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-later-lex",
        platformId: "google_ads",
        bookingId: "booking-offset",
        // Lexicographically earlier string, but later instant than +02:00 row.
        claimedAtIso: "2026-11-22T18:00:00Z",
      },
      {
        claimId: "c-earlier-offset",
        platformId: "meta_ads",
        bookingId: "booking-offset",
        // 17:30Z — earlier than 18:00Z, but string sorts after "18:00:00Z".
        claimedAtIso: "2026-11-22T19:30:00+02:00",
      },
    ]);
    expect(projection.retainedClaims.map((c) => c.claimId)).toEqual([
      "c-earlier-offset",
      "c-later-lex",
    ]);
    expect(projection.uniqueBookingCount).toBe(1);
    expect(projection.platformClaimCount).toBe(2);
  });

  it("projects empty input as zero unique without double-count flag", () => {
    const projection = projectUniqueOutcomes([]);
    expect(projection.uniqueBookingCount).toBe(0);
    expect(projection.platformClaimCount).toBe(0);
    expect(projection.distinctPlatformCount).toBe(0);
    expect(projection.wouldDoubleCountIfSummed).toBe(false);
    expect(projection.hasInvalidClaims).toBe(false);
    expect(projection.externalEffects).toBe("NONE");
    expect(refuseSilentPlatformSum(projection).allowed).toBe(true);
  });

  it("pins T-X059 / T-US-038 related case ids (Q34)", () => {
    expect([...DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS]).toEqual([
      "T-X059",
      "T-US-038",
    ]);
  });

  it("refuses blank platformId as INVALID_ATTRIBUTION_CLAIM (Q34/S17)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-ok",
        platformId: "   ",
        bookingId: "booking-x",
        claimedAtIso: nowIso,
      },
    ]);
    expect(projection.hasInvalidClaims).toBe(true);
    const decision = refuseSilentPlatformSum(projection);
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("INVALID_ATTRIBUTION_CLAIM");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("refuses blank bookingId — never invent unique bookings (Q34/S18)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-blank-booking",
        platformId: "google_ads",
        bookingId: "\t",
        claimedAtIso: nowIso,
      },
    ]);
    expect(projection.uniqueBookingCount).toBe(0);
    expect(refuseSilentPlatformSum(projection).code).toBe(
      "INVALID_ATTRIBUTION_CLAIM",
    );
  });

  it("blocks naive platform sum when wouldDoubleCountIfSummed (Q34/S19)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-g",
        platformId: "google_ads",
        bookingId: "booking-one",
        claimedAtIso: nowIso,
      },
      {
        claimId: "c-m",
        platformId: "meta_ads",
        bookingId: "booking-one",
        claimedAtIso: nowIso,
      },
    ]);
    expect(projection.platformClaimCount).toBe(2);
    expect(projection.uniqueBookingCount).toBe(1);
    expect(projection.wouldDoubleCountIfSummed).toBe(true);
    const decision = refuseSilentPlatformSum(projection);
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SILENT_PLATFORM_SUM_REFUSED");
    expect(decision.uniqueBookingCount).toBe(1);
    expect(decision.platformClaimCount).toBe(2);
  });

  it("refuses silent sum for same booking with distinct platform claims (Q34 wipe15 @ 578b1a08)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-google",
        platformId: "google_ads",
        bookingId: "booking-shared",
        claimedAtIso: nowIso,
      },
      {
        claimId: "c-meta",
        platformId: "linkedin_ads",
        bookingId: "booking-shared",
        claimedAtIso: nowIso,
      },
    ]);
    expect(projection.uniqueBookingCount).toBe(1);
    expect(projection.distinctPlatformCount).toBe(2);
    expect(projection.wouldDoubleCountIfSummed).toBe(true);
    expect(refuseSilentPlatformSum(projection).code).toBe(
      "SILENT_PLATFORM_SUM_REFUSED",
    );
    expect(projection.externalEffects).toBe("NONE");
  });

  it("refuses claimedAtIso without timezone — no lexicographic chronology trap (Q34 wipe15)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-no-tz",
        platformId: "google_ads",
        bookingId: "booking-no-tz",
        claimedAtIso: "2026-11-22T19:00:00",
      },
    ]);
    expect(projection.hasInvalidClaims).toBe(true);
    expect(projection.platformClaimCount).toBe(0);
    expect(refuseSilentPlatformSum(projection).code).toBe(
      "INVALID_ATTRIBUTION_CLAIM",
    );
    expect(projection.externalEffects).toBe("NONE");
    expect(projection.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("allow path keeps NOT_WIRED and NONE on single-platform unique match (Q34/S20)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-single",
        platformId: "google_ads",
        bookingId: "booking-single",
        claimedAtIso: nowIso,
      },
    ]);
    const decision = refuseSilentPlatformSum(projection);
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(null);
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(projection.reasons.join(" ")).toContain(
      "liveProviderWiring=NOT_WIRED externalEffects=NONE",
    );
  });

  it("refuses silent sum when one platform files two claims on one booking (Q34 wipe15 @ e969eb6e)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-a",
        platformId: "google_ads",
        bookingId: "booking-dup-platform",
        claimedAtIso: "2026-11-22T19:00:01.000Z",
      },
      {
        claimId: "c-b",
        platformId: "google_ads",
        bookingId: "booking-dup-platform",
        claimedAtIso: "2026-11-22T19:00:02.000Z",
      },
    ]);
    expect(projection.uniqueBookingCount).toBe(1);
    expect(projection.distinctPlatformCount).toBe(1);
    expect(projection.platformClaimCount).toBe(2);
    expect(projection.wouldDoubleCountIfSummed).toBe(true);
    expect(projection.retainedClaims.map((c) => c.claimId)).toEqual([
      "c-a",
      "c-b",
    ]);
    expect(refuseSilentPlatformSum(projection).code).toBe(
      "SILENT_PLATFORM_SUM_REFUSED",
    );
  });

  it("rejects numeric offset without colon in claimedAtIso (Q34 wipe15 @ e969eb6e)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-nocolon-offset",
        platformId: "meta_ads",
        bookingId: "booking-offset-nocolon",
        claimedAtIso: "2026-11-22T19:00:00+0500",
      },
    ]);
    expect(projection.hasInvalidClaims).toBe(true);
    expect(projection.platformClaimCount).toBe(0);
    expect(refuseSilentPlatformSum(projection).code).toBe(
      "INVALID_ATTRIBUTION_CLAIM",
    );
  });

  it("prefers INVALID_ATTRIBUTION_CLAIM over silent-sum when batch mixes invalid rows (Q34 wipe15 @ e969eb6e)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-g",
        platformId: "google_ads",
        bookingId: "booking-mixed",
        claimedAtIso: nowIso,
      },
      {
        claimId: "c-m",
        platformId: "meta_ads",
        bookingId: "booking-mixed",
        claimedAtIso: nowIso,
      },
      {
        claimId: "   ",
        platformId: "linkedin_ads",
        bookingId: "booking-mixed",
        claimedAtIso: nowIso,
      },
    ]);
    expect(projection.wouldDoubleCountIfSummed).toBe(true);
    expect(projection.hasInvalidClaims).toBe(true);
    const decision = refuseSilentPlatformSum(projection);
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("INVALID_ATTRIBUTION_CLAIM");
    expect(decision.platformClaimCount).toBe(2);
  });

  it("sorts retainedClaims by claimId when claimedAt instant ties (Q34 wipe15 @ e7226169)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-z",
        platformId: "meta_ads",
        bookingId: "booking-tie",
        claimedAtIso: nowIso,
      },
      {
        claimId: "c-a",
        platformId: "google_ads",
        bookingId: "booking-tie",
        claimedAtIso: nowIso,
      },
    ]);
    expect(projection.retainedClaims.map((c) => c.claimId)).toEqual([
      "c-a",
      "c-z",
    ]);
    expect(refuseSilentPlatformSum(projection).code).toBe(
      "SILENT_PLATFORM_SUM_REFUSED",
    );
  });

  it("accepts lowercase z timezone suffix in claimedAtIso (Q34 wipe15 @ e7226169)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-lower-z",
        platformId: "google_ads",
        bookingId: "booking-lower-z",
        claimedAtIso: "2026-11-22T19:00:00.000z",
      },
    ]);
    expect(projection.hasInvalidClaims).toBe(false);
    expect(projection.platformClaimCount).toBe(1);
    expect(projection.uniqueBookingCount).toBe(1);
    expect(refuseSilentPlatformSum(projection).allowed).toBe(true);
  });

  it("sorts uniqueBookingIds lexicographically across bookings (Q34 wipe15 @ 63d2c0e0)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-b",
        platformId: "google_ads",
        bookingId: "booking-b",
        claimedAtIso: nowIso,
      },
      {
        claimId: "c-a",
        platformId: "meta_ads",
        bookingId: "booking-a",
        claimedAtIso: nowIso,
      },
    ]);
    expect(projection.uniqueBookingIds).toEqual(["booking-a", "booking-b"]);
    expect(projection.uniqueBookingCount).toBe(2);
    expect(refuseSilentPlatformSum(projection).allowed).toBe(true);
  });

  it("accepts negative numeric offset with colon (Q34 wipe15 @ 63d2c0e0)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-neg-offset",
        platformId: "linkedin_ads",
        bookingId: "booking-neg-offset",
        claimedAtIso: "2026-11-22T14:00:00-05:00",
      },
    ]);
    expect(projection.hasInvalidClaims).toBe(false);
    expect(projection.platformClaimCount).toBe(1);
    expect(refuseSilentPlatformSum(projection).code).toBe(null);
  });
});
