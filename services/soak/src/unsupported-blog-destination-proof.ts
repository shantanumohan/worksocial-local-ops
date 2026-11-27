/**
 * Fixture proof for T-X046 — unsupported blog destination / no fake publication.
 *
 * Drives content `runCanonicalDistribution` with an unsupported destination id
 * (not dest-cms / dest-gbp / dest-linkedin). Orchestration must persist
 * FAILED + UNSUPPORTED_ACTION with null receipt/remote — never invent
 * PUBLISHED_VERIFIED. Secondary domain checks: fixtureAvailable=false release
 * gate; ChatGPT Hub full-blog format rejected. Domain classifier honesty
 * fields on every path. External effects: NONE.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 * Hillclimb: classifyUnsupportedBlogDestination + preferLive refuse + Hub edge;
 * DST civil schedule gaps still refuse fake OTHER_BLOG publication (G11);
 * blank/padded destinationId + format mismatch + preferLive-on-schedule (G15);
 * INVALID_SCHEDULE_INPUT civil refuse (G16/G18–G20); empty destinationId refuse (G17); spring-gap blocks fixture schedule (G21); fixture CMS schedule (G22/G23); Hub scheduled civil resolve still unsupported (G24); fixture OTHER_BLOG fall-back allowed (G25); scheduled format mismatch refuse (G26); scheduled padded destinationId refuse (G27); scheduled empty destinationId refuse (G28); fixture OTHER_BLOG normal schedule allowed (G29); preferLive-on-normal-OTHER_BLOG-schedule refuse (G30); unsupported OTHER_BLOG normal schedule still refuse (G31); preferLive-on-Hub-schedule refuse (G32); fixture CMS fall-back schedule allowed (G33).
 */

import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createActionGateway } from "@worksocial/action-gateway";
import { createContentService } from "@worksocial/content";
import {
  AdapterLiveStatus,
  ArticleStatus,
  ContentFormat,
  DestinationAttemptStatus,
  DestinationKind,
  DistributionRunStatus,
  OperatingMode,
  PublicationOutcome,
  SoakProofKind,
  SupportLabel,
  classifyUnsupportedBlogDestination,
  classifyUnsupportedBlogScheduledPublish,
  createCanonicalArticle,
  createDestinationVariant,
  evaluateVariantReleaseGate,
  type DestinationRegistryEntry,
  type SoakProofRecord,
  type UnsupportedBlogDestinationDecision,
} from "@worksocial/domain";
import {
  createDemoContentDistributionGrants,
  createDurableExecutionService,
  createFileContentStore,
  createMemoryDurableStores,
} from "@worksocial/persistence";

function honestyOk(
  decision: UnsupportedBlogDestinationDecision,
  expectedWiring: "NOT_WIRED" | "FIXTURE" = "NOT_WIRED",
): boolean {
  return (
    decision.liveProviderWiring === expectedWiring &&
    decision.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    decision.externalEffects === "NONE" &&
    decision.inventPublishedVerified === false
  );
}

const UNSUPPORTED_DEST_ID = "dest-other-blog-unsupported";

function unsupportedOtherBlog(): DestinationRegistryEntry {
  return {
    destinationId: UNSUPPORTED_DEST_ID,
    kind: DestinationKind.OTHER_BLOG,
    displayName: "Third-party blog (no publish API)",
    channelId: "other-blog",
    allowedFormats: [ContentFormat.FULL_ARTICLE],
    maxBodyChars: null,
    requiresCanonicalUrl: false,
    liveWiring: AdapterLiveStatus.NOT_WIRED,
    fixtureAvailable: false,
    locationRelevant: false,
    notes:
      "Additional owned blog without tested publish/read-back — do not invent a public API.",
  };
}

function chatgptHubDestination(): DestinationRegistryEntry {
  return {
    destinationId: "dest-chatgpt-hub",
    kind: DestinationKind.CHATGPT_HUB,
    displayName: "ChatGPT Business Hub",
    channelId: "chatgpt-hub",
    allowedFormats: [ContentFormat.PROFILE_FACT],
    maxBodyChars: 500,
    requiresCanonicalUrl: false,
    liveWiring: AdapterLiveStatus.NOT_WIRED,
    fixtureAvailable: false,
    locationRelevant: false,
    notes:
      "Profile/presence only — no invented blog-post API; fixture publish unavailable.",
  };
}

/**
 * Complete expected proof set for T-X046 fixture ACCEPTED.
 */
export async function proofUnsupportedBlogDestinationNoFakePublication(
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  let passed = true;
  const operationId = `op-x046-${randomUUID().slice(0, 8)}`;
  const dir = mkdtempSync(join(tmpdir(), "ws-tx046-"));

  try {
    const store = createFileContentStore(dir);
    const gateway = createActionGateway();
    const durable = createDurableExecutionService(createMemoryDurableStores());
    const service = createContentService(store, { gateway, durable });

    service.seedFixtures(nowIso);
    const mapping = service.seedAndProveContentMapping(nowIso);
    const article =
      service
        .listArticles()
        .find(
          (a) =>
            a.status === ArticleStatus.READY_FOR_REVIEW ||
            a.status === ArticleStatus.DRAFT,
        ) ?? service.listArticles()[0];
    if (!article) {
      passed = false;
      details.push("No seeded fixture article for distribution");
      return finish(passed, details, nowIso, operationId);
    }

    const labels = new Map([
      ["fixture-fact-hours", SupportLabel.SUPPORTED],
      ["fixture-fact-hypothesis", SupportLabel.HYPOTHESIS],
    ]);

    const claim = service.canonicalPublish.recordClaimSourceQa({
      articleId: article.articleId,
      claims: [
        {
          claimId: "c-hours-tx046",
          factId: "fixture-fact-hours",
          sourceRef: "src-hours",
          statement: "Open with verified hours",
        },
      ],
      factLabels: labels,
      nowIso,
    });
    if (!claim.ok) {
      passed = false;
      details.push(`Claim QA failed: ${JSON.stringify(claim)}`);
      return finish(passed, details, nowIso, operationId);
    }

    service.canonicalPublish.bindIndependentReview({
      articleId: article.articleId,
      nowIso,
    });

    const qa = service.recordQaVerdict({
      articleId: article.articleId,
      authorId: article.authorId,
      reviewerId: "reviewer-a25",
      approved: true,
      nowIso,
    });
    if (!qa.ok) {
      passed = false;
      details.push(`QA verdict failed: ${JSON.stringify(qa)}`);
      return finish(passed, details, nowIso, operationId);
    }

    const approved = service.approveArticle({
      articleId: article.articleId,
      factLabels: labels,
      nowIso,
    });
    if (!approved.ok || approved.article?.status !== ArticleStatus.APPROVED) {
      passed = false;
      details.push(`Approve failed: ${JSON.stringify(approved)}`);
      return finish(passed, details, nowIso, operationId);
    }
    details.push("Fixture article approved for canonical distribute");

    const grants = createDemoContentDistributionGrants(nowIso, {
      assetId: approved.article.articleId,
      contentRevision: approved.article.contentDigest,
    });
    const authority = {
      outboundStopped: false,
      operatingMode: OperatingMode.OPERATE,
      policies: [
        grants.policy,
        grants.gbpPolicy,
        grants.linkedinPolicy,
        grants.facebookPolicy,
      ],
      grants: [
        grants.grant,
        grants.gbpGrant,
        grants.linkedinGrant,
        grants.facebookGrant,
      ],
      actorRole: "administrator",
    };

    // Primary: drive real orchestration with unsupported blog destination.
    const distributed = await service.canonicalPublish.runCanonicalDistribution({
      articleId: approved.article.articleId,
      destinationIds: ["dest-cms", UNSUPPORTED_DEST_ID],
      authority,
      productionMapping: mapping.mapping,
      factLabels: labels,
      nowIso,
    });

    const cmsAttempt = distributed.run.attempts.find(
      (a) => a.destinationId === "dest-cms",
    );
    const unsupportedAttempt = distributed.run.attempts.find(
      (a) => a.destinationId === UNSUPPORTED_DEST_ID,
    );

    if (cmsAttempt?.status === DestinationAttemptStatus.VERIFIED) {
      details.push("Owned CMS peer VERIFIED via runCanonicalDistribution");
    } else {
      passed = false;
      details.push(
        `Expected dest-cms VERIFIED, got ${JSON.stringify(cmsAttempt)}`,
      );
    }

    if (
      unsupportedAttempt?.status === DestinationAttemptStatus.FAILED &&
      unsupportedAttempt.outcome === PublicationOutcome.UNSUPPORTED_ACTION &&
      unsupportedAttempt.kind === DestinationKind.OTHER_BLOG &&
      unsupportedAttempt.receiptId === null &&
      unsupportedAttempt.durableOperationId === null &&
      unsupportedAttempt.gatewayOperationId === null
    ) {
      details.push(
        "runCanonicalDistribution unsupported dest → FAILED/UNSUPPORTED_ACTION with null receipt/gateway/durable ids",
      );
    } else {
      passed = false;
      details.push(
        `Unsupported dest attempt unexpected: ${JSON.stringify(unsupportedAttempt)}`,
      );
    }

    if (
      distributed.run.status === DistributionRunStatus.PARTIAL &&
      distributed.details.some((d) =>
        /Rejected unsupported destination/i.test(d),
      )
    ) {
      details.push(
        "Distribution PARTIAL with orchestration detail 'Rejected unsupported destination'",
      );
    } else {
      passed = false;
      details.push(
        `Expected PARTIAL + reject detail; status=${distributed.run.status} details=${JSON.stringify(distributed.details)}`,
      );
    }

    // No invented publication receipt for the unsupported destination.
    const fakeReceipt = service
      .listReceipts()
      .find(
        (r) =>
          r.destinationId === UNSUPPORTED_DEST_ID &&
          r.outcome === PublicationOutcome.PUBLISHED_VERIFIED,
      );
    if (!fakeReceipt) {
      details.push(
        "No PUBLISHED_VERIFIED receipt persisted for unsupported blog destination",
      );
    } else {
      passed = false;
      details.push(
        `Fake publication receipt invented: ${JSON.stringify(fakeReceipt)}`,
      );
    }

    // Secondary domain: fixtureAvailable=false blocks release gate.
    const otherBlog = unsupportedOtherBlog();
    const otherClassified = classifyUnsupportedBlogDestination({
      destination: otherBlog,
      format: ContentFormat.FULL_ARTICLE,
    });
    if (
      !otherClassified.allowed &&
      otherClassified.code === "OTHER_BLOG_NO_ADAPTER_UNSUPPORTED" &&
      otherClassified.outcome === PublicationOutcome.UNSUPPORTED_ACTION &&
      honestyOk(otherClassified)
    ) {
      details.push(
        "classifyUnsupportedBlogDestination OTHER_BLOG (no adapter) → UNSUPPORTED_ACTION with honesty fields",
      );
    } else {
      passed = false;
      details.push(
        `OTHER_BLOG classifier unexpected: ${JSON.stringify(otherClassified)}`,
      );
    }

    // Fixture-backed OTHER_BLOG is allowed in fixture mode (not a live claim).
    const fixtureOtherBlog: DestinationRegistryEntry = {
      ...otherBlog,
      destinationId: "dest-other-blog-fixture",
      fixtureAvailable: true,
      liveWiring: AdapterLiveStatus.FIXTURE,
      notes: "Additional owned blog with tested fixture adapter only.",
    };
    const fixtureOtherClassified = classifyUnsupportedBlogDestination({
      destination: fixtureOtherBlog,
      format: ContentFormat.FULL_ARTICLE,
    });
    if (
      fixtureOtherClassified.allowed &&
      fixtureOtherClassified.code === "OTHER_BLOG_FIXTURE_ALLOWED" &&
      honestyOk(fixtureOtherClassified, AdapterLiveStatus.FIXTURE)
    ) {
      details.push(
        "classifyUnsupportedBlogDestination OTHER_BLOG fixture adapter → OTHER_BLOG_FIXTURE_ALLOWED (FIXTURE≠live claim)",
      );
    } else {
      passed = false;
      details.push(
        `Fixture OTHER_BLOG classifier unexpected: ${JSON.stringify(fixtureOtherClassified)}`,
      );
    }

    const drafted = createDestinationVariant({
      variantId: `var-other-${operationId.slice(-8)}`,
      campaignId: approved.article.campaignId,
      article: approved.article,
      destination: otherBlog,
      format: ContentFormat.FULL_ARTICLE,
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (!drafted.ok) {
      passed = false;
      details.push(`OTHER_BLOG draft rejected: ${JSON.stringify(drafted)}`);
    } else {
      const gate = evaluateVariantReleaseGate({
        variant: drafted.variant,
        article: approved.article,
        destination: otherBlog,
        preferLive: false,
      });
      if (
        !gate.allowed &&
        gate.code === "VARIANT_RELEASE_BLOCKED" &&
        gate.reasons.some((r) => /No fixture adapter available/i.test(r))
      ) {
        details.push(
          "Domain release gate blocks OTHER_BLOG without fixture adapter",
        );
      } else {
        passed = false;
        details.push(`Release gate unexpected: ${JSON.stringify(gate)}`);
      }
    }

    // Secondary: ChatGPT Hub full-blog format rejected (no invented blog-post API).
    const hub = chatgptHubDestination();
    const hubClassified = classifyUnsupportedBlogDestination({
      destination: hub,
      format: ContentFormat.FULL_ARTICLE,
    });
    if (
      !hubClassified.allowed &&
      hubClassified.code === "HUB_FULL_BLOG_UNSUPPORTED" &&
      hubClassified.outcome === PublicationOutcome.UNSUPPORTED_ACTION &&
      honestyOk(hubClassified)
    ) {
      details.push(
        "classifyUnsupportedBlogDestination Hub FULL_ARTICLE → HUB_FULL_BLOG_UNSUPPORTED",
      );
    } else {
      passed = false;
      details.push(
        `Hub classifier unexpected: ${JSON.stringify(hubClassified)}`,
      );
    }

    const hubBlog = createDestinationVariant({
      variantId: `var-hub-${operationId.slice(-8)}`,
      campaignId: approved.article.campaignId,
      article: approved.article,
      destination: hub,
      format: ContentFormat.FULL_ARTICLE,
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (!hubBlog.ok && hubBlog.code === "VARIANT_FORMAT_REJECTED") {
      details.push(
        "ChatGPT Hub full-blog variant rejected (VARIANT_FORMAT_REJECTED)",
      );
    } else {
      passed = false;
      details.push(`ChatGPT Hub full-blog unexpectedly ${JSON.stringify(hubBlog)}`);
    }

    // Prefer-live claim refused while adapters remain NOT_WIRED.
    const liveClaim = classifyUnsupportedBlogDestination({
      destination: {
        destinationId: "dest-cms",
        kind: DestinationKind.CMS,
        displayName: "Owned CMS / blog",
        channelId: "owned-site",
        allowedFormats: [ContentFormat.FULL_ARTICLE],
        maxBodyChars: null,
        requiresCanonicalUrl: false,
        liveWiring: AdapterLiveStatus.NOT_WIRED,
        fixtureAvailable: true,
        locationRelevant: false,
        notes: "Canonical owned-site article; fixture release + read-back only.",
      },
      format: ContentFormat.FULL_ARTICLE,
      preferLive: true,
    });
    if (
      !liveClaim.allowed &&
      liveClaim.code === "LIVE_WIRE_CLAIM_REFUSED" &&
      honestyOk(liveClaim)
    ) {
      details.push(
        "preferLive claim refused — LIVE_WIRE_CLAIM_REFUSED with honesty fields",
      );
    } else {
      passed = false;
      details.push(`preferLive unexpected: ${JSON.stringify(liveClaim)}`);
    }

    // Positive control: owned CMS draft still allowed.
    const cmsDest: DestinationRegistryEntry = {
      destinationId: "dest-cms",
      kind: DestinationKind.CMS,
      displayName: "Owned CMS / blog",
      channelId: "owned-site",
      allowedFormats: [ContentFormat.FULL_ARTICLE],
      maxBodyChars: null,
      requiresCanonicalUrl: false,
      liveWiring: AdapterLiveStatus.NOT_WIRED,
      fixtureAvailable: true,
      locationRelevant: false,
      notes: "Canonical owned-site article; fixture release + read-back only.",
    };
    const cmsClassified = classifyUnsupportedBlogDestination({
      destination: cmsDest,
      format: ContentFormat.FULL_ARTICLE,
    });
    if (
      cmsClassified.allowed &&
      cmsClassified.code === "OWNED_CMS_ALLOWED" &&
      honestyOk(cmsClassified)
    ) {
      details.push(
        "Positive control: classifyUnsupportedBlogDestination OWNED_CMS_ALLOWED",
      );
    } else {
      passed = false;
      details.push(`CMS classifier unexpected: ${JSON.stringify(cmsClassified)}`);
    }

    const cmsDraft = createDestinationVariant({
      variantId: `var-cms-${operationId.slice(-8)}`,
      campaignId: approved.article.campaignId,
      article: createCanonicalArticle({
        articleId: `art-cms-ctrl-${operationId.slice(-6)}`,
        campaignId: approved.article.campaignId,
        authorId: approved.article.authorId,
        title: "CMS positive control",
        body: "Owned site fixture draft remains allowed.",
        citedFactIds: ["fixture-fact-hours"],
        fixtureOnly: true,
        createdAtIso: nowIso,
      }),
      destination: cmsDest,
      format: ContentFormat.FULL_ARTICLE,
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (cmsDraft.ok) {
      details.push("Positive control: owned CMS full-article draft allowed");
    } else {
      passed = false;
      details.push(`CMS positive control failed: ${JSON.stringify(cmsDraft)}`);
    }

    // G11: DST spring gap schedule + unsupported OTHER_BLOG — no fake publish.
    const springGap = classifyUnsupportedBlogScheduledPublish({
      destination: otherBlog,
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-03-09",
      hour: 2,
      minute: 30,
    });
    if (
      !springGap.scheduleOk &&
      springGap.scheduleCode === "NONEXISTENT_LOCAL_TIME" &&
      !springGap.allowed &&
      springGap.inventPublishedVerified === false &&
      springGap.publish.code === "OTHER_BLOG_NO_ADAPTER_UNSUPPORTED" &&
      springGap.externalEffects === "NONE" &&
      springGap.chatgptAdsAccess === "ACCESS_BLOCKED"
    ) {
      details.push(
        "DST spring-gap schedule → NONEXISTENT_LOCAL_TIME; OTHER_BLOG still UNSUPPORTED; never invent PUBLISHED_VERIFIED",
      );
    } else {
      passed = false;
      details.push(`DST spring schedule unexpected: ${JSON.stringify(springGap)}`);
    }

    // G11: fall-back resolves once; unsupported OTHER_BLOG still refused.
    const fallBack = classifyUnsupportedBlogScheduledPublish({
      destination: otherBlog,
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-11-02",
      hour: 1,
      minute: 30,
    });
    if (
      fallBack.scheduleOk &&
      fallBack.scheduleCode === "SCHEDULE_RESOLVED" &&
      fallBack.ambiguous === true &&
      !fallBack.allowed &&
      fallBack.publish.code === "OTHER_BLOG_NO_ADAPTER_UNSUPPORTED" &&
      fallBack.inventPublishedVerified === false
    ) {
      details.push(
        "DST fall-back schedule resolves once; OTHER_BLOG still UNSUPPORTED — never invent PUBLISHED_VERIFIED",
      );
    } else {
      passed = false;
      details.push(`DST fall schedule unexpected: ${JSON.stringify(fallBack)}`);
    }

    // G15: whitespace-padded destinationId refuses even with fixture adapter.
    const paddedId = classifyUnsupportedBlogDestination({
      destination: {
        ...otherBlog,
        destinationId: "  dest-other-blog-unsupported  ",
        fixtureAvailable: true,
        liveWiring: AdapterLiveStatus.FIXTURE,
      },
      format: ContentFormat.FULL_ARTICLE,
    });
    if (
      !paddedId.allowed &&
      paddedId.code === "OTHER_BLOG_NO_ADAPTER_UNSUPPORTED" &&
      paddedId.inventPublishedVerified === false &&
      paddedId.externalEffects === "NONE"
    ) {
      details.push(
        "Whitespace-padded destinationId → OTHER_BLOG_NO_ADAPTER_UNSUPPORTED; never invent PUBLISHED_VERIFIED",
      );
    } else {
      passed = false;
      details.push(`Padded destinationId unexpected: ${JSON.stringify(paddedId)}`);
    }

    // G15: fixture OTHER_BLOG with disallowed format still refuses.
    const formatMismatch = classifyUnsupportedBlogDestination({
      destination: {
        ...otherBlog,
        destinationId: "dest-other-blog-format-mismatch",
        fixtureAvailable: true,
        allowedFormats: [ContentFormat.PROFILE_FACT],
        liveWiring: AdapterLiveStatus.FIXTURE,
      },
      format: ContentFormat.FULL_ARTICLE,
    });
    if (
      !formatMismatch.allowed &&
      formatMismatch.code === "OTHER_BLOG_NO_ADAPTER_UNSUPPORTED" &&
      formatMismatch.outcome === PublicationOutcome.UNSUPPORTED_ACTION &&
      formatMismatch.inventPublishedVerified === false
    ) {
      details.push(
        "Fixture OTHER_BLOG format mismatch → OTHER_BLOG_NO_ADAPTER_UNSUPPORTED; never invent PUBLISHED_VERIFIED",
      );
    } else {
      passed = false;
      details.push(`Format mismatch unexpected: ${JSON.stringify(formatMismatch)}`);
    }

    // G17: empty destinationId refuses before format/adapter paths.
    const emptyId = classifyUnsupportedBlogDestination({
      destination: {
        ...otherBlog,
        destinationId: "",
        fixtureAvailable: true,
        liveWiring: AdapterLiveStatus.FIXTURE,
      },
      format: ContentFormat.FULL_ARTICLE,
    });
    if (
      !emptyId.allowed &&
      emptyId.code === "OTHER_BLOG_NO_ADAPTER_UNSUPPORTED" &&
      emptyId.inventPublishedVerified === false &&
      emptyId.externalEffects === "NONE"
    ) {
      details.push(
        "Empty destinationId → OTHER_BLOG_NO_ADAPTER_UNSUPPORTED; never invent PUBLISHED_VERIFIED",
      );
    } else {
      passed = false;
      details.push(`Empty destinationId unexpected: ${JSON.stringify(emptyId)}`);
    }

    // G22: fixture CMS schedule resolves — allowed without invent PUBLISHED_VERIFIED.
    const cmsSchedule = classifyUnsupportedBlogScheduledPublish({
      destination: {
        destinationId: "dest-cms",
        kind: DestinationKind.CMS,
        displayName: "Owned CMS",
        channelId: "owned-site",
        allowedFormats: [ContentFormat.FULL_ARTICLE],
        maxBodyChars: null,
        requiresCanonicalUrl: false,
        liveWiring: AdapterLiveStatus.FIXTURE,
        fixtureAvailable: true,
        locationRelevant: false,
        notes: "fixture",
      },
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-06-15",
      hour: 9,
      minute: 0,
    });
    if (
      cmsSchedule.scheduleOk &&
      cmsSchedule.scheduleCode === "SCHEDULE_RESOLVED" &&
      cmsSchedule.allowed &&
      cmsSchedule.publish.code === "OWNED_CMS_ALLOWED" &&
      cmsSchedule.inventPublishedVerified === false &&
      cmsSchedule.externalEffects === "NONE"
    ) {
      details.push(
        "Fixture CMS civil schedule resolves — OWNED_CMS_ALLOWED; inventPublishedVerified=false",
      );
    } else {
      passed = false;
      details.push(`CMS schedule unexpected: ${JSON.stringify(cmsSchedule)}`);
    }

    // G23: resolved CMS schedule + preferLive still refused.
    const cmsPreferLive = classifyUnsupportedBlogScheduledPublish({
      destination: {
        destinationId: "dest-cms",
        kind: DestinationKind.CMS,
        displayName: "Owned CMS",
        channelId: "owned-site",
        allowedFormats: [ContentFormat.FULL_ARTICLE],
        maxBodyChars: null,
        requiresCanonicalUrl: false,
        liveWiring: AdapterLiveStatus.FIXTURE,
        fixtureAvailable: true,
        locationRelevant: false,
        notes: "fixture",
      },
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-06-15",
      hour: 9,
      minute: 0,
      preferLive: true,
    });
    if (
      cmsPreferLive.scheduleOk &&
      cmsPreferLive.scheduleCode === "SCHEDULE_RESOLVED" &&
      !cmsPreferLive.allowed &&
      cmsPreferLive.publish.code === "LIVE_WIRE_CLAIM_REFUSED" &&
      cmsPreferLive.inventPublishedVerified === false
    ) {
      details.push(
        "CMS schedule resolve + preferLive → LIVE_WIRE_CLAIM_REFUSED; never invent PUBLISHED_VERIFIED",
      );
    } else {
      passed = false;
      details.push(`CMS preferLive schedule unexpected: ${JSON.stringify(cmsPreferLive)}`);
    }

    // G21: spring-gap blocks schedule even when fixture OTHER_BLOG publish would classify allowed.
    const springFixture = classifyUnsupportedBlogScheduledPublish({
      destination: {
        ...otherBlog,
        destinationId: "dest-other-blog-fixture-spring",
        fixtureAvailable: true,
        liveWiring: AdapterLiveStatus.FIXTURE,
      },
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-03-09",
      hour: 2,
      minute: 30,
    });
    if (
      !springFixture.scheduleOk &&
      springFixture.scheduleCode === "NONEXISTENT_LOCAL_TIME" &&
      !springFixture.allowed &&
      springFixture.inventPublishedVerified === false &&
      springFixture.publish.code === "OTHER_BLOG_FIXTURE_ALLOWED"
    ) {
      details.push(
        "Spring-gap NONEXISTENT_LOCAL_TIME blocks fixture OTHER_BLOG schedule — never invent PUBLISHED_VERIFIED",
      );
    } else {
      passed = false;
      details.push(`Spring fixture schedule unexpected: ${JSON.stringify(springFixture)}`);
    }

    // G20: out-of-range civil minute → INVALID_SCHEDULE_INPUT.
    const badMinute = classifyUnsupportedBlogScheduledPublish({
      destination: otherBlog,
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-06-15",
      hour: 9,
      minute: 60,
    });
    if (
      !badMinute.scheduleOk &&
      badMinute.scheduleCode === "INVALID_SCHEDULE_INPUT" &&
      !badMinute.allowed &&
      badMinute.inventPublishedVerified === false
    ) {
      details.push(
        "Out-of-range civil minute INVALID_SCHEDULE_INPUT; never invent PUBLISHED_VERIFIED",
      );
    } else {
      passed = false;
      details.push(`Bad minute schedule unexpected: ${JSON.stringify(badMinute)}`);
    }

    // G19: out-of-range civil hour → INVALID_SCHEDULE_INPUT.
    const badHour = classifyUnsupportedBlogScheduledPublish({
      destination: otherBlog,
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-06-15",
      hour: 25,
      minute: 0,
    });
    if (
      !badHour.scheduleOk &&
      badHour.scheduleCode === "INVALID_SCHEDULE_INPUT" &&
      !badHour.allowed &&
      badHour.inventPublishedVerified === false &&
      badHour.publish.code === "OTHER_BLOG_NO_ADAPTER_UNSUPPORTED"
    ) {
      details.push(
        "Out-of-range civil hour INVALID_SCHEDULE_INPUT; never invent PUBLISHED_VERIFIED",
      );
    } else {
      passed = false;
      details.push(`Bad hour schedule unexpected: ${JSON.stringify(badHour)}`);
    }

    // G18: malformed localDate → INVALID_SCHEDULE_INPUT; publish still unsupported.
    const malformedDate = classifyUnsupportedBlogScheduledPublish({
      destination: otherBlog,
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-13-01",
      hour: 9,
      minute: 0,
    });
    if (
      !malformedDate.scheduleOk &&
      malformedDate.scheduleCode === "INVALID_SCHEDULE_INPUT" &&
      !malformedDate.allowed &&
      malformedDate.inventPublishedVerified === false &&
      malformedDate.publish.code === "OTHER_BLOG_NO_ADAPTER_UNSUPPORTED"
    ) {
      details.push(
        "Malformed localDate INVALID_SCHEDULE_INPUT; OTHER_BLOG never invent PUBLISHED_VERIFIED",
      );
    } else {
      passed = false;
      details.push(`Malformed localDate unexpected: ${JSON.stringify(malformedDate)}`);
    }

    // G16: invalid civil schedule (bad zone) → INVALID_SCHEDULE_INPUT; no fake publish.
    const invalidCivil = classifyUnsupportedBlogScheduledPublish({
      destination: otherBlog,
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "Not/A_Valid_Zone",
      localDate: "2025-11-02",
      hour: 9,
      minute: 0,
    });
    if (
      !invalidCivil.scheduleOk &&
      invalidCivil.scheduleCode === "INVALID_SCHEDULE_INPUT" &&
      invalidCivil.fireAtIso === null &&
      !invalidCivil.allowed &&
      invalidCivil.inventPublishedVerified === false &&
      invalidCivil.publish.code === "OTHER_BLOG_NO_ADAPTER_UNSUPPORTED" &&
      invalidCivil.externalEffects === "NONE"
    ) {
      details.push(
        "INVALID_SCHEDULE_INPUT civil refuse; OTHER_BLOG still UNSUPPORTED — never invent PUBLISHED_VERIFIED",
      );
    } else {
      passed = false;
      details.push(`Invalid civil schedule unexpected: ${JSON.stringify(invalidCivil)}`);
    }

    // G24: Hub FULL_ARTICLE — civil schedule resolves but still unsupported.
    const hubScheduled = classifyUnsupportedBlogScheduledPublish({
      destination: {
        destinationId: "dest-chatgpt-hub",
        kind: DestinationKind.CHATGPT_HUB,
        displayName: "ChatGPT Hub",
        channelId: "chatgpt-hub",
        allowedFormats: [ContentFormat.FULL_ARTICLE],
        maxBodyChars: null,
        requiresCanonicalUrl: false,
        liveWiring: AdapterLiveStatus.NOT_WIRED,
        fixtureAvailable: false,
        locationRelevant: false,
        notes: "Hub has no invented full-blog API",
      },
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-06-15",
      hour: 9,
      minute: 0,
    });
    if (
      hubScheduled.scheduleOk &&
      hubScheduled.scheduleCode === "SCHEDULE_RESOLVED" &&
      hubScheduled.fireAtIso !== null &&
      !hubScheduled.allowed &&
      hubScheduled.publish.code === "HUB_FULL_BLOG_UNSUPPORTED" &&
      hubScheduled.publish.outcome === PublicationOutcome.UNSUPPORTED_ACTION &&
      hubScheduled.inventPublishedVerified === false &&
      hubScheduled.externalEffects === "NONE" &&
      hubScheduled.chatgptAdsAccess === "ACCESS_BLOCKED"
    ) {
      details.push(
        "Hub FULL_ARTICLE civil schedule resolves; publish still HUB_FULL_BLOG_UNSUPPORTED — never invent PUBLISHED_VERIFIED",
      );
    } else {
      passed = false;
      details.push(`Hub scheduled unexpected: ${JSON.stringify(hubScheduled)}`);
    }

    // G25: fall-back ambiguous schedule + fixture OTHER_BLOG allowed — still no invent VERIFIED.
    const fallBackFixture = classifyUnsupportedBlogScheduledPublish({
      destination: {
        ...otherBlog,
        destinationId: "dest-other-blog-fixture-fallback",
        fixtureAvailable: true,
        liveWiring: AdapterLiveStatus.FIXTURE,
      },
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-11-02",
      hour: 1,
      minute: 30,
    });
    if (
      fallBackFixture.scheduleOk &&
      fallBackFixture.scheduleCode === "SCHEDULE_RESOLVED" &&
      fallBackFixture.ambiguous === true &&
      fallBackFixture.allowed === true &&
      fallBackFixture.publish.code === "OTHER_BLOG_FIXTURE_ALLOWED" &&
      fallBackFixture.inventPublishedVerified === false &&
      fallBackFixture.liveProviderWiring === AdapterLiveStatus.FIXTURE &&
      fallBackFixture.externalEffects === "NONE" &&
      fallBackFixture.chatgptAdsAccess === "ACCESS_BLOCKED"
    ) {
      details.push(
        "DST fall-back + fixture OTHER_BLOG → SCHEDULE_RESOLVED allowed; inventPublishedVerified=false",
      );
    } else {
      passed = false;
      details.push(`Fall-back fixture OTHER_BLOG unexpected: ${JSON.stringify(fallBackFixture)}`);
    }

    // G26: civil schedule resolves but format mismatch still refuses publish.
    const scheduledFormatMismatch = classifyUnsupportedBlogScheduledPublish({
      destination: {
        ...otherBlog,
        destinationId: "dest-other-blog-format-scheduled",
        fixtureAvailable: true,
        allowedFormats: [ContentFormat.PROFILE_FACT],
        liveWiring: AdapterLiveStatus.FIXTURE,
      },
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-06-15",
      hour: 9,
      minute: 0,
    });
    if (
      scheduledFormatMismatch.scheduleOk &&
      scheduledFormatMismatch.scheduleCode === "SCHEDULE_RESOLVED" &&
      scheduledFormatMismatch.fireAtIso !== null &&
      !scheduledFormatMismatch.allowed &&
      scheduledFormatMismatch.publish.code === "OTHER_BLOG_NO_ADAPTER_UNSUPPORTED" &&
      scheduledFormatMismatch.inventPublishedVerified === false &&
      scheduledFormatMismatch.externalEffects === "NONE"
    ) {
      details.push(
        "SCHEDULE_RESOLVED but format mismatch → OTHER_BLOG_NO_ADAPTER_UNSUPPORTED; never invent PUBLISHED_VERIFIED",
      );
    } else {
      passed = false;
      details.push(
        `Scheduled format mismatch unexpected: ${JSON.stringify(scheduledFormatMismatch)}`,
      );
    }

    // G27: civil schedule resolves but whitespace-padded destinationId still refuses.
    const scheduledPaddedId = classifyUnsupportedBlogScheduledPublish({
      destination: {
        ...otherBlog,
        destinationId: "  dest-other-blog-padded-schedule  ",
        fixtureAvailable: true,
        liveWiring: AdapterLiveStatus.FIXTURE,
      },
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-06-15",
      hour: 9,
      minute: 0,
    });
    if (
      scheduledPaddedId.scheduleOk &&
      scheduledPaddedId.scheduleCode === "SCHEDULE_RESOLVED" &&
      scheduledPaddedId.fireAtIso !== null &&
      !scheduledPaddedId.allowed &&
      scheduledPaddedId.publish.code === "OTHER_BLOG_NO_ADAPTER_UNSUPPORTED" &&
      scheduledPaddedId.inventPublishedVerified === false &&
      scheduledPaddedId.externalEffects === "NONE" &&
      scheduledPaddedId.chatgptAdsAccess === "ACCESS_BLOCKED"
    ) {
      details.push(
        "SCHEDULE_RESOLVED but padded destinationId → OTHER_BLOG_NO_ADAPTER_UNSUPPORTED; never invent PUBLISHED_VERIFIED",
      );
    } else {
      passed = false;
      details.push(`Scheduled padded id unexpected: ${JSON.stringify(scheduledPaddedId)}`);
    }

      // G33: fall-back ambiguous schedule + fixture CMS allowed — still no invent VERIFIED.
    const cmsFallBackSchedule = classifyUnsupportedBlogScheduledPublish({
      destination: {
        destinationId: "dest-cms",
        kind: DestinationKind.CMS,
        displayName: "Owned CMS",
        channelId: "owned-site",
        allowedFormats: [ContentFormat.FULL_ARTICLE],
        maxBodyChars: null,
        requiresCanonicalUrl: false,
        liveWiring: AdapterLiveStatus.FIXTURE,
        fixtureAvailable: true,
        locationRelevant: false,
        notes: "fixture",
      },
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-11-02",
      hour: 1,
      minute: 30,
    });
    if (
      cmsFallBackSchedule.scheduleOk &&
      cmsFallBackSchedule.scheduleCode === "SCHEDULE_RESOLVED" &&
      cmsFallBackSchedule.ambiguous === true &&
      cmsFallBackSchedule.allowed === true &&
      cmsFallBackSchedule.publish.code === "OWNED_CMS_ALLOWED" &&
      cmsFallBackSchedule.inventPublishedVerified === false &&
      cmsFallBackSchedule.liveProviderWiring === AdapterLiveStatus.FIXTURE &&
      cmsFallBackSchedule.externalEffects === "NONE" &&
      cmsFallBackSchedule.chatgptAdsAccess === "ACCESS_BLOCKED"
    ) {
      details.push(
        "DST fall-back + fixture CMS → OWNED_CMS_ALLOWED; inventPublishedVerified=false",
      );
    } else {
      passed = false;
      details.push(`CMS fall-back schedule unexpected: ${JSON.stringify(cmsFallBackSchedule)}`);
    }

    // G32: Hub schedule resolves but preferLive still refused.
    const hubPreferLiveSchedule = classifyUnsupportedBlogScheduledPublish({
      destination: {
        destinationId: "dest-chatgpt-hub-preferlive",
        kind: DestinationKind.CHATGPT_HUB,
        displayName: "ChatGPT Hub",
        channelId: "chatgpt-hub",
        allowedFormats: [ContentFormat.FULL_ARTICLE],
        maxBodyChars: null,
        requiresCanonicalUrl: false,
        liveWiring: AdapterLiveStatus.NOT_WIRED,
        fixtureAvailable: false,
        locationRelevant: false,
        notes: "Hub scheduled preferLive refuse",
      },
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-06-15",
      hour: 9,
      minute: 0,
      preferLive: true,
    });
    if (
      hubPreferLiveSchedule.scheduleOk &&
      hubPreferLiveSchedule.scheduleCode === "SCHEDULE_RESOLVED" &&
      !hubPreferLiveSchedule.allowed &&
      hubPreferLiveSchedule.publish.code === "LIVE_WIRE_CLAIM_REFUSED" &&
      hubPreferLiveSchedule.inventPublishedVerified === false &&
      hubPreferLiveSchedule.externalEffects === "NONE" &&
      hubPreferLiveSchedule.chatgptAdsAccess === "ACCESS_BLOCKED"
    ) {
      details.push(
        "Hub scheduled preferLive → LIVE_WIRE_CLAIM_REFUSED; never invent PUBLISHED_VERIFIED",
      );
    } else {
      passed = false;
      details.push(`Hub preferLive schedule unexpected: ${JSON.stringify(hubPreferLiveSchedule)}`);
    }

    // G31: normal schedule resolves but unsupported OTHER_BLOG still refused.
    const unsupportedNormalSchedule = classifyUnsupportedBlogScheduledPublish({
      destination: otherBlog,
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-06-15",
      hour: 9,
      minute: 0,
    });
    if (
      unsupportedNormalSchedule.scheduleOk &&
      unsupportedNormalSchedule.scheduleCode === "SCHEDULE_RESOLVED" &&
      unsupportedNormalSchedule.fireAtIso !== null &&
      !unsupportedNormalSchedule.allowed &&
      unsupportedNormalSchedule.publish.code === "OTHER_BLOG_NO_ADAPTER_UNSUPPORTED" &&
      unsupportedNormalSchedule.inventPublishedVerified === false &&
      unsupportedNormalSchedule.externalEffects === "NONE" &&
      unsupportedNormalSchedule.chatgptAdsAccess === "ACCESS_BLOCKED"
    ) {
      details.push(
        "Normal SCHEDULE_RESOLVED but unsupported OTHER_BLOG → OTHER_BLOG_NO_ADAPTER_UNSUPPORTED; never invent PUBLISHED_VERIFIED",
      );
    } else {
      passed = false;
      details.push(
        `Unsupported normal schedule unexpected: ${JSON.stringify(unsupportedNormalSchedule)}`,
      );
    }

    // G30: normal schedule resolves but preferLive on fixture OTHER_BLOG still refused.
    const preferLiveNormalSchedule = classifyUnsupportedBlogScheduledPublish({
      destination: {
        ...otherBlog,
        destinationId: "dest-other-blog-fixture-preferlive-normal",
        fixtureAvailable: true,
        liveWiring: AdapterLiveStatus.FIXTURE,
      },
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-06-15",
      hour: 9,
      minute: 0,
      preferLive: true,
    });
    if (
      preferLiveNormalSchedule.scheduleOk &&
      preferLiveNormalSchedule.scheduleCode === "SCHEDULE_RESOLVED" &&
      preferLiveNormalSchedule.ambiguous === false &&
      !preferLiveNormalSchedule.allowed &&
      preferLiveNormalSchedule.publish.code === "LIVE_WIRE_CLAIM_REFUSED" &&
      preferLiveNormalSchedule.inventPublishedVerified === false &&
      preferLiveNormalSchedule.externalEffects === "NONE" &&
      preferLiveNormalSchedule.chatgptAdsAccess === "ACCESS_BLOCKED"
    ) {
      details.push(
        "Normal schedule + preferLive on fixture OTHER_BLOG → LIVE_WIRE_CLAIM_REFUSED; never invent PUBLISHED_VERIFIED",
      );
    } else {
      passed = false;
      details.push(
        `preferLive normal OTHER_BLOG schedule unexpected: ${JSON.stringify(preferLiveNormalSchedule)}`,
      );
    }

    // G29: normal civil schedule + fixture OTHER_BLOG allowed — still no invent VERIFIED.
    const normalFixtureSchedule = classifyUnsupportedBlogScheduledPublish({
      destination: {
        ...otherBlog,
        destinationId: "dest-other-blog-fixture-normal-schedule",
        fixtureAvailable: true,
        liveWiring: AdapterLiveStatus.FIXTURE,
      },
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-06-15",
      hour: 9,
      minute: 0,
    });
    if (
      normalFixtureSchedule.scheduleOk &&
      normalFixtureSchedule.scheduleCode === "SCHEDULE_RESOLVED" &&
      normalFixtureSchedule.ambiguous === false &&
      normalFixtureSchedule.allowed === true &&
      normalFixtureSchedule.publish.code === "OTHER_BLOG_FIXTURE_ALLOWED" &&
      normalFixtureSchedule.inventPublishedVerified === false &&
      normalFixtureSchedule.liveProviderWiring === AdapterLiveStatus.FIXTURE &&
      normalFixtureSchedule.externalEffects === "NONE" &&
      normalFixtureSchedule.chatgptAdsAccess === "ACCESS_BLOCKED"
    ) {
      details.push(
        "Normal civil schedule + fixture OTHER_BLOG → OTHER_BLOG_FIXTURE_ALLOWED; inventPublishedVerified=false",
      );
    } else {
      passed = false;
      details.push(
        `Normal fixture OTHER_BLOG schedule unexpected: ${JSON.stringify(normalFixtureSchedule)}`,
      );
    }

    // G28: civil schedule resolves but empty destinationId still refuses.
    const scheduledEmptyId = classifyUnsupportedBlogScheduledPublish({
      destination: {
        ...otherBlog,
        destinationId: "",
        fixtureAvailable: true,
        liveWiring: AdapterLiveStatus.FIXTURE,
      },
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-06-15",
      hour: 9,
      minute: 0,
    });
    if (
      scheduledEmptyId.scheduleOk &&
      scheduledEmptyId.scheduleCode === "SCHEDULE_RESOLVED" &&
      scheduledEmptyId.fireAtIso !== null &&
      !scheduledEmptyId.allowed &&
      scheduledEmptyId.publish.code === "OTHER_BLOG_NO_ADAPTER_UNSUPPORTED" &&
      scheduledEmptyId.inventPublishedVerified === false &&
      scheduledEmptyId.externalEffects === "NONE" &&
      scheduledEmptyId.chatgptAdsAccess === "ACCESS_BLOCKED"
    ) {
      details.push(
        "SCHEDULE_RESOLVED but empty destinationId → OTHER_BLOG_NO_ADAPTER_UNSUPPORTED; never invent PUBLISHED_VERIFIED",
      );
    } else {
      passed = false;
      details.push(`Scheduled empty id unexpected: ${JSON.stringify(scheduledEmptyId)}`);
    }

    // G15: fall-back schedule resolves but preferLive still refused.
    const preferLiveSchedule = classifyUnsupportedBlogScheduledPublish({
      destination: {
        ...otherBlog,
        destinationId: "dest-other-blog-fixture-schedule",
        fixtureAvailable: true,
        liveWiring: AdapterLiveStatus.FIXTURE,
      },
      format: ContentFormat.FULL_ARTICLE,
      timeZone: "America/New_York",
      localDate: "2025-11-02",
      hour: 1,
      minute: 30,
      preferLive: true,
    });
    if (
      preferLiveSchedule.scheduleOk &&
      preferLiveSchedule.scheduleCode === "SCHEDULE_RESOLVED" &&
      preferLiveSchedule.ambiguous === true &&
      !preferLiveSchedule.allowed &&
      preferLiveSchedule.publish.code === "LIVE_WIRE_CLAIM_REFUSED" &&
      preferLiveSchedule.inventPublishedVerified === false &&
      preferLiveSchedule.externalEffects === "NONE" &&
      preferLiveSchedule.chatgptAdsAccess === "ACCESS_BLOCKED"
    ) {
      details.push(
        "DST fall-back + preferLive → LIVE_WIRE_CLAIM_REFUSED; schedule resolve does not unlock live invent",
      );
    } else {
      passed = false;
      details.push(
        `preferLive schedule unexpected: ${JSON.stringify(preferLiveSchedule)}`,
      );
    }

    details.push(
      "liveProviderSuccessClaimed=false externalEffects=NONE catalogClaim=ACCEPTED≠VERIFIED deepen=G33 hillclimb=classify+preferLive+Hub+DST-schedule+paddedId+formatMismatch+invalidCivil+emptyId+malformedDate+badHour+badMinute+springFixture+cmsSchedule+cmsPreferLive+hubScheduled+fixtureOtherBlogFallBack+scheduledFormatMismatch+scheduledPaddedId+scheduledEmptyId+fixtureOtherBlogNormalSchedule+preferLiveNormalOtherBlogSchedule+unsupportedNormalSchedule+hubPreferLiveSchedule+cmsFallBackSchedule",
    );
    return finish(passed, details, nowIso, operationId);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function finish(
  passed: boolean,
  details: string[],
  nowIso: string,
  operationId: string,
): SoakProofRecord {
  return {
    proofId: `proof-unsupported-blog-${randomUUID()}`,
    kind: SoakProofKind.UNSUPPORTED_BLOG_DESTINATION_NO_FAKE_PUBLICATION,
    passed,
    details,
    applyAttemptCount: 1,
    operationId,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
