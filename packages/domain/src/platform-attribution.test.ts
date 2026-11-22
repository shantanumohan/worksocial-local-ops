import { describe, expect, it } from "vitest";
import {
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
    expect(projection.claimsByPlatform).toEqual({
      google_ads: 1,
      meta_ads: 1,
    });
    expect(projection.wouldDoubleCountIfSummed).toBe(true);

    const decision = refuseSilentPlatformSum(projection);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("SILENT_PLATFORM_SUM_REFUSED");
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
    expect(projection.wouldDoubleCountIfSummed).toBe(false);
    expect(refuseSilentPlatformSum(projection).allowed).toBe(true);
  });
});
