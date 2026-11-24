/**
 * T-X044 — Unlicensed venue media: publish blocked.
 *
 * Venue media without an active license + rights clearance must not enter
 * a publish path. A14 `approved_media_only` is the creative-side companion;
 * this gate is the publish-side fail-closed check. Pure domain — no network
 * I/O. Live media publish stays NOT_WIRED. ChatGPT Ads ACCESS_BLOCKED.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 */

/** Declared license / rights state for a venue media asset. */
export const VenueMediaLicenseStatus = {
  LICENSED: "licensed",
  UNLICENSED: "unlicensed",
  UNKNOWN: "unknown",
  EXPIRED: "expired",
  PENDING_CLEARANCE: "pending_clearance",
} as const;

export type VenueMediaLicenseStatusValue =
  (typeof VenueMediaLicenseStatus)[keyof typeof VenueMediaLicenseStatus];

/** Live venue-media publish wiring — always NOT_WIRED for fixture proofs. */
export const VENUE_MEDIA_LIVE_WIRING = "NOT_WIRED" as const;

export type VenueMediaLiveWiring = typeof VENUE_MEDIA_LIVE_WIRING;

export type VenueMediaPublishGateInput = {
  mediaAssetId: string;
  licenseStatus: VenueMediaLicenseStatusValue;
  /** Explicit rights clearance recorded (owner / legal). */
  rightsCleared: boolean;
  /** Owner approved this asset for publish/layout use. */
  ownerApproved: boolean;
  /**
   * Invented / generative / stock asset used without owner approval.
   * A14 forbids inventing venue photographs.
   */
  inventedOrStockWithoutApproval?: boolean;
  /** Forbidden — fixture proofs never claim live VERIFIED. */
  claimLiveVerified?: boolean;
  /** Forbidden — live media publish stays NOT_WIRED. */
  requestLivePublishWire?: boolean;
};

type VenueMediaHonesty = {
  externalEffects: "NONE";
  liveMediaWiring: VenueMediaLiveWiring;
  liveProviderSuccessClaimed: false;
  chatgptAdsAccess: "ACCESS_BLOCKED";
};

function honesty(): VenueMediaHonesty {
  return {
    externalEffects: "NONE",
    liveMediaWiring: VENUE_MEDIA_LIVE_WIRING,
    liveProviderSuccessClaimed: false,
    chatgptAdsAccess: "ACCESS_BLOCKED",
  };
}

export type VenueMediaPublishGateDecision =
  | {
      allowed: false;
      code:
        | "UNLICENSED_MEDIA"
        | "LICENSE_UNKNOWN"
        | "LICENSE_EXPIRED"
        | "PENDING_CLEARANCE"
        | "RIGHTS_NOT_CLEARED"
        | "OWNER_NOT_APPROVED"
        | "UNAPPROVED_INVENTED_MEDIA"
        | "INVALID_MEDIA_ASSET"
        | "LIVE_MEDIA_CLAIM_REFUSED";
      reason: string;
      publishBlocked: true;
      reasons: string[];
    } & VenueMediaHonesty
  | {
      allowed: true;
      reason: string;
      publishBlocked: false;
      reasons: string[];
    } & VenueMediaHonesty;

function blocked(
  code: Extract<VenueMediaPublishGateDecision, { allowed: false }>["code"],
  reason: string,
  extraReasons: string[] = [],
): VenueMediaPublishGateDecision {
  return {
    allowed: false,
    code,
    reason,
    publishBlocked: true,
    reasons: [
      reason,
      ...extraReasons,
      "liveMediaWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED",
      "ACCEPTED≠VERIFIED",
    ],
    ...honesty(),
  };
}

/**
 * Evaluate whether venue media may enter a publish path.
 * Unlicensed / unknown / expired / uncleared media always blocks publish.
 * Live-verified / live-publish-wire claims are refused (NOT_WIRED).
 */
export function evaluateVenueMediaPublishGate(
  input: VenueMediaPublishGateInput,
): VenueMediaPublishGateDecision {
  if (input.claimLiveVerified === true) {
    return blocked(
      "LIVE_MEDIA_CLAIM_REFUSED",
      "Live VERIFIED venue-media publish claims are forbidden — fixture ACCEPTED only (T-X044)",
    );
  }
  if (input.requestLivePublishWire === true) {
    return blocked(
      "LIVE_MEDIA_CLAIM_REFUSED",
      "Live venue-media publish remains NOT_WIRED — refuse live publish wiring (T-X044)",
    );
  }

  const mediaAssetId = String(input.mediaAssetId ?? "").trim();
  if (!mediaAssetId) {
    return blocked(
      "INVALID_MEDIA_ASSET",
      "mediaAssetId required for venue media publish gate",
    );
  }

  if (input.inventedOrStockWithoutApproval === true) {
    return blocked(
      "UNAPPROVED_INVENTED_MEDIA",
      "Invented or stock venue media without owner approval — publish blocked",
    );
  }

  switch (input.licenseStatus) {
    case VenueMediaLicenseStatus.UNLICENSED:
      return blocked(
        "UNLICENSED_MEDIA",
        `Venue media ${mediaAssetId} is unlicensed — publish blocked`,
      );
    case VenueMediaLicenseStatus.UNKNOWN:
      return blocked(
        "LICENSE_UNKNOWN",
        `Venue media ${mediaAssetId} has unknown license — publish blocked`,
      );
    case VenueMediaLicenseStatus.EXPIRED:
      return blocked(
        "LICENSE_EXPIRED",
        `Venue media ${mediaAssetId} license expired — publish blocked`,
      );
    case VenueMediaLicenseStatus.PENDING_CLEARANCE:
      return blocked(
        "PENDING_CLEARANCE",
        `Venue media ${mediaAssetId} pending rights clearance — publish blocked`,
      );
    case VenueMediaLicenseStatus.LICENSED:
      break;
    default:
      return blocked(
        "LICENSE_UNKNOWN",
        `Venue media ${mediaAssetId} has unrecognized license status — publish blocked`,
      );
  }

  if (!input.rightsCleared) {
    return blocked(
      "RIGHTS_NOT_CLEARED",
      `Venue media ${mediaAssetId} licensed but rights not cleared — publish blocked`,
    );
  }

  if (!input.ownerApproved) {
    return blocked(
      "OWNER_NOT_APPROVED",
      `Venue media ${mediaAssetId} lacks owner approval — publish blocked`,
    );
  }

  const reason = `Venue media ${mediaAssetId} licensed, rights cleared, owner approved — publish gate open`;
  return {
    allowed: true,
    reason,
    publishBlocked: false,
    reasons: [
      reason,
      "liveMediaWiring=NOT_WIRED",
      "ACCEPTED≠VERIFIED",
    ],
    ...honesty(),
  };
}

export type VenueMediaBundleGateDecision =
  | VenueMediaPublishGateDecision
  | ({
      allowed: true;
      skipped: true;
      reason: string;
      publishBlocked: false;
      reasons: string[];
    } & VenueMediaHonesty);

/**
 * Fail-closed bundle check for a publish attempt that cites venue media.
 * Empty/undefined media lists are treated as no media gate input (caller decides
 * whether that is allowed). When media is present, every asset must pass.
 * Bundle-level live claims are refused before inspecting assets.
 */
export function gateVenueMediaBundleForPublish(
  media: readonly VenueMediaPublishGateInput[] | undefined | null,
  opts?: {
    claimLiveVerified?: boolean;
    requestLivePublishWire?: boolean;
  },
): VenueMediaBundleGateDecision {
  if (opts?.claimLiveVerified === true) {
    return blocked(
      "LIVE_MEDIA_CLAIM_REFUSED",
      "Live VERIFIED venue-media bundle claims are forbidden — fixture ACCEPTED only (T-X044)",
    );
  }
  if (opts?.requestLivePublishWire === true) {
    return blocked(
      "LIVE_MEDIA_CLAIM_REFUSED",
      "Live venue-media publish remains NOT_WIRED — refuse live publish wiring (T-X044)",
    );
  }

  if (!media || media.length === 0) {
    const reason =
      "No venue media attached to publish attempt — media gate skipped";
    return {
      allowed: true,
      skipped: true,
      reason,
      publishBlocked: false,
      reasons: [reason, "liveMediaWiring=NOT_WIRED", "ACCEPTED≠VERIFIED"],
      ...honesty(),
    };
  }
  for (const asset of media) {
    const decision = evaluateVenueMediaPublishGate(asset);
    if (!decision.allowed) {
      return decision;
    }
  }
  const reason = `All ${media.length} venue media asset(s) licensed and cleared — publish gate open`;
  return {
    allowed: true,
    reason,
    publishBlocked: false,
    reasons: [reason, "liveMediaWiring=NOT_WIRED", "ACCEPTED≠VERIFIED"],
    ...honesty(),
  };
}
