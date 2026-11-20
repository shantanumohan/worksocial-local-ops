import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ArtifactTrustLabel,
  InputPackageErrorCode,
  compileInputPackage,
  digestInputPackageEntries,
  evidenceCitationIds,
  utf8ByteLength,
  validateEvidenceCitations,
  type ArtifactRevisionRef,
} from "./input-package.js";

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function factArtifact(
  overrides?: Partial<ArtifactRevisionRef>,
): ArtifactRevisionRef {
  const content = overrides?.content ?? "Capacity is 12 seats.";
  const base: ArtifactRevisionRef = {
    artifactId: "fact-capacity",
    revision: "rev-1",
    checksum: sha256(content),
    trustLabel: ArtifactTrustLabel.MEASURED_EVIDENCE,
    byteLength: utf8ByteLength(content),
    capturedAtIso: "2026-11-20T01:00:00.000Z",
    maxAgeSeconds: 86_400,
    allowedGrantIds: ["grant-m3"],
    kind: "approved_facts",
    content,
  };
  if (!overrides) return base;
  const merged = { ...base, ...overrides };
  if (overrides.content !== undefined && overrides.checksum === undefined) {
    merged.checksum = sha256(overrides.content);
  }
  if (overrides.content !== undefined && overrides.byteLength === undefined) {
    merged.byteLength = utf8ByteLength(overrides.content);
  }
  return merged;
}

describe("input-package compiler (M3/NEXT-12)", () => {
  it("compiles immutable revisions with trust labels and output schema", () => {
    const briefContent = "Write a landing update for training rooms.";
    const compiled = compileInputPackage({
      packageId: "pkg-1",
      roleId: "A13",
      capabilityGrantId: "grant-m3",
      sourceRevision: "src-1",
      nowIso: "2026-11-20T02:00:00.000Z",
      artifacts: [
        {
          artifactId: "brief-1",
          revision: "r1",
          checksum: sha256(briefContent),
          trustLabel: ArtifactTrustLabel.TRUSTED_INSTRUCTION,
          byteLength: utf8ByteLength(briefContent),
          capturedAtIso: "2026-11-20T01:00:00.000Z",
          maxAgeSeconds: 0,
          allowedGrantIds: ["grant-m3"],
          kind: "content_brief",
          content: briefContent,
        },
        factArtifact(),
        {
          artifactId: "src-serp",
          revision: "r1",
          checksum: sha256("serp snippet"),
          trustLabel: ArtifactTrustLabel.UNTRUSTED_SOURCE,
          byteLength: utf8ByteLength("serp snippet"),
          capturedAtIso: "2026-11-20T01:30:00.000Z",
          maxAgeSeconds: 86_400,
          allowedGrantIds: ["grant-m3"],
          kind: "source_ids",
          content: "serp snippet",
        },
      ],
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.package.trustedInstructionCount).toBe(1);
    expect(compiled.package.untrustedSourceCount).toBe(1);
    expect(compiled.package.measuredEvidenceCount).toBe(1);
    expect(
      compiled.package.entries.find((e) => e.artifactId === "brief-1")
        ?.instructionEligible,
    ).toBe(true);
    expect(
      compiled.package.entries.find((e) => e.artifactId === "src-serp")
        ?.instructionEligible,
    ).toBe(false);
    expect(compiled.package.outputSchema.structuredOutputType).toBe(
      "RoleStructuredOutput",
    );
    expect(compiled.package.outputSchema.expectedOutputKinds).toContain(
      "article_draft",
    );
    expect(compiled.package.packageDigest).toMatch(/^pkg:/);
    expect(digestInputPackageEntries(compiled.package.entries)).toBe(
      compiled.package.packageDigest,
    );
  });

  it("fails clearly for missing, stale, unauthorized, and oversized inputs", () => {
    expect(
      compileInputPackage({
        packageId: "empty",
        roleId: "A13",
        capabilityGrantId: "grant-m3",
        sourceRevision: "src",
        nowIso: "2026-11-20T02:00:00.000Z",
        artifacts: [],
      }).ok,
    ).toBe(false);

    const stale = compileInputPackage({
      packageId: "stale",
      roleId: "A13",
      capabilityGrantId: "grant-m3",
      sourceRevision: "src",
      nowIso: "2026-11-22T02:00:00.000Z",
      artifacts: [factArtifact({ maxAgeSeconds: 60 })],
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.code).toBe(InputPackageErrorCode.STALE_ARTIFACT);
      expect(stale.reason).toMatch(/stale/i);
    }

    const unauthorized = compileInputPackage({
      packageId: "unauth",
      roleId: "A13",
      capabilityGrantId: "other-grant",
      sourceRevision: "src",
      nowIso: "2026-11-20T02:00:00.000Z",
      artifacts: [factArtifact()],
    });
    expect(unauthorized.ok).toBe(false);
    if (!unauthorized.ok) {
      expect(unauthorized.code).toBe(InputPackageErrorCode.UNAUTHORIZED);
    }

    const oversized = compileInputPackage({
      packageId: "big",
      roleId: "A13",
      capabilityGrantId: "grant-m3",
      sourceRevision: "src",
      nowIso: "2026-11-20T02:00:00.000Z",
      maxTotalInputBytes: 10,
      artifacts: [factArtifact()],
    });
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) {
      expect(oversized.code).toBe(InputPackageErrorCode.SIZE_LIMIT);
    }

    const badChecksum = compileInputPackage({
      packageId: "bad-sum",
      roleId: "A13",
      capabilityGrantId: "grant-m3",
      sourceRevision: "src",
      nowIso: "2026-11-20T02:00:00.000Z",
      artifacts: [factArtifact({ checksum: "not-a-hash" })],
    });
    expect(badChecksum.ok).toBe(false);
    if (!badChecksum.ok) {
      expect(badChecksum.code).toBe(InputPackageErrorCode.CHECKSUM_MISMATCH);
    }
  });

  it("requires writer citations against supplied evidence", () => {
    const compiled = compileInputPackage({
      packageId: "cite",
      roleId: "A13",
      capabilityGrantId: "grant-m3",
      sourceRevision: "src",
      nowIso: "2026-11-20T02:00:00.000Z",
      artifacts: [
        {
          artifactId: "brief-1",
          revision: "r1",
          checksum: sha256("brief"),
          trustLabel: ArtifactTrustLabel.TRUSTED_INSTRUCTION,
          byteLength: utf8ByteLength("brief"),
          capturedAtIso: "2026-11-20T01:00:00.000Z",
          maxAgeSeconds: 0,
          allowedGrantIds: ["grant-m3"],
          kind: "content_brief",
          content: "brief",
        },
        factArtifact(),
      ],
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(evidenceCitationIds(compiled.package)).toEqual(["fact-capacity"]);

    const missing = validateEvidenceCitations({
      package: compiled.package,
      citedArtifactIds: [],
      summary: "A draft with no sources",
    });
    expect(missing.ok).toBe(false);

    const ok = validateEvidenceCitations({
      package: compiled.package,
      citedArtifactIds: ["fact-capacity"],
      summary: "Draft cites fact-capacity for seating.",
    });
    expect(ok.ok).toBe(true);
  });
});
