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
 * DST civil schedule gaps still refuse fake OTHER_BLOG publication (G11).
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

    details.push(
      "liveProviderSuccessClaimed=false externalEffects=NONE catalogClaim=ACCEPTED≠VERIFIED deepen=G11 hillclimb=classify+preferLive+Hub+DST-schedule",
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
