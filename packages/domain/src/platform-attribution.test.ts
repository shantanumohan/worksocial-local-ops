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
    const decision = refuseSilentPlatformSum(projection);
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(null);
  });

  it("returns zero retained claims when every row is invalid (Q35/S21)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: " ",
        platformId: "google_ads",
        bookingId: "booking-x",
        claimedAtIso: nowIso,
      },
    ]);
    expect(projection.platformClaimCount).toBe(0);
    expect(projection.uniqueBookingCount).toBe(0);
    expect(projection.invalidClaimCount).toBe(1);
    expect(refuseSilentPlatformSum(projection).code).toBe(
      "INVALID_ATTRIBUTION_CLAIM",
    );
  });

  it("exposes refused silent-sum platformClaimCount on double-count (Q35/S22)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-1",
        platformId: "google_ads",
        bookingId: "booking-dc",
        claimedAtIso: nowIso,
      },
      {
        claimId: "c-2",
        platformId: "meta_ads",
        bookingId: "booking-dc",
        claimedAtIso: nowIso,
      },
    ]);
    const decision = refuseSilentPlatformSum(projection);
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SILENT_PLATFORM_SUM_REFUSED");
    expect(decision.platformClaimCount).toBe(2);
    expect(decision.uniqueBookingCount).toBe(1);
  });

  it("collapses trim-identical bookingIds to one unique booking (Q35/S23)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-trim",
        platformId: "google_ads",
        bookingId: "  booking-trim-id ",
        claimedAtIso: nowIso,
      },
    ]);
    expect(projection.uniqueBookingIds).toEqual(["booking-trim-id"]);
    expect(projection.uniqueBookingCount).toBe(1);
  });

  it("empty allow path still pins NOT_WIRED wiring (Q35/S24)", () => {
    const projection = projectUniqueOutcomes([]);
    const decision = refuseSilentPlatformSum(projection);
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
  });

  it("accepts explicit +00:00 UTC offset suffix (Q35 wipe15 @ d6731fcd)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-utc",
        platformId: "google_ads",
        bookingId: "booking-utc",
        claimedAtIso: "2026-11-22T19:00:00.000+00:00",
      },
    ]);
    expect(projection.hasInvalidClaims).toBe(false);
    expect(projection.platformClaimCount).toBe(1);
  });

  it("records invalidClaimCount in reasons for malformed batch (Q35 wipe15 @ d6731fcd)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-bad",
        platformId: "meta_ads",
        bookingId: "booking-reasons",
        claimedAtIso: "2026-11-22T19:00:00",
      },
    ]);
    expect(projection.invalidClaimCount).toBe(1);
    expect(projection.reasons.join(" ")).toContain("invalidClaimCount=1");
  });

  it("uses null-prototype claimsByPlatform map (Q35 wipe15 @ d6731fcd)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-constructor",
        platformId: "constructor",
        bookingId: "booking-proto",
        claimedAtIso: nowIso,
      },
    ]);
    expect(Object.prototype.hasOwnProperty.call(projection.claimsByPlatform, "constructor")).toBe(true);
    expect(projection.claimsByPlatform["constructor"]).toBe(1);
    expect(Object.getPrototypeOf(projection.claimsByPlatform)).toBeNull();
  });

  it("refuses silent sum for three platforms on one booking (Q35/S25 wipe15 @ 1fb05770)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-g",
        platformId: "google_ads",
        bookingId: "booking-triple",
        claimedAtIso: nowIso,
      },
      {
        claimId: "c-m",
        platformId: "meta_ads",
        bookingId: "booking-triple",
        claimedAtIso: nowIso,
      },
      {
        claimId: "c-l",
        platformId: "linkedin_ads",
        bookingId: "booking-triple",
        claimedAtIso: nowIso,
      },
    ]);
    expect(projection.uniqueBookingCount).toBe(1);
    expect(projection.platformClaimCount).toBe(3);
    expect(projection.distinctPlatformCount).toBe(3);
    expect(projection.wouldDoubleCountIfSummed).toBe(true);
    const decision = refuseSilentPlatformSum(projection);
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SILENT_PLATFORM_SUM_REFUSED");
  });

  it("sorts retainedClaims chronologically when same booking spans instants (Q35/S26 wipe15 @ 1fb05770)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-later",
        platformId: "meta_ads",
        bookingId: "booking-chrono",
        claimedAtIso: "2026-11-22T20:00:00.000Z",
      },
      {
        claimId: "c-earlier",
        platformId: "google_ads",
        bookingId: "booking-chrono",
        claimedAtIso: "2026-11-22T18:00:00.000Z",
      },
    ]);
    expect(projection.retainedClaims.map((c) => c.claimId)).toEqual([
      "c-earlier",
      "c-later",
    ]);
    expect(refuseSilentPlatformSum(projection).code).toBe(
      "SILENT_PLATFORM_SUM_REFUSED",
    );
  });

  it("pins DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS for acceptance wiring (Q35/S27 wipe15 @ 1fb05770)", () => {
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).toEqual([
      "T-X059",
      "T-US-038",
    ]);
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X061",
    );
  });

  it("allows silent-sum when each booking has one platform claim (Q35/S28 wipe15 @ 64829602)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-b1",
        platformId: "google_ads",
        bookingId: "booking-a",
        claimedAtIso: nowIso,
      },
      {
        claimId: "c-b2",
        platformId: "meta_ads",
        bookingId: "booking-b",
        claimedAtIso: nowIso,
      },
    ]);
    expect(projection.uniqueBookingCount).toBe(2);
    expect(projection.platformClaimCount).toBe(2);
    expect(projection.wouldDoubleCountIfSummed).toBe(false);
    const decision = refuseSilentPlatformSum(projection);
    expect(decision.allowed).toBe(true);
  });

  it("threads distinctPlatformCount in refusal reasons (Q35/S29 wipe15 @ 64829602)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-1",
        platformId: "google_ads",
        bookingId: "booking-reasons-dc",
        claimedAtIso: nowIso,
      },
      {
        claimId: "c-2",
        platformId: "meta_ads",
        bookingId: "booking-reasons-dc",
        claimedAtIso: nowIso,
      },
    ]);
    const decision = refuseSilentPlatformSum(projection);
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reasons.join(" ")).toMatch(/distinctPlatformCount=2/);
  });

  it("excludes T-X064 SSRF case from duplicate-attribution wiring (Q35/S30 wipe15 @ 64829602)", () => {
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X064",
    );
  });

  it("excludes T-X066 backup-omit from duplicate-attribution wiring (Q35/S31 wipe15 @ 5ed3d15d)", () => {
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X066",
    );
  });

  it("excludes T-X068 grouped-outage from attribution wiring (Q35/S32 wipe15 @ 7a9be9a1)", () => {
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X068",
    );
  });

  it("excludes T-X070 payload-collection from attribution wiring (Q35/S33 wipe15 @ 579ffaf8)", () => {
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X070",
    );
  });

  it("excludes T-X073 offboard from attribution wiring (Q35/S34 tip-moved-316 @ 60b4b782)", () => {
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X073",
    );
  });

  it("excludes T-X057 repair-weaken from attribution wiring (Q35/S35 tip-moved-316 @ 60b4b782)", () => {
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X057",
    );
  });

  it("collapses trim-identical platformIds under one claimsByPlatform key (Q35/S36)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-trim-plat-a",
        platformId: "  google_ads  ",
        bookingId: "booking-trim-plat",
        claimedAtIso: nowIso,
      },
      {
        claimId: "c-trim-plat-b",
        platformId: "\tgoogle_ads\n",
        bookingId: "booking-trim-plat-2",
        claimedAtIso: nowIso,
      },
    ]);
    expect(projection.distinctPlatformCount).toBe(1);
    expect(projection.claimsByPlatform.google_ads).toBe(2);
    expect(projection.wouldDoubleCountIfSummed).toBe(false);
    expect(projection.externalEffects).toBe("NONE");
    expect(projection.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("accepts fractional-second Z timestamps without inventing bookings (Q35/S37)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-frac",
        platformId: "meta_ads",
        bookingId: "booking-frac",
        claimedAtIso: "2026-11-22T19:00:00.123Z",
      },
    ]);
    expect(projection.hasInvalidClaims).toBe(false);
    expect(projection.platformClaimCount).toBe(1);
    expect(projection.uniqueBookingCount).toBe(1);
    expect(projection.retainedClaims[0]?.claimedAtIso).toBe(
      "2026-11-22T19:00:00.123Z",
    );
    const decision = refuseSilentPlatformSum(projection);
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("refuse path keeps NONE/NOT_WIRED honesty on invalid batch (Q35/S38)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: " ",
        platformId: "google_ads",
        bookingId: "booking-honesty",
        claimedAtIso: nowIso,
      },
    ]);
    const decision = refuseSilentPlatformSum(projection);
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("INVALID_ATTRIBUTION_CLAIM");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.reasons.join(" ")).toMatch(
      /liveProviderWiring=NOT_WIRED externalEffects=NONE/,
    );
  });

  it("excludes T-X071 host-offline from attribution wiring (Q35/S39)", () => {
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X071",
    );
  });

  it("excludes T-X072 eval-redaction from attribution wiring (Q35/S40)", () => {
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X072",
    );
  });

  it("excludes exclusive T-X058 repair-limit from attribution wiring (Q35/S41)", () => {
    // Fence only — exclusive elsewhere is #317 Slot P; do not claim.
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X058",
    );
  });

  it("excludes T-X060 currency-timezone from attribution wiring (Q36/S42 tip-moved-334 @ 27a872ed)", () => {
    // Drift fence — T-X060 merged #319; SOLE exclusive is #335 Slot Q.
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X060",
    );
  });

  it("sorts retainedClaims by parsed instant across offset timezones (Q36/S43)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-later-utc",
        platformId: "meta_ads",
        bookingId: "booking-offset",
        claimedAtIso: "2026-11-22T19:00:00.000Z",
      },
      {
        claimId: "c-earlier-offset",
        platformId: "google_ads",
        bookingId: "booking-offset",
        claimedAtIso: "2026-11-22T18:30:00+05:30",
      },
    ]);
    expect(projection.retainedClaims.map((c) => c.claimId)).toEqual([
      "c-earlier-offset",
      "c-later-utc",
    ]);
    expect(projection.wouldDoubleCountIfSummed).toBe(true);
    const decision = refuseSilentPlatformSum(projection);
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SILENT_PLATFORM_SUM_REFUSED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("treats claimedAtIso without timezone as invalid (Q36/S44)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-notz",
        platformId: "google_ads",
        bookingId: "booking-notz",
        claimedAtIso: "2026-11-22T19:00:00",
      },
    ]);
    expect(projection.hasInvalidClaims).toBe(true);
    expect(projection.invalidClaimCount).toBe(1);
    expect(projection.uniqueBookingCount).toBe(0);
    const decision = refuseSilentPlatformSum(projection);
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("INVALID_ATTRIBUTION_CLAIM");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("sorts uniqueBookingIds lexicographically across platforms (Q36/S45)", () => {
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
      {
        claimId: "c-c",
        platformId: "google_ads",
        bookingId: "booking-c",
        claimedAtIso: nowIso,
      },
    ]);
    expect(projection.uniqueBookingIds).toEqual([
      "booking-a",
      "booking-b",
      "booking-c",
    ]);
    expect(projection.wouldDoubleCountIfSummed).toBe(false);
    const decision = refuseSilentPlatformSum(projection);
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("excludes T-X065 browser-auth from attribution wiring (Q36/S47 tip-moved-334)", () => {
    // Drift fence — T-X065 merged #324; SOLE exclusive is #335 Slot Q.
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X065",
    );
  });

  it("excludes T-X066 backup-omit from attribution wiring (Q36/S48 tip-moved-334)", () => {
    // Drift fence — T-X066 merged #325; SOLE exclusive is #335 Slot Q.
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X066",
    );
  });

  it("excludes T-X067 workflow-upgrade from attribution wiring (Q36/S49 tip-moved-334)", () => {
    // Drift fence — T-X067 merged #326; SOLE exclusive is #335 Slot Q.
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X067",
    );
  });

  it("excludes T-X068 grouped-outage from attribution wiring (Q36/S50 tip-moved-334)", () => {
    // Drift fence — T-X068 merged #327; SOLE exclusive is #335 Slot Q.
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X068",
    );
  });

  it("excludes T-X069 imported-doc from attribution wiring (Q36/S51 tip-moved-334)", () => {
    // Drift fence — T-X069 merged #328; SOLE exclusive is #335 Slot Q.
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X069",
    );
  });

  it("excludes T-X070 payload-collection from attribution wiring (Q36/S52 tip-moved-334)", () => {
    // Drift fence — T-X070 merged #329; SOLE exclusive is #335 Slot Q.
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X070",
    );
  });

  it("excludes T-X071 host-offline from attribution wiring (Q36/S53 tip-moved-334)", () => {
    // Drift fence — T-X071 merged #330; SOLE exclusive is #335 Slot Q.
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X071",
    );
  });

  it("excludes T-X072 eval-redaction from attribution wiring (Q36/S54 tip-moved-334)", () => {
    // Drift fence — T-X072 merged #331; SOLE exclusive is #335 Slot Q.
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X072",
    );
  });

  it("excludes T-X073 offboard from attribution wiring (Q36/S55 tip-moved-334)", () => {
    // Drift fence — T-X073 merged #332; SOLE exclusive is #335 Slot Q.
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X073",
    );
  });

  it("excludes T-X057 repair-weaken from attribution wiring (Q36/S56 tip-moved-334)", () => {
    // Drift fence — T-X057 merged #333; SOLE exclusive is #335 Slot Q.
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X057",
    );
  });

  it("excludes T-X058 repair-limit from attribution wiring (Q36/S57 tip-moved-334)", () => {
    // Drift fence — T-X058 merged #334; SOLE exclusive is #335 Slot Q.
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X058",
    );
  });

  it("pins SOLE exclusive related case ids for T-X059 (Q36/S58 tip-moved-334)", () => {
    // SOLE exclusive #335 Slot Q — related wiring stays T-X059 + T-US-038 only.
    expect([...DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS]).toEqual([
      "T-X059",
      "T-US-038",
    ]);
  });

  it("excludes T-X060 from attribution wiring (Q37/S59 tip-moved-342 @ b106092f)", () => {
    // Drift fence — T-X060 merged #336; current exclusive #343 Slot S (do not claim).
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X060",
    );
  });

  it("breaks claimId ties when claimedAtMs matches (Q37/S60)", () => {
    const projection = projectUniqueOutcomes([
      {
        claimId: "c-b",
        platformId: "meta_ads",
        bookingId: "booking-tie",
        claimedAtIso: "2026-11-22T19:00:00.000Z",
      },
      {
        claimId: "c-a",
        platformId: "google_ads",
        bookingId: "booking-tie",
        claimedAtIso: "2026-11-22T19:00:00.000Z",
      },
    ]);
    expect(projection.retainedClaims.map((c) => c.claimId)).toEqual([
      "c-a",
      "c-b",
    ]);
    expect(projection.wouldDoubleCountIfSummed).toBe(true);
  });

  it("exposes reasons on allowed single-booking path (Q37/S61)", () => {
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
    expect(decision.reasons.join(" ")).toMatch(/uniqueBookingCount=1/);
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("excludes T-X061 keyboard-focus from attribution wiring (Q37/S62 tip-moved-342)", () => {
    // Drift fence — T-X061 merged #337; current exclusive #343 Slot S (do not claim).
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X061",
    );
  });

  it("excludes T-X062 SSE-gap from attribution wiring (Q37/S63 tip-moved-342)", () => {
    // Drift fence — T-X062 merged #338; current exclusive #343 Slot S (do not claim).
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X062",
    );
  });

  it("excludes T-X063 injection-exfil from attribution wiring (Q37/S64 tip-moved-342)", () => {
    // Drift fence — T-X063 merged #339; current exclusive #343 Slot S (do not claim).
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X063",
    );
  });

  it("excludes T-X064 SSRF from attribution wiring (Q37/S65 tip-moved-342)", () => {
    // Drift fence — T-X064 merged #340; current exclusive #343 Slot S (do not claim).
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X064",
    );
  });

  it("excludes T-X065 browser-auth from attribution wiring (Q37/S66 tip-moved-342)", () => {
    // Drift fence — T-X065 merged #341; current exclusive #343 Slot S (do not claim).
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X065",
    );
  });

  it("excludes T-X066 backup-omit from attribution wiring (Q37/S67 tip-moved-342)", () => {
    // Drift fence — T-X066 merged #342; current exclusive #343 Slot S (do not claim).
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X066",
    );
  });

  it("excludes exclusive T-X067 workflow-upgrade from attribution wiring (Q37/S68 tip-moved-342)", () => {
    // Fence only — exclusive elsewhere is #343 Slot S; do not claim.
    expect(DUPLICATE_PLATFORM_ATTRIBUTION_RELATED_CASE_IDS).not.toContain(
      "T-X067",
    );
  });
});
