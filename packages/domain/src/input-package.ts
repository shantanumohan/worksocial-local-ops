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

/**
 * UTF-8 byte length without Node Buffer (domain stays free of Node APIs).
 * Lone surrogates are counted as the 3-byte UTF-8 replacement sequence (U+FFFD),
 * matching Node's Buffer.byteLength / TextEncoder behavior.
 */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else {
        // Lone high surrogate → replacement char (3 bytes)
        bytes += 3;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // Lone low surrogate → replacement char (3 bytes)
      bytes += 3;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * SHA-256 hex digest of UTF-8 bytes — pure JS (no Node crypto import).
 * Used to verify inline artifact content against caller-supplied checksums.
 */
export function sha256HexUtf8(text: string): string {
  return sha256HexBytes(utf8Encode(text));
}

function utf8Encode(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      } else {
        code = 0xfffd;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      code = 0xfffd;
    }
    if (code <= 0x7f) {
      out.push(code);
    } else if (code <= 0x7ff) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code <= 0xffff) {
      out.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return out;
}

function sha256HexBytes(bytes: number[]): string {
  // Compact SHA-256 (public-domain style) for integrity checks only.
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const bitLen = bytes.length * 8;
  const withPad = bytes.slice();
  withPad.push(0x80);
  while ((withPad.length % 64) !== 56) {
    withPad.push(0);
  }
  // 64-bit big-endian length (high 32 always 0 for practical package sizes)
  for (let i = 0; i < 4; i += 1) withPad.push(0);
  withPad.push(
    (bitLen >>> 24) & 0xff,
    (bitLen >>> 16) & 0xff,
    (bitLen >>> 8) & 0xff,
    bitLen & 0xff,
  );

  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  const w = new Uint32Array(64);
  for (let i = 0; i < withPad.length; i += 64) {
    for (let t = 0; t < 16; t += 1) {
      const j = i + t * 4;
      w[t] =
        ((withPad[j]! << 24) |
          (withPad[j + 1]! << 16) |
          (withPad[j + 2]! << 8) |
          withPad[j + 3]!) >>>
        0;
    }
    for (let t = 16; t < 64; t += 1) {
      const s0 =
        rotr(w[t - 15]!, 7) ^ rotr(w[t - 15]!, 18) ^ (w[t - 15]! >>> 3);
      const s1 =
        rotr(w[t - 2]!, 17) ^ rotr(w[t - 2]!, 19) ^ (w[t - 2]! >>> 10);
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = [
      H[0]!,
      H[1]!,
      H[2]!,
      H[3]!,
      H[4]!,
      H[5]!,
      H[6]!,
      H[7]!,
    ];
    for (let t = 0; t < 64; t += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t]! + w[t]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0]! + a) >>> 0;
    H[1] = (H[1]! + b) >>> 0;
    H[2] = (H[2]! + c) >>> 0;
    H[3] = (H[3]! + d) >>> 0;
    H[4] = (H[4]! + e) >>> 0;
    H[5] = (H[5]! + f) >>> 0;
    H[6] = (H[6]! + g) >>> 0;
    H[7] = (H[7]! + h) >>> 0;
  }
  return [...H]
    .map((x) => x.toString(16).padStart(8, "0"))
    .join("");
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
    "artifactId" | "revision" | "checksum" | "trustLabel"
  >[],
): string {
  // Trust label is part of identity — reclassifying instruction eligibility must change the digest.
  const lines = [...entries]
    .map(
      (e) =>
        `${e.artifactId}@${e.revision}:${normalizeChecksum(e.checksum)}:${e.trustLabel}`,
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
      const contentDigest = sha256HexUtf8(raw.content);
      if (contentDigest !== checksum) {
        return {
          ok: false,
          code: InputPackageErrorCode.CHECKSUM_MISMATCH,
          reason: `Artifact ${raw.artifactId} checksum does not match inline content digest`,
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

    if (
      typeof raw.maxAgeSeconds !== "number" ||
      !Number.isFinite(raw.maxAgeSeconds) ||
      raw.maxAgeSeconds < 0
    ) {
      return {
        ok: false,
        code: InputPackageErrorCode.STALE_ARTIFACT,
        reason: `Artifact ${raw.artifactId} maxAgeSeconds must be a finite number >= 0 (0 = unlimited)`,
        artifactId: raw.artifactId,
      };
    }

    const capturedMs = Date.parse(raw.capturedAtIso);
    if (!Number.isFinite(capturedMs)) {
      return {
        ok: false,
        code: InputPackageErrorCode.STALE_ARTIFACT,
        reason: `Artifact ${raw.artifactId} has invalid capturedAtIso`,
        artifactId: raw.artifactId,
      };
    }
    if (capturedMs > nowMs) {
      return {
        ok: false,
        code: InputPackageErrorCode.STALE_ARTIFACT,
        reason: `Artifact ${raw.artifactId} capturedAtIso is in the future`,
        artifactId: raw.artifactId,
      };
    }
    if (raw.maxAgeSeconds > 0) {
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
