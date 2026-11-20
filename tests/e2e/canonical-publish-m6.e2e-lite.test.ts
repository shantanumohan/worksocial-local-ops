/**
 * E2E-lite (offline): M6 authoring → claim QA → review bind → approve →
 * multi-destination fixture distribute with recovery. Not live publish.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ArticleStatus,
  DestinationAttemptStatus,
  DistributionRunStatus,
  OperatingMode,
  SupportLabel,
  defaultDestinationRegistry,
} from "@worksocial/domain";
import {
  createDemoContentDistributionGrants,
  createFileContentStore,
} from "@worksocial/persistence";
import { createActionGateway } from "@worksocial/action-gateway";
import { createContentService } from "@worksocial/content";

const dirs: string[] = [];
const now = "2026-11-20T17:00:00.000Z";
const labels = new Map([["fixture-fact-hours", SupportLabel.SUPPORTED]]);

afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

describe("e2e-lite: M6 canonical + GBP/social publish", () => {
  it("completes owned-site + GBP + LinkedIn with durable keys and recovery evidence", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-m6-e2e-"));
    dirs.push(dir);
    const store = createFileContentStore(dir);
    store.setDestinations(defaultDestinationRegistry());
    const service = createContentService(store, {
      gateway: createActionGateway(),
    });

    const campaign = service.createCampaign({
      title: "E2E M6",
      topic: "training",
      audienceNeed: "rooms",
      practicalValue: "checklist",
      intendedAction: "book",
      nowIso: now,
    });
    const draft = service.createArticle({
      campaignId: campaign.campaignId,
      title: "E2E article",
      body: "Training room checklist with verified hours.",
      authorId: "author-a13",
      citedFactIds: ["fixture-fact-hours"],
      nowIso: now,
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    expect(
      service.canonicalPublish.recordClaimSourceQa({
        articleId: draft.article.articleId,
        claims: [
          {
            claimId: "e2e-c1",
            factId: "fixture-fact-hours",
            sourceRef: "src-e2e",
            statement: "Verified hours",
          },
        ],
        factLabels: labels,
        nowIso: now,
      }).ok,
    ).toBe(true);

    expect(
      service.canonicalPublish.bindIndependentReview({
        articleId: draft.article.articleId,
        nowIso: now,
      }).ok,
    ).toBe(true);

    expect(
      service.recordQaVerdict({
        articleId: draft.article.articleId,
        authorId: "author-a13",
        reviewerId: "reviewer-a25",
        approved: true,
        nowIso: now,
      }).ok,
    ).toBe(true);

    const approved = service.approveArticle({
      articleId: draft.article.articleId,
      factLabels: labels,
      nowIso: now,
    });
    expect(approved.article?.status).toBe(ArticleStatus.APPROVED);

    const mapping = service.seedAndProveContentMapping(now);
    const grants = createDemoContentDistributionGrants(now, {
      assetId: approved.article!.articleId,
      contentRevision: approved.article!.contentDigest,
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

    const unknown = await service.canonicalPublish.runCanonicalDistribution({
      articleId: approved.article!.articleId,
      authority,
      productionMapping: mapping.mapping,
      factLabels: labels,
      forceGbpUnknown: true,
      nowIso: now,
    });
    expect(unknown.run.status).toBe(DistributionRunStatus.PARTIAL);
    const gbp = unknown.run.attempts.find(
      (a) => (a as { destinationId: string }).destinationId === "dest-gbp",
    ) as { status: string; operationKey: string };
    expect(gbp.status).toBe(DestinationAttemptStatus.UNKNOWN_REMOTE);
    expect(gbp.operationKey).toContain("biz-content");

    const recovered = await service.canonicalPublish.recoverDistribution({
      runId: unknown.run.runId,
      authority,
      productionMapping: mapping.mapping,
      factLabels: labels,
      nowIso: now,
    });
    const gbpAfter = recovered.run!.attempts.find(
      (a) => (a as { destinationId: string }).destinationId === "dest-gbp",
    ) as { status: string };
    expect(gbpAfter.status).toBe(DestinationAttemptStatus.VERIFIED);

    const cms = recovered.run!.attempts.find(
      (a) => (a as { destinationId: string }).destinationId === "dest-cms",
    ) as { status: string };
    expect(cms.status).toBe(DestinationAttemptStatus.VERIFIED);
  });
});
