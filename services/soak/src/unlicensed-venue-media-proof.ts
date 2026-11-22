/**
 * Fixture proof for T-X044 — Unlicensed venue media: publish blocked.
 *
 * Exercises the content `releaseCanonical` boundary with venueMedia attached.
 * Unlicensed media blocks before gateway (no receipt / no provider mutate).
 * Licensed + cleared + owner-approved is the positive control at this gate.
 * External effects: NONE.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  ArticleStatus,
  OperatingMode,
  SoakProofKind,
  SupportLabel,
  VenueMediaLicenseStatus,
  evaluateVenueMediaPublishGate,
  type SoakProofRecord,
} from "@worksocial/domain";
import {
  createDemoContentDistributionGrants,
  createFileContentStore,
} from "@worksocial/persistence";
import { createActionGateway } from "@worksocial/action-gateway";
import {
  CONTENT_PILOT_ARTICLE_ID,
  createContentService,
  goldenArticleContentDigest,
} from "@worksocial/content";

/**
 * Complete expected proof set for T-X044 fixture ACCEPTED.
 */
export function proofUnlicensedVenueMediaPublishBlocked(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const dir = mkdtempSync(join(tmpdir(), "ws-soak-tx044-"));

  try {
    const store = createFileContentStore(dir);
    const gateway = createActionGateway();
    const service = createContentService(store, { gateway });
    service.seedFixtures(nowIso);
    service.approveArticle({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      factLabels: new Map([
        ["fixture-fact-hours", SupportLabel.SUPPORTED],
        ["fixture-fact-hypothesis", SupportLabel.HYPOTHESIS],
      ]),
      nowIso,
    });
    const { mapping } = service.seedAndProveContentMapping(nowIso);
    const grants = createDemoContentDistributionGrants(nowIso, {
      assetId: CONTENT_PILOT_ARTICLE_ID,
      contentRevision: goldenArticleContentDigest(),
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
    };
    const factLabels = new Map([
      ["fixture-fact-hours", SupportLabel.SUPPORTED],
      ["fixture-fact-hypothesis", SupportLabel.HYPOTHESIS],
    ]);

    // 1. Domain evaluator: unlicensed → blocked.
    const unlicensedEval = evaluateVenueMediaPublishGate({
      mediaAssetId: "venue-lobby-unlicensed",
      licenseStatus: VenueMediaLicenseStatus.UNLICENSED,
      rightsCleared: false,
      ownerApproved: false,
    });
    if (
      !unlicensedEval.allowed &&
      unlicensedEval.code === "UNLICENSED_MEDIA" &&
      unlicensedEval.publishBlocked
    ) {
      details.push("Domain: unlicensed venue media → UNLICENSED_MEDIA");
    } else {
      passed = false;
      details.push(`Domain unlicensed failed: ${JSON.stringify(unlicensedEval)}`);
    }

    // 2. releaseCanonical with unlicensed media → no gateway / no receipt.
    const blocked = service.releaseCanonical({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      authority,
      productionMapping: mapping,
      factLabels,
      nowIso,
      venueMedia: [
        {
          mediaAssetId: "venue-lobby-unlicensed",
          licenseStatus: VenueMediaLicenseStatus.UNLICENSED,
          rightsCleared: false,
          ownerApproved: false,
        },
      ],
    });
    if (
      blocked.gatewayDecision === null &&
      blocked.receipt === null &&
      blocked.article?.status === ArticleStatus.APPROVED &&
      blocked.details.some((d) => /UNLICENSED_MEDIA/.test(d))
    ) {
      details.push(
        "releaseCanonical: unlicensed venueMedia → publish blocked before gateway (receipt=null)",
      );
    } else {
      passed = false;
      details.push(
        `releaseCanonical unlicensed failed: gateway=${blocked.gatewayDecision !== null} receipt=${blocked.receipt !== null} details=${JSON.stringify(blocked.details)}`,
      );
    }

    // 3. Unknown / expired / pending / invented still blocked at domain + release.
    for (const [status, code] of [
      [VenueMediaLicenseStatus.UNKNOWN, "LICENSE_UNKNOWN"],
      [VenueMediaLicenseStatus.EXPIRED, "LICENSE_EXPIRED"],
      [VenueMediaLicenseStatus.PENDING_CLEARANCE, "PENDING_CLEARANCE"],
    ] as const) {
      const decision = evaluateVenueMediaPublishGate({
        mediaAssetId: `venue-${status}`,
        licenseStatus: status,
        rightsCleared: true,
        ownerApproved: true,
      });
      if (!decision.allowed && decision.code === code) {
        details.push(`Domain: ${status} → ${code}`);
      } else {
        passed = false;
        details.push(`${status} domain failed: ${JSON.stringify(decision)}`);
      }
    }

    const inventedRelease = service.releaseCanonical({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      authority,
      productionMapping: mapping,
      factLabels,
      nowIso,
      venueMedia: [
        {
          mediaAssetId: "ai-lobby-render",
          licenseStatus: VenueMediaLicenseStatus.LICENSED,
          rightsCleared: true,
          ownerApproved: true,
          inventedOrStockWithoutApproval: true,
        },
      ],
    });
    if (
      inventedRelease.receipt === null &&
      inventedRelease.gatewayDecision === null &&
      inventedRelease.details.some((d) => /UNAPPROVED_INVENTED_MEDIA/.test(d))
    ) {
      details.push(
        "releaseCanonical: invented/stock without approval → UNAPPROVED_INVENTED_MEDIA blocked",
      );
    } else {
      passed = false;
      details.push(
        `Invented release failed: ${JSON.stringify(inventedRelease.details)}`,
      );
    }

    // 4. Positive control: licensed + cleared + approved reaches beyond media gate
    //    (gateway may still apply; receipt allowed). Count only media-gate pass.
    const allowed = service.releaseCanonical({
      articleId: CONTENT_PILOT_ARTICLE_ID,
      authority,
      productionMapping: mapping,
      factLabels,
      nowIso,
      venueMedia: [
        {
          mediaAssetId: "venue-lobby-approved",
          licenseStatus: VenueMediaLicenseStatus.LICENSED,
          rightsCleared: true,
          ownerApproved: true,
        },
      ],
    });
    const mediaGatePassed = allowed.details.some((d) =>
      /licensed and cleared|publish gate open/i.test(d),
    );
    const notMediaBlocked = !allowed.details.some((d) =>
      /Venue media publish blocked/i.test(d),
    );
    if (mediaGatePassed && notMediaBlocked) {
      details.push(
        "Positive control: licensed + rights cleared + owner approved → media gate open at releaseCanonical",
      );
    } else {
      passed = false;
      details.push(
        `Positive control failed: ${JSON.stringify(allowed.details)}`,
      );
    }

    // Unlicensed / invented paths must not produce receipts.
    if (blocked.receipt !== null || inventedRelease.receipt !== null) {
      passed = false;
      details.push("Unlicensed/invented path unexpectedly produced a receipt");
    }

    details.push(`proofClock=${nowIso}`);
    details.push("liveProviderSuccessClaimed=false externalEffects=NONE");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  return {
    proofId: `proof-unlicensed-venue-media-${randomUUID()}`,
    kind: SoakProofKind.UNLICENSED_VENUE_MEDIA_PUBLISH_BLOCKED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx044-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
