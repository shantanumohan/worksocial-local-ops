/**
 * R1-07 SEO and search: page audits, SEO change proposals, schema.org
 * validation, semantic search stubs, and gateway-gated pilot page release.
 *
 * Pure types + validators. No network or CMS adapters.
 * Schema “truth” may only cite SUPPORTED facts — never HYPOTHESIS.
 * Acceptance ≠ verified. Live CMS publish remains NOT_WIRED.
 */

import { createHash } from "node:crypto";
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
  /**
   * Digest of pageAssetId + proposedFields — schema validations must match.
   * Always set at creation from proposedFields.
   */
  schemaPayloadDigest: string;
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

/** Client/fixture creation may only start in draft or ready-for-review. */
export const SEO_CREATABLE_STATUSES: ReadonlySet<SeoProposalStatusValue> =
  new Set([SeoProposalStatus.DRAFT, SeoProposalStatus.READY_FOR_REVIEW]);

/** Canonical digest binding a schema proposal to its validated payload. */
export function digestSeoSchemaPayload(
  pageAssetId: string,
  fields: Record<string, string>,
): string {
  const keys = Object.keys(fields).sort();
  const canonical: Record<string, string> = { pageAssetId };
  for (const key of keys) {
    canonical[key] = fields[key]!;
  }
  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

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

/**
 * Flatten schema.org nodes into comparable field map for digest binding.
 * Single-node graphs stay flat so proposal.schemaPayloadDigest still binds.
 * Multi-node graphs prefix keys by nodeId so earlier nodes are not overwritten.
 */
export function schemaNodesToFields(
  nodes: readonly SchemaOrgNode[],
): Record<string, string> {
  const fields: Record<string, string> = {};
  if (nodes.length === 1) {
    const node = nodes[0]!;
    fields["@type"] = node.schemaType;
    for (const [key, value] of Object.entries(node.properties)) {
      if (value === null || value === undefined) continue;
      fields[key] = String(value);
    }
    return fields;
  }
  for (const node of nodes) {
    fields[`${node.nodeId}.@type`] = node.schemaType;
    for (const [key, value] of Object.entries(node.properties)) {
      if (value === null || value === undefined) continue;
      fields[`${node.nodeId}.${key}`] = String(value);
    }
  }
  return fields;
}

export function digestSchemaNodes(
  pageAssetId: string,
  nodes: readonly SchemaOrgNode[],
): string {
  return digestSeoSchemaPayload(pageAssetId, schemaNodesToFields(nodes));
}

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
  /** Digest of page + flattened node fields — must match proposal digest. */
  payloadDigest: string;
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
  /** Max price in minor currency units when parsed; null if absent. */
  priceMaxMinor: number | null;
  /** Raw price phrase retained for clarify/abstain when not enforceable. */
  priceRaw: string | null;
  /** Date / timing phrase when present (not silently dropped). */
  dateRaw: string | null;
  /** Negated amenities / attributes ("without X", "no parking", "not downtown"). */
  negatedTerms: string[];
  /**
   * Constraints recognized but not safely enforceable against the index —
   * prefer clarify/abstain rather than dropping or inverting them.
   */
  unresolvedConstraints: string[];
  /** Constraints the index cannot verify — honest unknown, not false. */
  unknownConstraints: string[];
};

/** M8 grounding status for a search hit — only SUPPORTED facts ground answers. */
export const SearchGroundingStatus = {
  GROUNDED: "grounded",
  UNKNOWN: "unknown",
  UNGROUNDED: "ungrounded",
} as const;

export type SearchGroundingStatusValue =
  (typeof SearchGroundingStatus)[keyof typeof SearchGroundingStatus];

export type SemanticSearchHit = {
  entryId: string;
  name: string;
  score: number;
  citations: string[];
  /** Fact ids that are SUPPORTED at query time (subset of citations). */
  supportedFactIds: string[];
  groundingStatus: SearchGroundingStatusValue;
  filterTrace: string[];
};

/** Honest answer posture for the overall result (M8 / T-F23). */
export const SearchAnswerStatus = {
  GROUNDED: "grounded",
  NO_RESULT: "no_result",
  UNKNOWN: "unknown",
  CLARIFY: "clarify",
} as const;

export type SearchAnswerStatusValue =
  (typeof SearchAnswerStatus)[keyof typeof SearchAnswerStatus];

export type SemanticSearchResult = {
  queryId: string;
  rawQuery: string;
  constraints: ParsedSearchConstraints;
  hits: SemanticSearchHit[];
  noMatchReason: string | null;
  answerStatus: SearchAnswerStatusValue;
  /** Optional booking handoff URL only when grounded in evidence — never invented. */
  bookingHandoffUrl: string | null;
  indexVersion: number;
  createdAtIso: string;
};

/** Operator judgment on a search result (T-F23). */
export const SearchJudgmentLabel = {
  RELEVANT: "relevant",
  WRONG: "wrong",
  NO_MATCH: "no_match",
} as const;

export type SearchJudgmentLabelValue =
  (typeof SearchJudgmentLabel)[keyof typeof SearchJudgmentLabel];

export type SearchJudgmentRecord = {
  judgmentId: string;
  queryId: string;
  label: SearchJudgmentLabelValue;
  note: string;
  fixtureOnly: boolean;
  createdAtIso: string;
};

export type SearchRemediationTask = {
  taskId: string;
  queryId: string;
  judgmentId: string;
  summary: string;
  status: "open" | "done";
  fixtureOnly: boolean;
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
  /** M8 judged retrieval ledger. */
  searchJudgments: SearchJudgmentRecord[];
  searchRemediations: SearchRemediationTask[];
  /** Verified SEO release SUCCESS/FAILURE outcomes for learning-worker. */
  releaseOutcomes: WritePathOutcomeEvidence[];
  /**
   * Durable fixture remote ledger for independent read-back after release.
   * Survives API restart — keyed by proposalId.
   */
  fixtureRemoteLedger: Record<string, Record<string, string>>;
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
    searchJudgments: [],
    searchRemediations: [],
    releaseOutcomes: [],
    fixtureRemoteLedger: {},
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
      if (key === "@type") continue;
      const text = String(value).toLowerCase();
      // Concrete string / number / boolean claims must appear in visible copy.
      const concrete =
        (typeof value === "string" && value.trim().length > 0) ||
        typeof value === "number" ||
        typeof value === "boolean";
      if (concrete && text.length > 0 && !visible.includes(text)) {
        issues.push({
          code: "SCHEMA_VISIBLE_MISMATCH",
          message: `Property ${key} value is not reflected in visible content`,
          propertyPath: `${node.nodeId}.${key}`,
          relatedFactId: null,
        });
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
    payloadDigest: digestSchemaNodes(input.pageAssetId, input.nodes),
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
    } else {
      if (
        input.schemaValidation.pageAssetId !== input.proposal.pageAssetId
      ) {
        reasons.push(
          `Schema validation pageAssetId ${input.schemaValidation.pageAssetId} ≠ proposal ${input.proposal.pageAssetId}`,
        );
      }
      if (
        input.schemaValidation.payloadDigest !==
        input.proposal.schemaPayloadDigest
      ) {
        reasons.push(
          "Schema validation payload digest does not match proposal schema payload",
        );
      }
      if (input.schemaValidation.verdict === SchemaValidationVerdict.FAIL) {
        reasons.push("Schema validation FAILED — proposal blocked");
      } else if (
        input.schemaValidation.verdict === SchemaValidationVerdict.PARTIAL
      ) {
        reasons.push(
          "Schema validation PARTIAL — resolve UNKNOWN facts / visible mismatches before release",
        );
      }
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
  const requested = input.status ?? SeoProposalStatus.DRAFT;
  const status = SEO_CREATABLE_STATUSES.has(requested)
    ? requested
    : SeoProposalStatus.DRAFT;
  const proposedFields = { ...input.proposedFields };
  return {
    proposalId: input.proposalId,
    pageAssetId: input.pageAssetId,
    pageAuditId: input.pageAuditId ?? null,
    changeKind: input.changeKind,
    title: input.title.trim(),
    summary: input.summary.trim(),
    proposedFields,
    schemaPayloadDigest: digestSeoSchemaPayload(
      input.pageAssetId,
      proposedFields,
    ),
    citedFactIds: [...(input.citedFactIds ?? [])],
    hypothesisFactIds: [...(input.hypothesisFactIds ?? [])],
    status,
    fixtureOnly: input.fixtureOnly,
    gatewayOperationId: null,
    writePathId: null,
    createdAtIso: input.createdAtIso,
    updatedAtIso: input.createdAtIso,
  };
}

/**
 * Compare fixture read-back fields to the proposed release payload.
 * Verification requires an explicit matching read-back — never gateway accept alone.
 */
export function evaluateFixtureReadBack(input: {
  proposedFields: Record<string, string>;
  observedFields: Record<string, string>;
}): { matched: boolean; details: string[] } {
  const details: string[] = [];
  const proposedKeys = Object.keys(input.proposedFields).sort();
  if (proposedKeys.length === 0) {
    return { matched: false, details: ["Proposed fields empty — nothing to verify"] };
  }
  for (const key of proposedKeys) {
    const expected = input.proposedFields[key]!;
    const observed = input.observedFields[key];
    if (observed === undefined) {
      details.push(`Missing read-back field ${key}`);
      continue;
    }
    if (observed !== expected) {
      details.push(`Read-back mismatch on ${key}`);
    }
  }
  if (details.length === 0) {
    details.push("Fixture read-back matched proposed fields");
    return { matched: true, details };
  }
  return { matched: false, details };
}

/** Parse natural-language space/service queries into hard constraints. */
export function parseSearchConstraints(rawQuery: string): ParsedSearchConstraints {
  const q = rawQuery.toLowerCase();
  const unresolvedConstraints: string[] = [];

  // Capacity only from person-count phrases — not hours, years, or prices.
  const peopleMatch =
    q.match(
      /\b(\d{1,3})\s*(?:people|persons|person|attendees|guests|pax)\b/,
    ) ??
    q.match(
      /\b(?:people|persons|person|attendees|guests|pax)\s*(?:of|:)?\s*(\d{1,3})\b/,
    ) ??
    // "meeting for 8" / "room for 20" — reject time/money units after the number.
    q.match(
      /\b(?:for|of)\s+(\d{1,3})(?!\s*(?:hours?|hrs?|mins?|minutes?|days?|weeks?|years?|usd|dollars?|\$))\b/,
    );
  const people = peopleMatch ? Number(peopleMatch[1]) : null;

  let category: ParsedSearchConstraints["category"] = null;
  if (/train|classroom|workshop/.test(q)) category = "Training";
  else if (/office|cowork/.test(q)) category = "Office";
  else if (/event|reception|party/.test(q)) category = "Event";
  else if (/meeting|conference|boardroom/.test(q)) category = "Meeting";

  // Location — never invert "not in X" into a positive hard filter.
  let location: string | null = null;
  const negatedLocationMatch = q.match(
    /\b(?:not\s+(?:in|near|around)|outside(?:\s+of)?|excluding)\s+(new york|manhattan|nyc|los angeles|\bla\b|jersey(?:\s+city)?|[a-z][a-z\s-]{1,40}?)(?=\s+(?:with|without|under|before|after|for|on|,|\.|$)|$)/,
  );
  if (negatedLocationMatch?.[1]) {
    const raw = negatedLocationMatch[1].trim();
    unresolvedConstraints.push(`negation:location:${raw}`);
  } else if (/new york|manhattan|nyc/.test(q)) {
    location = "New York";
  } else if (/los angeles|\bla\b/.test(q)) {
    location = "Los Angeles";
  } else if (/jersey/.test(q)) {
    location = "Jersey City";
  } else {
    // Preserve unrecognized location phrases rather than silently dropping them.
    const locMatch = q.match(
      /\b(?:in|near|around)\s+([a-z][a-z\s-]{1,40}?)(?=\s+(?:with|without|under|before|after|for|on|,|\.)|$)/,
    );
    if (locMatch?.[1]) {
      const rawLoc = locMatch[1].trim();
      if (rawLoc && !/^(a|an|the|room|space|office)$/.test(rawLoc)) {
        unresolvedConstraints.push(`location:${rawLoc}`);
      }
    }
  }

  const requiredAmenities: string[] = [];
  // Positive amenity phrases only — "without/no X" handled below (never invert).
  if (/(?<!\bwithout\s)(?<!\bno\s)(?:display|screen|projector)\b/.test(q)) {
    requiredAmenities.push("display");
  }
  if (/(?<!\bwithout\s)(?<!\bno\s)(?:video|zoom|teams)\b/.test(q)) {
    requiredAmenities.push("video");
  }
  if (/(?<!\bwithout\s)(?<!\bno\s)whiteboard\b/.test(q)) {
    requiredAmenities.push("whiteboard");
  }

  // Price — preserve; do not invent "free" or drop the bound.
  let priceMaxMinor: number | null = null;
  let priceRaw: string | null = null;
  const priceMatch =
    q.match(
      /\b(?:under|below|less than|at most|max(?:imum)?)\s*\$?\s*(\d{1,6})(?:\s*(?:usd|dollars?))?\b/,
    ) ?? q.match(/\$\s*(\d{1,6})\s*(?:or less|max|maximum)?\b/);
  if (priceMatch) {
    priceRaw = priceMatch[0]!.trim();
    priceMaxMinor = Number(priceMatch[1]) * 100;
    // Catalog often lacks comparable numeric prices — keep unresolved for clarify.
    unresolvedConstraints.push(`price:${priceRaw}`);
  } else if (/\b(?:cheap|inexpensive|budget|affordable|free)\b/.test(q)) {
    priceRaw = (q.match(/\b(?:cheap|inexpensive|budget|affordable|free)\b/) ?? [
      "price",
    ])[0]!;
    unresolvedConstraints.push(`price:${priceRaw}`);
  }

  // Date / timing — preserve; do not silently drop (incl. ISO dates).
  let dateRaw: string | null = null;
  const dateMatch =
    q.match(/\b(?:on|before|after|by)\s+(\d{4}-\d{2}-\d{2})\b/) ??
    q.match(/\b(\d{4}-\d{2}-\d{2})\b/) ??
    q.match(
      /\b(?:on|before|after|by|this|next)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|weekend|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/,
    ) ??
    q.match(/\b(?:tomorrow|today|tonight|this weekend|next week)\b/) ??
    q.match(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/);
  if (dateMatch) {
    dateRaw = dateMatch[0]!.trim();
    unresolvedConstraints.push(`date:${dateRaw}`);
  }

  // Negations — preserve; never invert into required amenities.
  const negatedTerms: string[] = [];
  const negationPatterns: Array<[RegExp, string]> = [
    [/\b(?:without|no)\s+parking\b/, "parking"],
    [/\b(?:without|no)\s+video\b/, "video"],
    [/\b(?:without|no)\s+(?:display|screen|projector)\b/, "display"],
    [/\b(?:without|no)\s+whiteboard\b/, "whiteboard"],
    [/\b(?:without|no)\s+cater(?:ing)?\b/, "catering"],
    [/\bnot\s+(?:in\s+)?(?:downtown|manhattan|brooklyn)\b/, "downtown"],
    [/\b(?:without|no)\s+([a-z]{3,20})\b/, "generic"],
  ];
  for (const [re, label] of negationPatterns) {
    const m = q.match(re);
    if (!m) continue;
    if (label === "generic") {
      const term = m[1]!;
      if (
        ["people", "persons", "person", "meeting", "room", "space"].includes(term)
      ) {
        continue;
      }
      if (
        ["parking", "video", "display", "whiteboard", "catering"].includes(term)
      ) {
        continue;
      }
      negatedTerms.push(term);
      unresolvedConstraints.push(`negation:${term}`);
    } else if (!negatedTerms.includes(label)) {
      negatedTerms.push(label);
      unresolvedConstraints.push(`negation:${label}`);
    }
  }
  // Strip any amenity that was also negated (defense in depth against invert).
  for (const term of negatedTerms) {
    const idx = requiredAmenities.indexOf(term);
    if (idx >= 0) requiredAmenities.splice(idx, 1);
  }

  const unknownConstraints: string[] = [];
  const unknownPatterns: Array<[RegExp, string]> = [
    [/accessib|wheelchair/, "accessibility"],
    // parking as a positive requirement (negation handled above)
    [/\bparking\b/, "parking"],
    [/cater/, "catering"],
    [/pool|beach|hotel|bed/, "lodging"],
    [/recording|podcast/, "recording"],
  ];
  for (const [re, label] of unknownPatterns) {
    if (!re.test(q)) continue;
    if (negatedTerms.includes(label)) {
      // Already preserved as negation — do not also invent a positive unknown.
      continue;
    }
    unknownConstraints.push(label);
  }

  return {
    people,
    category,
    location,
    requiredAmenities,
    priceMaxMinor,
    priceRaw,
    dateRaw,
    negatedTerms,
    unresolvedConstraints,
    unknownConstraints,
  };
}

function resolveHitGrounding(
  entry: SemanticCatalogEntry,
  factLabels: FactSupportLookup | undefined,
): {
  citations: string[];
  supportedFactIds: string[];
  groundingStatus: SearchGroundingStatusValue;
  exclude: boolean;
  filterNote: string | null;
} {
  const pageCite = `page:${entry.sourcePageId}`;
  if (!factLabels) {
    // Legacy path (unit tests without labels): keep prior citation shape but
    // mark grounding UNKNOWN so callers cannot claim SUPPORTED without labels.
    return {
      citations: [
        pageCite,
        ...entry.groundedFactIds.map((id) => `fact:${id}`),
      ],
      supportedFactIds: [],
      groundingStatus: SearchGroundingStatus.UNKNOWN,
      exclude: false,
      filterNote: "factLabels absent — citations not attested as SUPPORTED",
    };
  }

  const supportedFactIds = entry.groundedFactIds.filter(
    (id) => factLabels.get(id) === SupportLabel.SUPPORTED,
  );
  const unknownOrMissing = entry.groundedFactIds.filter((id) => {
    const label = factLabels.get(id);
    return label === undefined || label === SupportLabel.UNKNOWN;
  });
  const hypothesisOnly = entry.groundedFactIds.filter(
    (id) => factLabels.get(id) === SupportLabel.HYPOTHESIS,
  );

  if (supportedFactIds.length > 0) {
    return {
      citations: [
        pageCite,
        ...supportedFactIds.map((id) => `fact:${id}`),
      ],
      supportedFactIds,
      groundingStatus: SearchGroundingStatus.GROUNDED,
      exclude: false,
      filterNote: null,
    };
  }

  if (entry.groundedFactIds.length === 0) {
    return {
      citations: [pageCite],
      supportedFactIds: [],
      groundingStatus: SearchGroundingStatus.UNGROUNDED,
      exclude: true,
      filterNote: "excluded: no grounded facts — cannot cite SUPPORTED truth",
    };
  }

  if (hypothesisOnly.length > 0 && unknownOrMissing.length === 0) {
    return {
      citations: [pageCite],
      supportedFactIds: [],
      groundingStatus: SearchGroundingStatus.UNGROUNDED,
      exclude: true,
      filterNote:
        "excluded: only HYPOTHESIS facts — public answers require SUPPORTED",
    };
  }

  // UNKNOWN / missing labels — honest abstain rather than inventing eligibility.
  return {
    citations: [pageCite],
    supportedFactIds: [],
    groundingStatus: SearchGroundingStatus.UNKNOWN,
    exclude: true,
    filterNote:
      "excluded: fact support UNKNOWN/missing — honest no-result, not false match",
  };
}

/**
 * Deterministic structured filters before any ranking. Unknown / unresolved
 * constraints force honest clarify/abstain rather than inventing eligibility
 * or silently dropping location/price/date/negation.
 *
 * When factLabels are supplied (M8), public hits cite SUPPORTED facts only.
 */
export function runSemanticSearch(input: {
  queryId: string;
  rawQuery: string;
  index: SemanticSearchIndex;
  createdAtIso: string;
  factLabels?: FactSupportLookup;
  /** Optional booking URL — only attached when answer is grounded. */
  bookingHandoffUrl?: string | null;
}): SemanticSearchResult {
  const constraints = parseSearchConstraints(input.rawQuery);

  if (constraints.unknownConstraints.length > 0) {
    return {
      queryId: input.queryId,
      rawQuery: input.rawQuery,
      constraints,
      hits: [],
      noMatchReason: `Unsupported or unverified constraints: ${constraints.unknownConstraints.join(", ")}`,
      answerStatus: SearchAnswerStatus.UNKNOWN,
      bookingHandoffUrl: null,
      indexVersion: input.index.version,
      createdAtIso: input.createdAtIso,
    };
  }

  if (constraints.unresolvedConstraints.length > 0) {
    return {
      queryId: input.queryId,
      rawQuery: input.rawQuery,
      constraints,
      hits: [],
      noMatchReason: `Clarify or abstain — unresolved constraints preserved (not dropped): ${constraints.unresolvedConstraints.join(", ")}`,
      answerStatus: SearchAnswerStatus.CLARIFY,
      bookingHandoffUrl: null,
      indexVersion: input.index.version,
      createdAtIso: input.createdAtIso,
    };
  }

  const hits: SemanticSearchHit[] = [];
  let sawUnknownGrounding = false;
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

    const grounding = resolveHitGrounding(entry, input.factLabels);
    if (grounding.filterNote) filterTrace.push(grounding.filterNote);
    if (grounding.groundingStatus === SearchGroundingStatus.UNKNOWN) {
      sawUnknownGrounding = true;
    }
    if (grounding.exclude) {
      continue;
    }

    filterTrace.push("passed hard constraints");
    if (grounding.groundingStatus === SearchGroundingStatus.GROUNDED) {
      filterTrace.push("grounded: SUPPORTED facts only");
    }
    const score =
      10 +
      (constraints.people !== null
        ? Math.max(0, 5 - (entry.capacity - constraints.people))
        : 0) +
      constraints.requiredAmenities.length +
      grounding.supportedFactIds.length;

    hits.push({
      entryId: entry.entryId,
      name: entry.name,
      score,
      citations: grounding.citations,
      supportedFactIds: grounding.supportedFactIds,
      groundingStatus: grounding.groundingStatus,
      filterTrace,
    });
  }

  hits.sort((a, b) => b.score - a.score);

  const groundedHits = hits.filter(
    (h) => h.groundingStatus === SearchGroundingStatus.GROUNDED,
  );
  const publicHits = input.factLabels ? groundedHits : hits;

  let answerStatus: SearchAnswerStatusValue;
  let noMatchReason: string | null = null;
  if (publicHits.length > 0) {
    answerStatus = input.factLabels
      ? SearchAnswerStatus.GROUNDED
      : SearchAnswerStatus.UNKNOWN;
  } else if (sawUnknownGrounding && input.factLabels) {
    answerStatus = SearchAnswerStatus.UNKNOWN;
    noMatchReason =
      "Eligible inventory lacked SUPPORTED grounding — UNKNOWN, not a false match";
  } else {
    answerStatus = SearchAnswerStatus.NO_RESULT;
    noMatchReason = "No eligible inventory matched the hard constraints";
  }

  const bookingHandoffUrl =
    answerStatus === SearchAnswerStatus.GROUNDED &&
    input.bookingHandoffUrl &&
    /^https?:\/\//i.test(input.bookingHandoffUrl)
      ? input.bookingHandoffUrl
      : null;

  return {
    queryId: input.queryId,
    rawQuery: input.rawQuery,
    constraints,
    hits: publicHits,
    noMatchReason,
    answerStatus,
    bookingHandoffUrl,
    indexVersion: input.index.version,
    createdAtIso: input.createdAtIso,
  };
}

export function recordSearchJudgment(input: {
  judgmentId: string;
  queryId: string;
  label: SearchJudgmentLabelValue;
  note?: string;
  fixtureOnly?: boolean;
  createdAtIso: string;
}): SearchJudgmentRecord {
  return {
    judgmentId: input.judgmentId,
    queryId: input.queryId,
    label: input.label,
    note: input.note ?? "",
    fixtureOnly: input.fixtureOnly ?? true,
    createdAtIso: input.createdAtIso,
  };
}

export function createSearchRemediation(input: {
  taskId: string;
  queryId: string;
  judgmentId: string;
  summary: string;
  fixtureOnly?: boolean;
  createdAtIso: string;
}): SearchRemediationTask {
  return {
    taskId: input.taskId,
    queryId: input.queryId,
    judgmentId: input.judgmentId,
    summary: input.summary,
    status: "open",
    fixtureOnly: input.fixtureOnly ?? true,
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
  "T-F23", // judged retrieval / no-result (M8)
  "T-US-045",
  "T-US-046",
] as const;
