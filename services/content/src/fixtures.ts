/**
 * Fixture golden campaign + destination adapters for R1-08.
 * Offline only — no live CMS / GBP / social mutations.
 */

import {
  AdapterWiring,
  ArticleStatus,
  BindingKind,
  CampaignStatus,
  ConnectionState,
  ContentFormat,
  DEFAULT_PILOT_EVIDENCE_KINDS,
  DestinationKind,
  SupportLabel,
  VariantStatus,
  VerificationState,
  WriteReadiness,
  createCanonicalArticle,
  createContentBrief,
  createContentCampaign,
  createDestinationVariant,
  defaultDestinationRegistry,
  proveFixturePilotWritePath,
  type CanonicalArticle,
  type ContentCampaign,
  type DestinationRegistryEntry,
  type DestinationVariant,
  type ProductionMappingState,
  type SourceBinding,
  type PilotWritePath,
} from "@worksocial/domain";

export const CONTENT_PILOT_ARTICLE_ASSET_ID = "article-training-brief" as const;
export const CONTENT_PILOT_CMS_WRITE_PATH_ID = "wp-content-cms-publish" as const;
export const CONTENT_PILOT_GBP_WRITE_PATH_ID = "wp-content-gbp-publish" as const;
export const CONTENT_PILOT_LINKEDIN_WRITE_PATH_ID =
  "wp-content-linkedin-publish" as const;
export const CONTENT_PILOT_BINDING_ID = "bind-content-cms" as const;
export const CONTENT_PILOT_CAMPAIGN_ID = "golden-camp-training" as const;
export const CONTENT_PILOT_ARTICLE_ID = "golden-art-training" as const;

export const CONTENT_GOLDEN_ARTICLE_BODY =
  "A successful training day starts before the first attendee arrives. Start with the learning outcome, then choose a room layout that supports it. Confirm the display, audio, and connectivity you will actually use. Share verified directions and arrival instructions. Confirm current rates and availability directly before committing." as const;

/** Destination adapters: fixture publish vs honest NOT_WIRED live stubs. */
export type DestinationAdapterResult =
  | {
      wiring: "FIXTURE";
      accepted: true;
      remoteId: string;
      summary: string;
    }
  | {
      wiring: "NOT_WIRED";
      accepted: false;
      remoteId: null;
      summary: string;
      code: "NOT_WIRED";
    };

export function fixtureCmsPublish(input: {
  articleId: string;
  title: string;
}): DestinationAdapterResult {
  return {
    wiring: "FIXTURE",
    accepted: true,
    remoteId: `https://fixture.worksocial.local/articles/${input.articleId}`,
    summary: `Fixture CMS accepted article "${input.title}"`,
  };
}

export function liveCmsPublishStub(): DestinationAdapterResult {
  return {
    wiring: "NOT_WIRED",
    accepted: false,
    remoteId: null,
    summary: "Live CMS publish is NOT_WIRED without owner credentials",
    code: "NOT_WIRED",
  };
}

export function fixtureGbpPublish(input: {
  variantId: string;
  body: string;
}): DestinationAdapterResult {
  return {
    wiring: "FIXTURE",
    accepted: true,
    remoteId: `gbp-fixture-${input.variantId}`,
    summary: `Fixture GBP accepted short update (${input.body.length} chars)`,
  };
}

export function liveGbpPublishStub(): DestinationAdapterResult {
  return {
    wiring: "NOT_WIRED",
    accepted: false,
    remoteId: null,
    summary:
      "Live Google Business Profile API is NOT_WIRED without ownership verification and credentials",
    code: "NOT_WIRED",
  };
}

export function fixtureSocialPublish(input: {
  kind: string;
  variantId: string;
}): DestinationAdapterResult {
  return {
    wiring: "FIXTURE",
    accepted: true,
    remoteId: `${input.kind}-fixture-${input.variantId}`,
    summary: `Fixture ${input.kind} accepted post`,
  };
}

export function liveSocialPublishStub(kind: string): DestinationAdapterResult {
  return {
    wiring: "NOT_WIRED",
    accepted: false,
    remoteId: null,
    summary: `Live ${kind} adapter is NOT_WIRED without organization role and credentials`,
    code: "NOT_WIRED",
  };
}

export function invokeDestinationAdapter(input: {
  kind: string;
  preferLive: boolean;
  articleId?: string;
  variantId?: string;
  title?: string;
  body?: string;
}): DestinationAdapterResult {
  if (input.preferLive) {
    if (input.kind === DestinationKind.CMS) return liveCmsPublishStub();
    if (input.kind === DestinationKind.GBP) return liveGbpPublishStub();
    return liveSocialPublishStub(input.kind);
  }
  if (input.kind === DestinationKind.CMS) {
    return fixtureCmsPublish({
      articleId: input.articleId ?? "unknown",
      title: input.title ?? "untitled",
    });
  }
  if (input.kind === DestinationKind.GBP) {
    return fixtureGbpPublish({
      variantId: input.variantId ?? "unknown",
      body: input.body ?? "",
    });
  }
  return fixtureSocialPublish({
    kind: input.kind,
    variantId: input.variantId ?? "unknown",
  });
}

export function buildGoldenCampaign(nowIso: string): ContentCampaign {
  return createContentCampaign({
    campaignId: CONTENT_PILOT_CAMPAIGN_ID,
    title: "A better brief for your next training day",
    topic: "Corporate training rooms",
    brief: createContentBrief({
      briefId: "golden-brief-training",
      audienceNeed: "Plan a useful corporate training day",
      practicalValue: "Checklist for room layout, tech, and arrival",
      intendedAction: "Inquire about training rooms",
      sourceFactIds: ["fixture-fact-hours"],
      createdAtIso: nowIso,
    }),
    destinationIds: ["dest-cms", "dest-gbp", "dest-linkedin"],
    fixtureOnly: true,
    createdAtIso: nowIso,
    status: CampaignStatus.DRAFTING,
  });
}

export function buildGoldenArticle(nowIso: string): CanonicalArticle {
  return createCanonicalArticle({
    articleId: CONTENT_PILOT_ARTICLE_ID,
    campaignId: CONTENT_PILOT_CAMPAIGN_ID,
    title: "A better brief for your next training day",
    body: CONTENT_GOLDEN_ARTICLE_BODY,
    citedFactIds: ["fixture-fact-hours"],
    hypothesisFactIds: ["fixture-fact-hypothesis"],
    fixtureOnly: true,
    createdAtIso: nowIso,
    status: ArticleStatus.READY_FOR_REVIEW,
  });
}

export function buildGoldenVariants(
  nowIso: string,
  article: CanonicalArticle,
  destinations: DestinationRegistryEntry[],
): DestinationVariant[] {
  const variants: DestinationVariant[] = [];
  const gbp = destinations.find((d) => d.destinationId === "dest-gbp");
  const linkedin = destinations.find((d) => d.destinationId === "dest-linkedin");

  if (gbp) {
    const created = createDestinationVariant({
      variantId: "golden-var-gbp",
      campaignId: CONTENT_PILOT_CAMPAIGN_ID,
      article,
      destination: gbp,
      format: ContentFormat.SHORT_UPDATE,
      title: "Training day tip from WorkSocial",
      body: "Start with the learning outcome, then match the room layout. Confirm display, audio, and arrival instructions before the session.",
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (created.ok) {
      variants.push({ ...created.variant, status: VariantStatus.READY });
    }
  }

  if (linkedin) {
    const created = createDestinationVariant({
      variantId: "golden-var-linkedin",
      campaignId: CONTENT_PILOT_CAMPAIGN_ID,
      article,
      destination: linkedin,
      format: ContentFormat.SHORT_UPDATE,
      title: "Plan a useful training day",
      body: "A practical checklist for corporate training rooms — layout, tech, and arrival. Full article on the WorkSocial blog after canonical release.",
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (created.ok) {
      variants.push({ ...created.variant, status: VariantStatus.READY });
    }
  }

  return variants;
}

export function buildFixtureContentSeed(nowIso: string): {
  destinations: DestinationRegistryEntry[];
  campaigns: ContentCampaign[];
  articles: CanonicalArticle[];
  variants: DestinationVariant[];
  factLabels: Map<string, (typeof SupportLabel)[keyof typeof SupportLabel]>;
} {
  const destinations = defaultDestinationRegistry();
  const campaign = buildGoldenCampaign(nowIso);
  const article = buildGoldenArticle(nowIso);
  campaign.canonicalArticleId = article.articleId;
  return {
    destinations,
    campaigns: [{ ...campaign, canonicalArticleId: article.articleId }],
    articles: [article],
    variants: buildGoldenVariants(nowIso, article, destinations),
    factLabels: new Map([
      ["fixture-fact-hours", SupportLabel.SUPPORTED],
      ["fixture-fact-hypothesis", SupportLabel.HYPOTHESIS],
    ]),
  };
}

/**
 * Fixture production mapping for content CMS + GBP + LinkedIn write paths.
 */
export function createFixtureContentPilotMapping(nowIso: string): {
  state: ProductionMappingState;
  writePathIds: {
    cms: string;
    gbp: string;
    linkedin: string;
  };
} {
  const siteId = "worksocial-pilot";
  const binding: SourceBinding = {
    bindingId: CONTENT_PILOT_BINDING_ID,
    siteId,
    kind: BindingKind.WEBSITE,
    resourceRef: "https://example.worksocial.local/blog",
    displayName: "Pilot blog (content fixture)",
    identityLabel: null,
    connectionState: ConnectionState.NOT_CONFIGURED,
    writeReadiness: WriteReadiness.NOT_AUTHORIZED,
    verificationState: VerificationState.NOT_VERIFIED,
    ownershipProven: false,
    observedRevision: null,
    adapterWiring: AdapterWiring.FIXTURE,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  const cmsPath: PilotWritePath = {
    writePathId: CONTENT_PILOT_CMS_WRITE_PATH_ID,
    channelId: "owned-site",
    assetId: CONTENT_PILOT_ARTICLE_ASSET_ID,
    operation: "publish_article",
    siteId,
    bindingId: CONTENT_PILOT_BINDING_ID,
    formId: null,
    bookingOwnershipId: null,
    crmOwnershipId: null,
    requiredEvidenceKinds: [...DEFAULT_PILOT_EVIDENCE_KINDS],
    createdAtIso: nowIso,
  };

  const gbpPath: PilotWritePath = {
    writePathId: CONTENT_PILOT_GBP_WRITE_PATH_ID,
    channelId: "gbp",
    assetId: CONTENT_PILOT_ARTICLE_ASSET_ID,
    operation: "publish_gbp_update",
    siteId,
    bindingId: CONTENT_PILOT_BINDING_ID,
    formId: null,
    bookingOwnershipId: null,
    crmOwnershipId: null,
    requiredEvidenceKinds: [...DEFAULT_PILOT_EVIDENCE_KINDS],
    createdAtIso: nowIso,
  };

  const linkedinPath: PilotWritePath = {
    writePathId: CONTENT_PILOT_LINKEDIN_WRITE_PATH_ID,
    channelId: "linkedin",
    assetId: CONTENT_PILOT_ARTICLE_ASSET_ID,
    operation: "publish_social_post",
    siteId,
    bindingId: CONTENT_PILOT_BINDING_ID,
    formId: null,
    bookingOwnershipId: null,
    crmOwnershipId: null,
    requiredEvidenceKinds: [...DEFAULT_PILOT_EVIDENCE_KINDS],
    createdAtIso: nowIso,
  };

  return {
    writePathIds: {
      cms: CONTENT_PILOT_CMS_WRITE_PATH_ID,
      gbp: CONTENT_PILOT_GBP_WRITE_PATH_ID,
      linkedin: CONTENT_PILOT_LINKEDIN_WRITE_PATH_ID,
    },
    state: {
      version: 1,
      sites: [siteId],
      bindings: [binding],
      forms: [],
      bookingOwnership: [],
      crmOwnership: [],
      writePaths: [cmsPath, gbpPath, linkedinPath],
      journeys: [
        {
          journeyId: "journey-content-distribution",
          siteId,
          displayName: "Content distribution (fixture)",
          stages: [
            "brief",
            "draft",
            "qa",
            "canonical_release",
            "variants",
            "receipts",
          ],
          writePathIds: [
            CONTENT_PILOT_CMS_WRITE_PATH_ID,
            CONTENT_PILOT_GBP_WRITE_PATH_ID,
            CONTENT_PILOT_LINKEDIN_WRITE_PATH_ID,
          ],
          createdAtIso: nowIso,
        },
      ],
      readEvidence: [],
      writePathOutcomes: [],
      updatedAt: nowIso,
    },
  };
}

export function proveFixtureContentWritePaths(
  state: ProductionMappingState,
  nowIso: string,
): ProductionMappingState {
  let next = proveFixturePilotWritePath(
    state,
    CONTENT_PILOT_CMS_WRITE_PATH_ID,
    nowIso,
  );
  next = proveFixturePilotWritePath(
    next,
    CONTENT_PILOT_GBP_WRITE_PATH_ID,
    nowIso,
  );
  next = proveFixturePilotWritePath(
    next,
    CONTENT_PILOT_LINKEDIN_WRITE_PATH_ID,
    nowIso,
  );
  return next;
}

export function upsertFixtureContentMapping(
  current: ProductionMappingState,
  nowIso: string,
): {
  state: ProductionMappingState;
  writePathIds: { cms: string; gbp: string; linkedin: string };
  created: boolean;
} {
  const { state: fixture, writePathIds } =
    createFixtureContentPilotMapping(nowIso);
  const existingPath = current.writePaths.find(
    (p) => p.writePathId === writePathIds.cms,
  );
  if (existingPath) {
    return { state: current, writePathIds, created: false };
  }

  return {
    writePathIds,
    created: true,
    state: {
      ...current,
      sites: [...new Set([...current.sites, ...fixture.sites])],
      bindings: [
        ...current.bindings.filter(
          (b) => !fixture.bindings.some((fb) => fb.bindingId === b.bindingId),
        ),
        ...fixture.bindings,
      ],
      writePaths: [...current.writePaths, ...fixture.writePaths],
      journeys: [
        ...current.journeys.filter(
          (j) => !fixture.journeys.some((fj) => fj.journeyId === j.journeyId),
        ),
        ...fixture.journeys,
      ],
      updatedAt: nowIso,
    },
  };
}
