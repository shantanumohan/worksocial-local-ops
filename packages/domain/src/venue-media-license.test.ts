import { describe, expect, it } from "vitest";
import {
  VENUE_MEDIA_LIVE_WIRING,
  VenueMediaLicenseStatus,
  evaluateVenueMediaPublishGate,
  gateVenueMediaBundleForPublish,
} from "./venue-media-license.js";

describe("evaluateVenueMediaPublishGate (T-X044)", () => {
  it("blocks unlicensed venue media publish", () => {
    const decision = evaluateVenueMediaPublishGate({
      mediaAssetId: "venue-lobby-01",
      licenseStatus: VenueMediaLicenseStatus.UNLICENSED,
      rightsCleared: false,
      ownerApproved: false,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe("UNLICENSED_MEDIA");
      expect(decision.publishBlocked).toBe(true);
      expect(decision.externalEffects).toBe("NONE");
      expect(decision.liveMediaWiring).toBe(VENUE_MEDIA_LIVE_WIRING);
      expect(decision.liveProviderSuccessClaimed).toBe(false);
      expect(decision.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
      expect(decision.reasons.some((r) => /ACCEPTED≠VERIFIED/.test(r))).toBe(
        true,
      );
    }
  });

  it("blocks unknown, expired, and pending-clearance licenses", () => {
    for (const [status, code] of [
      [VenueMediaLicenseStatus.UNKNOWN, "LICENSE_UNKNOWN"],
      [VenueMediaLicenseStatus.EXPIRED, "LICENSE_EXPIRED"],
      [VenueMediaLicenseStatus.PENDING_CLEARANCE, "PENDING_CLEARANCE"],
    ] as const) {
      const decision = evaluateVenueMediaPublishGate({
        mediaAssetId: "venue-photo",
        licenseStatus: status,
        rightsCleared: true,
        ownerApproved: true,
      });
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) {
        expect(decision.code).toBe(code);
        expect(decision.publishBlocked).toBe(true);
        expect(decision.liveMediaWiring).toBe("NOT_WIRED");
      }
    }
  });

  it("blocks licensed media without rights clearance or owner approval", () => {
    const noRights = evaluateVenueMediaPublishGate({
      mediaAssetId: "venue-photo",
      licenseStatus: VenueMediaLicenseStatus.LICENSED,
      rightsCleared: false,
      ownerApproved: true,
    });
    expect(noRights.allowed).toBe(false);
    if (!noRights.allowed) {
      expect(noRights.code).toBe("RIGHTS_NOT_CLEARED");
    }

    const noOwner = evaluateVenueMediaPublishGate({
      mediaAssetId: "venue-photo",
      licenseStatus: VenueMediaLicenseStatus.LICENSED,
      rightsCleared: true,
      ownerApproved: false,
    });
    expect(noOwner.allowed).toBe(false);
    if (!noOwner.allowed) {
      expect(noOwner.code).toBe("OWNER_NOT_APPROVED");
    }
  });

  it("blocks invented/stock media without approval", () => {
    const decision = evaluateVenueMediaPublishGate({
      mediaAssetId: "ai-lobby-render",
      licenseStatus: VenueMediaLicenseStatus.LICENSED,
      rightsCleared: true,
      ownerApproved: true,
      inventedOrStockWithoutApproval: true,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe("UNAPPROVED_INVENTED_MEDIA");
      expect(decision.publishBlocked).toBe(true);
    }
  });

  it("allows licensed + rights-cleared + owner-approved media at this gate", () => {
    const decision = evaluateVenueMediaPublishGate({
      mediaAssetId: "venue-lobby-approved",
      licenseStatus: VenueMediaLicenseStatus.LICENSED,
      rightsCleared: true,
      ownerApproved: true,
    });
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.publishBlocked).toBe(false);
      expect(decision.externalEffects).toBe("NONE");
      expect(decision.liveMediaWiring).toBe("NOT_WIRED");
      expect(decision.liveProviderSuccessClaimed).toBe(false);
      expect(decision.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    }
  });

  it("rejects empty mediaAssetId", () => {
    const decision = evaluateVenueMediaPublishGate({
      mediaAssetId: "  ",
      licenseStatus: VenueMediaLicenseStatus.LICENSED,
      rightsCleared: true,
      ownerApproved: true,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe("INVALID_MEDIA_ASSET");
    }
  });

  it("refuses claimLiveVerified and requestLivePublishWire", () => {
    const verified = evaluateVenueMediaPublishGate({
      mediaAssetId: "venue-lobby-approved",
      licenseStatus: VenueMediaLicenseStatus.LICENSED,
      rightsCleared: true,
      ownerApproved: true,
      claimLiveVerified: true,
    });
    expect(verified.allowed).toBe(false);
    if (!verified.allowed) {
      expect(verified.code).toBe("LIVE_MEDIA_CLAIM_REFUSED");
      expect(verified.publishBlocked).toBe(true);
      expect(verified.liveMediaWiring).toBe("NOT_WIRED");
      expect(verified.reasons.some((r) => /VERIFIED/.test(r))).toBe(true);
    }

    const wire = evaluateVenueMediaPublishGate({
      mediaAssetId: "venue-lobby-approved",
      licenseStatus: VenueMediaLicenseStatus.LICENSED,
      rightsCleared: true,
      ownerApproved: true,
      requestLivePublishWire: true,
    });
    expect(wire.allowed).toBe(false);
    if (!wire.allowed) {
      expect(wire.code).toBe("LIVE_MEDIA_CLAIM_REFUSED");
      expect(wire.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    }
  });

  it("bundle gate fails closed on first unlicensed asset", () => {
    const decision = gateVenueMediaBundleForPublish([
      {
        mediaAssetId: "ok",
        licenseStatus: VenueMediaLicenseStatus.LICENSED,
        rightsCleared: true,
        ownerApproved: true,
      },
      {
        mediaAssetId: "bad",
        licenseStatus: VenueMediaLicenseStatus.UNLICENSED,
        rightsCleared: false,
        ownerApproved: false,
      },
    ]);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe("UNLICENSED_MEDIA");
      expect(decision.liveMediaWiring).toBe("NOT_WIRED");
    }
  });

  it("bundle gate skips when no media attached", () => {
    const decision = gateVenueMediaBundleForPublish([]);
    expect(decision.allowed).toBe(true);
    expect("skipped" in decision && decision.skipped).toBe(true);
    expect(decision.liveMediaWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
  });

  it("bundle gate refuses live claims before inspecting assets", () => {
    const decision = gateVenueMediaBundleForPublish(
      [
        {
          mediaAssetId: "ok",
          licenseStatus: VenueMediaLicenseStatus.LICENSED,
          rightsCleared: true,
          ownerApproved: true,
        },
      ],
      { requestLivePublishWire: true },
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe("LIVE_MEDIA_CLAIM_REFUSED");
      expect(decision.liveMediaWiring).toBe("NOT_WIRED");
    }
  });
});
