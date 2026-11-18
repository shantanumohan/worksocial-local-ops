/**
 * Feature extraction from durable outcome ledgers.
 * Excludes fixtureOnly / fixture execution by default.
 * Rejects unverified model self-report as training labels.
 */

import {
  OutcomeEvidenceSource,
  OutcomeLabel,
  type OutcomeEvidenceSourceValue,
  type OutcomeLabelValue,
  type RoleRunOutcomeEvidence,
  type WritePathOutcomeEvidence,
} from "@worksocial/domain";

export const LearningExampleKind = {
  WRITE_PATH: "write_path",
  ROLE_RUN: "role_run",
} as const;

export type LearningExampleKindValue =
  (typeof LearningExampleKind)[keyof typeof LearningExampleKind];

export type LearningFeatureVector = {
  /** Stable hashed / categorical feature keys for local models. */
  tokens: readonly string[];
  /** Numeric features (bounded, non-secret). */
  numerics: Readonly<Record<string, number>>;
};

export type LearningExample = {
  exampleId: string;
  kind: LearningExampleKindValue;
  label: typeof OutcomeLabel.SUCCESS | typeof OutcomeLabel.FAILURE;
  features: LearningFeatureVector;
  recordedAtIso: string;
  source: OutcomeEvidenceSourceValue | "role_runtime";
  fixtureExcluded: boolean;
};

export type FeatureExtractionOptions = {
  /** Default false — fixture rows are training noise, not production evidence. */
  includeFixture?: boolean;
};

const VERIFIED_WRITE_PATH_SOURCES: ReadonlySet<OutcomeEvidenceSourceValue> = new Set([
  OutcomeEvidenceSource.GATEWAY_RECEIPT,
  OutcomeEvidenceSource.READ_BACK,
  OutcomeEvidenceSource.JOURNEY_VERIFICATION,
  OutcomeEvidenceSource.OWNER_DECISION,
  OutcomeEvidenceSource.STOP_SWITCH,
  OutcomeEvidenceSource.FIXTURE,
]);

/**
 * Model self-confidence / self-report must never become a training label.
 */
export function isUnverifiedModelClaimLabel(
  hints: Readonly<Record<string, string | number | boolean | null | undefined>>,
): boolean {
  if (hints.labelSource === "model_claim" || hints.labelSource === "model_self_report") {
    return true;
  }
  if (hints.unverifiedModelClaim === true) {
    return true;
  }
  if (hints.authorityFromModelConfidence === true) {
    return true;
  }
  return false;
}

function pushToken(tokens: string[], key: string, value: string | number | boolean | null | undefined): void {
  if (value === null || value === undefined || value === "") {
    return;
  }
  tokens.push(`${key}=${String(value)}`);
}

function writePathFeatures(row: WritePathOutcomeEvidence): LearningFeatureVector {
  const tokens: string[] = [
    `kind=${LearningExampleKind.WRITE_PATH}`,
    `writePathId=${row.writePathId}`,
    `source=${row.source}`,
    `label=${row.label}`,
  ];
  const numerics: Record<string, number> = {};
  for (const [key, value] of Object.entries(row.featureHints)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      numerics[key] = value;
    } else {
      pushToken(tokens, `hint.${key}`, value);
    }
  }
  return { tokens, numerics };
}

function roleRunFeatures(row: RoleRunOutcomeEvidence): LearningFeatureVector {
  const tokens: string[] = [
    `kind=${LearningExampleKind.ROLE_RUN}`,
    `roleId=${row.roleId}`,
    `status=${row.status}`,
    `executionMode=${row.executionMode}`,
    `label=${row.label}`,
  ];
  const numerics: Record<string, number> = {
    costMinor: row.costMinor,
    artifactCount: row.artifactIds.length,
  };
  for (const [key, value] of Object.entries(row.featureHints)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      numerics[key] = value;
    } else {
      pushToken(tokens, `hint.${key}`, value);
    }
  }
  return { tokens, numerics };
}

function asBinaryLabel(
  label: OutcomeLabelValue,
): typeof OutcomeLabel.SUCCESS | typeof OutcomeLabel.FAILURE | null {
  if (label === OutcomeLabel.SUCCESS || label === OutcomeLabel.FAILURE) {
    return label;
  }
  return null;
}

/**
 * Project write-path ledger rows into learning examples.
 * UNKNOWN labels, fixture rows (by default), and model-claim labels are dropped/rejected.
 */
export function extractWritePathExamples(
  outcomes: readonly WritePathOutcomeEvidence[],
  options: FeatureExtractionOptions = {},
): LearningExample[] {
  const includeFixture = options.includeFixture ?? false;
  const examples: LearningExample[] = [];

  for (const row of outcomes) {
    if (isUnverifiedModelClaimLabel(row.featureHints)) {
      throw new Error(
        `Rejected unverified model claim as learning label: ${row.outcomeId}`,
      );
    }
    if (!VERIFIED_WRITE_PATH_SOURCES.has(row.source)) {
      throw new Error(
        `Unrecognized / unverified outcome evidence source for learning: ${String(row.source)}`,
      );
    }
    const label = asBinaryLabel(row.label);
    if (!label) {
      continue;
    }
    if (row.fixtureOnly && !includeFixture) {
      continue;
    }
    if (row.source === OutcomeEvidenceSource.FIXTURE && !includeFixture) {
      continue;
    }
    examples.push({
      exampleId: row.outcomeId,
      kind: LearningExampleKind.WRITE_PATH,
      label,
      features: writePathFeatures(row),
      recordedAtIso: row.recordedAtIso,
      source: row.source,
      fixtureExcluded: row.fixtureOnly,
    });
  }

  return examples;
}

/**
 * Project role-run ledger rows into learning examples.
 * Fixture execution mode is excluded by default (same spirit as fixtureOnly).
 */
export function extractRoleRunExamples(
  outcomes: readonly RoleRunOutcomeEvidence[],
  options: FeatureExtractionOptions = {},
): LearningExample[] {
  const includeFixture = options.includeFixture ?? false;
  const examples: LearningExample[] = [];

  for (const row of outcomes) {
    if (isUnverifiedModelClaimLabel(row.featureHints)) {
      throw new Error(
        `Rejected unverified model claim as learning label: ${row.outcomeId}`,
      );
    }
    const label = asBinaryLabel(row.label);
    if (!label) {
      continue;
    }
    const isFixture = row.executionMode === "fixture";
    if (isFixture && !includeFixture) {
      continue;
    }
    examples.push({
      exampleId: row.outcomeId,
      kind: LearningExampleKind.ROLE_RUN,
      label,
      features: roleRunFeatures(row),
      recordedAtIso: row.recordedAtIso,
      source: "role_runtime",
      fixtureExcluded: isFixture,
    });
  }

  return examples;
}

export function extractLearningExamples(input: {
  writePathOutcomes?: readonly WritePathOutcomeEvidence[];
  roleOutcomes?: readonly RoleRunOutcomeEvidence[];
  includeFixture?: boolean;
}): LearningExample[] {
  const options: FeatureExtractionOptions = {
    includeFixture: input.includeFixture ?? false,
  };
  return [
    ...extractWritePathExamples(input.writePathOutcomes ?? [], options),
    ...extractRoleRunExamples(input.roleOutcomes ?? [], options),
  ];
}

/** Hash token → dense index in a fixed vocabulary window (local, deterministic). */
export function hashToken(token: string, dim: number): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % dim + dim) % dim;
}

export function vectorizeExample(
  example: LearningExample,
  dim: number,
): { binary: Float64Array; label: 0 | 1 } {
  const binary = new Float64Array(dim);
  for (const token of example.features.tokens) {
    binary[hashToken(token, dim)] = 1;
  }
  for (const [key, value] of Object.entries(example.features.numerics)) {
    const idx = hashToken(`num.${key}`, dim);
    // Bound numeric contribution into [0,1]-ish via soft clip.
    binary[idx] = Math.max(0, Math.min(1, Math.abs(value) / (1 + Math.abs(value))));
  }
  return {
    binary,
    label: example.label === OutcomeLabel.SUCCESS ? 1 : 0,
  };
}
