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
  digestSchemaNodes,
  emptySeoState,
  evaluateProposalGate,
  catalogPriceIsHonest,
  cmsPublishWiringStatus,
  DEFAULT_HARD_SEARCH_RETRY_MAX_ATTEMPTS,
  evaluateHardSearchRetryBudget,
  parseSearchConstraints,
  resolveHardSearchBookingHandoff,
  resolveHardSearchInventoryClaim,
  runSemanticSearch,
  schemaNodesToFields,
  semanticSearchLiveWiringStatus,
  shouldRecordHardSearchAttemptOnBudgetDenial,
  validateSchemaOrg,
  type SemanticSearchIndex,
} from "./seo.js";
import { AdapterWiring } from "./production-mapping.js";

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

describe("seo domain — schema digests", () => {
  it("includes all schema graph nodes without overwriting earlier ones (F04)", () => {
    const nodes = [
      {
        nodeId: "n-business",
        schemaType: "LocalBusiness",
        properties: { name: "WorkSocial", price: "100" },
        citedFactIds: [],
      },
      {
        nodeId: "n-offer",
        schemaType: "Offer",
        properties: { name: "Day Pass", price: "45" },
        citedFactIds: [],
      },
    ] as const;
    const fields = schemaNodesToFields(nodes);
    expect(fields["n-business.@type"]).toBe("LocalBusiness");
    expect(fields["n-business.name"]).toBe("WorkSocial");
    expect(fields["n-business.price"]).toBe("100");
    expect(fields["n-offer.@type"]).toBe("Offer");
    expect(fields["n-offer.name"]).toBe("Day Pass");
    expect(fields["n-offer.price"]).toBe("45");

    const digestBoth = digestSchemaNodes("page-home", nodes);
    const digestMutated = digestSchemaNodes("page-home", [
      nodes[0],
      {
        ...nodes[1],
        properties: { ...nodes[1].properties, price: "50" },
      },
    ]);
    expect(digestBoth).not.toBe(digestMutated);
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
    const proposal = {
      ...createSeoProposal({
        proposalId: "prop-1",
        pageAssetId: "page-home",
        changeKind: SeoChangeKind.CONTENT,
        title: "Improve FAQ",
        summary: "Add parking answer",
        proposedFields: { faq: "Parking is available nearby" },
        citedFactIds: ["fact-hyp"],
        fixtureOnly: true,
        createdAtIso: now,
      }),
      status: SeoProposalStatus.APPROVED,
    };
    const gate = evaluateProposalGate({
      proposal,
      factLabels: new Map([["fact-hyp", SupportLabel.HYPOTHESIS]]),
    });
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe("PROPOSAL_GATE_FAILED");
  });

  it("forces client creation away from verified/approved statuses", () => {
    const proposal = createSeoProposal({
      proposalId: "prop-draft-force",
      pageAssetId: "page-home",
      changeKind: SeoChangeKind.METADATA,
      title: "x",
      summary: "y",
      proposedFields: { title: "T" },
      fixtureOnly: true,
      createdAtIso: now,
      status: SeoProposalStatus.VERIFIED,
    });
    expect(proposal.status).toBe(SeoProposalStatus.DRAFT);
  });

  it("requires schema validation bound to proposal page + payload digest", () => {
    const proposal = {
      ...createSeoProposal({
        proposalId: "prop-2",
        pageAssetId: "page-home",
        changeKind: SeoChangeKind.SCHEMA,
        title: "Add LocalBusiness",
        summary: "Emit schema",
        proposedFields: { "@type": "LocalBusiness", name: "WorkSocial" },
        citedFactIds: ["fact-ok"],
        fixtureOnly: true,
        createdAtIso: now,
      }),
      status: SeoProposalStatus.APPROVED,
    };
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
    expect(validation.payloadDigest).toBe(proposal.schemaPayloadDigest);
    const ok = evaluateProposalGate({
      proposal,
      factLabels: new Map([["fact-ok", SupportLabel.SUPPORTED]]),
      schemaValidation: validation,
    });
    expect(ok.allowed).toBe(true);
  });

  it("flags numeric schema properties missing from visible content", () => {
    const result = validateSchemaOrg({
      validationId: "val-num",
      pageAssetId: "page-home",
      nodes: [
        {
          nodeId: "n1",
          schemaType: "MeetingRoom",
          properties: { name: "Hudson", capacity: 100 },
          citedFactIds: ["fact-ok"],
        },
      ],
      visibleContent: "Hudson boardroom",
      factLabels: new Map([["fact-ok", SupportLabel.SUPPORTED]]),
      fixtureOnly: true,
      createdAtIso: now,
    });
    expect(result.agreesWithVisibleContent).toBe(false);
    expect(result.issues.some((i) => i.code === "SCHEMA_VISIBLE_MISMATCH")).toBe(
      true,
    );
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

  it("ignores hour counts and words ending in la for location/capacity", () => {
    const hours = parseSearchConstraints(
      "room for 2 hours for 10 people in Jersey City",
    );
    expect(hours.people).toBe(10);
    expect(hours.location).toBe("Jersey City");
    const gala = parseSearchConstraints(
      "gala event for 40 in Jersey City",
    );
    expect(gala.location).toBe("Jersey City");
    expect(gala.people).toBe(40);
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

  it("preserves price/date/negation as unresolved and prefers clarify/abstain (F10)", () => {
    const priced = parseSearchConstraints(
      "Meeting room for 8 in Jersey City under $200",
    );
    expect(priced.priceMaxMinor).toBe(20000);
    expect(priced.priceRaw).toMatch(/200/);
    expect(priced.unresolvedConstraints.some((c) => c.startsWith("price:"))).toBe(
      true,
    );

    const dated = parseSearchConstraints(
      "Training room for 10 in Jersey City next Friday",
    );
    expect(dated.dateRaw).toMatch(/friday/i);
    expect(dated.unresolvedConstraints.some((c) => c.startsWith("date:"))).toBe(
      true,
    );

    const negated = parseSearchConstraints(
      "Meeting room for 8 in Jersey City without parking",
    );
    expect(negated.negatedTerms).toContain("parking");
    expect(
      negated.unresolvedConstraints.some((c) => c.startsWith("negation:")),
    ).toBe(true);
    // Must not invert negation into a positive amenity requirement.
    expect(negated.requiredAmenities).not.toContain("parking");
    expect(negated.unknownConstraints).not.toContain("parking");

    const withoutVideo = parseSearchConstraints(
      "meeting room without video in Jersey City",
    );
    expect(withoutVideo.requiredAmenities).not.toContain("video");
    expect(withoutVideo.negatedTerms).toContain("video");

    const notLa = parseSearchConstraints(
      "not in Los Angeles meeting room for 8 people",
    );
    expect(notLa.location).toBeNull();
    expect(
      notLa.unresolvedConstraints.some((c) => c.includes("negation:location")),
    ).toBe(true);

    const result = runSemanticSearch({
      queryId: "q-f10",
      rawQuery: "Meeting for 8 in Jersey City under $150 without video",
      index,
      createdAtIso: now,
    });
    expect(result.hits).toHaveLength(0);
    expect(result.noMatchReason).toMatch(/unresolved|Clarify|abstain/i);
    expect(result.constraints.unresolvedConstraints.length).toBeGreaterThan(0);
  });

  it("does not silently drop unrecognized location phrases", () => {
    const c = parseSearchConstraints("meeting room for 6 in Hoboken with display");
    expect(c.location).toBeNull();
    expect(c.unresolvedConstraints.some((x) => x.startsWith("location:"))).toBe(
      true,
    );
    const terminal = parseSearchConstraints("meeting room for 6 in Hoboken");
    expect(
      terminal.unresolvedConstraints.some((x) => x.startsWith("location:")),
    ).toBe(true);
    const result = runSemanticSearch({
      queryId: "q-loc",
      rawQuery: "meeting room for 6 in Hoboken with display",
      index,
      createdAtIso: now,
    });
    expect(result.hits).toHaveLength(0);
    expect(result.constraints.unresolvedConstraints.join(" ")).toMatch(/hoboken/i);
  });

  it("preserves ISO date constraints as unresolved", () => {
    const c = parseSearchConstraints(
      "meeting room in Jersey City on 2026-12-01",
    );
    expect(c.dateRaw).toMatch(/2026-12-01/);
    expect(c.unresolvedConstraints.some((x) => x.startsWith("date:"))).toBe(
      true,
    );
    const result = runSemanticSearch({
      queryId: "q-iso",
      rawQuery: "meeting room in Jersey City on 2026-12-01",
      index,
      createdAtIso: now,
    });
    expect(result.hits).toHaveLength(0);
    expect(result.noMatchReason).toMatch(/unresolved|Clarify|abstain/i);
  });

  it("cites SUPPORTED facts only and abstains on UNKNOWN/HYPOTHESIS (M8)", () => {
    const labels = new Map([
      ["fact-capacity-8", SupportLabel.SUPPORTED],
      ["fact-capacity-20", SupportLabel.HYPOTHESIS],
    ]);
    const grounded = runSemanticSearch({
      queryId: "q-m8-g",
      rawQuery: "Meeting room for 8 in Jersey City with display",
      index,
      createdAtIso: now,
      factLabels: labels,
      bookingHandoffUrl: "https://fixture.worksocial.local/book",
    });
    expect(grounded.hits).toHaveLength(1);
    expect(grounded.answerStatus).toBe("grounded");
    expect(grounded.hits[0]?.supportedFactIds).toEqual(["fact-capacity-8"]);
    expect(grounded.hits[0]?.citations.every((c) => !c.includes("hypothesis"))).toBe(
      true,
    );
    expect(grounded.bookingHandoffUrl).toMatch(/^https:/);

    const hypOnly = runSemanticSearch({
      queryId: "q-m8-h",
      rawQuery: "Training room for 20 in Jersey City with video",
      index,
      createdAtIso: now,
      factLabels: labels,
    });
    expect(hypOnly.hits).toHaveLength(0);
    expect(hypOnly.answerStatus).toMatch(/no_result|unknown/);
    expect(hypOnly.bookingHandoffUrl).toBeNull();
  });

  it("does not invent availability when catalog has no availability field (T-X048)", () => {
    const parsed = parseSearchConstraints(
      "Available meeting room for 8 in Jersey City with display",
    );
    expect(parsed.unknownConstraints).toContain("availability");
    const result = runSemanticSearch({
      queryId: "q-avail",
      rawQuery: "Available meeting room for 8 in Jersey City with display",
      index,
      createdAtIso: now,
    });
    expect(result.hits).toHaveLength(0);
    expect(result.answerStatus).toBe("unknown");
    expect(result.bookingHandoffUrl).toBeNull();
    expect(result.noMatchReason).toMatch(/availability/i);
    // Standalone bookable / open meeting — no invent.
    for (const q of [
      "bookable meeting room for 8 in Jersey City with display",
      "open meeting room for 8 in Jersey City with display",
    ]) {
      const r = runSemanticSearch({
        queryId: `q-${q.slice(0, 8)}`,
        rawQuery: q,
        index,
        createdAtIso: now,
      });
      expect(r.hits).toHaveLength(0);
      expect(r.answerStatus).toBe("unknown");
      expect(r.constraints.unknownConstraints).toContain("availability");
    }
    // "unavailable" must not trigger a positive availability unknown.
    const neg = parseSearchConstraints(
      "meeting room for 8 in Jersey City with display unavailable parking",
    );
    // parking still unknown; availability from "unavailable" must not invent.
    expect(neg.unknownConstraints).not.toContain("availability");
  });

  it("expands price aliases and never invents free as $0 (T-X048)", () => {
    const upTo = parseSearchConstraints(
      "Meeting room for 8 in Jersey City up to $175",
    );
    expect(upTo.priceMaxMinor).toBe(17500);
    expect(upTo.unresolvedConstraints.some((c) => c.startsWith("price:"))).toBe(
      true,
    );
    const noMore = parseSearchConstraints(
      "Meeting room for 8 in Jersey City no more than $90",
    );
    expect(noMore.priceMaxMinor).toBe(9000);
    // Symbolic ≤ / <= without leading word-boundary requirement.
    const le = parseSearchConstraints(
      "Meeting room for 8 in Jersey City ≤ $175",
    );
    expect(le.priceMaxMinor).toBe(17500);
    const leEq = parseSearchConstraints(
      "Meeting room for 8 in Jersey City <= 90",
    );
    expect(leEq.priceMaxMinor).toBe(9000);
    // Capacity phrases must not become price bounds.
    const capacity = parseSearchConstraints(
      "meeting room for up to 8 people in Jersey City with display",
    );
    expect(capacity.priceMaxMinor).toBeNull();
    expect(capacity.unresolvedConstraints.some((c) => c.startsWith("price:"))).toBe(
      false,
    );
    expect(capacity.people).toBe(8);
    const free = parseSearchConstraints(
      "free meeting room for 8 in Jersey City with display",
    );
    expect(free.priceMaxMinor).toBeNull();
    expect(free.unresolvedConstraints.some((c) => c.includes("free"))).toBe(
      true,
    );
    expect(catalogPriceIsHonest(index.entries[0]!)).toBe(true);
    expect(
      catalogPriceIsHonest({ priceKnown: false, priceLabel: "free" }),
    ).toBe(false);
    expect(catalogPriceIsHonest(index.entries[1]!)).toBe(true);
  });

  it("attaches booking handoff only for grounded HTTPS URLs", () => {
    const labels = new Map([["fact-capacity-8", SupportLabel.SUPPORTED]]);
    const https = runSemanticSearch({
      queryId: "q-https",
      rawQuery: "Meeting room for 8 in Jersey City with display",
      index,
      createdAtIso: now,
      factLabels: labels,
      bookingHandoffUrl: "https://fixture.worksocial.local/book",
    });
    expect(https.bookingHandoffUrl).toMatch(/^https:/);
    const http = runSemanticSearch({
      queryId: "q-http",
      rawQuery: "Meeting room for 8 in Jersey City with display",
      index,
      createdAtIso: now,
      factLabels: labels,
      bookingHandoffUrl: "http://fixture.worksocial.local/book",
    });
    expect(http.answerStatus).toBe("grounded");
    expect(http.bookingHandoffUrl).toBeNull();
    const js = runSemanticSearch({
      queryId: "q-js",
      rawQuery: "Meeting room for 8 in Jersey City with display",
      index,
      createdAtIso: now,
      factLabels: labels,
      bookingHandoffUrl: "javascript:alert(1)",
    });
    expect(js.bookingHandoffUrl).toBeNull();
  });

  it("reports semantic search live wiring as NOT_WIRED", () => {
    expect(semanticSearchLiveWiringStatus()).toBe("NOT_WIRED");
    expect(cmsPublishWiringStatus(AdapterWiring.NOT_WIRED)).toBe("NOT_WIRED");
    expect(cmsPublishWiringStatus(AdapterWiring.LIVE)).toBe("NOT_WIRED");
  });

  it("excludes inaccessible inventory even when hard constraints match", () => {
    const closed: SemanticSearchIndex = {
      ...index,
      entries: [
        {
          ...index.entries[0]!,
          inaccessible: true,
        },
      ],
    };
    const result = runSemanticSearch({
      queryId: "q-inacc",
      rawQuery: "Meeting room for 8 in Jersey City with display",
      index: closed,
      createdAtIso: now,
    });
    expect(result.hits).toHaveLength(0);
    expect(result.answerStatus).toBe("no_result");
    expect(result.bookingHandoffUrl).toBeNull();
  });
});

describe("seo domain — hard-search retry fence (T-X048)", () => {
  it("allows the first honest abstain within default maxAttempts", () => {
    const decision = evaluateHardSearchRetryBudget({
      answerStatus: "unknown",
      attemptCount: 0,
      startingNewAttempt: true,
    });
    expect(DEFAULT_HARD_SEARCH_RETRY_MAX_ATTEMPTS).toBe(1);
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBeNull();
    expect(decision.recordAttempt).toBe(true);
    expect(decision.consumesBudget).toBe(true);
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.semanticSearchLiveWiring).toBe("NOT_WIRED");
    expect(decision.cmsPublishWiring).toBe("NOT_WIRED");
  });

  it("refuses a second start with RETRY_BUDGET_EXHAUSTED and does not record", () => {
    const decision = evaluateHardSearchRetryBudget({
      answerStatus: "clarify",
      attemptCount: 1,
      startingNewAttempt: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(decision.recordAttempt).toBe(false);
    expect(decision.attemptCount).toBe(1);
    expect(shouldRecordHardSearchAttemptOnBudgetDenial(decision.code)).toBe(
      false,
    );
  });

  it("does not consume budget for grounded answers", () => {
    const decision = evaluateHardSearchRetryBudget({
      answerStatus: "grounded",
      attemptCount: 0,
      startingNewAttempt: true,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.consumesBudget).toBe(false);
    expect(decision.recordAttempt).toBe(false);
    expect(decision.code).toBeNull();
  });

  it("NO_RESULT consumes budget the same as UNKNOWN/CLARIFY", () => {
    const within = evaluateHardSearchRetryBudget({
      answerStatus: "no_result",
      attemptCount: 0,
      startingNewAttempt: true,
      maxAttempts: 1,
    });
    expect(within.allowed).toBe(true);
    expect(within.consumesBudget).toBe(true);
    const exhausted = evaluateHardSearchRetryBudget({
      answerStatus: "no_result",
      attemptCount: 1,
      startingNewAttempt: true,
      maxAttempts: 1,
    });
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(shouldRecordHardSearchAttemptOnBudgetDenial(exhausted.code)).toBe(
      false,
    );
    expect(shouldRecordHardSearchAttemptOnBudgetDenial(null)).toBe(true);
  });

  it("booking handoff refused when retry exhausted or abstain (T-X048 E14)", () => {
    const https = "https://fixture.worksocial.local/book";
    const exhausted = evaluateHardSearchRetryBudget({
      answerStatus: "unknown",
      attemptCount: 1,
      startingNewAttempt: true,
    });
    const refused = resolveHardSearchBookingHandoff({
      answerStatus: "grounded",
      retryBudget: exhausted,
      proposedHandoffUrl: https,
    });
    expect(refused.attached).toBe(false);
    expect(refused.bookingHandoffUrl).toBeNull();
    expect(refused.externalEffects).toBe("NONE");
    expect(refused.semanticSearchLiveWiring).toBe("NOT_WIRED");

    const within = evaluateHardSearchRetryBudget({
      answerStatus: "unknown",
      attemptCount: 0,
      startingNewAttempt: true,
    });
    const abstain = resolveHardSearchBookingHandoff({
      answerStatus: "unknown",
      retryBudget: within,
      proposedHandoffUrl: https,
    });
    expect(abstain.attached).toBe(false);
    expect(abstain.bookingHandoffUrl).toBeNull();

    const groundedBudget = evaluateHardSearchRetryBudget({
      answerStatus: "grounded",
      attemptCount: 0,
      startingNewAttempt: true,
    });
    const ok = resolveHardSearchBookingHandoff({
      answerStatus: "grounded",
      retryBudget: groundedBudget,
      proposedHandoffUrl: https,
    });
    expect(ok.attached).toBe(true);
    expect(ok.bookingHandoffUrl).toBe(https);

    const httpRefused = resolveHardSearchBookingHandoff({
      answerStatus: "grounded",
      retryBudget: groundedBudget,
      proposedHandoffUrl: "http://fixture.worksocial.local/book",
    });
    expect(httpRefused.attached).toBe(false);
    expect(httpRefused.bookingHandoffUrl).toBeNull();
  });

  it("inventory claim cleared when retry exhausted (T-X048 E16/E17)", () => {
    const fakeHit = {
      entryId: "invented",
      name: "Invented Room",
      score: 99,
      citations: [],
      supportedFactIds: [],
      groundingStatus: "grounded" as const,
      filterTrace: [],
    };
    const exhausted = evaluateHardSearchRetryBudget({
      answerStatus: "unknown",
      attemptCount: 1,
      startingNewAttempt: true,
    });
    const handoff = resolveHardSearchBookingHandoff({
      answerStatus: "grounded",
      retryBudget: exhausted,
      proposedHandoffUrl: "https://fixture.worksocial.local/book",
    });
    const claim = resolveHardSearchInventoryClaim({
      answerStatus: "grounded",
      retryBudget: exhausted,
      hits: [fakeHit],
      bookingHandoff: handoff,
    });
    expect(claim.hits).toHaveLength(0);
    expect(claim.bookingHandoffUrl).toBeNull();
    expect(claim.inventedInventory).toBe(false);
    expect(claim.answerStatus).toBe("no_result");
    expect(claim.externalEffects).toBe("NONE");
    expect(claim.semanticSearchLiveWiring).toBe("NOT_WIRED");

    const within = evaluateHardSearchRetryBudget({
      answerStatus: "unknown",
      attemptCount: 0,
      startingNewAttempt: true,
    });
    const abstainClaim = resolveHardSearchInventoryClaim({
      answerStatus: "unknown",
      retryBudget: within,
      hits: [fakeHit],
      bookingHandoff: resolveHardSearchBookingHandoff({
        answerStatus: "unknown",
        retryBudget: within,
        proposedHandoffUrl: "https://fixture.worksocial.local/book",
      }),
    });
    expect(abstainClaim.hits).toHaveLength(0);
    expect(abstainClaim.answerStatus).toBe("unknown");
    expect(abstainClaim.inventedInventory).toBe(false);

    const groundedBudget = evaluateHardSearchRetryBudget({
      answerStatus: "grounded",
      attemptCount: 0,
      startingNewAttempt: true,
    });
    const okHandoff = resolveHardSearchBookingHandoff({
      answerStatus: "grounded",
      retryBudget: groundedBudget,
      proposedHandoffUrl: "https://fixture.worksocial.local/book",
    });
    const okClaim = resolveHardSearchInventoryClaim({
      answerStatus: "grounded",
      retryBudget: groundedBudget,
      hits: [fakeHit],
      bookingHandoff: okHandoff,
    });
    expect(okClaim.hits).toHaveLength(1);
    expect(okClaim.bookingHandoffUrl).toMatch(/^https:/);
    expect(okClaim.inventedInventory).toBe(false);
  });

  it("grounded HTTPS handoff keeps cmsPublishWiring NOT_WIRED (T-X048 E21)", () => {
    const budget = evaluateHardSearchRetryBudget({
      answerStatus: "grounded",
      attemptCount: 0,
      startingNewAttempt: true,
    });
    const handoff = resolveHardSearchBookingHandoff({
      answerStatus: "grounded",
      retryBudget: budget,
      proposedHandoffUrl: "https://fixture.worksocial.local/book",
    });
    expect(handoff.attached).toBe(true);
    expect(handoff.cmsPublishWiring).toBe("NOT_WIRED");
    expect(handoff.externalEffects).toBe("NONE");
  });

  it("retry fence decisions keep cmsPublishWiring NOT_WIRED (T-X048 E19)", () => {
    const exhausted = evaluateHardSearchRetryBudget({
      answerStatus: "unknown",
      attemptCount: 1,
      startingNewAttempt: true,
    });
    expect(exhausted.cmsPublishWiring).toBe("NOT_WIRED");
    expect(exhausted.externalEffects).toBe("NONE");
    expect(exhausted.semanticSearchLiveWiring).toBe("NOT_WIRED");
  });

  it("exhausted budget keeps UNKNOWN status without downgrade (T-X048 E20)", () => {
    const exhausted = evaluateHardSearchRetryBudget({
      answerStatus: "unknown",
      attemptCount: 1,
      startingNewAttempt: true,
    });
    const claim = resolveHardSearchInventoryClaim({
      answerStatus: "unknown",
      retryBudget: exhausted,
      hits: [
        {
          entryId: "x",
          name: "X",
          score: 1,
          citations: [],
          supportedFactIds: [],
          groundingStatus: "grounded",
          filterTrace: [],
        },
      ],
      bookingHandoff: resolveHardSearchBookingHandoff({
        answerStatus: "unknown",
        retryBudget: exhausted,
        proposedHandoffUrl: "https://fixture.worksocial.local/book",
      }),
    });
    expect(claim.answerStatus).toBe("unknown");
    expect(claim.hits).toHaveLength(0);
    expect(claim.cmsPublishWiring).toBe("NOT_WIRED");
  });

  it("exhausted budget keeps CLARIFY status without NO_RESULT downgrade (T-X048 E18)", () => {
    const exhausted = evaluateHardSearchRetryBudget({
      answerStatus: "clarify",
      attemptCount: 1,
      startingNewAttempt: true,
    });
    const claim = resolveHardSearchInventoryClaim({
      answerStatus: "clarify",
      retryBudget: exhausted,
      hits: [
        {
          entryId: "invented",
          name: "Invented",
          score: 1,
          citations: [],
          supportedFactIds: [],
          groundingStatus: "grounded",
          filterTrace: [],
        },
      ],
      bookingHandoff: resolveHardSearchBookingHandoff({
        answerStatus: "clarify",
        retryBudget: exhausted,
        proposedHandoffUrl: "https://fixture.worksocial.local/book",
      }),
    });
    expect(claim.hits).toHaveLength(0);
    expect(claim.answerStatus).toBe("clarify");
    expect(claim.inventedInventory).toBe(false);
    expect(claim.externalEffects).toBe("NONE");
  });

  it("NO_RESULT never attaches booking handoff even within budget (T-X048 E22)", () => {
    const withinBudget = evaluateHardSearchRetryBudget({
      answerStatus: "no_result",
      attemptCount: 0,
      startingNewAttempt: true,
    });
    const handoff = resolveHardSearchBookingHandoff({
      answerStatus: "no_result",
      retryBudget: withinBudget,
      proposedHandoffUrl: "https://fixture.worksocial.local/book",
    });
    const claim = resolveHardSearchInventoryClaim({
      answerStatus: "no_result",
      retryBudget: withinBudget,
      hits: [
        {
          entryId: "invented",
          name: "Invented",
          score: 1,
          citations: [],
          supportedFactIds: [],
          groundingStatus: "grounded",
          filterTrace: [],
        },
      ],
      bookingHandoff: handoff,
    });
    expect(handoff.attached).toBe(false);
    expect(handoff.bookingHandoffUrl).toBe(null);
    expect(handoff.cmsPublishWiring).toBe("NOT_WIRED");
    expect(claim.hits).toHaveLength(0);
    expect(claim.bookingHandoffUrl).toBe(null);
    expect(claim.answerStatus).toBe("no_result");
    expect(claim.externalEffects).toBe("NONE");
  });

  it("UNKNOWN never attaches booking handoff even within budget (T-X048 E23)", () => {
    const withinBudget = evaluateHardSearchRetryBudget({
      answerStatus: "unknown",
      attemptCount: 0,
      startingNewAttempt: true,
    });
    const handoff = resolveHardSearchBookingHandoff({
      answerStatus: "unknown",
      retryBudget: withinBudget,
      proposedHandoffUrl: "https://fixture.worksocial.local/book",
    });
    const claim = resolveHardSearchInventoryClaim({
      answerStatus: "unknown",
      retryBudget: withinBudget,
      hits: [
        {
          entryId: "invented",
          name: "Invented",
          score: 1,
          citations: [],
          supportedFactIds: [],
          groundingStatus: "grounded",
          filterTrace: [],
        },
      ],
      bookingHandoff: handoff,
    });
    expect(handoff.attached).toBe(false);
    expect(handoff.semanticSearchLiveWiring).toBe("NOT_WIRED");
    expect(claim.hits).toHaveLength(0);
    expect(claim.answerStatus).toBe("unknown");
    expect(claim.externalEffects).toBe("NONE");
  });

  it("CLARIFY never attaches booking handoff even within budget (T-X048 E24)", () => {
    const withinBudget = evaluateHardSearchRetryBudget({
      answerStatus: "clarify",
      attemptCount: 0,
      startingNewAttempt: true,
    });
    const handoff = resolveHardSearchBookingHandoff({
      answerStatus: "clarify",
      retryBudget: withinBudget,
      proposedHandoffUrl: "https://fixture.worksocial.local/book",
    });
    const claim = resolveHardSearchInventoryClaim({
      answerStatus: "clarify",
      retryBudget: withinBudget,
      hits: [
        {
          entryId: "invented",
          name: "Invented",
          score: 1,
          citations: [],
          supportedFactIds: [],
          groundingStatus: "grounded",
          filterTrace: [],
        },
      ],
      bookingHandoff: handoff,
    });
    expect(handoff.attached).toBe(false);
    expect(handoff.bookingHandoffUrl).toBe(null);
    expect(handoff.cmsPublishWiring).toBe("NOT_WIRED");
    expect(claim.hits).toHaveLength(0);
    expect(claim.bookingHandoffUrl).toBe(null);
    expect(claim.answerStatus).toBe("clarify");
    expect(claim.externalEffects).toBe("NONE");
  });

  it("javascript: handoff refused even when grounded within budget (T-X048 E25)", () => {
    const withinBudget = evaluateHardSearchRetryBudget({
      answerStatus: "grounded",
      attemptCount: 0,
      startingNewAttempt: true,
    });
    const handoff = resolveHardSearchBookingHandoff({
      answerStatus: "grounded",
      retryBudget: withinBudget,
      proposedHandoffUrl: "javascript:alert(1)",
    });
    const claim = resolveHardSearchInventoryClaim({
      answerStatus: "grounded",
      retryBudget: withinBudget,
      hits: [
        {
          entryId: "room-8",
          name: "Room",
          score: 1,
          citations: [],
          supportedFactIds: [],
          groundingStatus: "grounded",
          filterTrace: [],
        },
      ],
      bookingHandoff: handoff,
    });
    expect(handoff.attached).toBe(false);
    expect(handoff.bookingHandoffUrl).toBe(null);
    expect(claim.bookingHandoffUrl).toBe(null);
    expect(claim.hits).toHaveLength(1);
    expect(claim.inventedInventory).toBe(false);
    expect(claim.externalEffects).toBe("NONE");
  });

  it("data: handoff refused even when grounded within budget (T-X048 E26)", () => {
    const withinBudget = evaluateHardSearchRetryBudget({
      answerStatus: "grounded",
      attemptCount: 0,
      startingNewAttempt: true,
    });
    const handoff = resolveHardSearchBookingHandoff({
      answerStatus: "grounded",
      retryBudget: withinBudget,
      proposedHandoffUrl: "data:text/html,<script>alert(1)</script>",
    });
    const claim = resolveHardSearchInventoryClaim({
      answerStatus: "grounded",
      retryBudget: withinBudget,
      hits: [
        {
          entryId: "room-8",
          name: "Room",
          score: 1,
          citations: [],
          supportedFactIds: [],
          groundingStatus: "grounded",
          filterTrace: [],
        },
      ],
      bookingHandoff: handoff,
    });
    expect(handoff.attached).toBe(false);
    expect(handoff.bookingHandoffUrl).toBe(null);
    expect(claim.bookingHandoffUrl).toBe(null);
    expect(claim.hits).toHaveLength(1);
    expect(claim.inventedInventory).toBe(false);
    expect(claim.externalEffects).toBe("NONE");
  });
});

describe("seo domain — release learning hooks", () => {
  it("records SUCCESS with fixtureOnly and does not imply acceptance=verified", () => {
    let state = emptySeoState(now);
    const proposal = {
      ...createSeoProposal({
        proposalId: "prop-rel",
        pageAssetId: "page-home",
        changeKind: SeoChangeKind.METADATA,
        title: "Title fix",
        summary: "Improve title",
        proposedFields: { title: "WorkSocial | Jersey City coworking" },
        citedFactIds: ["fact-ok"],
        fixtureOnly: true,
        createdAtIso: now,
      }),
      status: SeoProposalStatus.RELEASED_PENDING,
    };
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
