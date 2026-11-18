/**
 * Fixture golden pages + semantic catalog for R1-07.
 * Offline only — no live CMS reads or publishes.
 */

import {
  AdapterWiring,
  AuditDimension,
  AuditSeverity,
  BindingKind,
  ConnectionState,
  DEFAULT_PILOT_EVIDENCE_KINDS,
  SeoChangeKind,
  SeoProposalStatus,
  SupportLabel,
  VerificationState,
  WriteReadiness,
  createPageAudit,
  createSeoProposal,
  proveFixturePilotWritePath,
  type PageAuditRecord,
  type ProductionMappingState,
  type SemanticSearchIndex,
  type SeoChangeProposal,
  type SourceBinding,
  type PilotWritePath,
} from "@worksocial/domain";

export const SEO_PILOT_PAGE_ASSET_ID = "page-home" as const;
export const SEO_PILOT_WRITE_PATH_ID = "wp-seo-page-publish" as const;
export const SEO_PILOT_BINDING_ID = "bind-seo-home" as const;
export const SEO_GOLDEN_VISIBLE_CONTENT =
  "WorkSocial Jersey City coworking and meeting rooms. Day pass and training spaces near Exchange Place." as const;

/** Golden page audits used by contract/unit suites. */
export function buildGoldenPageAudits(nowIso: string): PageAuditRecord[] {
  return [
    createPageAudit({
      pageAuditId: "golden-audit-home",
      pageAssetId: SEO_PILOT_PAGE_ASSET_ID,
      siteId: "worksocial-pilot",
      pagePath: "/",
      displayName: "Home (golden)",
      findings: [
        {
          findingId: "gf-title",
          dimension: AuditDimension.METADATA,
          severity: AuditSeverity.WARNING,
          code: "TITLE_GENERIC",
          message: "Title can better match day-pass intent",
          relatedFactId: null,
        },
        {
          findingId: "gf-schema",
          dimension: AuditDimension.SCHEMA,
          severity: AuditSeverity.INFO,
          code: "SCHEMA_ABSENT",
          message: "No LocalBusiness schema on fixture page",
          relatedFactId: null,
        },
      ],
      fixtureOnly: true,
      createdAtIso: nowIso,
    }),
    createPageAudit({
      pageAuditId: "golden-audit-rooms",
      pageAssetId: "page-rooms",
      siteId: "worksocial-pilot",
      pagePath: "/rooms",
      displayName: "Rooms (golden)",
      findings: [
        {
          findingId: "gf-canonical",
          dimension: AuditDimension.CANONICAL,
          severity: AuditSeverity.ERROR,
          code: "CANONICAL_SELF_REF_MISSING",
          message: "Self-referencing canonical missing in fixture HTML",
          relatedFactId: null,
        },
      ],
      fixtureOnly: true,
      createdAtIso: nowIso,
    }),
    createPageAudit({
      pageAuditId: "golden-audit-healthy",
      pageAssetId: "page-about",
      siteId: "worksocial-pilot",
      pagePath: "/about",
      displayName: "About (golden healthy)",
      findings: [],
      fixtureOnly: true,
      createdAtIso: nowIso,
    }),
  ];
}

export function buildGoldenProposals(nowIso: string): SeoChangeProposal[] {
  return [
    createSeoProposal({
      proposalId: "golden-prop-title",
      pageAssetId: SEO_PILOT_PAGE_ASSET_ID,
      pageAuditId: "golden-audit-home",
      changeKind: SeoChangeKind.METADATA,
      title: "Improve home title for day-pass intent",
      summary: "Align title with supported day-pass offering",
      proposedFields: {
        title: "WorkSocial Jersey City | Day pass coworking & meeting rooms",
        description:
          "Book a day pass or meeting room at WorkSocial Jersey City near Exchange Place.",
      },
      citedFactIds: ["fixture-fact-hours"],
      hypothesisFactIds: ["fixture-fact-hypothesis"],
      fixtureOnly: true,
      createdAtIso: nowIso,
      status: SeoProposalStatus.READY_FOR_REVIEW,
    }),
    createSeoProposal({
      proposalId: "golden-prop-schema",
      pageAssetId: SEO_PILOT_PAGE_ASSET_ID,
      pageAuditId: "golden-audit-home",
      changeKind: SeoChangeKind.SCHEMA,
      title: "Emit LocalBusiness schema from SUPPORTED facts",
      summary: "Structured data must match visible content and SUPPORTED facts",
      proposedFields: {
        "@type": "LocalBusiness",
        name: "WorkSocial",
      },
      citedFactIds: ["fixture-fact-hours"],
      fixtureOnly: true,
      createdAtIso: nowIso,
      status: SeoProposalStatus.DRAFT,
    }),
  ];
}

export function buildFixtureSearchIndex(nowIso: string): SemanticSearchIndex {
  return {
    indexId: "fixture-semantic-v1",
    version: 1,
    updatedAtIso: nowIso,
    fixtureOnly: true,
    entries: [
      {
        entryId: "fixture-room-boardroom",
        name: "Hudson Boardroom",
        category: "Meeting",
        capacity: 8,
        location: "Jersey City",
        amenities: ["display", "whiteboard"],
        sourcePageId: "page-rooms",
        groundedFactIds: ["fixture-fact-hours"],
        inaccessible: false,
        priceKnown: false,
        priceLabel: null,
        fixtureOnly: true,
      },
      {
        entryId: "fixture-room-training",
        name: "Exchange Training Room",
        category: "Training",
        capacity: 20,
        location: "Jersey City",
        amenities: ["display", "video", "whiteboard"],
        sourcePageId: "page-rooms",
        groundedFactIds: ["fixture-fact-hours"],
        inaccessible: false,
        priceKnown: true,
        priceLabel: "contact for quote",
        fixtureOnly: true,
      },
      {
        entryId: "fixture-room-inaccessible",
        name: "Rooftop (fixture inaccessible)",
        category: "Event",
        capacity: 40,
        location: "Jersey City",
        amenities: ["display"],
        sourcePageId: "page-rooms",
        groundedFactIds: [],
        inaccessible: true,
        priceKnown: false,
        priceLabel: null,
        fixtureOnly: true,
      },
    ],
  };
}

/**
 * Fixture production mapping for SEO pilot page publish.
 * Ownership starts unproven until proveFixtureSeoWritePath runs.
 */
export function createFixtureSeoPilotMapping(nowIso: string): {
  state: ProductionMappingState;
  writePathId: string;
} {
  const siteId = "worksocial-pilot";
  const binding: SourceBinding = {
    bindingId: SEO_PILOT_BINDING_ID,
    siteId,
    kind: BindingKind.WEBSITE,
    resourceRef: "https://example.worksocial.local/",
    displayName: "Pilot home page (SEO fixture)",
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

  const writePath: PilotWritePath = {
    writePathId: SEO_PILOT_WRITE_PATH_ID,
    channelId: "owned-site",
    assetId: SEO_PILOT_PAGE_ASSET_ID,
    operation: "publish_page",
    siteId,
    bindingId: SEO_PILOT_BINDING_ID,
    formId: null,
    bookingOwnershipId: null,
    crmOwnershipId: null,
    requiredEvidenceKinds: [...DEFAULT_PILOT_EVIDENCE_KINDS],
    createdAtIso: nowIso,
  };

  return {
    writePathId: SEO_PILOT_WRITE_PATH_ID,
    state: {
      version: 1,
      sites: [siteId],
      bindings: [binding],
      forms: [],
      bookingOwnership: [],
      crmOwnership: [],
      writePaths: [writePath],
      journeys: [
        {
          journeyId: "journey-seo-page-release",
          siteId,
          displayName: "SEO pilot page release (fixture)",
          stages: ["audit", "proposal", "schema", "gateway", "read_back"],
          writePathIds: [SEO_PILOT_WRITE_PATH_ID],
          createdAtIso: nowIso,
        },
      ],
      readEvidence: [],
      writePathOutcomes: [],
      updatedAt: nowIso,
    },
  };
}

/** Apply fixture read evidence + ownership for the SEO publish path. */
export function proveFixtureSeoWritePath(
  state: ProductionMappingState,
  nowIso: string,
): ProductionMappingState {
  return proveFixturePilotWritePath(state, SEO_PILOT_WRITE_PATH_ID, nowIso);
}

export function buildFixtureSeoSeed(nowIso: string): {
  audits: PageAuditRecord[];
  proposals: SeoChangeProposal[];
  searchIndex: SemanticSearchIndex;
  factLabels: Map<string, (typeof SupportLabel)[keyof typeof SupportLabel]>;
  visibleContent: string;
} {
  return {
    audits: buildGoldenPageAudits(nowIso),
    proposals: buildGoldenProposals(nowIso),
    searchIndex: buildFixtureSearchIndex(nowIso),
    factLabels: new Map([
      ["fixture-fact-hours", SupportLabel.SUPPORTED],
      ["fixture-fact-hypothesis", SupportLabel.HYPOTHESIS],
    ]),
    visibleContent: SEO_GOLDEN_VISIBLE_CONTENT,
  };
}
