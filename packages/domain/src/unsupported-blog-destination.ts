/**
 * T-X046 — Unsupported blog destination: no fake publication.
 *
 * OTHER_BLOG / Hub without a tested adapter must refuse publish and never
 * invent PUBLISHED_VERIFIED. Fixture-backed destinations (CMS or OTHER_BLOG
 * with fixtureAvailable + allowed format) may classify as allowed in fixture
 * mode. `AdapterLiveStatus.FIXTURE` is not a live publish claim — only
 * preferLive triggers LIVE_WIRE_CLAIM_REFUSED. Distinct from T-US-022 /
 * T-X045. External effects: NONE. ChatGPT Ads ACCESS_BLOCKED.
 * Hillclimb: honesty fields on every classification; Hub full-blog stays
 * unsupported; owned CMS / fixture OTHER_BLOG remain positive controls;
 * DST civil schedule gaps still refuse fake publication (G11).
 */

import {
  ContentFormat,
  DestinationKind,
  PublicationOutcome,
  type AdapterLiveStatusValue,
  type ContentFormatValue,
  type DestinationKindValue,
  type DestinationRegistryEntry,
} from "./content.js";
import {
  LocalCivilResolveCode,
  resolveLocalDateTime,
  type LocalCivilResolveResult,
} from "./recurring-schedule.js";

export type UnsupportedBlogDestinationCode =
  | "OWNED_CMS_ALLOWED"
  | "OTHER_BLOG_FIXTURE_ALLOWED"
  | "OTHER_BLOG_NO_ADAPTER_UNSUPPORTED"
  | "HUB_FULL_BLOG_UNSUPPORTED"
  | "LIVE_WIRE_CLAIM_REFUSED";

export type UnsupportedBlogDestinationDecision = {
  code: UnsupportedBlogDestinationCode;
  allowed: boolean;
  outcome: typeof PublicationOutcome.UNSUPPORTED_ACTION | null;
  inventPublishedVerified: false;
  /** Mirrors destination.liveWiring — FIXTURE is not a live success claim. */
  liveProviderWiring: AdapterLiveStatusValue;
  chatgptAdsAccess: "ACCESS_BLOCKED";
  externalEffects: "NONE";
  reasons: string[];
};

function honestyFields(liveWiring: AdapterLiveStatusValue) {
  return {
    inventPublishedVerified: false as const,
    liveProviderWiring: liveWiring,
    chatgptAdsAccess: "ACCESS_BLOCKED" as const,
    externalEffects: "NONE" as const,
  };
}

/**
 * Classify whether a destination may honestly publish a blog-shaped payload
 * in fixture mode. Never invents PUBLISHED_VERIFIED for unsupported blogs.
 */
export function classifyUnsupportedBlogDestination(input: {
  destination: DestinationRegistryEntry;
  format: ContentFormatValue;
  /** Prefer-live claim — refused; FIXTURE wiring alone is not a live claim. */
  preferLive?: boolean;
}): UnsupportedBlogDestinationDecision {
  const dest = input.destination;
  const honesty = honestyFields(dest.liveWiring);
  const honestyReasons = [
    `liveProviderWiring=${dest.liveWiring} chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE`,
    "inventPublishedVerified=false",
  ];

  // Only an explicit preferLive request is a live publish claim.
  // AdapterLiveStatus.FIXTURE is a supported fixture-path status, not live.
  if (input.preferLive === true) {
    return {
      code: "LIVE_WIRE_CLAIM_REFUSED",
      allowed: false,
      outcome: PublicationOutcome.UNSUPPORTED_ACTION,
      reasons: [
        "Live publish claim refused (preferLive) — never invent PUBLISHED_VERIFIED; live adapters stay NOT_WIRED until credentials exist",
        ...honestyReasons,
      ],
      ...honesty,
    };
  }

  const formatAllowed = dest.allowedFormats.includes(input.format);

  if (
    dest.kind === DestinationKind.CMS &&
    dest.fixtureAvailable === true &&
    formatAllowed
  ) {
    return {
      code: "OWNED_CMS_ALLOWED",
      allowed: true,
      outcome: null,
      reasons: [
        "Owned CMS with fixture adapter may draft/release — not an unsupported blog",
        ...honestyReasons,
      ],
      ...honesty,
    };
  }

  if (
    dest.kind === DestinationKind.OTHER_BLOG &&
    dest.fixtureAvailable === true &&
    formatAllowed
  ) {
    return {
      code: "OTHER_BLOG_FIXTURE_ALLOWED",
      allowed: true,
      outcome: null,
      reasons: [
        "OTHER_BLOG with tested fixture adapter + allowed format may classify in fixture mode — not a fake live publication",
        ...honestyReasons,
      ],
      ...honesty,
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
      ...honesty,
    };
  }

  if (dest.fixtureAvailable === false || !formatAllowed) {
    return {
      code: "OTHER_BLOG_NO_ADAPTER_UNSUPPORTED",
      allowed: false,
      outcome: PublicationOutcome.UNSUPPORTED_ACTION,
      reasons: [
        `Destination ${dest.destinationId} (${dest.kind}) has no tested publish/read-back adapter for format ${input.format} — UNSUPPORTED_ACTION`,
        "Never invent PUBLISHED_VERIFIED for unsupported blog destination",
        ...honestyReasons,
      ],
      ...honesty,
    };
  }

  return {
    code: "OTHER_BLOG_NO_ADAPTER_UNSUPPORTED",
    allowed: false,
    outcome: PublicationOutcome.UNSUPPORTED_ACTION,
    reasons: [
      `Destination ${dest.destinationId} not an owned/fixture blog path — refuse fake publication`,
      ...honestyReasons,
    ],
    ...honesty,
  };
}

export function isBlogShapedKind(kind: DestinationKindValue): boolean {
  return (
    kind === DestinationKind.CMS ||
    kind === DestinationKind.OTHER_BLOG ||
    kind === DestinationKind.CHATGPT_HUB
  );
}

export type UnsupportedBlogScheduleCode =
  | "SCHEDULE_RESOLVED"
  | "NONEXISTENT_LOCAL_TIME"
  | "INVALID_SCHEDULE_INPUT";

export type UnsupportedBlogScheduledPublishDecision = {
  scheduleOk: boolean;
  scheduleCode: UnsupportedBlogScheduleCode;
  /** Canonical fire instant when schedule resolved; null on gap/invalid. */
  fireAtIso: string | null;
  /** Ambiguous fall-back hour when schedule resolved. */
  ambiguous: boolean;
  publish: UnsupportedBlogDestinationDecision;
  /** Combined gate: schedule must resolve AND publish allowed. */
  allowed: boolean;
  inventPublishedVerified: false;
  liveProviderWiring: AdapterLiveStatusValue;
  chatgptAdsAccess: "ACCESS_BLOCKED";
  externalEffects: "NONE";
  reasons: string[];
};

/**
 * Schedule a blog-shaped publish against civil local time (DST-aware).
 * Spring-forward gaps refuse the schedule; fall-back ambiguous hours resolve
 * once. Unsupported destinations still never invent PUBLISHED_VERIFIED even
 * when the civil schedule resolves (T-X046 ∩ DST schedule edge).
 */
export function classifyUnsupportedBlogScheduledPublish(input: {
  destination: DestinationRegistryEntry;
  format: ContentFormatValue;
  timeZone: string;
  localDate: string;
  hour: number;
  minute: number;
  preferLive?: boolean;
}): UnsupportedBlogScheduledPublishDecision {
  const publish = classifyUnsupportedBlogDestination({
    destination: input.destination,
    format: input.format,
    ...(input.preferLive === undefined ? {} : { preferLive: input.preferLive }),
  });
  const resolved: LocalCivilResolveResult = resolveLocalDateTime({
    timeZone: input.timeZone,
    localDate: input.localDate,
    hour: input.hour,
    minute: input.minute,
  });

  if (!resolved.ok) {
    const scheduleCode: UnsupportedBlogScheduleCode =
      resolved.code === LocalCivilResolveCode.NONEXISTENT_LOCAL_TIME
        ? "NONEXISTENT_LOCAL_TIME"
        : "INVALID_SCHEDULE_INPUT";
    return {
      scheduleOk: false,
      scheduleCode,
      fireAtIso: null,
      ambiguous: false,
      publish,
      allowed: false,
      inventPublishedVerified: false,
      liveProviderWiring: publish.liveProviderWiring,
      chatgptAdsAccess: "ACCESS_BLOCKED",
      externalEffects: "NONE",
      reasons: [
        `Civil schedule refused (${scheduleCode}) in ${input.timeZone} ${input.localDate} ${String(input.hour).padStart(2, "0")}:${String(input.minute).padStart(2, "0")}`,
        "Never invent PUBLISHED_VERIFIED for unsupported blog — DST gap does not unlock publish",
        ...publish.reasons,
      ],
    };
  }

  return {
    scheduleOk: true,
    scheduleCode: "SCHEDULE_RESOLVED",
    fireAtIso: resolved.fireAtIso,
    ambiguous: resolved.ambiguous,
    publish,
    allowed: publish.allowed,
    inventPublishedVerified: false,
    liveProviderWiring: publish.liveProviderWiring,
    chatgptAdsAccess: "ACCESS_BLOCKED",
    externalEffects: "NONE",
    reasons: [
      resolved.ambiguous
        ? `Civil schedule resolved once on fall-back ambiguous hour → ${resolved.fireAtIso}`
        : `Civil schedule resolved → ${resolved.fireAtIso}`,
      publish.allowed
        ? "Publish path allowed in fixture mode after schedule resolve"
        : "Schedule resolved but publish still refused — never invent PUBLISHED_VERIFIED",
      ...publish.reasons,
    ],
  };
}

export const UNSUPPORTED_BLOG_DESTINATION_RELATED_CASE_IDS = [
  "T-X046",
] as const;
