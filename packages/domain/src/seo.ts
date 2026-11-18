/**
 * R1-07 SEO and search: page audits, SEO change proposals, schema.org
 * validation, semantic search stubs, and gateway-gated pilot page release.
 *
 * Pure types + validators. No network or CMS adapters.
 * Schema “truth” may only cite SUPPORTED facts — never HYPOTHESIS.
 * Acceptance ≠ verified. Live CMS publish remains NOT_WIRED.
 */

import {
  AdapterWiring,
  OutcomeEvidenceSource,
  OutcomeLabel,
  recordWritePathOutcome,
  type AdapterWiringValue,
  type OutcomeEvidenceSourceValue,
  type OutcomeLabelValue,
  type WritePathOutcomeEvidence,
} from "./production-mapping.js";
import { SupportLabel, type SupportLabelValue } from "./knowledge.js";

/** Page audit finding severity. */
export const AuditSeverity = {
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
  BLOCKER: "blocker",
} as const;

export type AuditSeverityValue =
  (typeof AuditSeverity)[keyof typeof AuditSeverity];

/** Full-page model dimensions (v3 §12). */
export const AuditDimension = {
  CRAWLABILITY: "crawlability",
  CANONICAL: "canonical",
  METADATA: "metadata",
  CONTENT: "content",
  SCHEMA: "schema",
  ACCESSIBILITY: "accessibility",
  INTERNAL_LINKS: "internal_links",
  CONVERSION: "conversion",
  FACTUAL_ACCURACY: "factual_accuracy",
} as const;

export type AuditDimensionValue =
  (typeof AuditDimension)[keyof typeof AuditDimension];

export const PageAuditStatus = {
  HEALTHY: "healthy",
  NEEDS_ATTENTION: "needs_attention",
  BLOCKED: "blocked",
} as const;

export type PageAuditStatusValue =
  (typeof PageAuditStatus)[keyof typeof PageAuditStatus];

export type PageAuditFinding = {
  findingId: string;
  dimension: AuditDimensionValue;
  severity: AuditSeverityValue;
  code: string;
  message: string;
  /** Optional fact id when finding concerns a claim. */
  relatedFactId: string | null;
};

export type PageAuditRecord = {
  pageAuditId: string;
  pageAssetId: string;
  siteId: string;
  /** Path or URL — never a secret. */
  pagePath: string;
  displayName: string;
  status: PageAuditStatusValue;
  score: number;
  findings: PageAuditFinding[];
  fixtureOnly: boolean;
  createdAtIso: string;
  updatedAtIso: string;
};

export const SeoChangeKind = {
  METADATA: "metadata",
  CONTENT: "content",
  SCHEMA: "schema",
  INTERNAL_LINK: "internal_link",
  TECHNICAL: "technical",
} as const;

export type SeoChangeKindValue =
  (typeof SeoChangeKind)[keyof typeof SeoChangeKind];

export const SeoProposalStatus = {
  DRAFT: "draft",
  READY_FOR_REVIEW: "ready_for_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  RELEASED_PENDING: "released_pending",
  VERIFIED: "verified",
  FAILED: "failed",
} as const;

export type SeoProposalStatusValue =
  (typeof SeoProposalStatus)[keyof typeof SeoProposalStatus];

/**
 * Proposed page change. Claims that become published “truth” must cite
 * SUPPORTED facts only — HYPOTHESIS may appear as research context, not schema.
 */
export type SeoChangeProposal = {
  proposalId: string;
  pageAssetId: string;
  pageAuditId: string | null;
  changeKind: SeoChangeKindValue;
  title: string;
  summary: string;
  /** Exact field diffs (title, description, schema nodes, links…). */
  proposedFields: Record<string, string>;
  /** Fact ids backing claims — schema/content truth requires SUPPORTED. */
  citedFactIds: string[];
  /** Research/hypothesis fact ids — never used as schema truth. */
  hypothesisFactIds: string[];
  status: SeoProposalStatusValue;
  fixtureOnly: boolean;
  gatewayOperationId: string | null;
  writePathId: string | null;
  createdAtIso: string;
  updatedAtIso: string;
};

export const SchemaValidationVerdict = {
  PASS: "pass",
  FAIL: "fail",
  PARTIAL: "partial",
} as const;

export type SchemaValidationVerdictValue =
  (typeof SchemaValidationVerdict)[keyof typeof SchemaValidationVerdict];

export type SchemaOrgNode = {
  nodeId: string;
  schemaType: string;
  properties: Record<string, string | number | boolean | null>;
  /** Fact ids that must be SUPPORTED for this node to be valid “truth”. */
  citedFactIds: string[];
};

export type SchemaValidationIssue = {
  code: string;
  message: string;
  propertyPath: string | null;
  relatedFactId: string | null;
};

export type SchemaValidationResult = {
  validationId: string;
  pageAssetId: string;
  proposalId: string | null;
  nodes: SchemaOrgNode[];
  verdict: SchemaValidationVerdictValue;
  issues: SchemaValidationIssue[];
  /** Visible-content agreement check passed. */
  agreesWithVisibleContent: boolean;
  fixtureOnly: boolean;
  createdAtIso: string;
};

/** Semantic catalog entry for on-site search (fixture corpus OK). */
export type SemanticCatalogEntry = {
  entryId: string;
  name: string;
  category: "Meeting" | "Training" | "Office" | "Event" | "Other";
  capacity: number;
  location: string;
  amenities: string[];
  sourcePageId: string;
  /** Only SUPPORTED facts may ground public answers. */
  groundedFactIds: string[];
  /** When true, entry is excluded from eligibility (e.g. inaccessible). */
  inaccessible: boolean;
  /** Price omitted → unknown, never inferred as free. */
  priceKnown: boolean;
  priceLabel: string | null;
  fixtureOnly: boolean;
};

export type SemanticSearchIndex = {
  indexId: string;
  version: number;
  entries: SemanticCatalogEntry[];
  updatedAtIso: string;
  fixtureOnly: boolean;
};

export type ParsedSearchConstraints = {
  people: number | null;
  category: SemanticCatalogEntry["category"] | null;
  location: string | null;
  requiredAmenities: string[];
  /** Constraints the index cannot verify — honest unknown, not false. */
  unknownConstraints: string[];
};

export type SemanticSearchHit = {
  entryId: string;
  name: string;
  score: number;
  citations: string[];
  filterTrace: string[];
};

export type SemanticSearchResult = {
  queryId: string;
  rawQuery: string;
  constraints: ParsedSearchConstraints;
  hits: SemanticSearchHit[];
  noMatchReason: string | null;
  indexVersion: number;
  createdAtIso: string;
};

export type SeoState = {
  version: 1;
  updatedAtIso: string;
  pageAudits: PageAuditRecord[];
  proposals: SeoChangeProposal[];
  schemaValidations: SchemaValidationResult[];
  searchIndex: SemanticSearchIndex | null;
  searchResults: SemanticSearchResult[];
  /** Verified SEO release SUCCESS/FAILURE outcomes for learning-worker. */
  releaseOutcomes: WritePathOutcomeEvidence[];
  /** Live CMS publish adapter — honest NOT_WIRED until wired. */
  liveCmsPublishWiring: "NOT_WIRED";
};

export function emptySeoState(nowIso: string): SeoState {
  return {
    version: 1,
    updatedAtIso: nowIso,
    pageAudits: [],
    proposals: [],
    schemaValidations: [],
    searchIndex: null,
    searchResults: [],
    releaseOutcomes: [],
    liveCmsPublishWiring: "NOT_WIRED",
  };
}

export function derivePageAuditStatus(
  findings: readonly PageAuditFinding[],
): PageAuditStatusValue {
  if (findings.some((f) => f.severity === AuditSeverity.BLOCKER)) {
    return PageAuditStatus.BLOCKED;
  }
  if (
    findings.some(
      (f) =>
        f.severity === AuditSeverity.ERROR ||
        f.severity === AuditSeverity.WARNING,
    )
  ) {
    return PageAuditStatus.NEEDS_ATTENTION;
  }
  return PageAuditStatus.HEALTHY;
}

export function scorePageAudit(findings: readonly PageAuditFinding[]): number {
  let score = 100;
  for (const f of findings) {
    if (f.severity === AuditSeverity.BLOCKER) score -= 40;
    else if (f.severity === AuditSeverity.ERROR) score -= 15;
    else if (f.severity === AuditSeverity.WARNING) score -= 8;
    else score -= 2;
  }
  return Math.max(0, Math.min(100, score));
}

export type CreatePageAuditInput = {
  pageAuditId: string;
  pageAssetId: string;
  siteId: string;
  pagePath: string;
  displayName: string;
  findings: PageAuditFinding[];
  fixtureOnly: boolean;
  createdAtIso: string;
};

export function createPageAudit(input: CreatePageAuditInput): PageAuditRecord {
  const findings = input.findings;
  return {
    pageAuditId: input.pageAuditId,
    pageAssetId: input.pageAssetId,
    siteId: input.siteId,
    pagePath: input.pagePath,
    displayName: input.displayName,
    status: derivePageAuditStatus(findings),
    score: scorePageAudit(findings),
    findings,
    fixtureOnly: input.fixtureOnly,
    createdAtIso: input.createdAtIso,
    updatedAtIso: input.createdAtIso,
  };
}

export type FactSupportLookup = ReadonlyMap<string, SupportLabelValue>;

/**
 * Schema validation: nodes must agree with visible content; cited facts must
 * be SUPPORTED. HYPOTHESIS citations are schema failures (not “truth”).
 */
export function validateSchemaOrg(input: {
  validationId: string;
  pageAssetId: string;
  proposalId?: string | null;
  nodes: SchemaOrgNode[];
  /** Visible page text used for agreement checks. */
  visibleContent: string;
  factLabels: FactSupportLookup;
  fixtureOnly: boolean;
  createdAtIso: string;
}): SchemaValidationResult {
  const issues: SchemaValidationIssue[] = [];
  const visible = input.visibleContent.toLowerCase();

  if (input.nodes.length === 0) {
    issues.push({
      code: "SCHEMA_EMPTY",
      message: "No schema.org nodes provided",
      propertyPath: null,
      relatedFactId: null,
    });
  }

  for (const node of input.nodes) {
    if (!node.schemaType.trim()) {
      issues.push({
        code: "SCHEMA_TYPE_MISSING",
        message: "schemaType is required",
        propertyPath: node.nodeId,
        relatedFactId: null,
      });
    }

    for (const factId of node.citedFactIds) {
      const label = input.factLabels.get(factId);
      if (!label) {
        issues.push({
          code: "SCHEMA_FACT_UNKNOWN",
          message: `Cited fact ${factId} is not in the registry`,
          propertyPath: node.nodeId,
          relatedFactId: factId,
        });
        continue;
      }
      if (label === SupportLabel.HYPOTHESIS) {
        issues.push({
          code: "SCHEMA_HYPOTHESIS_NOT_TRUTH",
          message: `Fact ${factId} is HYPOTHESIS and cannot back schema truth`,
          propertyPath: node.nodeId,
          relatedFactId: factId,
        });
      } else if (label === SupportLabel.UNKNOWN) {
        issues.push({
          code: "SCHEMA_UNKNOWN_FACT",
          message: `Fact ${factId} is UNKNOWN — omit or resolve before schema publish`,
          propertyPath: node.nodeId,
          relatedFactId: factId,
        });
      }
    }

    for (const [key, value] of Object.entries(node.properties)) {
      if (value === null || value === undefined) continue;
      const text = String(value).toLowerCase();
      if (text.length >= 3 && !visible.includes(text) && key !== "@type") {
        // Soft agreement: flag when a concrete string claim is absent from visible copy.
        if (typeof value === "string" && value.trim().length > 0) {
          issues.push({
            code: "SCHEMA_VISIBLE_MISMATCH",
            message: `Property ${key} value is not reflected in visible content`,
            propertyPath: `${node.nodeId}.${key}`,
            relatedFactId: null,
          });
        }
      }
    }
  }

  const hardFail = issues.some(
    (i) =>
      i.code === "SCHEMA_HYPOTHESIS_NOT_TRUTH" ||
      i.code === "SCHEMA_EMPTY" ||
      i.code === "SCHEMA_TYPE_MISSING" ||
      i.code === "SCHEMA_FACT_UNKNOWN",
  );
  const softOnly =
    !hardFail &&
    issues.some(
      (i) =>
        i.code === "SCHEMA_VISIBLE_MISMATCH" || i.code === "SCHEMA_UNKNOWN_FACT",
    );

  let verdict: SchemaValidationVerdictValue = SchemaValidationVerdict.PASS;
  if (hardFail) verdict = SchemaValidationVerdict.FAIL;
  else if (softOnly) verdict = SchemaValidationVerdict.PARTIAL;

  const agreesWithVisibleContent = !issues.some(
    (i) => i.code === "SCHEMA_VISIBLE_MISMATCH",
  );

  return {
    validationId: input.validationId,
    pageAssetId: input.pageAssetId,
    proposalId: input.proposalId ?? null,
    nodes: input.nodes,
    verdict,
    issues,
    agreesWithVisibleContent,
    fixtureOnly: input.fixtureOnly,
    createdAtIso: input.createdAtIso,
  };
}

/**
 * Gate a proposal for review/release: schema changes require passing schema
 * validation; content/schema truth citations must be SUPPORTED.
 */
export function evaluateProposalGate(input: {
  proposal: SeoChangeProposal;
  factLabels: FactSupportLookup;
  schemaValidation?: SchemaValidationResult | null;
}): {
  allowed: boolean;
  code: string | null;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (
    input.proposal.status !== SeoProposalStatus.APPROVED &&
    input.proposal.status !== SeoProposalStatus.READY_FOR_REVIEW
  ) {
    // Release path requires APPROVED; review path may use READY_FOR_REVIEW.
  }

  for (const factId of input.proposal.citedFactIds) {
    const label = input.factLabels.get(factId);
    if (!label) {
      reasons.push(`Cited fact ${factId} missing from registry`);
    } else if (label !== SupportLabel.SUPPORTED) {
      reasons.push(
        `Cited fact ${factId} is ${label} — only SUPPORTED facts may back released claims`,
      );
    }
  }

  for (const factId of input.proposal.hypothesisFactIds) {
    if (input.proposal.citedFactIds.includes(factId)) {
      reasons.push(
        `Fact ${factId} listed as both citation and hypothesis — hypotheses cannot be schema truth`,
      );
    }
  }

  if (input.proposal.changeKind === SeoChangeKind.SCHEMA) {
    if (!input.schemaValidation) {
      reasons.push("Schema change requires a schema validation result");
    } else if (
      input.schemaValidation.verdict === SchemaValidationVerdict.FAIL
    ) {
      reasons.push("Schema validation FAILED — proposal blocked");
    } else if (
      input.schemaValidation.verdict === SchemaValidationVerdict.PARTIAL
    ) {
      reasons.push(
        "Schema validation PARTIAL — resolve UNKNOWN facts / visible mismatches before release",
      );
    }
  }

  if (reasons.length > 0) {
    return {
      allowed: false,
      code: "PROPOSAL_GATE_FAILED",
      reasons,
    };
  }

  return { allowed: true, code: null, reasons: ["Proposal gate passed"] };
}

export function createSeoProposal(input: {
  proposalId: string;
  pageAssetId: string;
  pageAuditId?: string | null;
  changeKind: SeoChangeKindValue;
  title: string;
  summary: string;
  proposedFields: Record<string, string>;
  citedFactIds?: string[];
  hypothesisFactIds?: string[];
  fixtureOnly: boolean;
  createdAtIso: string;
  status?: SeoProposalStatusValue;
}): SeoChangeProposal {
  return {
    proposalId: input.proposalId,
    pageAssetId: input.pageAssetId,
    pageAuditId: input.pageAuditId ?? null,
    changeKind: input.changeKind,
    title: input.title.trim(),
    summary: input.summary.trim(),
    proposedFields: { ...input.proposedFields },
    citedFactIds: [...(input.citedFactIds ?? [])],
    hypothesisFactIds: [...(input.hypothesisFactIds ?? [])],
    status: input.status ?? SeoProposalStatus.DRAFT,
    fixtureOnly: input.fixtureOnly,
    gatewayOperationId: null,
    writePathId: null,
    createdAtIso: input.createdAtIso,
    updatedAtIso: input.createdAtIso,
  };
}

/** Parse natural-language space/service queries into hard constraints. */
export function parseSearchConstraints(rawQuery: string): ParsedSearchConstraints {
  const q = rawQuery.toLowerCase();
  const n = q.match(/\b(\d{1,3})\b/);
  const people = n ? Number(n[1]) : null;

  let category: ParsedSearchConstraints["category"] = null;
  if (/train|classroom|workshop/.test(q)) category = "Training";
  else if (/office|cowork/.test(q)) category = "Office";
  else if (/event|reception|party/.test(q)) category = "Event";
  else if (/meeting|conference|boardroom/.test(q)) category = "Meeting";

  let location: string | null = null;
  if (/new york|manhattan|nyc/.test(q)) location = "New York";
  else if (/los angeles|la\b/.test(q)) location = "Los Angeles";
  else if (/jersey/.test(q)) location = "Jersey City";

  const requiredAmenities: string[] = [];
  if (/display|screen|projector/.test(q)) requiredAmenities.push("display");
  if (/video|zoom|teams/.test(q)) requiredAmenities.push("video");
  if (/whiteboard/.test(q)) requiredAmenities.push("whiteboard");

  const unknownConstraints: string[] = [];
  const unknownPatterns: Array<[RegExp, string]> = [
    [/accessib|wheelchair/, "accessibility"],
    [/parking/, "parking"],
    [/cater/, "catering"],
    [/pool|beach|hotel|bed/, "lodging"],
    [/recording|podcast/, "recording"],
  ];
  for (const [re, label] of unknownPatterns) {
    if (re.test(q)) unknownConstraints.push(label);
  }

  return {
    people,
    category,
    location,
    requiredAmenities,
    unknownConstraints,
  };
}

/**
 * Deterministic structured filters before any ranking. Unknown constraints
 * force honest no-match rather than inventing eligibility.
 */
export function runSemanticSearch(input: {
  queryId: string;
  rawQuery: string;
  index: SemanticSearchIndex;
  createdAtIso: string;
}): SemanticSearchResult {
  const constraints = parseSearchConstraints(input.rawQuery);

  if (constraints.unknownConstraints.length > 0) {
    return {
      queryId: input.queryId,
      rawQuery: input.rawQuery,
      constraints,
      hits: [],
      noMatchReason: `Unsupported or unverified constraints: ${constraints.unknownConstraints.join(", ")}`,
      indexVersion: input.index.version,
      createdAtIso: input.createdAtIso,
    };
  }

  const hits: SemanticSearchHit[] = [];
  for (const entry of input.index.entries) {
    const filterTrace: string[] = [];
    if (entry.inaccessible) {
      filterTrace.push("excluded: inaccessible");
      continue;
    }
    if (constraints.people !== null && entry.capacity < constraints.people) {
      filterTrace.push(
        `capacity ${entry.capacity} < required ${constraints.people}`,
      );
      continue;
    }
    if (constraints.category && entry.category !== constraints.category) {
      filterTrace.push(
        `category ${entry.category} ≠ ${constraints.category}`,
      );
      continue;
    }
    if (
      constraints.location &&
      entry.location.toLowerCase() !== constraints.location.toLowerCase()
    ) {
      filterTrace.push(`location ${entry.location} ≠ ${constraints.location}`);
      continue;
    }
    let amenityOk = true;
    for (const amenity of constraints.requiredAmenities) {
      if (!entry.amenities.map((a) => a.toLowerCase()).includes(amenity)) {
        filterTrace.push(`missing amenity ${amenity}`);
        amenityOk = false;
        break;
      }
    }
    if (!amenityOk) continue;

    filterTrace.push("passed hard constraints");
    const score =
      10 +
      (constraints.people !== null
        ? Math.max(0, 5 - (entry.capacity - constraints.people))
        : 0) +
      constraints.requiredAmenities.length;

    hits.push({
      entryId: entry.entryId,
      name: entry.name,
      score,
      citations: [
        `page:${entry.sourcePageId}`,
        ...entry.groundedFactIds.map((id) => `fact:${id}`),
      ],
      filterTrace,
    });
  }

  hits.sort((a, b) => b.score - a.score);

  return {
    queryId: input.queryId,
    rawQuery: input.rawQuery,
    constraints,
    hits,
    noMatchReason:
      hits.length === 0
        ? "No eligible inventory matched the hard constraints"
        : null,
    indexVersion: input.index.version,
    createdAtIso: input.createdAtIso,
  };
}

export const SeoReleaseDecision = {
  SUCCESS: "SUCCESS",
  FAILURE: "FAILURE",
} as const;

export type SeoReleaseDecisionValue =
  (typeof SeoReleaseDecision)[keyof typeof SeoReleaseDecision];

/**
 * Learning hook for verified SEO release outcomes.
 * fixtureOnly stays true for fixture evidence — never auto-applies authority.
 */
export function buildSeoReleaseOutcome(input: {
  outcomeId: string;
  proposalId: string;
  writePathId: string;
  operationId: string;
  decision: SeoReleaseDecisionValue;
  source: OutcomeEvidenceSourceValue;
  fixtureOnly: boolean;
  summary: string;
  recordedAtIso: string;
  featureHints?: Record<string, string | number | boolean | null>;
}): WritePathOutcomeEvidence {
  const label: OutcomeLabelValue =
    input.decision === SeoReleaseDecision.SUCCESS
      ? OutcomeLabel.SUCCESS
      : OutcomeLabel.FAILURE;

  if (input.source === OutcomeEvidenceSource.FIXTURE && !input.fixtureOnly) {
    throw new Error("FIXTURE SEO release outcome must set fixtureOnly=true");
  }

  return recordWritePathOutcome({
    outcomeId: input.outcomeId,
    writePathId: input.writePathId,
    operationId: input.operationId,
    label,
    source: input.source,
    fixtureOnly: input.fixtureOnly,
    summary: input.summary,
    recordedAtIso: input.recordedAtIso,
    featureHints: {
      proposalId: input.proposalId,
      seoSlice: "R1-07",
      releaseDecision: input.decision,
      ...(input.featureHints ?? {}),
    },
  });
}

export function listSeoOutcomesForLearning(
  state: SeoState,
  options?: { includeFixture?: boolean },
): WritePathOutcomeEvidence[] {
  const includeFixture = options?.includeFixture === true;
  return state.releaseOutcomes.filter((row) => {
    if (row.label === OutcomeLabel.UNKNOWN) return false;
    if (row.fixtureOnly && !includeFixture) return false;
    return true;
  });
}

/**
 * Apply a verified (or failed) release to proposal + learning ledger.
 * Gateway ACCEPTED_PENDING must not call this — only after markVerified
 * (or explicit failure evidence).
 */
export function applySeoReleaseVerification(
  state: SeoState,
  input: {
    proposalId: string;
    decision: SeoReleaseDecisionValue;
    source: OutcomeEvidenceSourceValue;
    fixtureOnly: boolean;
    summary: string;
    outcomeId: string;
    operationId: string;
    writePathId: string;
    nowIso: string;
  },
): {
  state: SeoState;
  proposal: SeoChangeProposal | null;
  outcome: WritePathOutcomeEvidence | null;
  reasons: string[];
} {
  const idx = state.proposals.findIndex((p) => p.proposalId === input.proposalId);
  if (idx < 0) {
    return {
      state,
      proposal: null,
      outcome: null,
      reasons: [`Unknown proposalId ${input.proposalId}`],
    };
  }

  const existing = state.proposals[idx]!;
  const nextStatus =
    input.decision === SeoReleaseDecision.SUCCESS
      ? SeoProposalStatus.VERIFIED
      : SeoProposalStatus.FAILED;

  const proposal: SeoChangeProposal = {
    ...existing,
    status: nextStatus,
    gatewayOperationId: input.operationId,
    writePathId: input.writePathId,
    updatedAtIso: input.nowIso,
  };

  const outcome = buildSeoReleaseOutcome({
    outcomeId: input.outcomeId,
    proposalId: input.proposalId,
    writePathId: input.writePathId,
    operationId: input.operationId,
    decision: input.decision,
    source: input.source,
    fixtureOnly: input.fixtureOnly,
    summary: input.summary,
    recordedAtIso: input.nowIso,
  });

  const proposals = [...state.proposals];
  proposals[idx] = proposal;

  return {
    state: {
      ...state,
      proposals,
      releaseOutcomes: [...state.releaseOutcomes, outcome].slice(-500),
      updatedAtIso: input.nowIso,
    },
    proposal,
    outcome,
    reasons: [
      input.decision === SeoReleaseDecision.SUCCESS
        ? "SEO release verified with evidence"
        : "SEO release failed — learning FAILURE recorded",
    ],
  };
}

/** Live CMS publish is never implied by fixture wiring. */
export function cmsPublishWiringStatus(
  adapterWiring: AdapterWiringValue,
): "NOT_WIRED" | "FIXTURE" {
  if (adapterWiring === AdapterWiring.FIXTURE) return "FIXTURE";
  return "NOT_WIRED";
}

/** Catalog case ids related to SEO/search (do not mark VERIFIED without evidence). */
export const SEO_RELATED_CASE_IDS = [
  "T-S01", // page audit golden suite
  "T-S02", // schema validation gates
  "T-S03", // semantic search constraints
  "T-S04", // pilot page release via gateway
] as const;
