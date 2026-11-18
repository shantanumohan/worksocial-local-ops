import { describe, expect, it } from "vitest";
import { SupportLabel } from "./knowledge.js";
import { OutcomeEvidenceSource } from "./production-mapping.js";
import {
  AuditDimension,
  AuditSeverity,
  SchemaValidationVerdict,
  SeoChangeKind,
  SeoProposalStatus,
  SeoReleaseDecision,
  applySeoReleaseVerification,
  createPageAudit,
  createSeoProposal,
  emptySeoState,
  evaluateProposalGate,
  parseSearchConstraints,
  runSemanticSearch,
  validateSchemaOrg,
  type SemanticSearchIndex,
} from "./seo.js";

const now = "2026-11-18T15:00:00.000Z";

describe("seo domain — page audits", () => {
  it("derives blocked status from blocker findings", () => {
    const audit = createPageAudit({
      pageAuditId: "audit-1",
      pageAssetId: "page-home",
      siteId: "worksocial-pilot",
      pagePath: "/",
      displayName: "Home",
      findings: [
        {
          findingId: "f1",
          dimension: AuditDimension.CANONICAL,
          severity: AuditSeverity.BLOCKER,
          code: "CANONICAL_MISSING",
          message: "No canonical link",
          relatedFactId: null,
        },
      ],
      fixtureOnly: true,
      createdAtIso: now,
    });
    expect(audit.status).toBe("blocked");
    expect(audit.score).toBeLessThan(70);
  });
});

describe("seo domain — schema validation", () => {
  it("rejects HYPOTHESIS facts as schema truth", () => {
    const result = validateSchemaOrg({
      validationId: "val-1",
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: "WorkSocial Jersey City" },
          citedFactIds: ["fact-hyp"],
        },
      ],
      visibleContent: "WorkSocial Jersey City coworking and meeting rooms",
      factLabels: new Map([["fact-hyp", SupportLabel.HYPOTHESIS]]),
      fixtureOnly: true,
      createdAtIso: now,
    });
    expect(result.verdict).toBe(SchemaValidationVerdict.FAIL);
    expect(result.issues.some((i) => i.code === "SCHEMA_HYPOTHESIS_NOT_TRUTH")).toBe(
      true,
    );
  });

  it("passes when SUPPORTED facts agree with visible content", () => {
    const result = validateSchemaOrg({
      validationId: "val-2",
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: "WorkSocial" },
          citedFactIds: ["fact-ok"],
        },
      ],
      visibleContent: "Welcome to WorkSocial in Jersey City",
      factLabels: new Map([["fact-ok", SupportLabel.SUPPORTED]]),
      fixtureOnly: true,
      createdAtIso: now,
    });
    expect(result.verdict).toBe(SchemaValidationVerdict.PASS);
    expect(result.agreesWithVisibleContent).toBe(true);
  });
});

describe("seo domain — proposal gates", () => {
  it("blocks release when cited facts are not SUPPORTED", () => {
    const proposal = createSeoProposal({
      proposalId: "prop-1",
      pageAssetId: "page-home",
      changeKind: SeoChangeKind.CONTENT,
      title: "Improve FAQ",
      summary: "Add parking answer",
      proposedFields: { faq: "Parking is available nearby" },
      citedFactIds: ["fact-hyp"],
      fixtureOnly: true,
      createdAtIso: now,
      status: SeoProposalStatus.APPROVED,
    });
    const gate = evaluateProposalGate({
      proposal,
      factLabels: new Map([["fact-hyp", SupportLabel.HYPOTHESIS]]),
    });
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe("PROPOSAL_GATE_FAILED");
  });

  it("requires schema validation for schema changes", () => {
    const proposal = createSeoProposal({
      proposalId: "prop-2",
      pageAssetId: "page-home",
      changeKind: SeoChangeKind.SCHEMA,
      title: "Add LocalBusiness",
      summary: "Emit schema",
      proposedFields: { "@type": "LocalBusiness" },
      citedFactIds: ["fact-ok"],
      fixtureOnly: true,
      createdAtIso: now,
      status: SeoProposalStatus.APPROVED,
    });
    const missing = evaluateProposalGate({
      proposal,
      factLabels: new Map([["fact-ok", SupportLabel.SUPPORTED]]),
    });
    expect(missing.allowed).toBe(false);

    const validation = validateSchemaOrg({
      validationId: "val-3",
      pageAssetId: "page-home",
      proposalId: proposal.proposalId,
      nodes: [
        {
          nodeId: "n1",
          schemaType: "LocalBusiness",
          properties: { name: "WorkSocial" },
          citedFactIds: ["fact-ok"],
        },
      ],
      visibleContent: "WorkSocial",
      factLabels: new Map([["fact-ok", SupportLabel.SUPPORTED]]),
      fixtureOnly: true,
      createdAtIso: now,
    });
    const ok = evaluateProposalGate({
      proposal,
      factLabels: new Map([["fact-ok", SupportLabel.SUPPORTED]]),
      schemaValidation: validation,
    });
    expect(ok.allowed).toBe(true);
  });
});

describe("seo domain — semantic search", () => {
  const index: SemanticSearchIndex = {
    indexId: "idx-1",
    version: 1,
    updatedAtIso: now,
    fixtureOnly: true,
    entries: [
      {
        entryId: "room-8",
        name: "Hudson Boardroom",
        category: "Meeting",
        capacity: 8,
        location: "Jersey City",
        amenities: ["display", "whiteboard"],
        sourcePageId: "page-rooms",
        groundedFactIds: ["fact-capacity-8"],
        inaccessible: false,
        priceKnown: false,
        priceLabel: null,
        fixtureOnly: true,
      },
      {
        entryId: "room-20",
        name: "Exchange Training",
        category: "Training",
        capacity: 20,
        location: "Jersey City",
        amenities: ["display", "video"],
        sourcePageId: "page-training",
        groundedFactIds: ["fact-capacity-20"],
        inaccessible: false,
        priceKnown: true,
        priceLabel: "contact for quote",
        fixtureOnly: true,
      },
    ],
  };

  it("parses capacity and amenities", () => {
    const c = parseSearchConstraints(
      "A meeting room for 8 people with a display in Jersey City",
    );
    expect(c.people).toBe(8);
    expect(c.category).toBe("Meeting");
    expect(c.location).toBe("Jersey City");
    expect(c.requiredAmenities).toContain("display");
  });

  it("returns honest no-match for unknown constraints", () => {
    const result = runSemanticSearch({
      queryId: "q1",
      rawQuery: "Accessible meeting room with parking",
      index,
      createdAtIso: now,
    });
    expect(result.hits).toHaveLength(0);
    expect(result.noMatchReason).toMatch(/Unsupported/);
  });

  it("filters by hard constraints before ranking", () => {
    const result = runSemanticSearch({
      queryId: "q2",
      rawQuery: "Training room for 20 in Jersey City with video",
      index,
      createdAtIso: now,
    });
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.entryId).toBe("room-20");
  });
});

describe("seo domain — release learning hooks", () => {
  it("records SUCCESS with fixtureOnly and does not imply acceptance=verified", () => {
    let state = emptySeoState(now);
    const proposal = createSeoProposal({
      proposalId: "prop-rel",
      pageAssetId: "page-home",
      changeKind: SeoChangeKind.METADATA,
      title: "Title fix",
      summary: "Improve title",
      proposedFields: { title: "WorkSocial | Jersey City coworking" },
      citedFactIds: ["fact-ok"],
      fixtureOnly: true,
      createdAtIso: now,
      status: SeoProposalStatus.RELEASED_PENDING,
    });
    state = {
      ...state,
      proposals: [proposal],
      updatedAtIso: now,
    };

    const applied = applySeoReleaseVerification(state, {
      proposalId: "prop-rel",
      decision: SeoReleaseDecision.SUCCESS,
      source: OutcomeEvidenceSource.FIXTURE,
      fixtureOnly: true,
      summary: "Fixture read-back matched proposed title",
      outcomeId: "out-1",
      operationId: "op-seo-1",
      writePathId: "wp-seo-page",
      nowIso: now,
    });

    expect(applied.proposal?.status).toBe(SeoProposalStatus.VERIFIED);
    expect(applied.outcome?.label).toBe("SUCCESS");
    expect(applied.outcome?.fixtureOnly).toBe(true);
    expect(applied.state.releaseOutcomes).toHaveLength(1);
  });
});
