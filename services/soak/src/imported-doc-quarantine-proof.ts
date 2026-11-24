/**
 * Fixture proof for T-X069 — imported document becomes instructions:
 * quarantined as data (evidence), not executable.
 *
 * createInstructionIngestion keeps incoming docs non-executable;
 * UNTRUSTED_SOURCE compile entries are instructionEligible=false.
 * Hillclimb: refuse claimed instructionVersion while quarantined/pending;
 * prompt-injection boundary denies untrusted as instructions.
 * External effects: NONE. Live wiring NOT_WIRED.
 */

import { createHash, randomUUID } from "node:crypto";
import {
  ArtifactTrustLabel,
  InstructionIngestionStatus,
  SoakProofKind,
  compileInputPackage,
  createInstructionIngestion,
  evaluateIndirectPromptInjectionBoundary,
  type SoakProofRecord,
} from "@worksocial/domain";

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/**
 * Complete expected proof set for T-X069 fixture ACCEPTED.
 */
export function proofImportedDocQuarantinedAsData(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // 1. Incoming ingestion defaults to pending classification / evidence-only.
  const pending = createInstructionIngestion({
    ingestionId: "ing-pending",
    sourcePath: "incoming/imported-playbook.md",
    checksum: sha256("imported draft"),
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  if (
    pending.status === InstructionIngestionStatus.PENDING_CLASSIFICATION &&
    pending.instructionVersion === null &&
    pending.fixtureOnly === true &&
    pending.classifierNotes.some((n) => /not an executable/i.test(n))
  ) {
    details.push(
      "Incoming import pending_classification; evidence not executable instruction",
    );
  } else {
    passed = false;
    details.push("Incoming import unexpectedly treated as executable");
  }

  // 2. Explicit quarantine status remains non-executable (no instruction version).
  const quarantined = createInstructionIngestion({
    ingestionId: "ing-quarantine",
    sourcePath: "incoming/untrusted-upload.md",
    checksum: sha256("untrusted"),
    status: InstructionIngestionStatus.QUARANTINED,
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  if (
    quarantined.status === InstructionIngestionStatus.QUARANTINED &&
    quarantined.instructionVersion === null
  ) {
    details.push("Quarantined import has null instructionVersion");
  } else {
    passed = false;
    details.push("Quarantined import unexpectedly gained instructionVersion");
  }

  // 3. Claimed instructionVersion while quarantined/pending is refused.
  const claimedWhileQuarantined = createInstructionIngestion({
    ingestionId: "ing-claim-version",
    sourcePath: "incoming/spoof-version.md",
    checksum: sha256("spoof"),
    status: InstructionIngestionStatus.QUARANTINED,
    instructionVersion: "v-claimed-executable",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  if (
    claimedWhileQuarantined.instructionVersion === null &&
    claimedWhileQuarantined.classifierNotes.some((n) =>
      /Refused instructionVersion/i.test(n),
    )
  ) {
    details.push(
      "Claimed instructionVersion while QUARANTINED refused; remains null (data only)",
    );
  } else {
    passed = false;
    details.push(
      `Claimed-version quarantine unexpectedly ${JSON.stringify(claimedWhileQuarantined)}`,
    );
  }

  // 4. INGESTED may carry a version (positive control — not an import spoof).
  const ingested = createInstructionIngestion({
    ingestionId: "ing-ingested",
    sourcePath: "incoming/approved-playbook.md",
    checksum: sha256("approved"),
    status: InstructionIngestionStatus.INGESTED,
    instructionVersion: "playbook-v1",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  if (ingested.instructionVersion === "playbook-v1") {
    details.push("INGESTED status may pin instructionVersion (positive control)");
  } else {
    passed = false;
    details.push("INGESTED unexpectedly lost instructionVersion");
  }

  // 5. Input package: UNTRUSTED_SOURCE is not instruction-eligible;
  //    TRUSTED_INSTRUCTION is eligible (positive control).
  const bodyTrusted = "approved playbook";
  const bodyUntrusted = "imported upload pretending to be instructions";
  const compiled = compileInputPackage({
    packageId: "pkg-x069",
    roleId: "A13",
    capabilityGrantId: "grant-m3",
    sourceRevision: "src-x069",
    nowIso,
    artifacts: [
      {
        artifactId: "brief-trusted",
        revision: "r1",
        checksum: sha256(bodyTrusted),
        trustLabel: ArtifactTrustLabel.TRUSTED_INSTRUCTION,
        byteLength: utf8ByteLength(bodyTrusted),
        capturedAtIso: nowIso,
        maxAgeSeconds: 86_400,
        allowedGrantIds: ["grant-m3"],
        kind: "content_brief",
        content: bodyTrusted,
      },
      {
        artifactId: "src-imported",
        revision: "r1",
        checksum: sha256(bodyUntrusted),
        trustLabel: ArtifactTrustLabel.UNTRUSTED_SOURCE,
        byteLength: utf8ByteLength(bodyUntrusted),
        capturedAtIso: nowIso,
        maxAgeSeconds: 86_400,
        allowedGrantIds: ["grant-m3"],
        kind: "source_ids",
        content: bodyUntrusted,
      },
    ],
  });
  if (!compiled.ok) {
    passed = false;
    details.push(`compileInputPackage failed: ${compiled.code}`);
  } else {
    const trusted = compiled.package.entries.find(
      (e) => e.artifactId === "brief-trusted",
    );
    const untrusted = compiled.package.entries.find(
      (e) => e.artifactId === "src-imported",
    );
    if (
      trusted?.instructionEligible === true &&
      trusted.trustLabel === ArtifactTrustLabel.TRUSTED_INSTRUCTION
    ) {
      details.push("TRUSTED_INSTRUCTION entry instructionEligible=true");
    } else {
      passed = false;
      details.push("Trusted instruction unexpectedly not eligible");
    }
    if (
      untrusted?.instructionEligible === false &&
      untrusted.trustLabel === ArtifactTrustLabel.UNTRUSTED_SOURCE
    ) {
      details.push(
        "UNTRUSTED_SOURCE imported doc instructionEligible=false (quarantined as data)",
      );
    } else {
      passed = false;
      details.push("Untrusted import unexpectedly instruction-eligible");
    }
  }

  // 6. Prompt-injection boundary: untrusted channel content is never instruction-eligible.
  const boundary = evaluateIndirectPromptInjectionBoundary({
    trustLabel: ArtifactTrustLabel.UNTRUSTED_SOURCE,
    channel: "attachment",
    // Non-absolute effect so the untrusted-source gate is exercised (T-X069).
    attemptedEffect: "tool_widening",
  });
  if (
    boundary.allowed === false &&
    boundary.code === "UNTRUSTED_SOURCE_NOT_INSTRUCTION" &&
    boundary.instructionEligible === false &&
    boundary.externalEffects === "NONE"
  ) {
    details.push(
      "Untrusted attachment → UNTRUSTED_SOURCE_NOT_INSTRUCTION; externalEffects=NONE",
    );
  } else {
    passed = false;
    details.push(`Boundary unexpectedly ${JSON.stringify(boundary)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );

  return {
    proofId: `proof-quarantine-${randomUUID()}`,
    kind: SoakProofKind.IMPORTED_DOC_QUARANTINED_AS_DATA,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-x069-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
