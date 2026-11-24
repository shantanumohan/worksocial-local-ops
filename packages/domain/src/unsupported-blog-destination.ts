/**
 * T-X046 — Unsupported blog destination: no fake publication.
 *
 * OTHER_BLOG / Hub without a tested adapter must refuse publish and never
 * invent PUBLISHED_VERIFIED. Distinct from T-US-022 (capability matrix) and
 * T-X045 (partial campaign destinations). External effects: NONE.
 * Live wiring stays NOT_WIRED. ChatGPT Ads ACCESS_BLOCKED.
 * Hillclimb: honesty fields on every classification; fixtureAvailable=false
 * and Hub full-blog stay unsupported; owned CMS remains the positive control.
 */

import {
  AdapterLiveStatus,
  ContentFormat,
  DestinationKind,
  PublicationOutcome,
  type ContentFormatValue,
  type DestinationKindValue,
  type DestinationRegistryEntry,
} from "./content.js";

export type UnsupportedBlogDestinationCode =
  | "OWNED_CMS_ALLOWED"
  | "OTHER_BLOG_NO_ADAPTER_UNSUPPORTED"
  | "HUB_FULL_BLOG_UNSUPPORTED"
  | "LIVE_WIRE_CLAIM_REFUSED";

export type UnsupportedBlogDestinationDecision = {
  code: UnsupportedBlogDestinationCode;
  allowed: boolean;
  outcome: typeof PublicationOutcome.UNSUPPORTED_ACTION | null;
  inventPublishedVerified: false;
  liveProviderWiring: "NOT_WIRED";
  chatgptAdsAccess: "ACCESS_BLOCKED";
  externalEffects: "NONE";
  reasons: string[];
};

const HONESTY = {
  inventPublishedVerified: false as const,
  liveProviderWiring: "NOT_WIRED" as const,
  chatgptAdsAccess: "ACCESS_BLOCKED" as const,
  externalEffects: "NONE" as const,
};

/**
 * Classify whether a destination may honestly publish a blog-shaped payload
 * in fixture mode. Never invents PUBLISHED_VERIFIED for unsupported blogs.
 */
export function classifyUnsupportedBlogDestination(input: {
  destination: DestinationRegistryEntry;
  format: ContentFormatValue;
  /** Prefer-live claim — always refused while adapters are NOT_WIRED. */
  preferLive?: boolean;
}): UnsupportedBlogDestinationDecision {
  const dest = input.destination;
  const honestyReasons = [
    "liveProviderWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE",
    "inventPublishedVerified=false",
  ];

  if (
    input.preferLive === true ||
    dest.liveWiring !== AdapterLiveStatus.NOT_WIRED
  ) {
    // Fixture path never elevates live wiring; refuse live publish claims.
    return {
      code: "LIVE_WIRE_CLAIM_REFUSED",
      allowed: false,
      outcome: PublicationOutcome.UNSUPPORTED_ACTION,
      reasons: [
        "Live publish claim refused — adapters remain NOT_WIRED; never invent PUBLISHED_VERIFIED",
        ...honestyReasons,
      ],
      ...HONESTY,
    };
  }

  if (
    dest.kind === DestinationKind.CMS &&
    dest.fixtureAvailable === true &&
    dest.allowedFormats.includes(input.format)
  ) {
    return {
      code: "OWNED_CMS_ALLOWED",
      allowed: true,
      outcome: null,
      reasons: [
        "Owned CMS with fixture adapter may draft/release — not an unsupported blog",
        ...honestyReasons,
      ],
      ...HONESTY,
    };
  }

  if (
    dest.kind === DestinationKind.CHATGPT_HUB &&
    input.format === ContentFormat.FULL_ARTICLE
  ) {
    return {
      code: "HUB_FULL_BLOG_UNSUPPORTED",
      allowed: false,
      outcome: PublicationOutcome.UNSUPPORTED_ACTION,
      reasons: [
        "ChatGPT Hub has no invented blog-post API — FULL_ARTICLE unsupported",
        ...honestyReasons,
      ],
      ...HONESTY,
    };
  }

  if (
    dest.kind === DestinationKind.OTHER_BLOG ||
    dest.fixtureAvailable === false
  ) {
    return {
      code: "OTHER_BLOG_NO_ADAPTER_UNSUPPORTED",
      allowed: false,
      outcome: PublicationOutcome.UNSUPPORTED_ACTION,
      reasons: [
        `Destination ${dest.destinationId} (${dest.kind}) has no tested publish/read-back adapter — UNSUPPORTED_ACTION`,
        "Never invent PUBLISHED_VERIFIED for unsupported blog destination",
        ...honestyReasons,
      ],
      ...HONESTY,
    };
  }

  return {
    code: "OTHER_BLOG_NO_ADAPTER_UNSUPPORTED",
    allowed: false,
    outcome: PublicationOutcome.UNSUPPORTED_ACTION,
    reasons: [
      `Destination ${dest.destinationId} not an owned fixture CMS — refuse fake publication`,
      ...honestyReasons,
    ],
    ...HONESTY,
  };
}

export function isBlogShapedKind(kind: DestinationKindValue): boolean {
  return (
    kind === DestinationKind.CMS ||
    kind === DestinationKind.OTHER_BLOG ||
    kind === DestinationKind.CHATGPT_HUB
  );
}

export const UNSUPPORTED_BLOG_DESTINATION_RELATED_CASE_IDS = [
  "T-X046",
] as const;
