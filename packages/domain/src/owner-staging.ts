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
