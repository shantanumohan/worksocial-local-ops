/**
 * Fixture proof for T-US-005 — Map sites, pages and editable sources.
 *
 * Domain + URL boundaries, pilot page source binding, form/CRM destinations,
 * editable subset/exclusions, baseline ID + deterministic checks.
 * External effects: NONE. ACCEPTED ≠ VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  BindingKind,
  SitePageMapDecisionCode,
  SoakProofKind,
  evaluateSitePageEditableSources,
  type SoakProofRecord,
} from "@worksocial/domain";

const HEALTHY_HTML = `<!doctype html>
<html>
<head>
  <title>Pilot contact</title>
  <meta name="description" content="Book a tour at the pilot site." />
  <link rel="canonical" href="https://example.worksocial.local/contact" />
</head>
<body>
  <h1>Contact</h1>
  <p>Reach the team for a workspace tour.</p>
  <form action="/api/forms/contact"><input name="email" /></form>
</body>
</html>`;

/**
 * Complete expected proof set for T-US-005 fixture ACCEPTED.
 */
export function proofSitePageEditableSourcesBaseline(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const healthy = evaluateSitePageEditableSources({
    nowIso,
    domainHostname: "example.worksocial.local",
    allowedUrlPrefixes: ["https://example.worksocial.local/"],
    pilotPageUrl: "https://example.worksocial.local/contact",
    pilotPagePath: "/contact",
    bindingKind: BindingKind.CMS,
    resourceRef: "cms://pages/contact-pilot",
    editablePaths: ["/contact", "/about"],
    excludedPaths: ["/admin"],
    fixtureHtml: HEALTHY_HTML,
  });

  if (
    healthy.ok &&
    healthy.code === SitePageMapDecisionCode.OK &&
    typeof healthy.baselineId === "string" &&
    healthy.baselineId.length === 32 &&
    healthy.releasePathProven &&
    healthy.inventory.formCount === 1 &&
    healthy.inventory.crmCount === 1 &&
    healthy.checks.every((c) => c.passed) &&
    healthy.externalEffects === "NONE" &&
    healthy.liveVerifiedClaimed === false &&
    healthy.fixtureOnly === true
  ) {
    details.push(
      `Healthy map minted baseline ${healthy.baselineId} with proven release path`,
    );
  } else {
    passed = false;
    details.push(`Healthy map unexpectedly ${JSON.stringify(healthy)}`);
  }

  const outside = evaluateSitePageEditableSources({
    nowIso,
    domainHostname: "example.worksocial.local",
    allowedUrlPrefixes: ["https://example.worksocial.local/"],
    pilotPageUrl: "https://evil.example/contact",
    pilotPagePath: "/contact",
    bindingKind: BindingKind.WEBSITE,
    resourceRef: "https://evil.example/contact",
    editablePaths: ["/contact"],
    excludedPaths: [],
    fixtureHtml: HEALTHY_HTML,
  });
  if (
    !outside.ok &&
    outside.code === SitePageMapDecisionCode.DOMAIN_HOST_MISMATCH &&
    outside.baselineId === null
  ) {
    details.push("Foreign host refused — domain mismatch, no baseline ID");
  } else {
    passed = false;
    details.push(`Outside host unexpectedly ${JSON.stringify(outside)}`);
  }

  const pathMismatch = evaluateSitePageEditableSources({
    nowIso,
    domainHostname: "example.worksocial.local",
    allowedUrlPrefixes: ["https://example.worksocial.local/"],
    pilotPageUrl: "https://example.worksocial.local/admin",
    pilotPagePath: "/contact",
    bindingKind: BindingKind.CMS,
    resourceRef: "cms://pages/contact-pilot",
    editablePaths: ["/contact", "/admin"],
    excludedPaths: [],
    fixtureHtml: HEALTHY_HTML,
  });
  if (
    !pathMismatch.ok &&
    pathMismatch.code === SitePageMapDecisionCode.PILOT_PATH_MISMATCH
  ) {
    details.push("Declared path must match pilot URL pathname");
  } else {
    passed = false;
    details.push(`Path mismatch unexpectedly ${JSON.stringify(pathMismatch)}`);
  }

  const segmentLeak = evaluateSitePageEditableSources({
    nowIso,
    domainHostname: "example.worksocial.local",
    allowedUrlPrefixes: ["https://example.worksocial.local/admin"],
    pilotPageUrl: "https://example.worksocial.local/administrator",
    pilotPagePath: "/administrator",
    bindingKind: BindingKind.CMS,
    resourceRef: "cms://pages/administrator",
    editablePaths: ["/administrator"],
    excludedPaths: [],
    fixtureHtml: HEALTHY_HTML.replace(
      "https://example.worksocial.local/contact",
      "https://example.worksocial.local/administrator",
    ),
  });
  if (
    !segmentLeak.ok &&
    segmentLeak.code === SitePageMapDecisionCode.URL_OUTSIDE_BOUNDARY
  ) {
    details.push("Segment-safe boundary rejects /admin prefix vs /administrator");
  } else {
    passed = false;
    details.push(`Segment leak unexpectedly ${JSON.stringify(segmentLeak)}`);
  }

  const wrongCanonical = evaluateSitePageEditableSources({
    nowIso,
    domainHostname: "example.worksocial.local",
    allowedUrlPrefixes: ["https://example.worksocial.local/"],
    pilotPageUrl: "https://example.worksocial.local/contact",
    pilotPagePath: "/contact",
    bindingKind: BindingKind.CMS,
    resourceRef: "cms://pages/contact-pilot",
    editablePaths: ["/contact"],
    excludedPaths: [],
    fixtureHtml: HEALTHY_HTML.replace(
      "https://example.worksocial.local/contact",
      "https://example.worksocial.local/about",
    ),
  });
  if (
    !wrongCanonical.ok &&
    wrongCanonical.code === SitePageMapDecisionCode.CANONICAL_MISMATCH
  ) {
    details.push("Snapshot canonical must match pilot URL");
  } else {
    passed = false;
    details.push(
      `Canonical mismatch unexpectedly ${JSON.stringify(wrongCanonical)}`,
    );
  }

  const notEditable = evaluateSitePageEditableSources({
    nowIso,
    domainHostname: "example.worksocial.local",
    allowedUrlPrefixes: ["https://example.worksocial.local/"],
    pilotPageUrl: "https://example.worksocial.local/contact",
    pilotPagePath: "/contact",
    bindingKind: BindingKind.REPO,
    resourceRef: "repo://site/pages/contact.md",
    editablePaths: ["/about"],
    excludedPaths: [],
    fixtureHtml: HEALTHY_HTML,
  });
  if (
    !notEditable.ok &&
    notEditable.code === SitePageMapDecisionCode.PILOT_NOT_EDITABLE
  ) {
    details.push("Pilot path outside editable subset refused");
  } else {
    passed = false;
    details.push(`Not-editable unexpectedly ${JSON.stringify(notEditable)}`);
  }

  const missingDest = evaluateSitePageEditableSources({
    nowIso,
    domainHostname: "example.worksocial.local",
    allowedUrlPrefixes: ["https://example.worksocial.local/"],
    pilotPageUrl: "https://example.worksocial.local/contact",
    pilotPagePath: "/contact",
    bindingKind: BindingKind.CMS,
    resourceRef: "cms://pages/contact-pilot",
    editablePaths: ["/contact"],
    excludedPaths: [],
    fixtureHtml: HEALTHY_HTML,
    includeCrmMapping: false,
  });
  if (
    !missingDest.ok &&
    missingDest.code === SitePageMapDecisionCode.MISSING_RELEASE_DESTINATIONS
  ) {
    details.push("Missing CRM destination blocks release path");
  } else {
    passed = false;
    details.push(`Missing dest unexpectedly ${JSON.stringify(missingDest)}`);
  }

  const badHtml = evaluateSitePageEditableSources({
    nowIso,
    domainHostname: "example.worksocial.local",
    allowedUrlPrefixes: ["https://example.worksocial.local/"],
    pilotPageUrl: "https://example.worksocial.local/contact",
    pilotPagePath: "/contact",
    bindingKind: BindingKind.CMS,
    resourceRef: "cms://pages/contact-pilot",
    editablePaths: ["/contact"],
    excludedPaths: [],
    fixtureHtml: "<html><body>x</body></html>",
  });
  if (
    !badHtml.ok &&
    badHtml.code === SitePageMapDecisionCode.BASELINE_CHECKS_FAILED &&
    badHtml.checks.some((c) => !c.passed)
  ) {
    details.push("Failing deterministic page checks block baseline ID");
  } else {
    passed = false;
    details.push(`Bad HTML unexpectedly ${JSON.stringify(badHtml)}`);
  }

  const unproven = evaluateSitePageEditableSources({
    nowIso,
    domainHostname: "example.worksocial.local",
    allowedUrlPrefixes: ["https://example.worksocial.local/"],
    pilotPageUrl: "https://example.worksocial.local/contact",
    pilotPagePath: "/contact",
    bindingKind: BindingKind.CMS,
    resourceRef: "cms://pages/contact-pilot",
    editablePaths: ["/contact"],
    excludedPaths: [],
    fixtureHtml: HEALTHY_HTML,
    skipOwnershipProof: true,
  });
  if (
    !unproven.ok &&
    unproven.code === SitePageMapDecisionCode.RELEASE_PATH_UNPROVEN &&
    unproven.releasePathProven === false
  ) {
    details.push("Unproven ownership refuses release path / baseline");
  } else {
    passed = false;
    details.push(`Unproven unexpectedly ${JSON.stringify(unproven)}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-site-page-map-${randomUUID()}`,
    kind: SoakProofKind.SITE_PAGE_EDITABLE_SOURCES_BASELINE,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-us005-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
