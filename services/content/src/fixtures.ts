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
  createArticleQaVerdict,
  createCanonicalArticle,
  createContentBrief,
  createContentCampaign,
  createDestinationVariant,
  defaultDestinationRegistry,
  digestArticleContent,
  proveFixturePilotWritePath,
  type ArticleQaVerdict,
  type CanonicalArticle,
  type ContentCampaign,
  type DestinationRegistryEntry,
  type DestinationVariant,
  type ProductionMappingState,
  type SourceBinding,
  type PilotWritePath,
} from "@worksocial/domain";

/** Asset id equals the canonical article id — grants bind to the reviewed article. */
export const CONTENT_PILOT_ARTICLE_ID = "golden-art-training" as const;
export const CONTENT_PILOT_ARTICLE_ASSET_ID = CONTENT_PILOT_ARTICLE_ID;
export const CONTENT_PILOT_CMS_WRITE_PATH_ID = "wp-content-cms-publish" as const;
export const CONTENT_PILOT_GBP_WRITE_PATH_ID = "wp-content-gbp-publish" as const;
export const CONTENT_PILOT_LINKEDIN_WRITE_PATH_ID =
  "wp-content-linkedin-publish" as const;
export const CONTENT_PILOT_FACEBOOK_WRITE_PATH_ID =
  "wp-content-facebook-publish" as const;
export const CONTENT_PILOT_CMS_BINDING_ID = "bind-content-cms" as const;
export const CONTENT_PILOT_GBP_BINDING_ID = "bind-content-gbp" as const;
export const CONTENT_PILOT_LINKEDIN_BINDING_ID = "bind-content-linkedin" as const;
export const CONTENT_PILOT_FACEBOOK_BINDING_ID = "bind-content-facebook" as const;
/** @deprecated use CONTENT_PILOT_CMS_BINDING_ID */
export const CONTENT_PILOT_BINDING_ID = CONTENT_PILOT_CMS_BINDING_ID;
export const CONTENT_PILOT_CAMPAIGN_ID = "golden-camp-training" as const;

export const CONTENT_GOLDEN_ARTICLE_TITLE =
  "A better brief for your next training day" as const;
export const CONTENT_GOLDEN_ARTICLE_BODY =
  "A successful training day starts before the first attendee arrives. Start with the learning outcome, then choose a room layout that supports it. Confirm the display, audio, and connectivity you will actually use. Share verified directions and arrival instructions. Confirm current rates and availability directly before committing." as const;

export function goldenArticleContentDigest(): string {
  return digestArticleContent(
    CONTENT_GOLDEN_ARTICLE_TITLE,
    CONTENT_GOLDEN_ARTICLE_BODY,
  );
}

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
    title: CONTENT_GOLDEN_ARTICLE_TITLE,
    topic: "Corporate training rooms",
    brief: createContentBrief({
      briefId: "golden-brief-training",
      audienceNeed: "Plan a useful corporate training day",
      practicalValue: "Checklist for room layout, tech, and arrival",
      intendedAction: "Inquire about training rooms",
      sourceFactIds: ["fixture-fact-hours"],
      createdAtIso: nowIso,
    }),
    destinationIds: ["dest-cms", "dest-gbp", "dest-linkedin", "dest-facebook"],
    fixtureOnly: true,
    createdAtIso: nowIso,
    status: CampaignStatus.DRAFTING,
  });
}

export function buildGoldenArticle(nowIso: string): CanonicalArticle {
  return createCanonicalArticle({
    articleId: CONTENT_PILOT_ARTICLE_ID,
    campaignId: CONTENT_PILOT_CAMPAIGN_ID,
    title: CONTENT_GOLDEN_ARTICLE_TITLE,
    body: CONTENT_GOLDEN_ARTICLE_BODY,
    citedFactIds: ["fixture-fact-hours"],
    hypothesisFactIds: ["fixture-fact-hypothesis"],
    fixtureOnly: true,
    createdAtIso: nowIso,
    status: ArticleStatus.READY_FOR_REVIEW,
  });
}

export function buildGoldenQaVerdict(
  nowIso: string,
  article: CanonicalArticle,
): ArticleQaVerdict {
  const created = createArticleQaVerdict({
    verdictId: "golden-qa-training",
    articleId: article.articleId,
    authorId: "author-a13",
    reviewerId: "reviewer-a25",
    approved: true,
    contentDigest: article.contentDigest,
    summary: "Independent QA passed originality, sources, and accessibility checks",
    decidedAtIso: nowIso,
  });
  if (!created.ok) {
    throw new Error(created.reasons.join("; "));
  }
  return created.verdict;
}

export function buildGoldenVariants(
  nowIso: string,
  article: CanonicalArticle,
  destinations: DestinationRegistryEntry[],
): DestinationVariant[] {
  const variants: DestinationVariant[] = [];
  const gbp = destinations.find((d) => d.destinationId === "dest-gbp");
  const linkedin = destinations.find((d) => d.destinationId === "dest-linkedin");
  const facebook = destinations.find((d) => d.destinationId === "dest-facebook");

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

  if (facebook) {
    const created = createDestinationVariant({
      variantId: "golden-var-facebook",
      campaignId: CONTENT_PILOT_CAMPAIGN_ID,
      article,
      destination: facebook,
      format: ContentFormat.SHORT_UPDATE,
      title: "Training-day checklist",
      body: "Match the room to the work. Confirm tech. Share arrival instructions.",
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
  qaVerdicts: ArticleQaVerdict[];
  factLabels: Map<string, (typeof SupportLabel)[keyof typeof SupportLabel]>;
} {
  const destinations = defaultDestinationRegistry();
  const campaign = buildGoldenCampaign(nowIso);
  const article = buildGoldenArticle(nowIso);
  return {
    destinations,
    campaigns: [{ ...campaign, canonicalArticleId: article.articleId }],
    articles: [article],
    variants: buildGoldenVariants(nowIso, article, destinations),
    qaVerdicts: [buildGoldenQaVerdict(nowIso, article)],
    factLabels: new Map([
      ["fixture-fact-hours", SupportLabel.SUPPORTED],
      ["fixture-fact-hypothesis", SupportLabel.HYPOTHESIS],
    ]),
  };
}

function makeBinding(input: {
  bindingId: string;
  siteId: string;
  resourceRef: string;
  displayName: string;
  nowIso: string;
}): SourceBinding {
  return {
    bindingId: input.bindingId,
    siteId: input.siteId,
    kind: BindingKind.WEBSITE,
    resourceRef: input.resourceRef,
    displayName: input.displayName,
    identityLabel: null,
    connectionState: ConnectionState.NOT_CONFIGURED,
    writeReadiness: WriteReadiness.NOT_AUTHORIZED,
    verificationState: VerificationState.NOT_VERIFIED,
    ownershipProven: false,
    observedRevision: null,
    adapterWiring: AdapterWiring.FIXTURE,
    createdAtIso: input.nowIso,
    updatedAtIso: input.nowIso,
  };
}

function makeWritePath(input: {
  writePathId: string;
  channelId: string;
  operation: string;
  siteId: string;
  bindingId: string;
  nowIso: string;
}): PilotWritePath {
  return {
    writePathId: input.writePathId,
    channelId: input.channelId,
    assetId: CONTENT_PILOT_ARTICLE_ASSET_ID,
    operation: input.operation,
    siteId: input.siteId,
    bindingId: input.bindingId,
    formId: null,
    bookingOwnershipId: null,
    crmOwnershipId: null,
    requiredEvidenceKinds: [...DEFAULT_PILOT_EVIDENCE_KINDS],
    createdAtIso: input.nowIso,
  };
}

export type ContentWritePathIds = {
  cms: string;
  gbp: string;
  linkedin: string;
  facebook: string;
};

/**
 * Fixture production mapping with per-destination bindings + write paths.
 */
export function createFixtureContentPilotMapping(nowIso: string): {
  state: ProductionMappingState;
  writePathIds: ContentWritePathIds;
} {
  const siteId = "worksocial-pilot";
  const cmsBinding = makeBinding({
    bindingId: CONTENT_PILOT_CMS_BINDING_ID,
    siteId,
    resourceRef: "https://example.worksocial.local/blog",
    displayName: "Pilot blog (content CMS fixture)",
    nowIso,
  });
  const gbpBinding = makeBinding({
    bindingId: CONTENT_PILOT_GBP_BINDING_ID,
    siteId,
    resourceRef: "gbp:location:fixture-jersey-city",
    displayName: "Pilot GBP location (fixture)",
    nowIso,
  });
  const linkedinBinding = makeBinding({
    bindingId: CONTENT_PILOT_LINKEDIN_BINDING_ID,
    siteId,
    resourceRef: "linkedin:org:fixture-worksocial",
    displayName: "Pilot LinkedIn organization (fixture)",
    nowIso,
  });
  const facebookBinding = makeBinding({
    bindingId: CONTENT_PILOT_FACEBOOK_BINDING_ID,
    siteId,
    resourceRef: "facebook:page:fixture-worksocial",
    displayName: "Pilot Facebook page (fixture)",
    nowIso,
  });

  const cmsPath = makeWritePath({
    writePathId: CONTENT_PILOT_CMS_WRITE_PATH_ID,
    channelId: "owned-site",
    operation: "publish_article",
    siteId,
    bindingId: CONTENT_PILOT_CMS_BINDING_ID,
    nowIso,
  });
  const gbpPath = makeWritePath({
    writePathId: CONTENT_PILOT_GBP_WRITE_PATH_ID,
    channelId: "gbp",
    operation: "publish_gbp_update",
    siteId,
    bindingId: CONTENT_PILOT_GBP_BINDING_ID,
    nowIso,
  });
  const linkedinPath = makeWritePath({
    writePathId: CONTENT_PILOT_LINKEDIN_WRITE_PATH_ID,
    channelId: "linkedin",
    operation: "publish_social_post",
    siteId,
    bindingId: CONTENT_PILOT_LINKEDIN_BINDING_ID,
    nowIso,
  });
  const facebookPath = makeWritePath({
    writePathId: CONTENT_PILOT_FACEBOOK_WRITE_PATH_ID,
    channelId: "facebook",
    operation: "publish_social_post",
    siteId,
    bindingId: CONTENT_PILOT_FACEBOOK_BINDING_ID,
    nowIso,
  });

  const writePathIds: ContentWritePathIds = {
    cms: CONTENT_PILOT_CMS_WRITE_PATH_ID,
    gbp: CONTENT_PILOT_GBP_WRITE_PATH_ID,
    linkedin: CONTENT_PILOT_LINKEDIN_WRITE_PATH_ID,
    facebook: CONTENT_PILOT_FACEBOOK_WRITE_PATH_ID,
  };

  return {
    writePathIds,
    state: {
      version: 1,
      sites: [siteId],
      bindings: [cmsBinding, gbpBinding, linkedinBinding, facebookBinding],
      forms: [],
      bookingOwnership: [],
      crmOwnership: [],
      writePaths: [cmsPath, gbpPath, linkedinPath, facebookPath],
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
          writePathIds: Object.values(writePathIds),
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
  let next = state;
  for (const writePathId of [
    CONTENT_PILOT_CMS_WRITE_PATH_ID,
    CONTENT_PILOT_GBP_WRITE_PATH_ID,
    CONTENT_PILOT_LINKEDIN_WRITE_PATH_ID,
    CONTENT_PILOT_FACEBOOK_WRITE_PATH_ID,
  ]) {
    if (next.writePaths.some((p) => p.writePathId === writePathId)) {
      next = proveFixturePilotWritePath(next, writePathId, nowIso);
    }
  }
  return next;
}

/**
 * Merge every missing content write path / binding independently.
 */
export function upsertFixtureContentMapping(
  current: ProductionMappingState,
  nowIso: string,
): {
  state: ProductionMappingState;
  writePathIds: ContentWritePathIds;
  created: boolean;
  addedWritePathIds: string[];
} {
  const { state: fixture, writePathIds } =
    createFixtureContentPilotMapping(nowIso);
  const addedWritePathIds: string[] = [];
  let state = current;

  for (const binding of fixture.bindings) {
    if (!state.bindings.some((b) => b.bindingId === binding.bindingId)) {
      state = {
        ...state,
        bindings: [...state.bindings, binding],
        updatedAt: nowIso,
      };
    }
  }

  for (const path of fixture.writePaths) {
    if (!state.writePaths.some((p) => p.writePathId === path.writePathId)) {
      state = {
        ...state,
        writePaths: [...state.writePaths, path],
        updatedAt: nowIso,
      };
      addedWritePathIds.push(path.writePathId);
    }
  }

  for (const journey of fixture.journeys) {
    if (!state.journeys.some((j) => j.journeyId === journey.journeyId)) {
      state = {
        ...state,
        journeys: [...state.journeys, journey],
        updatedAt: nowIso,
      };
    } else {
      state = {
        ...state,
        journeys: state.journeys.map((j) =>
          j.journeyId === journey.journeyId
            ? {
                ...j,
                writePathIds: [
                  ...new Set([...j.writePathIds, ...journey.writePathIds]),
                ],
              }
            : j,
        ),
        updatedAt: nowIso,
      };
    }
  }

  state = {
    ...state,
    sites: [...new Set([...state.sites, ...fixture.sites])],
  };

  return {
    writePathIds,
    created: addedWritePathIds.length > 0,
    addedWritePathIds,
    state,
  };
}
