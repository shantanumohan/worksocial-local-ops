/**
 * T-X044 — Unlicensed venue media: publish blocked.
 *
 * Venue media without an active license + rights clearance must not enter
 * a publish path. A14 `approved_media_only` is the creative-side companion;
 * this gate is the publish-side fail-closed check. Pure domain — no network
 * I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
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
};

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
        | "INVALID_MEDIA_ASSET";
      reason: string;
      publishBlocked: true;
      externalEffects: "NONE";
    }
  | {
      allowed: true;
      reason: string;
      publishBlocked: false;
      externalEffects: "NONE";
    };

/**
 * Evaluate whether venue media may enter a publish path.
 * Unlicensed / unknown / expired / uncleared media always blocks publish.
 */
export function evaluateVenueMediaPublishGate(
  input: VenueMediaPublishGateInput,
): VenueMediaPublishGateDecision {
  const mediaAssetId = String(input.mediaAssetId ?? "").trim();
  if (!mediaAssetId) {
    return {
      allowed: false,
      code: "INVALID_MEDIA_ASSET",
      reason: "mediaAssetId required for venue media publish gate",
      publishBlocked: true,
      externalEffects: "NONE",
    };
  }

  if (input.inventedOrStockWithoutApproval === true) {
    return {
      allowed: false,
      code: "UNAPPROVED_INVENTED_MEDIA",
      reason:
        "Invented or stock venue media without owner approval — publish blocked",
      publishBlocked: true,
      externalEffects: "NONE",
    };
  }

  switch (input.licenseStatus) {
    case VenueMediaLicenseStatus.UNLICENSED:
      return {
        allowed: false,
        code: "UNLICENSED_MEDIA",
        reason: `Venue media ${mediaAssetId} is unlicensed — publish blocked`,
        publishBlocked: true,
        externalEffects: "NONE",
      };
    case VenueMediaLicenseStatus.UNKNOWN:
      return {
        allowed: false,
        code: "LICENSE_UNKNOWN",
        reason: `Venue media ${mediaAssetId} has unknown license — publish blocked`,
        publishBlocked: true,
        externalEffects: "NONE",
      };
    case VenueMediaLicenseStatus.EXPIRED:
      return {
        allowed: false,
        code: "LICENSE_EXPIRED",
        reason: `Venue media ${mediaAssetId} license expired — publish blocked`,
        publishBlocked: true,
        externalEffects: "NONE",
      };
    case VenueMediaLicenseStatus.PENDING_CLEARANCE:
      return {
        allowed: false,
        code: "PENDING_CLEARANCE",
        reason: `Venue media ${mediaAssetId} pending rights clearance — publish blocked`,
        publishBlocked: true,
        externalEffects: "NONE",
      };
    case VenueMediaLicenseStatus.LICENSED:
      break;
    default:
      return {
        allowed: false,
        code: "LICENSE_UNKNOWN",
        reason: `Venue media ${mediaAssetId} has unrecognized license status — publish blocked`,
        publishBlocked: true,
        externalEffects: "NONE",
      };
  }

  if (!input.rightsCleared) {
    return {
      allowed: false,
      code: "RIGHTS_NOT_CLEARED",
      reason: `Venue media ${mediaAssetId} licensed but rights not cleared — publish blocked`,
      publishBlocked: true,
      externalEffects: "NONE",
    };
  }

  if (!input.ownerApproved) {
    return {
      allowed: false,
      code: "OWNER_NOT_APPROVED",
      reason: `Venue media ${mediaAssetId} lacks owner approval — publish blocked`,
      publishBlocked: true,
      externalEffects: "NONE",
    };
  }

  return {
    allowed: true,
    reason: `Venue media ${mediaAssetId} licensed, rights cleared, owner approved — publish gate open`,
    publishBlocked: false,
    externalEffects: "NONE",
  };
}

/**
 * Fail-closed bundle check for a publish attempt that cites venue media.
 * Empty/undefined media lists are treated as no media gate input (caller decides
 * whether that is allowed). When media is present, every asset must pass.
 */
export function gateVenueMediaBundleForPublish(
  media: readonly VenueMediaPublishGateInput[] | undefined | null,
): VenueMediaPublishGateDecision | { allowed: true; skipped: true; reason: string; publishBlocked: false; externalEffects: "NONE" } {
  if (!media || media.length === 0) {
    return {
      allowed: true,
      skipped: true,
      reason: "No venue media attached to publish attempt — media gate skipped",
      publishBlocked: false,
      externalEffects: "NONE",
    };
  }
  for (const asset of media) {
    const decision = evaluateVenueMediaPublishGate(asset);
    if (!decision.allowed) {
      return decision;
    }
  }
  return {
    allowed: true,
    reason: `All ${media.length} venue media asset(s) licensed and cleared — publish gate open`,
    publishBlocked: false,
    externalEffects: "NONE",
  };
}
