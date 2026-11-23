/**
 * Fixture proof for T-X046 — unsupported blog destination / no fake publication.
 *
 * Drives content `runCanonicalDistribution` with an unsupported destination id
 * (not dest-cms / dest-gbp / dest-linkedin). Orchestration must persist
 * FAILED + UNSUPPORTED_ACTION with null receipt/remote — never invent
 * PUBLISHED_VERIFIED. Secondary domain checks: fixtureAvailable=false release
 * gate; ChatGPT Hub full-blog format rejected. External effects: NONE.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
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
  createCanonicalArticle,
  createDestinationVariant,
  evaluateVariantReleaseGate,
  type DestinationRegistryEntry,
  type SoakProofRecord,
} from "@worksocial/domain";
import {
  createDemoContentDistributionGrants,
  createDurableExecutionService,
  createFileContentStore,
  createMemoryDurableStores,
} from "@worksocial/persistence";

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
    const hubBlog = createDestinationVariant({
      variantId: `var-hub-${operationId.slice(-8)}`,
      campaignId: approved.article.campaignId,
      article: approved.article,
      destination: chatgptHubDestination(),
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

    // Positive control: owned CMS draft still allowed.
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
      fixtureOnly: true,
      createdAtIso: nowIso,
    });
    if (cmsDraft.ok) {
      details.push("Positive control: owned CMS full-article draft allowed");
    } else {
      passed = false;
      details.push(`CMS positive control failed: ${JSON.stringify(cmsDraft)}`);
    }

    details.push(
      "liveProviderSuccessClaimed=false externalEffects=NONE catalogClaim=ACCEPTED≠VERIFIED",
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
