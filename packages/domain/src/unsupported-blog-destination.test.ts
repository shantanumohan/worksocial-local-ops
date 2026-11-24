import { describe, expect, it } from "vitest";
import {
  AdapterLiveStatus,
  ContentFormat,
  DestinationKind,
  PublicationOutcome,
} from "./content.js";
import {
  classifyUnsupportedBlogDestination,
  classifyUnsupportedBlogScheduledPublish,
  isBlogShapedKind,
} from "./unsupported-blog-destination.js";

function dest(partial: {
  destinationId: string;
  kind: (typeof DestinationKind)[keyof typeof DestinationKind];
  fixtureAvailable: boolean;
  allowedFormats?: (typeof ContentFormat)[keyof typeof ContentFormat][];
  liveWiring?: (typeof AdapterLiveStatus)[keyof typeof AdapterLiveStatus];
}) {
  return {
    destinationId: partial.destinationId,
    kind: partial.kind,
    displayName: partial.destinationId,
    channelId: "ch",
    allowedFormats: partial.allowedFormats ?? [ContentFormat.FULL_ARTICLE],
    maxBodyChars: null,
    requiresCanonicalUrl: false,
    liveWiring: partial.liveWiring ?? AdapterLiveStatus.NOT_WIRED,
    fixtureAvailable: partial.fixtureAvailable,
    locationRelevant: false,
    notes: "fixture",
  };
}

function expectHonesty(
  d: ReturnType<typeof classifyUnsupportedBlogDestination>,
  liveWiring: (typeof AdapterLiveStatus)[keyof typeof AdapterLiveStatus] = AdapterLiveStatus.NOT_WIRED,
) {
  expect(d.liveProviderWiring).toBe(liveWiring);
  expect(d.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
  expect(d.externalEffects).toBe("NONE");
  expect(d.inventPublishedVerified).toBe(false);
}

describe("unsupported blog destination (T-X046)", () => {
  it("allows owned CMS with fixture adapter", () => {
    const decision = classifyUnsupportedBlogDestination({
      destination: dest({
        destinationId: "dest-cms",
        kind: DestinationKind.CMS,
        fixtureAvailable: true,
      }),
      format: ContentFormat.FULL_ARTICLE,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe("OWNED_CMS_ALLOWED");
    expect(decision.outcome).toBeNull();
    expectHonesty(decision);
  });

  it("allows fixture-wired CMS without treating FIXTURE as a live claim", () => {
    const decision = classifyUnsupportedBlogDestination({
      destination: dest({
        destinationId: "dest-cms",
        kind: DestinationKind.CMS,
        fixtureAvailable: true,
        liveWiring: AdapterLiveStatus.FIXTURE,
      }),
      format: ContentFormat.FULL_ARTICLE,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe("OWNED_CMS_ALLOWED");
    expectHonesty(decision, AdapterLiveStatus.FIXTURE);
  });

  it("allows OTHER_BLOG when fixture adapter + format are available", () => {
    const decision = classifyUnsupportedBlogDestination({
      destination: dest({
        destinationId: "dest-other-blog-fixture",
        kind: DestinationKind.OTHER_BLOG,
        fixtureAvailable: true,
        liveWiring: AdapterLiveStatus.FIXTURE,
      }),
      format: ContentFormat.FULL_ARTICLE,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe("OTHER_BLOG_FIXTURE_ALLOWED");
    expect(decision.outcome).toBeNull();
    expectHonesty(decision, AdapterLiveStatus.FIXTURE);
  });

  it("refuses OTHER_BLOG without adapter — never invents PUBLISHED_VERIFIED", () => {
    const decision = classifyUnsupportedBlogDestination({
      destination: dest({
        destinationId: "dest-other-blog-unsupported",
        kind: DestinationKind.OTHER_BLOG,
        fixtureAvailable: false,
      }),
      format: ContentFormat.FULL_ARTICLE,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("OTHER_BLOG_NO_ADAPTER_UNSUPPORTED");
    expect(decision.outcome).toBe(PublicationOutcome.UNSUPPORTED_ACTION);
    expectHonesty(decision);
  });

  it("refuses ChatGPT Hub FULL_ARTICLE (no invented blog-post API)", () => {
    const decision = classifyUnsupportedBlogDestination({
      destination: dest({
        destinationId: "dest-chatgpt-hub",
        kind: DestinationKind.CHATGPT_HUB,
        fixtureAvailable: false,
        allowedFormats: [ContentFormat.PROFILE_FACT],
      }),
      format: ContentFormat.FULL_ARTICLE,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("HUB_FULL_BLOG_UNSUPPORTED");
    expect(decision.outcome).toBe(PublicationOutcome.UNSUPPORTED_ACTION);
    expectHonesty(decision);
  });

  it("refuses preferLive claims only (FIXTURE wiring alone is not a live claim)", () => {
    const decision = classifyUnsupportedBlogDestination({
      destination: dest({
        destinationId: "dest-cms",
        kind: DestinationKind.CMS,
        fixtureAvailable: true,
        liveWiring: AdapterLiveStatus.FIXTURE,
      }),
      format: ContentFormat.FULL_ARTICLE,
      preferLive: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("LIVE_WIRE_CLAIM_REFUSED");
    expect(decision.outcome).toBe(PublicationOutcome.UNSUPPORTED_ACTION);
    expectHonesty(decision, AdapterLiveStatus.FIXTURE);
  });

  it("marks CMS/OTHER_BLOG/Hub as blog-shaped kinds", () => {
    expect(isBlogShapedKind(DestinationKind.CMS)).toBe(true);
    expect(isBlogShapedKind(DestinationKind.OTHER_BLOG)).toBe(true);
    expect(isBlogShapedKind(DestinationKind.CHATGPT_HUB)).toBe(true);
    expect(isBlogShapedKind(DestinationKind.GBP)).toBe(false);
  });

  it("refuses OTHER_BLOG scheduled publish in America/New_York spring gap (G11)", () => {
    const decision = classifyUnsupportedBlogScheduledPublish({
      destination: dest({
        destinationId: "dest-other-blog-unsupported",
        kind: DestinationKind.OTHER_BLOG,
        fixtureAvailable: false,
      }),
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-03-09",
      hour: 2,
      minute: 30,
    });
    expect(decision.scheduleOk).toBe(false);
    expect(decision.scheduleCode).toBe("NONEXISTENT_LOCAL_TIME");
    expect(decision.fireAtIso).toBeNull();
    expect(decision.allowed).toBe(false);
    expect(decision.inventPublishedVerified).toBe(false);
    expect(decision.publish.code).toBe("OTHER_BLOG_NO_ADAPTER_UNSUPPORTED");
    expect(decision.publish.outcome).toBe(PublicationOutcome.UNSUPPORTED_ACTION);
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
  });

  it("resolves fall-back once but still refuses unsupported OTHER_BLOG (G11)", () => {
    const decision = classifyUnsupportedBlogScheduledPublish({
      destination: dest({
        destinationId: "dest-other-blog-unsupported",
        kind: DestinationKind.OTHER_BLOG,
        fixtureAvailable: false,
      }),
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-11-02",
      hour: 1,
      minute: 30,
    });
    expect(decision.scheduleOk).toBe(true);
    expect(decision.scheduleCode).toBe("SCHEDULE_RESOLVED");
    expect(decision.ambiguous).toBe(true);
    expect(decision.fireAtIso).not.toBeNull();
    expect(decision.allowed).toBe(false);
    expect(decision.publish.code).toBe("OTHER_BLOG_NO_ADAPTER_UNSUPPORTED");
    expect(decision.inventPublishedVerified).toBe(false);
  });
});
