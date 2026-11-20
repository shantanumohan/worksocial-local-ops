/**
 * Input-package compiler (M3 / NEXT-12 / F02).
 * Pure — no filesystem, network, or CLI.
 *
 * Resolves immutable artifact revisions, checks permissions/checksums/freshness,
 * labels trusted instructions vs untrusted source, enforces size limits, and
 * supplies the role output schema for structured Claude work.
 */

import {
  getAgentRoleContract,
  isAgentRoleId,
  type AgentRoleId,
} from "./agent-roles.js";

/** How content may be used inside a compiled package. */
export const ArtifactTrustLabel = {
  /** Approved playbooks / CLAUDE-style instructions — may guide behavior. */
  TRUSTED_INSTRUCTION: "trusted_instruction",
  /** Uploads, SERP, model drafts — evidence only; never executable instructions. */
  UNTRUSTED_SOURCE: "untrusted_source",
  /** First-party measured facts / page captures with provenance. */
  MEASURED_EVIDENCE: "measured_evidence",
} as const;

export type ArtifactTrustLabelValue =
  (typeof ArtifactTrustLabel)[keyof typeof ArtifactTrustLabel];

export const InputPackageErrorCode = {
  ROLE_UNKNOWN: "ROLE_UNKNOWN",
  EMPTY_PACKAGE: "EMPTY_PACKAGE",
  MISSING_ARTIFACT: "MISSING_ARTIFACT",
  CHECKSUM_MISMATCH: "CHECKSUM_MISMATCH",
  STALE_ARTIFACT: "STALE_ARTIFACT",
  UNAUTHORIZED: "UNAUTHORIZED",
  SIZE_LIMIT: "SIZE_LIMIT",
  KIND_UNSUPPORTED: "KIND_UNSUPPORTED",
  TRUST_LABEL_INVALID: "TRUST_LABEL_INVALID",
  REVISION_REQUIRED: "REVISION_REQUIRED",
} as const;

export type InputPackageErrorCodeValue =
  (typeof InputPackageErrorCode)[keyof typeof InputPackageErrorCode];

/** Immutable artifact revision presented to the compiler. */
export type ArtifactRevisionRef = {
  artifactId: string;
  revision: string;
  /** sha256 hex or `sha256:<hex>` digest of bytes. */
  checksum: string;
  trustLabel: ArtifactTrustLabelValue;
  byteLength: number;
  /** When this revision was captured or approved. */
  capturedAtIso: string;
  /** Max age in seconds from capturedAtIso; 0 = no freshness limit. */
  maxAgeSeconds: number;
  /** Grants permitted to read this revision. */
  allowedGrantIds: readonly string[];
  /** Logical kind — should intersect role inputKinds when role declares them. */
  kind: string;
  /** Optional inline body for fixture/offline cycles (never treated as trusted instruction unless labeled). */
  content?: string;
};

export type CompiledPackageEntry = {
  artifactId: string;
  revision: string;
  checksum: string;
  trustLabel: ArtifactTrustLabelValue;
  kind: string;
  byteLength: number;
  /** True only for TRUSTED_INSTRUCTION — untrusted sources must not become agent defs. */
  instructionEligible: boolean;
  content?: string;
};

export type RoleOutputSchemaSpec = {
  roleId: AgentRoleId;
  expectedOutputKinds: readonly string[];
  structuredOutputType: "RoleStructuredOutput";
  requiredFields: readonly [
    "roleId",
    "jobId",
    "status",
    "summary",
    "artifactIds",
    "proposedEffects",
    "taskRequests",
  ];
  /** Citations must reference package artifact IDs when evidence is required. */
  requireEvidenceCitations: boolean;
};

export type CompiledInputPackage = {
  packageId: string;
  /** Stable digest over sorted artifactId@revision:checksum tuples. */
  packageDigest: string;
  roleId: AgentRoleId;
  sourceRevision: string;
  capabilityGrantId: string;
  compiledAtIso: string;
  entries: readonly CompiledPackageEntry[];
  outputSchema: RoleOutputSchemaSpec;
  totalBytes: number;
  trustedInstructionCount: number;
  untrustedSourceCount: number;
  measuredEvidenceCount: number;
};

export type CompileInputPackageRequest = {
  packageId: string;
  roleId: AgentRoleId | string;
  capabilityGrantId: string;
  sourceRevision: string;
  nowIso: string;
  artifacts: readonly ArtifactRevisionRef[];
  /** Default: sum of role maxOutputBytes (input budget mirrors output ceiling). */
  maxTotalInputBytes?: number;
  /** When true (default), writer/review roles must cite measured/untrusted evidence IDs. */
  requireEvidenceCitations?: boolean;
};

export type CompileInputPackageResult =
  | { ok: true; package: CompiledInputPackage }
  | {
      ok: false;
      code: InputPackageErrorCodeValue;
      reason: string;
      artifactId?: string;
    };

const TRUST_SET = new Set<string>(Object.values(ArtifactTrustLabel));

const REQUIRED_OUTPUT_FIELDS = [
  "roleId",
  "jobId",
  "status",
  "summary",
  "artifactIds",
  "proposedEffects",
  "taskRequests",
] as const;

/** UTF-8 byte length without Node Buffer (domain stays free of Node APIs). */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // Surrogate pair → 4 bytes
      bytes += 4;
      i += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/** Default input budget = role maxOutputBytes when not overridden. */
export const DEFAULT_MAX_INPUT_BYTES_FALLBACK = 256_000;

function normalizeChecksum(checksum: string): string {
  const trimmed = checksum.trim().toLowerCase();
  if (trimmed.startsWith("sha256:")) {
    return trimmed.slice("sha256:".length);
  }
  return trimmed;
}

function isHexSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

/**
 * Deterministic package digest — not a cryptographic commitment of content
 * beyond the caller-supplied revision checksums.
 */
export function digestInputPackageEntries(
  entries: readonly Pick<
    CompiledPackageEntry,
    "artifactId" | "revision" | "checksum"
  >[],
): string {
  const lines = [...entries]
    .map(
      (e) =>
        `${e.artifactId}@${e.revision}:${normalizeChecksum(e.checksum)}`,
    )
    .sort();
  // FNV-1a 32-bit over UTF-8 — stable, dependency-free for package identity.
  let hash = 0x811c9dc5;
  const payload = lines.join("|");
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `pkg:${(hash >>> 0).toString(16).padStart(8, "0")}:${lines.length}`;
}

export function buildRoleOutputSchema(
  roleId: AgentRoleId,
  requireEvidenceCitations: boolean,
): RoleOutputSchemaSpec {
  const contract = getAgentRoleContract(roleId);
  return {
    roleId,
    expectedOutputKinds: contract.outputKinds,
    structuredOutputType: "RoleStructuredOutput",
    requiredFields: REQUIRED_OUTPUT_FIELDS,
    requireEvidenceCitations,
  };
}

/**
 * Compile an evidence/input package for a registered role job.
 * Fail-closed on missing, stale, unauthorized, checksum-invalid, or oversized inputs.
 */
export function compileInputPackage(
  request: CompileInputPackageRequest,
): CompileInputPackageResult {
  if (!isAgentRoleId(request.roleId)) {
    return {
      ok: false,
      code: InputPackageErrorCode.ROLE_UNKNOWN,
      reason: `Unknown role ${String(request.roleId)} — only A01–A30 are registered`,
    };
  }
  const roleId = request.roleId;
  const contract = getAgentRoleContract(roleId);

  if (!request.artifacts || request.artifacts.length === 0) {
    return {
      ok: false,
      code: InputPackageErrorCode.EMPTY_PACKAGE,
      reason: "Input package requires at least one artifact revision",
    };
  }

  const maxBytes =
    request.maxTotalInputBytes ??
    contract.resourceLimits.maxOutputBytes ??
    DEFAULT_MAX_INPUT_BYTES_FALLBACK;

  const nowMs = Date.parse(request.nowIso);
  if (!Number.isFinite(nowMs)) {
    return {
      ok: false,
      code: InputPackageErrorCode.STALE_ARTIFACT,
      reason: `Invalid nowIso '${request.nowIso}'`,
    };
  }

  const entries: CompiledPackageEntry[] = [];
  let totalBytes = 0;
  let trustedInstructionCount = 0;
  let untrustedSourceCount = 0;
  let measuredEvidenceCount = 0;

  for (const raw of request.artifacts) {
    if (!raw.artifactId?.trim()) {
      return {
        ok: false,
        code: InputPackageErrorCode.MISSING_ARTIFACT,
        reason: "artifactId is required",
      };
    }
    if (!raw.revision?.trim()) {
      return {
        ok: false,
        code: InputPackageErrorCode.REVISION_REQUIRED,
        reason: `Artifact ${raw.artifactId} missing immutable revision`,
        artifactId: raw.artifactId,
      };
    }
    if (!TRUST_SET.has(raw.trustLabel)) {
      return {
        ok: false,
        code: InputPackageErrorCode.TRUST_LABEL_INVALID,
        reason: `Artifact ${raw.artifactId} has invalid trustLabel`,
        artifactId: raw.artifactId,
      };
    }

    const checksum = normalizeChecksum(raw.checksum ?? "");
    if (!isHexSha256(checksum)) {
      return {
        ok: false,
        code: InputPackageErrorCode.CHECKSUM_MISMATCH,
        reason: `Artifact ${raw.artifactId} checksum must be sha256 hex (got '${raw.checksum}')`,
        artifactId: raw.artifactId,
      };
    }

    if (
      typeof raw.byteLength !== "number" ||
      !Number.isFinite(raw.byteLength) ||
      raw.byteLength < 0
    ) {
      return {
        ok: false,
        code: InputPackageErrorCode.SIZE_LIMIT,
        reason: `Artifact ${raw.artifactId} byteLength invalid`,
        artifactId: raw.artifactId,
      };
    }

    if (raw.content !== undefined) {
      const actual = utf8ByteLength(raw.content);
      if (actual !== raw.byteLength) {
        return {
          ok: false,
          code: InputPackageErrorCode.CHECKSUM_MISMATCH,
          reason: `Artifact ${raw.artifactId} byteLength ${raw.byteLength} does not match content (${actual})`,
          artifactId: raw.artifactId,
        };
      }
    }

    if (!raw.allowedGrantIds.includes(request.capabilityGrantId)) {
      return {
        ok: false,
        code: InputPackageErrorCode.UNAUTHORIZED,
        reason: `Grant ${request.capabilityGrantId} not authorized to read artifact ${raw.artifactId}@${raw.revision}`,
        artifactId: raw.artifactId,
      };
    }

    if (raw.maxAgeSeconds > 0) {
      const capturedMs = Date.parse(raw.capturedAtIso);
      if (!Number.isFinite(capturedMs)) {
        return {
          ok: false,
          code: InputPackageErrorCode.STALE_ARTIFACT,
          reason: `Artifact ${raw.artifactId} has invalid capturedAtIso`,
          artifactId: raw.artifactId,
        };
      }
      const ageSeconds = Math.floor((nowMs - capturedMs) / 1000);
      if (ageSeconds > raw.maxAgeSeconds) {
        return {
          ok: false,
          code: InputPackageErrorCode.STALE_ARTIFACT,
          reason: `Artifact ${raw.artifactId}@${raw.revision} is stale (age ${ageSeconds}s > max ${raw.maxAgeSeconds}s)`,
          artifactId: raw.artifactId,
        };
      }
    }

    if (
      contract.inputKinds.length > 0 &&
      !contract.inputKinds.includes(raw.kind)
    ) {
      return {
        ok: false,
        code: InputPackageErrorCode.KIND_UNSUPPORTED,
        reason: `Artifact kind '${raw.kind}' is not in ${roleId} inputKinds [${contract.inputKinds.join(", ")}]`,
        artifactId: raw.artifactId,
      };
    }

    totalBytes += raw.byteLength;
    if (totalBytes > maxBytes) {
      return {
        ok: false,
        code: InputPackageErrorCode.SIZE_LIMIT,
        reason: `Input package exceeds maxTotalInputBytes ${maxBytes} (at ${totalBytes} after ${raw.artifactId})`,
        artifactId: raw.artifactId,
      };
    }

    const instructionEligible =
      raw.trustLabel === ArtifactTrustLabel.TRUSTED_INSTRUCTION;
    if (raw.trustLabel === ArtifactTrustLabel.TRUSTED_INSTRUCTION) {
      trustedInstructionCount += 1;
    } else if (raw.trustLabel === ArtifactTrustLabel.UNTRUSTED_SOURCE) {
      untrustedSourceCount += 1;
    } else {
      measuredEvidenceCount += 1;
    }

    const entry: CompiledPackageEntry = {
      artifactId: raw.artifactId,
      revision: raw.revision,
      checksum,
      trustLabel: raw.trustLabel,
      kind: raw.kind,
      byteLength: raw.byteLength,
      instructionEligible,
    };
    if (raw.content !== undefined) {
      entry.content = raw.content;
    }
    entries.push(entry);
  }

  const requireEvidenceCitations = request.requireEvidenceCitations ?? true;

  return {
    ok: true,
    package: {
      packageId: request.packageId,
      packageDigest: digestInputPackageEntries(entries),
      roleId,
      sourceRevision: request.sourceRevision,
      capabilityGrantId: request.capabilityGrantId,
      compiledAtIso: request.nowIso,
      entries,
      outputSchema: buildRoleOutputSchema(roleId, requireEvidenceCitations),
      totalBytes,
      trustedInstructionCount,
      untrustedSourceCount,
      measuredEvidenceCount,
    },
  };
}

/**
 * Evidence IDs a writer/reviewer must cite (measured + untrusted — not instructions alone).
 */
export function evidenceCitationIds(
  pkg: CompiledInputPackage,
): readonly string[] {
  return pkg.entries
    .filter(
      (e) =>
        e.trustLabel === ArtifactTrustLabel.MEASURED_EVIDENCE ||
        e.trustLabel === ArtifactTrustLabel.UNTRUSTED_SOURCE,
    )
    .map((e) => e.artifactId);
}

/**
 * Validate that structured output cites supplied evidence when required.
 */
export function validateEvidenceCitations(input: {
  package: CompiledInputPackage;
  citedArtifactIds: readonly string[];
  summary: string;
}):
  | { ok: true }
  | { ok: false; code: "MISSING_CITATIONS"; reason: string } {
  if (!input.package.outputSchema.requireEvidenceCitations) {
    return { ok: true };
  }
  const required = evidenceCitationIds(input.package);
  if (required.length === 0) {
    return { ok: true };
  }
  const cited = new Set(input.citedArtifactIds);
  const missing = required.filter((id) => !cited.has(id));
  // Also require at least one required id appears in summary for human-readable grounding.
  const summaryMentions = required.some((id) => input.summary.includes(id));
  if (missing.length > 0 || !summaryMentions) {
    return {
      ok: false,
      code: "MISSING_CITATIONS",
      reason:
        missing.length > 0
          ? `Writer output missing evidence citations: ${missing.join(", ")}`
          : `Writer summary must mention at least one evidence artifact id (${required.join(", ")})`,
    };
  }
  return { ok: true };
}
