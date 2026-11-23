import { describe, expect, it } from "vitest";
import {
  BindingKind,
  SitePageMapDecisionCode,
  evaluateSitePageEditableSources,
} from "./site-page-editable-sources.js";

const NOW = "2026-11-22T21:00:00.000Z";

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

function healthyInput(
  overrides: Partial<Parameters<typeof evaluateSitePageEditableSources>[0]> = {},
) {
  return {
    nowIso: NOW,
    domainHostname: "example.worksocial.local",
    allowedUrlPrefixes: ["https://example.worksocial.local/"],
    pilotPageUrl: "https://example.worksocial.local/contact",
    pilotPagePath: "/contact",
    bindingKind: BindingKind.CMS,
    resourceRef: "cms://pages/contact-pilot",
    editablePaths: ["/contact", "/about"],
    excludedPaths: ["/admin", "/drafts"],
    fixtureHtml: HEALTHY_HTML,
    ...overrides,
  };
}

describe("evaluateSitePageEditableSources", () => {
  it("mints baseline ID when mapping, destinations, and checks pass", () => {
    const decision = evaluateSitePageEditableSources(healthyInput());
    expect(decision.ok).toBe(true);
    expect(decision.code).toBe(SitePageMapDecisionCode.OK);
    expect(decision.baselineId).toMatch(/^[a-f0-9]{32}$/);
    expect(decision.releasePathProven).toBe(true);
    expect(decision.releasePathId).toBe("wp-form-to-crm");
    expect(decision.mapping?.forms[0]?.pageAssetId).toBe("page-contact");
    expect(decision.mapping?.writePaths[0]?.assetId).toBe("page-contact");
    expect(decision.inventory.bindingCount).toBe(1);
    expect(decision.inventory.formCount).toBe(1);
    expect(decision.inventory.crmCount).toBe(1);
    expect(decision.inventory.sourceKind).toBe(BindingKind.CMS);
    expect(decision.checks.every((c) => c.passed)).toBe(true);
    expect(decision.journeyStages).toEqual(["page", "form", "handler", "crm"]);
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.liveVerifiedClaimed).toBe(false);
    expect(decision.snapshot?.measurementMode).toBe("FIXTURE");
  });

  it("fails closed when pilot URL is outside boundaries or segment-prefix leaks", () => {
    const outside = evaluateSitePageEditableSources(
      healthyInput({
        pilotPageUrl: "https://other.example/contact",
        domainHostname: "other.example",
        allowedUrlPrefixes: ["https://example.worksocial.local/"],
      }),
    );
    expect(outside.ok).toBe(false);
    expect(outside.code).toBe(SitePageMapDecisionCode.DOMAIN_HOST_MISMATCH);

    const segmentLeak = evaluateSitePageEditableSources(
      healthyInput({
        allowedUrlPrefixes: ["https://example.worksocial.local/admin"],
        pilotPageUrl: "https://example.worksocial.local/administrator",
        pilotPagePath: "/administrator",
        editablePaths: ["/administrator"],
        fixtureHtml: HEALTHY_HTML.replace(
          "https://example.worksocial.local/contact",
          "https://example.worksocial.local/administrator",
        ),
      }),
    );
    expect(segmentLeak.ok).toBe(false);
    expect(segmentLeak.code).toBe(SitePageMapDecisionCode.URL_OUTSIDE_BOUNDARY);
  });

  it("fails closed when authorized domain does not own boundary/pilot hosts", () => {
    const decision = evaluateSitePageEditableSources(
      healthyInput({
        domainHostname: "authorized.example",
      }),
    );
    expect(decision.ok).toBe(false);
    expect(decision.code).toBe(SitePageMapDecisionCode.DOMAIN_HOST_MISMATCH);
  });

  it("fails closed when declared path disagrees with pilot URL pathname", () => {
    const decision = evaluateSitePageEditableSources(
      healthyInput({
        pilotPagePath: "/contact",
        pilotPageUrl: "https://example.worksocial.local/admin",
        editablePaths: ["/contact", "/admin"],
      }),
    );
    expect(decision.ok).toBe(false);
    expect(decision.code).toBe(SitePageMapDecisionCode.PILOT_PATH_MISMATCH);
  });

  it("fails closed when pilot path is excluded or not editable", () => {
    const excluded = evaluateSitePageEditableSources(
      healthyInput({
        excludedPaths: ["/contact"],
      }),
    );
    expect(excluded.code).toBe(SitePageMapDecisionCode.PILOT_EXCLUDED);

    const notEditable = evaluateSitePageEditableSources(
      healthyInput({
        editablePaths: ["/about"],
      }),
    );
    expect(notEditable.code).toBe(SitePageMapDecisionCode.PILOT_NOT_EDITABLE);
  });

  it("fails closed without source binding or release destinations", () => {
    const noBinding = evaluateSitePageEditableSources(
      healthyInput({ resourceRef: "  " }),
    );
    expect(noBinding.code).toBe(SitePageMapDecisionCode.NO_SOURCE_BINDING);

    const noCrm = evaluateSitePageEditableSources(
      healthyInput({ includeCrmMapping: false }),
    );
    expect(noCrm.code).toBe(
      SitePageMapDecisionCode.MISSING_RELEASE_DESTINATIONS,
    );
  });

  it("fails closed when baseline HTML checks fail or canonical mismatches", () => {
    const badHtml = evaluateSitePageEditableSources(
      healthyInput({
        fixtureHtml: "<html><body>tiny</body></html>",
      }),
    );
    expect(badHtml.ok).toBe(false);
    expect(badHtml.code).toBe(SitePageMapDecisionCode.BASELINE_CHECKS_FAILED);

    const wrongCanonical = evaluateSitePageEditableSources(
      healthyInput({
        fixtureHtml: HEALTHY_HTML.replace(
          "https://example.worksocial.local/contact",
          "https://example.worksocial.local/about",
        ),
      }),
    );
    expect(wrongCanonical.ok).toBe(false);
    expect(wrongCanonical.code).toBe(SitePageMapDecisionCode.CANONICAL_MISMATCH);
  });

  it("rewrites release-path assets to the supplied pilot page", () => {
    const decision = evaluateSitePageEditableSources(
      healthyInput({
        pilotPageUrl: "https://example.worksocial.local/tours",
        pilotPagePath: "/tours",
        editablePaths: ["/tours"],
        fixtureHtml: HEALTHY_HTML.replace(
          "https://example.worksocial.local/contact",
          "https://example.worksocial.local/tours",
        ).replace("<h1>Contact</h1>", "<h1>Tours</h1>"),
      }),
    );
    expect(decision.ok).toBe(true);
    expect(decision.mapping?.forms[0]?.pageAssetId).toBe("page-tours");
    expect(decision.mapping?.forms[0]?.handlerEndpoint).toBe(
      "https://example.worksocial.local/api/forms/contact",
    );
    expect(decision.mapping?.writePaths[0]?.assetId).toBe("page-tours");
    expect(decision.mapping?.sites[0]).toContain("example.worksocial.local");
  });

  it("fails closed when ownership proof is skipped", () => {
    const decision = evaluateSitePageEditableSources(
      healthyInput({ skipOwnershipProof: true }),
    );
    expect(decision.ok).toBe(false);
    expect(decision.code).toBe(SitePageMapDecisionCode.RELEASE_PATH_UNPROVEN);
    expect(decision.releasePathProven).toBe(false);
  });
});
