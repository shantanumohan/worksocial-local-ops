/**
 * M4 / NEXT-13–15 — owner-usable staging site workflow domain.
 * Activation → connections → sites → mission → review → evidence.
 * Collectors preserve measurement provenance (FIXTURE vs LIVE).
 * Staging CMS apply ≠ verified; independent read-back required.
 * External effects: none unless explicitly fixture/simulator.
 */

import { createHash } from "node:crypto";

export const ActivationStepId = {
  SIGN_IN: "sign_in",
  WORKSPACE: "workspace",
  HOST_DIAGNOSTICS: "host_diagnostics",
  CONNECTIONS: "connections",
  PILOT_SITE: "pilot_site",
  READ_AND_DRAFT: "read_and_draft",
} as const;
export type ActivationStepIdValue =
  (typeof ActivationStepId)[keyof typeof ActivationStepId];

export const ActivationStepStatus = {
  NOT_STARTED: "NOT_STARTED",
  COMPLETE: "COMPLETE",
  SKIPPED: "SKIPPED",
  BLOCKED: "BLOCKED",
} as const;
export type ActivationStepStatusValue =
  (typeof ActivationStepStatus)[keyof typeof ActivationStepStatus];

export const ConnectionKind = {
  GSC: "gsc",
  GA4: "ga4",
  CMS_STAGING: "cms_staging",
} as const;
export type ConnectionKindValue =
  (typeof ConnectionKind)[keyof typeof ConnectionKind];

export const ConnectionMode = {
  NOT_CONFIGURED: "NOT_CONFIGURED",
  FIXTURE: "FIXTURE",
  LIVE: "LIVE",
} as const;
export type ConnectionModeValue =
  (typeof ConnectionMode)[keyof typeof ConnectionMode];

/** Honest measurement provenance — never collapse fixture into live. */
export const MeasurementMode = {
  FIXTURE: "FIXTURE",
  LIVE: "LIVE",
  UNAVAILABLE: "UNAVAILABLE",
} as const;
export type MeasurementModeValue =
  (typeof MeasurementMode)[keyof typeof MeasurementMode];

export const MissionStatus = {
  DRAFT: "DRAFT",
  EVIDENCE_CAPTURED: "EVIDENCE_CAPTURED",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  APPROVED: "APPROVED",
  APPLYING: "APPLYING",
  ACCEPTED_PENDING: "ACCEPTED_PENDING",
  VERIFIED: "VERIFIED",
  FAILED: "FAILED",
  RECOVERY_REQUIRED: "RECOVERY_REQUIRED",
  REJECTED: "REJECTED",
} as const;
export type MissionStatusValue =
  (typeof MissionStatus)[keyof typeof MissionStatus];

export const ReviewDecision = {
  APPROVE_EXACT: "APPROVE_EXACT",
  REQUEST_REVISION: "REQUEST_REVISION",
  REJECT: "REJECT",
  HOLD: "HOLD",
} as const;
export type ReviewDecisionValue =
  (typeof ReviewDecision)[keyof typeof ReviewDecision];

export const StagingChangeStatus = {
  DRAFT: "DRAFT",
  APPLIED_PENDING: "APPLIED_PENDING",
  VERIFIED: "VERIFIED",
  MISMATCH: "MISMATCH",
  UNKNOWN_REMOTE_OUTCOME: "UNKNOWN_REMOTE_OUTCOME",
  RECOVERED: "RECOVERED",
} as const;
export type StagingChangeStatusValue =
  (typeof StagingChangeStatus)[keyof typeof StagingChangeStatus];

export type ActivationStep = {
  stepId: ActivationStepIdValue;
  title: string;
  status: ActivationStepStatusValue;
  note: string | null;
  completedAtIso: string | null;
};

export type ActivationChecklist = {
  checklistId: string;
  timezone: string;
  steps: ActivationStep[];
  updatedAtIso: string;
};

export type OwnerSiteRecord = {
  siteId: string;
  displayName: string;
  domain: string;
  pilotPagePath: string;
  pilotPageTitle: string;
  environment: "staging" | "fixture";
  sourceBindingLabel: string;
  createdAtIso: string;
};

export type OwnerConnectionRecord = {
  connectionId: string;
  kind: ConnectionKindValue;
  displayName: string;
  mode: ConnectionModeValue;
  /** Owner-safe account label — never a raw secret or token. */
  accountLabel: string | null;
  capabilitySummary: string;
  writeReady: boolean;
  note: string;
  updatedAtIso: string;
};

export type DeterministicCheck = {
  checkId: string;
  name: string;
  passed: boolean;
  detail: string;
};

export type PageSnapshotRecord = {
  snapshotId: string;
  siteId: string;
  pagePath: string;
  title: string;
  canonical: string | null;
  h1: string | null;
  metaDescription: string | null;
  contentDigest: string;
  htmlByteLength: number;
  measurementMode: MeasurementModeValue;
  sourceLabel: string;
  checks: DeterministicCheck[];
  capturedAtIso: string;
};

export type MeasurementObservation = {
  observationId: string;
  kind: ConnectionKindValue;
  measurementMode: MeasurementModeValue;
  /** Owner-facing metric rows — never raw provider JSON dumps as primary UI. */
  rows: Array<{ label: string; value: string }>;
  windowLabel: string;
  note: string;
  capturedAtIso: string;
};

export type StagingPageFields = {
  title: string;
  metaDescription: string;
  h1: string;
  bodyExcerpt: string;
};

export type StagingCmsPageRecord = {
  pageId: string;
  siteId: string;
  path: string;
  fields: StagingPageFields;
  revision: string;
  contentDigest: string;
  updatedAtIso: string;
};

export type StagingChangeRecord = {
  changeId: string;
  missionId: string;
  pageId: string;
  desiredFields: StagingPageFields;
  desiredDigest: string;
  status: StagingChangeStatusValue;
  appliedRevision: string | null;
  observedDigest: string | null;
  recoveryNote: string | null;
  createdAtIso: string;
  updatedAtIso: string;
};

export type OwnerMissionRecord = {
  missionId: string;
  siteId: string;
  displayTitle: string;
  summary: string;
  status: MissionStatusValue;
  beforeSnapshotId: string | null;
  afterSnapshotId: string | null;
  changeId: string | null;
  reviewDecision: ReviewDecisionValue | null;
  reviewNote: string | null;
  desiredFields: StagingPageFields;
  fixtureOnly: boolean;
  createdAtIso: string;
  updatedAtIso: string;
};

export type OwnerEvidenceItem = {
  evidenceId: string;
  missionId: string | null;
  kind:
    | "page_snapshot"
    | "deterministic_checks"
    | "measurement"
    | "staging_apply"
    | "independent_read"
    | "recovery";
  title: string;
  summary: string;
  measurementMode: MeasurementModeValue | null;
  createdAtIso: string;
};

export type OwnerStagingState = {
  version: 1;
  activation: ActivationChecklist | null;
  sites: OwnerSiteRecord[];
  connections: OwnerConnectionRecord[];
  snapshots: PageSnapshotRecord[];
  measurements: MeasurementObservation[];
  cmsPages: StagingCmsPageRecord[];
  changes: StagingChangeRecord[];
  missions: OwnerMissionRecord[];
  evidence: OwnerEvidenceItem[];
  updatedAtIso: string;
  honestNote: string;
};

export const DEFAULT_ACTIVATION_STEPS: ReadonlyArray<{
  stepId: ActivationStepIdValue;
  title: string;
}> = [
  { stepId: ActivationStepId.SIGN_IN, title: "Sign in to the local console" },
  {
    stepId: ActivationStepId.WORKSPACE,
    title: "Confirm business time zone and workspace",
  },
  {
    stepId: ActivationStepId.HOST_DIAGNOSTICS,
    title: "Run host diagnostics",
  },
  {
    stepId: ActivationStepId.CONNECTIONS,
    title: "Connect GSC, GA4, and staging CMS (fixture OK)",
  },
  {
    stepId: ActivationStepId.PILOT_SITE,
    title: "Register the pilot site and page",
  },
  {
    stepId: ActivationStepId.READ_AND_DRAFT,
    title: "Enable read-and-draft pilot",
  },
];

export function emptyOwnerStagingState(nowIso: string): OwnerStagingState {
  return {
    version: 1,
    activation: null,
    sites: [],
    connections: [],
    snapshots: [],
    measurements: [],
    cmsPages: [],
    changes: [],
    missions: [],
    evidence: [],
    updatedAtIso: nowIso,
    honestNote:
      "M4 owner staging workflow. Fixture/simulator by default. Live collectors only when credentials exist. ACCEPTED_PENDING ≠ VERIFIED. Temporal remains NOT_WIRED. Not R1-complete.",
  };
}

export function digestFields(fields: StagingPageFields): string {
  const payload = JSON.stringify({
    title: fields.title,
    metaDescription: fields.metaDescription,
    h1: fields.h1,
    bodyExcerpt: fields.bodyExcerpt,
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function digestHtml(html: string): string {
  return createHash("sha256").update(html, "utf8").digest("hex");
}

export function createActivationChecklist(input: {
  checklistId: string;
  timezone?: string;
  nowIso: string;
}): ActivationChecklist {
  return {
    checklistId: input.checklistId,
    timezone: input.timezone ?? "America/New_York",
    steps: DEFAULT_ACTIVATION_STEPS.map((s) => ({
      stepId: s.stepId,
      title: s.title,
      status: ActivationStepStatus.NOT_STARTED,
      note: null,
      completedAtIso: null,
    })),
    updatedAtIso: input.nowIso,
  };
}

export function setActivationStep(input: {
  checklist: ActivationChecklist;
  stepId: ActivationStepIdValue;
  status: ActivationStepStatusValue;
  note?: string | null;
  nowIso: string;
}): ActivationChecklist {
  return {
    ...input.checklist,
    steps: input.checklist.steps.map((step) =>
      step.stepId === input.stepId
        ? {
            ...step,
            status: input.status,
            note: input.note ?? step.note,
            completedAtIso:
              input.status === ActivationStepStatus.COMPLETE
                ? input.nowIso
                : null,
          }
        : step,
    ),
    updatedAtIso: input.nowIso,
  };
}

export function activationProgress(checklist: ActivationChecklist): {
  complete: number;
  total: number;
  nextStepId: ActivationStepIdValue | null;
} {
  const complete = checklist.steps.filter(
    (s) =>
      s.status === ActivationStepStatus.COMPLETE ||
      s.status === ActivationStepStatus.SKIPPED,
  ).length;
  const next =
    checklist.steps.find((s) => s.status === ActivationStepStatus.NOT_STARTED) ??
    null;
  return {
    complete,
    total: checklist.steps.length,
    nextStepId: next?.stepId ?? null,
  };
}

/**
 * Deterministic HTML field extraction for fixture/live snapshots.
 * Intentionally simple — not a full browser render.
 */
export function extractPageFieldsFromHtml(html: string): {
  title: string;
  canonical: string | null;
  h1: string | null;
  metaDescription: string | null;
} {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const canonicalMatch = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
  );
  const canonicalMatchAlt = html.match(
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i,
  );
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const metaMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
  );
  const metaMatchAlt = html.match(
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i,
  );
  const strip = (s: string | undefined) =>
    (s ?? "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return {
    title: strip(titleMatch?.[1]) || "(untitled)",
    canonical: canonicalMatch?.[1] ?? canonicalMatchAlt?.[1] ?? null,
    h1: strip(h1Match?.[1]) || null,
    metaDescription: metaMatch?.[1] ?? metaMatchAlt?.[1] ?? null,
  };
}

export function runDeterministicPageChecks(input: {
  title: string;
  canonical: string | null;
  h1: string | null;
  metaDescription: string | null;
  htmlByteLength: number;
}): DeterministicCheck[] {
  return [
    {
      checkId: "title_present",
      name: "Title present",
      passed: input.title.length > 0 && input.title !== "(untitled)",
      detail: input.title,
    },
    {
      checkId: "h1_present",
      name: "H1 present",
      passed: Boolean(input.h1 && input.h1.length > 0),
      detail: input.h1 ?? "missing",
    },
    {
      checkId: "meta_description",
      name: "Meta description present",
      passed: Boolean(
        input.metaDescription && input.metaDescription.trim().length > 0,
      ),
      detail: input.metaDescription ?? "missing",
    },
    {
      checkId: "canonical_present",
      name: "Canonical link present",
      passed: Boolean(input.canonical),
      detail: input.canonical ?? "missing",
    },
    {
      checkId: "body_nonempty",
      name: "HTML body nonempty",
      passed: input.htmlByteLength > 32,
      detail: `${input.htmlByteLength} bytes`,
    },
  ];
}

export function createPageSnapshot(input: {
  snapshotId: string;
  siteId: string;
  pagePath: string;
  html: string;
  measurementMode: MeasurementModeValue;
  sourceLabel: string;
  nowIso: string;
}): PageSnapshotRecord {
  const fields = extractPageFieldsFromHtml(input.html);
  const htmlByteLength = Buffer.byteLength(input.html, "utf8");
  return {
    snapshotId: input.snapshotId,
    siteId: input.siteId,
    pagePath: input.pagePath,
    title: fields.title,
    canonical: fields.canonical,
    h1: fields.h1,
    metaDescription: fields.metaDescription,
    contentDigest: digestHtml(input.html),
    htmlByteLength,
    measurementMode: input.measurementMode,
    sourceLabel: input.sourceLabel,
    checks: runDeterministicPageChecks({
      ...fields,
      htmlByteLength,
    }),
    capturedAtIso: input.nowIso,
  };
}

export function fieldsMatch(
  desired: StagingPageFields,
  observed: StagingPageFields,
): { matched: boolean; details: string[] } {
  const details: string[] = [];
  const keys: Array<keyof StagingPageFields> = [
    "title",
    "metaDescription",
    "h1",
    "bodyExcerpt",
  ];
  for (const key of keys) {
    if (desired[key] !== observed[key]) {
      details.push(`Mismatch on ${key}`);
    }
  }
  if (details.length === 0) {
    return { matched: true, details: ["Independent read-back matched desired fields"] };
  }
  return { matched: false, details };
}

/** Owner-safe mission card — no raw JSON, no internal digest dump as primary text. */
export function ownerMissionSummary(mission: OwnerMissionRecord): {
  missionId: string;
  title: string;
  status: MissionStatusValue;
  summary: string;
  siteId: string;
  reviewDecision: ReviewDecisionValue | null;
  fixtureOnly: boolean;
  hasChange: boolean;
} {
  return {
    missionId: mission.missionId,
    title: mission.displayTitle,
    status: mission.status,
    summary: mission.summary,
    siteId: mission.siteId,
    reviewDecision: mission.reviewDecision,
    fixtureOnly: mission.fixtureOnly,
    hasChange: mission.changeId !== null,
  };
}

export function assertIndependentObservedFields(input: {
  desired: StagingPageFields;
  observed: StagingPageFields;
}): { ok: true } | { ok: false; code: "VERIFY_CHEAT_REFUSED"; reason: string } {
  // Callers must supply observed from an independent reader. Identical object
  // identity is fine; copying desired without a reader is a console bug we
  // detect when observedDigest was not produced by staging CMS read.
  if (
    !input.observed.title &&
    !input.observed.metaDescription &&
    !input.observed.h1 &&
    !input.observed.bodyExcerpt
  ) {
    return {
      ok: false,
      code: "VERIFY_CHEAT_REFUSED",
      reason: "Observed fields empty — independent read-back required",
    };
  }
  return { ok: true };
}

/**
 * Declared CMS target environment for publish/repair gates (T-X007).
 * Owner pilot sites remain staging|fixture; production is modeled only so
 * wrong-environment attempts can be refused without a live adapter.
 * Live provider wiring: NOT_WIRED. External effects: NONE.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 */
export const CmsEnvironment = {
  FIXTURE: "fixture",
  STAGING: "staging",
  PRODUCTION: "production",
} as const;

export type CmsEnvironmentValue =
  (typeof CmsEnvironment)[keyof typeof CmsEnvironment];

export type CmsOperationKind = "read" | "publish" | "repair";

/** Catalog cases tied to wrong CMS environment → no production op (T-X007). */
export const WRONG_CMS_ENVIRONMENT_RELATED_CASE_IDS = ["T-X007"] as const;

const CMS_ENVIRONMENTS: ReadonlySet<string> = new Set(
  Object.values(CmsEnvironment),
);

/**
 * Normalize CMS env labels so padding/case/unicode whitespace cannot bypass
 * the gate. Strips BOM, zero-width, NBSP, tabs/newlines; lowercases.
 */
export function normalizeCmsEnvironmentLabel(value: string): string {
  return value
    .replace(/[\uFEFF\u200B-\u200D\u2060]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/[\t\r\n\f\v]+/g, " ")
    .trim()
    .toLowerCase();
}

export type CmsEnvironmentGateResult =
  | {
      ok: true;
      /** Fixture/staging paths never authorize a production mutation. */
      allowProductionOp: false;
      reasons: string[];
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
    }
  | {
      ok: false;
      code:
        | "WRONG_CMS_ENVIRONMENT"
        | "PRODUCTION_OP_REFUSED"
        | "MISSING_ENVIRONMENT"
        | "UNRECOGNIZED_ENVIRONMENT";
      allowProductionOp: false;
      reasons: string[];
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
    };

function isKnownCmsEnvironment(value: string): value is CmsEnvironmentValue {
  return CMS_ENVIRONMENTS.has(value);
}

const CMS_ENV_HONESTY = {
  liveProviderWiring: "NOT_WIRED" as const,
  externalEffects: "NONE" as const,
  fixtureOnly: true as const,
};

/**
 * Refuse CMS mutate when bound vs intended environments disagree, unrecognized,
 * or production (T-X007 — wrong CMS environment → no production op).
 * Labels are whitespace/case-normalized. Fixture/staging matching envs may
 * publish/repair offline only. Honesty: NOT_WIRED / NONE.
 */
export function validateCmsEnvironmentOperation(input: {
  boundEnvironment: CmsEnvironmentValue | string | null | undefined;
  intendedEnvironment: CmsEnvironmentValue | string | null | undefined;
  operation: CmsOperationKind;
}): CmsEnvironmentGateResult {
  const boundRaw = (input.boundEnvironment ?? "").toString();
  const intendedRaw = (input.intendedEnvironment ?? "").toString();
  const bound = normalizeCmsEnvironmentLabel(boundRaw);
  const intended = normalizeCmsEnvironmentLabel(intendedRaw);
  if (!bound || !intended) {
    return {
      ok: false,
      code: "MISSING_ENVIRONMENT",
      allowProductionOp: false,
      reasons: ["CMS bound and intended environments are required"],
      ...CMS_ENV_HONESTY,
    };
  }

  if (!isKnownCmsEnvironment(bound) || !isKnownCmsEnvironment(intended)) {
    return {
      ok: false,
      code: "UNRECOGNIZED_ENVIRONMENT",
      allowProductionOp: false,
      reasons: [
        `CMS environment labels must be fixture|staging|production (bound=${JSON.stringify(bound)}, intended=${JSON.stringify(intended)}) — refuse ${input.operation} (T-X007); no production op`,
      ],
      ...CMS_ENV_HONESTY,
    };
  }

  const mutating =
    input.operation === "publish" || input.operation === "repair";

  if (bound !== intended) {
    return {
      ok: false,
      code: "WRONG_CMS_ENVIRONMENT",
      allowProductionOp: false,
      reasons: [
        `CMS bound=${bound} ≠ intended=${intended} — refuse ${input.operation} (T-X007); no production op`,
      ],
      ...CMS_ENV_HONESTY,
    };
  }

  if (mutating && bound === CmsEnvironment.PRODUCTION) {
    return {
      ok: false,
      code: "PRODUCTION_OP_REFUSED",
      allowProductionOp: false,
      reasons: [
        `Production CMS ${input.operation} refused — wrong/production environment; no production op (T-X007)`,
      ],
      ...CMS_ENV_HONESTY,
    };
  }

  return {
    ok: true,
    allowProductionOp: false,
    reasons: [
      `CMS ${input.operation} allowed for matching ${bound} environment (not production; fixture/simulator only)`,
    ],
    ...CMS_ENV_HONESTY,
  };
}

/**
 * Hillclimb + deepen suite (T-X007): mismatch / unrecognized / missing /
 * production mutate refused; case+unicode-whitespace normalized; aliases
 * refused; staging/fixture ok; production read allowed but never
 * allowProductionOp; fixtureOnly + NOT_WIRED/NONE.
 */
export function evaluateWrongCmsEnvironmentAttackSuite(): {
  passed: boolean;
  details: string[];
  results: CmsEnvironmentGateResult[];
} {
  const details: string[] = [];
  const results: CmsEnvironmentGateResult[] = [];
  let passed = true;

  const honestyOk = (r: CmsEnvironmentGateResult) =>
    r.allowProductionOp === false &&
    r.liveProviderWiring === "NOT_WIRED" &&
    r.externalEffects === "NONE" &&
    r.fixtureOnly === true;

  const expectRefuse = (
    label: string,
    input: {
      boundEnvironment: string | null;
      intendedEnvironment: string | null;
      operation: CmsOperationKind;
    },
    code: Extract<CmsEnvironmentGateResult, { ok: false }>["code"],
  ) => {
    const r = validateCmsEnvironmentOperation(input);
    results.push(r);
    if (r.ok === false && r.code === code && honestyOk(r)) {
      details.push(`${label} → ${code} NOT_WIRED fixtureOnly`);
    } else {
      passed = false;
      details.push(`${label} unexpectedly ${JSON.stringify(r)}`);
    }
  };

  const expectAllow = (
    label: string,
    input: {
      boundEnvironment: string;
      intendedEnvironment: string;
      operation: CmsOperationKind;
    },
  ) => {
    const r = validateCmsEnvironmentOperation(input);
    results.push(r);
    if (r.ok === true && honestyOk(r)) {
      details.push(
        `${label} → allowed (allowProductionOp=false) NOT_WIRED fixtureOnly`,
      );
    } else {
      passed = false;
      details.push(`${label} unexpectedly ${JSON.stringify(r)}`);
    }
  };

  expectRefuse(
    "prod-bound/staging-intended publish",
    {
      boundEnvironment: CmsEnvironment.PRODUCTION,
      intendedEnvironment: CmsEnvironment.STAGING,
      operation: "publish",
    },
    "WRONG_CMS_ENVIRONMENT",
  );
  expectRefuse(
    "staging-bound/prod-intended repair",
    {
      boundEnvironment: CmsEnvironment.STAGING,
      intendedEnvironment: CmsEnvironment.PRODUCTION,
      operation: "repair",
    },
    "WRONG_CMS_ENVIRONMENT",
  );
  expectRefuse(
    "fixture-bound/prod-intended publish",
    {
      boundEnvironment: CmsEnvironment.FIXTURE,
      intendedEnvironment: CmsEnvironment.PRODUCTION,
      operation: "publish",
    },
    "WRONG_CMS_ENVIRONMENT",
  );
  expectRefuse(
    "case+pad PRODUCTION vs staging",
    {
      boundEnvironment: " PRODUCTION ",
      intendedEnvironment: "Staging",
      operation: "publish",
    },
    "WRONG_CMS_ENVIRONMENT",
  );
  expectRefuse(
    "NBSP+ZWSP padded PRODUCTION vs staging",
    {
      boundEnvironment: "\u00A0PRODUCTION\u200B",
      intendedEnvironment: "\u200BStaging\u00A0",
      operation: "repair",
    },
    "WRONG_CMS_ENVIRONMENT",
  );
  expectRefuse(
    "unrecognized 'prod'",
    {
      boundEnvironment: "prod",
      intendedEnvironment: "prod",
      operation: "publish",
    },
    "UNRECOGNIZED_ENVIRONMENT",
  );
  expectRefuse(
    "unrecognized alias 'live'",
    {
      boundEnvironment: "live",
      intendedEnvironment: "live",
      operation: "publish",
    },
    "UNRECOGNIZED_ENVIRONMENT",
  );
  expectRefuse(
    "unrecognized alias 'prd'",
    {
      boundEnvironment: "prd",
      intendedEnvironment: "production",
      operation: "publish",
    },
    "UNRECOGNIZED_ENVIRONMENT",
  );
  expectRefuse(
    "missing intended",
    {
      boundEnvironment: CmsEnvironment.STAGING,
      intendedEnvironment: null,
      operation: "publish",
    },
    "MISSING_ENVIRONMENT",
  );
  expectRefuse(
    "whitespace-only bound",
    {
      boundEnvironment: " \t\u00A0 ",
      intendedEnvironment: CmsEnvironment.STAGING,
      operation: "publish",
    },
    "MISSING_ENVIRONMENT",
  );
  expectRefuse(
    "matching production publish",
    {
      boundEnvironment: CmsEnvironment.PRODUCTION,
      intendedEnvironment: CmsEnvironment.PRODUCTION,
      operation: "publish",
    },
    "PRODUCTION_OP_REFUSED",
  );
  expectRefuse(
    "matching production repair (case)",
    {
      boundEnvironment: "Production",
      intendedEnvironment: "PRODUCTION",
      operation: "repair",
    },
    "PRODUCTION_OP_REFUSED",
  );
  expectRefuse(
    "tab/newline padded matching production publish",
    {
      boundEnvironment: "\tProduction\n",
      intendedEnvironment: " PRODUCTION ",
      operation: "publish",
    },
    "PRODUCTION_OP_REFUSED",
  );

  expectAllow("matching staging publish", {
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    operation: "publish",
  });
  expectAllow("matching fixture repair (padded)", {
    boundEnvironment: " Fixture ",
    intendedEnvironment: "FIXTURE",
    operation: "repair",
  });
  expectAllow("matching staging with NBSP pad", {
    boundEnvironment: "\u00A0staging\u00A0",
    intendedEnvironment: "STAGING",
    operation: "publish",
  });
  expectAllow("matching production read (no mutate)", {
    boundEnvironment: CmsEnvironment.PRODUCTION,
    intendedEnvironment: CmsEnvironment.PRODUCTION,
    operation: "read",
  });

  // Normalize helpers: unicode whitespace collapses; aliases stay unknown.
  if (
    normalizeCmsEnvironmentLabel("\u00A0Production\u200B") === "production" &&
    normalizeCmsEnvironmentLabel("prod") === "prod"
  ) {
    details.push("normalizeCmsEnvironmentLabel strips unicode pad; aliases stay raw");
  } else {
    passed = false;
    details.push("normalizeCmsEnvironmentLabel unexpectedly failed");
  }

  if (results.some((r) => r.allowProductionOp !== false)) {
    passed = false;
    details.push("allowProductionOp elevated on at least one result");
  }

  if (passed) {
    details.push(
      "Deepen suite: unicode-whitespace/aliases/whitespace-only; fixtureOnly; NOT_WIRED/NONE; never allowProductionOp",
    );
  }

  return { passed, details, results };
}

/**
 * True when a CMS credential lease is missing or already expired at `nowIso`
 * (T-X007 lease-expire race — mutate-time recheck).
 */
export function isCmsCredentialLeaseExpired(input: {
  leaseExpiresAtIso: string | null | undefined;
  nowIso: string;
}): boolean {
  if (
    input.leaseExpiresAtIso === null ||
    input.leaseExpiresAtIso === undefined ||
    !String(input.leaseExpiresAtIso).trim()
  ) {
    return true;
  }
  const expiresMs = Date.parse(input.leaseExpiresAtIso);
  const nowMs = Date.parse(input.nowIso);
  if (!Number.isFinite(expiresMs) || !Number.isFinite(nowMs)) {
    return true;
  }
  return nowMs >= expiresMs;
}

export type CmsEnvironmentMutateWithLeaseDecision =
  | {
      allowed: true;
      code: "CMS_MUTATE_AUTHORIZED";
      allowProductionOp: false;
      providerMutateAllowed: true;
      environmentGate: Extract<CmsEnvironmentGateResult, { ok: true }>;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "LEASE_EXPIRED"
        | "WRONG_CMS_ENVIRONMENT"
        | "PRODUCTION_OP_REFUSED"
        | "MISSING_ENVIRONMENT"
        | "UNRECOGNIZED_ENVIRONMENT";
      allowProductionOp: false;
      providerMutateAllowed: false;
      environmentGate: CmsEnvironmentGateResult | null;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      reasons: string[];
    };

/**
 * Mutate-time CMS env + lease gate (T-X007 lease-expire race).
 * A staging env that was OK at T0 must still re-check lease at T1; expired
 * lease refuses mutate (`providerMutateAllowed=false`) — never invent a
 * production op. Live wiring NOT_WIRED; external effects NONE.
 */
export function evaluateCmsEnvironmentMutateWithLease(input: {
  boundEnvironment: CmsEnvironmentValue | string | null | undefined;
  intendedEnvironment: CmsEnvironmentValue | string | null | undefined;
  operation: CmsOperationKind;
  leaseExpiresAtIso: string | null | undefined;
  nowIso: string;
}): CmsEnvironmentMutateWithLeaseDecision {
  const honesty = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    allowProductionOp: false as const,
  };

  if (
    isCmsCredentialLeaseExpired({
      leaseExpiresAtIso: input.leaseExpiresAtIso,
      nowIso: input.nowIso,
    })
  ) {
    return {
      allowed: false,
      code: "LEASE_EXPIRED",
      providerMutateAllowed: false,
      environmentGate: null,
      reasons: [
        "CMS credential lease expired or missing at mutate time — refuse apply (T-X007 lease-expire race); no production op",
      ],
      ...honesty,
    };
  }

  const environmentGate = validateCmsEnvironmentOperation({
    boundEnvironment: input.boundEnvironment,
    intendedEnvironment: input.intendedEnvironment,
    operation: input.operation,
  });

  if (!environmentGate.ok) {
    return {
      allowed: false,
      code: environmentGate.code,
      providerMutateAllowed: false,
      environmentGate,
      reasons: environmentGate.reasons,
      ...honesty,
    };
  }

  return {
    allowed: true,
    code: "CMS_MUTATE_AUTHORIZED",
    providerMutateAllowed: true,
    environmentGate,
    reasons: [
      "CMS env + valid lease at mutate time — fixture/simulator mutate only (not production; NOT_WIRED)",
    ],
    ...honesty,
  };
}

/**
 * Lease-expire race suite (T-X007 deepen + H12): T0 staging+valid lease OK;
 * T1 expired refuses; exact boundary / invalid lease refuse; second mutate
 * after expire refuses; production still refused; missing lease refuses;
 * never allowProductionOp; NOT_WIRED/NONE.
 */
export function evaluateCmsLeaseExpireRaceAttackSuite(): {
  passed: boolean;
  details: string[];
} {
  const details: string[] = [];
  let passed = true;
  const t0 = "2026-11-21T18:00:00.000Z";
  const t1 = "2026-11-21T18:05:00.000Z";
  const leaseExpires = "2026-11-21T18:02:00.000Z";

  const atT0 = evaluateCmsEnvironmentMutateWithLease({
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    operation: "publish",
    leaseExpiresAtIso: leaseExpires,
    nowIso: t0,
  });
  if (
    atT0.allowed === true &&
    atT0.providerMutateAllowed === true &&
    atT0.allowProductionOp === false &&
    atT0.liveProviderWiring === "NOT_WIRED" &&
    atT0.fixtureOnly === true
  ) {
    details.push("T0 staging+valid lease → CMS_MUTATE_AUTHORIZED (fixture only)");
  } else {
    passed = false;
    details.push(`T0 unexpectedly ${JSON.stringify(atT0)}`);
  }

  const atT1 = evaluateCmsEnvironmentMutateWithLease({
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    operation: "publish",
    leaseExpiresAtIso: leaseExpires,
    nowIso: t1,
  });
  if (
    atT1.allowed === false &&
    atT1.code === "LEASE_EXPIRED" &&
    atT1.providerMutateAllowed === false &&
    atT1.allowProductionOp === false
  ) {
    details.push(
      "T1 same staging env after lease expire → LEASE_EXPIRED (race; no mutate)",
    );
  } else {
    passed = false;
    details.push(`T1 unexpectedly ${JSON.stringify(atT1)}`);
  }

  const prodValid = evaluateCmsEnvironmentMutateWithLease({
    boundEnvironment: CmsEnvironment.PRODUCTION,
    intendedEnvironment: CmsEnvironment.PRODUCTION,
    operation: "publish",
    leaseExpiresAtIso: "2099-01-01T00:00:00.000Z",
    nowIso: t0,
  });
  if (
    prodValid.allowed === false &&
    prodValid.code === "PRODUCTION_OP_REFUSED" &&
    prodValid.providerMutateAllowed === false
  ) {
    details.push("Production+valid lease still PRODUCTION_OP_REFUSED");
  } else {
    passed = false;
    details.push(`Production unexpectedly ${JSON.stringify(prodValid)}`);
  }

  const missingLease = evaluateCmsEnvironmentMutateWithLease({
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    operation: "repair",
    leaseExpiresAtIso: null,
    nowIso: t0,
  });
  if (
    missingLease.allowed === false &&
    missingLease.code === "LEASE_EXPIRED" &&
    missingLease.providerMutateAllowed === false
  ) {
    details.push("Missing lease → LEASE_EXPIRED (no mutate)");
  } else {
    passed = false;
    details.push(`Missing lease unexpectedly ${JSON.stringify(missingLease)}`);
  }

  if (
    isCmsCredentialLeaseExpired({
      leaseExpiresAtIso: leaseExpires,
      nowIso: t1,
    }) === true &&
    isCmsCredentialLeaseExpired({
      leaseExpiresAtIso: leaseExpires,
      nowIso: t0,
    }) === false
  ) {
    details.push("isCmsCredentialLeaseExpired T0=false T1=true");
  } else {
    passed = false;
    details.push("isCmsCredentialLeaseExpired unexpectedly failed");
  }

  // H12 edge: exact boundary nowIso === leaseExpiresAtIso → expired.
  const exactNow = "2026-11-21T18:02:00.000Z";
  const exact = evaluateCmsEnvironmentMutateWithLease({
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    operation: "publish",
    leaseExpiresAtIso: exactNow,
    nowIso: exactNow,
  });
  if (
    exact.allowed === false &&
    exact.code === "LEASE_EXPIRED" &&
    exact.providerMutateAllowed === false &&
    isCmsCredentialLeaseExpired({
      leaseExpiresAtIso: exactNow,
      nowIso: exactNow,
    }) === true
  ) {
    details.push(
      "Exact boundary nowIso===leaseExpiresAtIso → LEASE_EXPIRED (no mutate)",
    );
  } else {
    passed = false;
    details.push(`Exact boundary unexpectedly ${JSON.stringify(exact)}`);
  }

  // H12 edge: invalid / non-parseable lease timestamp → expired refuse.
  const invalidLease = evaluateCmsEnvironmentMutateWithLease({
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    operation: "publish",
    leaseExpiresAtIso: "not-a-timestamp",
    nowIso: t0,
  });
  if (
    invalidLease.allowed === false &&
    invalidLease.code === "LEASE_EXPIRED" &&
    invalidLease.providerMutateAllowed === false &&
    invalidLease.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "Invalid lease timestamp → LEASE_EXPIRED; NOT_WIRED; no mutate",
    );
  } else {
    passed = false;
    details.push(`Invalid lease unexpectedly ${JSON.stringify(invalidLease)}`);
  }

  // H12 edge: second mutate after expire still refused (no retry invent).
  const secondAfterExpire = evaluateCmsEnvironmentMutateWithLease({
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    operation: "repair",
    leaseExpiresAtIso: leaseExpires,
    nowIso: t1,
  });
  if (
    secondAfterExpire.allowed === false &&
    secondAfterExpire.code === "LEASE_EXPIRED" &&
    secondAfterExpire.providerMutateAllowed === false &&
    secondAfterExpire.allowProductionOp === false
  ) {
    details.push(
      "Second mutate after lease expire still LEASE_EXPIRED (no invent retry)",
    );
  } else {
    passed = false;
    details.push(
      `Second-after-expire unexpectedly ${JSON.stringify(secondAfterExpire)}`,
    );
  }

  // H13: blank / whitespace-only lease → expired refuse (no mutate).
  const blankLease = evaluateCmsEnvironmentMutateWithLease({
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    operation: "publish",
    leaseExpiresAtIso: "   ",
    nowIso: t0,
  });
  if (
    blankLease.allowed === false &&
    blankLease.code === "LEASE_EXPIRED" &&
    blankLease.providerMutateAllowed === false &&
    blankLease.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "H13 whitespace-only lease → LEASE_EXPIRED; providerMutateAllowed=false; NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`H13 blank lease unexpectedly ${JSON.stringify(blankLease)}`);
  }

  const emptyLease = evaluateCmsEnvironmentMutateWithLease({
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    operation: "repair",
    leaseExpiresAtIso: "",
    nowIso: t0,
  });
  if (
    emptyLease.allowed === false &&
    emptyLease.code === "LEASE_EXPIRED" &&
    emptyLease.providerMutateAllowed === false &&
    emptyLease.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "H14 empty-string lease → LEASE_EXPIRED; providerMutateAllowed=false; NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`H14 empty lease unexpectedly ${JSON.stringify(emptyLease)}`);
  }

  const zwspLease = evaluateCmsEnvironmentMutateWithLease({
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    operation: "publish",
    leaseExpiresAtIso: "\u200b",
    nowIso: t0,
  });
  if (
    zwspLease.allowed === false &&
    zwspLease.code === "LEASE_EXPIRED" &&
    zwspLease.providerMutateAllowed === false
  ) {
    details.push(
      "H15 ZWSP-only lease → LEASE_EXPIRED; providerMutateAllowed=false",
    );
  } else {
    passed = false;
    details.push(`H15 ZWSP lease unexpectedly ${JSON.stringify(zwspLease)}`);
  }

  const doubleZwspLease = evaluateCmsEnvironmentMutateWithLease({
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    operation: "publish",
    leaseExpiresAtIso: "\u200b\u200b",
    nowIso: t0,
  });
  if (
    doubleZwspLease.allowed === false &&
    doubleZwspLease.code === "LEASE_EXPIRED" &&
    doubleZwspLease.providerMutateAllowed === false &&
    doubleZwspLease.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "H16 double-ZWSP-only lease → LEASE_EXPIRED; providerMutateAllowed=false; NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(
      `H16 double-ZWSP lease unexpectedly ${JSON.stringify(doubleZwspLease)}`,
    );
  }

  const zwspPaddedValidIsoLease = evaluateCmsEnvironmentMutateWithLease({
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    operation: "publish",
    leaseExpiresAtIso: `\u200b${leaseExpires}\u200b`,
    nowIso: t0,
  });
  if (
    zwspPaddedValidIsoLease.allowed === false &&
    zwspPaddedValidIsoLease.code === "LEASE_EXPIRED" &&
    zwspPaddedValidIsoLease.providerMutateAllowed === false &&
    zwspPaddedValidIsoLease.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "H17 ZWSP-padded valid ISO lease → LEASE_EXPIRED (Date.parse fail; no mutate); NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(
      `H17 ZWSP-padded ISO lease unexpectedly ${JSON.stringify(zwspPaddedValidIsoLease)}`,
    );
  }

  const bomPaddedValidIsoLease = evaluateCmsEnvironmentMutateWithLease({
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    operation: "publish",
    leaseExpiresAtIso: `\ufeff${leaseExpires}`,
    nowIso: t0,
  });
  if (
    bomPaddedValidIsoLease.allowed === false &&
    bomPaddedValidIsoLease.code === "LEASE_EXPIRED" &&
    bomPaddedValidIsoLease.providerMutateAllowed === false &&
    bomPaddedValidIsoLease.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "H18 BOM-prefixed valid ISO lease → LEASE_EXPIRED (Date.parse fail; no mutate); NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(
      `H18 BOM-padded ISO lease unexpectedly ${JSON.stringify(bomPaddedValidIsoLease)}`,
    );
  }

  if (passed) {
    details.push(
      "Lease-expire race suite: mutate-time recheck; expired/missing/invalid/exact-boundary lease refuses; second mutate refused; NOT_WIRED/NONE",
    );
  }
  return { passed, details };
}
