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
  IndirectInjectionChannel,
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

  const a21Pending1 = createInstructionIngestion({
    ingestionId: "ing-a21-1",
    sourcePath: "incoming/a21-1.md",
    checksum: sha256("a21-1"),
    status: InstructionIngestionStatus.PENDING_CLASSIFICATION,
    instructionVersion: "v-spoof-1",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const a21Pending2 = createInstructionIngestion({
    ingestionId: "ing-a21-2",
    sourcePath: "incoming/a21-2.md",
    checksum: sha256("a21-2"),
    status: InstructionIngestionStatus.PENDING_CLASSIFICATION,
    instructionVersion: "v-spoof-2",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const a21Pending3 = createInstructionIngestion({
    ingestionId: "ing-a21-3",
    sourcePath: "incoming/a21-3.md",
    checksum: sha256("a21-3"),
    status: InstructionIngestionStatus.PENDING_CLASSIFICATION,
    instructionVersion: "v-spoof-3",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  if (
    a21Pending1.instructionVersion === null &&
    a21Pending2.instructionVersion === null &&
    a21Pending3.instructionVersion === null &&
    a21Pending3.classifierNotes.some((n) => /Refused instructionVersion/i.test(n))
  ) {
    details.push(
      "A21 tip-moved-306 train: triple pending claim instructionVersion → refused; remains null",
    );
  } else {
    passed = false;
    details.push(
      `A21 pending triple unexpectedly ${JSON.stringify({ a21Pending3 })}`,
    );
  }

  const a21Reject1 = createInstructionIngestion({
    ingestionId: "ing-a21-r1",
    sourcePath: "incoming/r1.md",
    checksum: sha256("r1"),
    status: InstructionIngestionStatus.REJECTED,
    instructionVersion: "v-r1",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const a21Reject2 = createInstructionIngestion({
    ingestionId: "ing-a21-r2",
    sourcePath: "incoming/r2.md",
    checksum: sha256("r2"),
    status: InstructionIngestionStatus.REJECTED,
    instructionVersion: "v-r2",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const a21Reject3 = createInstructionIngestion({
    ingestionId: "ing-a21-r3",
    sourcePath: "incoming/r3.md",
    checksum: sha256("r3"),
    status: InstructionIngestionStatus.REJECTED,
    instructionVersion: "v-r3",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  if (
    a21Reject1.instructionVersion === null &&
    a21Reject2.instructionVersion === null &&
    a21Reject3.instructionVersion === null &&
    a21Reject3.classifierNotes.some((n) => /Refused instructionVersion/i.test(n))
  ) {
    details.push(
      "A21 tip-moved-306 edge: triple REJECTED claim instructionVersion → refused; remains null",
    );
  } else {
    passed = false;
    details.push(
      `A21 rejected triple unexpectedly ${JSON.stringify({ a21Reject3 })}`,
    );
  }

  const a21Quarantine1 = createInstructionIngestion({
    ingestionId: "ing-a21-q1",
    sourcePath: "incoming/q1.md",
    checksum: sha256("q1"),
    status: InstructionIngestionStatus.QUARANTINED,
    instructionVersion: "v-q1",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const a21Quarantine2 = createInstructionIngestion({
    ingestionId: "ing-a21-q2",
    sourcePath: "incoming/q2.md",
    checksum: sha256("q2"),
    status: InstructionIngestionStatus.QUARANTINED,
    instructionVersion: "v-q2",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const a21Quarantine3 = createInstructionIngestion({
    ingestionId: "ing-a21-q3",
    sourcePath: "incoming/q3.md",
    checksum: sha256("q3"),
    status: InstructionIngestionStatus.QUARANTINED,
    instructionVersion: "v-q3",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  if (
    a21Quarantine1.instructionVersion === null &&
    a21Quarantine2.instructionVersion === null &&
    a21Quarantine3.instructionVersion === null &&
    a21Quarantine3.classifierNotes.some((n) =>
      /Refused instructionVersion/i.test(n),
    )
  ) {
    details.push(
      "A21 tip-moved-306 quarantine edge: triple QUARANTINED claim instructionVersion → refused; remains null",
    );
  } else {
    passed = false;
    details.push(
      `A21 quarantine triple unexpectedly ${JSON.stringify({ a21Quarantine3 })}`,
    );
  }

  const a21W151 = createInstructionIngestion({
    ingestionId: "ing-a21-w15-1",
    sourcePath: "incoming/w15-1.md",
    checksum: sha256("w15-1"),
    status: InstructionIngestionStatus.PENDING_CLASSIFICATION,
    instructionVersion: "v-w15-1",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const a21W152 = createInstructionIngestion({
    ingestionId: "ing-a21-w15-2",
    sourcePath: "incoming/w15-2.md",
    checksum: sha256("w15-2"),
    status: InstructionIngestionStatus.PENDING_CLASSIFICATION,
    instructionVersion: "v-w15-2",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const a21W153 = createInstructionIngestion({
    ingestionId: "ing-a21-w15-3",
    sourcePath: "incoming/w15-3.md",
    checksum: sha256("w15-3"),
    status: InstructionIngestionStatus.PENDING_CLASSIFICATION,
    instructionVersion: "v-w15-3",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const a21W154 = createInstructionIngestion({
    ingestionId: "ing-a21-w15-4",
    sourcePath: "incoming/w15-4.md",
    checksum: sha256("w15-4"),
    status: InstructionIngestionStatus.PENDING_CLASSIFICATION,
    instructionVersion: "v-w15-4",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  if (
    a21W151.instructionVersion === null &&
    a21W152.instructionVersion === null &&
    a21W153.instructionVersion === null &&
    a21W154.instructionVersion === null &&
    a21W154.classifierNotes.some((n) => /Refused instructionVersion/i.test(n))
  ) {
    details.push(
      "A21 tip-moved-306 quad edge: quad PENDING claim instructionVersion → refused; remains null",
    );
  } else {
    passed = false;
    details.push(
      `A21 wipe15 quad unexpectedly ${JSON.stringify({ a21W154 })}`,
    );
  }

  const a21W15R1 = createInstructionIngestion({
    ingestionId: "ing-a21-w15r-1",
    sourcePath: "incoming/w15r-1.md",
    checksum: sha256("w15r-1"),
    status: InstructionIngestionStatus.REJECTED,
    instructionVersion: "v-w15r-1",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const a21W15R2 = createInstructionIngestion({
    ingestionId: "ing-a21-w15r-2",
    sourcePath: "incoming/w15r-2.md",
    checksum: sha256("w15r-2"),
    status: InstructionIngestionStatus.REJECTED,
    instructionVersion: "v-w15r-2",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const a21W15R3 = createInstructionIngestion({
    ingestionId: "ing-a21-w15r-3",
    sourcePath: "incoming/w15r-3.md",
    checksum: sha256("w15r-3"),
    status: InstructionIngestionStatus.REJECTED,
    instructionVersion: "v-w15r-3",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const a21W15R4 = createInstructionIngestion({
    ingestionId: "ing-a21-w15r-4",
    sourcePath: "incoming/w15r-4.md",
    checksum: sha256("w15r-4"),
    status: InstructionIngestionStatus.REJECTED,
    instructionVersion: "v-w15r-4",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  if (
    a21W15R1.instructionVersion === null &&
    a21W15R2.instructionVersion === null &&
    a21W15R3.instructionVersion === null &&
    a21W15R4.instructionVersion === null &&
    a21W15R4.classifierNotes.some((n) => /Refused instructionVersion/i.test(n))
  ) {
    details.push(
      "A21 tip-moved-306 quad-rejected edge: quad REJECTED claim instructionVersion → refused; remains null",
    );
  } else {
    passed = false;
    details.push(
      `A21 wipe15 quad rejected unexpectedly ${JSON.stringify({ a21W15R4 })}`,
    );
  }

  const a21W15Q1 = createInstructionIngestion({
    ingestionId: "ing-a21-w15q-1",
    sourcePath: "incoming/w15q-1.md",
    checksum: sha256("w15q-1"),
    status: InstructionIngestionStatus.QUARANTINED,
    instructionVersion: "v-w15q-1",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const a21W15Q2 = createInstructionIngestion({
    ingestionId: "ing-a21-w15q-2",
    sourcePath: "incoming/w15q-2.md",
    checksum: sha256("w15q-2"),
    status: InstructionIngestionStatus.QUARANTINED,
    instructionVersion: "v-w15q-2",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const a21W15Q3 = createInstructionIngestion({
    ingestionId: "ing-a21-w15q-3",
    sourcePath: "incoming/w15q-3.md",
    checksum: sha256("w15q-3"),
    status: InstructionIngestionStatus.QUARANTINED,
    instructionVersion: "v-w15q-3",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const a21W15Q4 = createInstructionIngestion({
    ingestionId: "ing-a21-w15q-4",
    sourcePath: "incoming/w15q-4.md",
    checksum: sha256("w15q-4"),
    status: InstructionIngestionStatus.QUARANTINED,
    instructionVersion: "v-w15q-4",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  if (
    a21W15Q1.instructionVersion === null &&
    a21W15Q2.instructionVersion === null &&
    a21W15Q3.instructionVersion === null &&
    a21W15Q4.instructionVersion === null &&
    a21W15Q4.classifierNotes.some((n) => /Refused instructionVersion/i.test(n))
  ) {
    details.push(
      "A21 tip-moved-306 quad-quarantine edge: quad QUARANTINED claim instructionVersion → refused; remains null",
    );
  } else {
    passed = false;
    details.push(
      `A21 wipe15 quad quarantine unexpectedly ${JSON.stringify({ a21W15Q4 })}`,
    );
  }

  const a21W15P = [];
  for (let i = 1; i <= 5; i++) {
    a21W15P.push(
      createInstructionIngestion({
        ingestionId: `ing-a21-w15p-${i}`,
        sourcePath: `incoming/w15p-${i}.md`,
        checksum: sha256(`w15p-${i}`),
        status: InstructionIngestionStatus.PENDING_CLASSIFICATION,
        instructionVersion: `v-w15p-${i}`,
        fixtureOnly: true,
        createdAtIso: nowIso,
      }),
    );
  }
  if (
    a21W15P.every((r) => r.instructionVersion === null) &&
    a21W15P[4]!.classifierNotes.some((n) => /Refused instructionVersion/i.test(n))
  ) {
    details.push(
      "A21 wipe15-64829602 edge: quint PENDING claim instructionVersion → refused; remains null",
    );
  } else {
    passed = false;
    details.push(
      `A21 wipe15 quint pending unexpectedly ${JSON.stringify({ last: a21W15P[4] })}`,
    );
  }

  const a21W15R5 = [];
  for (let i = 1; i <= 5; i++) {
    a21W15R5.push(
      createInstructionIngestion({
        ingestionId: `ing-a21-w15r5-${i}`,
        sourcePath: `incoming/w15r5-${i}.md`,
        checksum: sha256(`w15r5-${i}`),
        status: InstructionIngestionStatus.REJECTED,
        instructionVersion: `v-w15r5-${i}`,
        fixtureOnly: true,
        createdAtIso: nowIso,
      }),
    );
  }
  if (
    a21W15R5.every((r) => r.instructionVersion === null) &&
    a21W15R5[4]!.classifierNotes.some((n) => /Refused instructionVersion/i.test(n))
  ) {
    details.push(
      "A21 wipe15-5ed3d15d edge: quint REJECTED claim instructionVersion → refused; remains null",
    );
  } else {
    passed = false;
    details.push(
      `A21 wipe15 quint rejected unexpectedly ${JSON.stringify({ last: a21W15R5[4] })}`,
    );
  }

  const a21W15Q5 = [];
  for (let i = 1; i <= 5; i++) {
    a21W15Q5.push(
      createInstructionIngestion({
        ingestionId: `ing-a21-w15q5-${i}`,
        sourcePath: `incoming/w15q5-${i}.md`,
        checksum: sha256(`w15q5-${i}`),
        status: InstructionIngestionStatus.QUARANTINED,
        instructionVersion: `v-w15q5-${i}`,
        fixtureOnly: true,
        createdAtIso: nowIso,
      }),
    );
  }
  if (
    a21W15Q5.every((r) => r.instructionVersion === null) &&
    a21W15Q5[4]!.classifierNotes.some((n) => /Refused instructionVersion/i.test(n))
  ) {
    details.push(
      "A21 wipe15-5ed3d15d quarantine edge: quint QUARANTINED claim instructionVersion → refused; remains null",
    );
  } else {
    passed = false;
    details.push(
      `A21 wipe15 quint quarantine unexpectedly ${JSON.stringify({ last: a21W15Q5[4] })}`,
    );
  }

  const a22C27 = [];
  for (let i = 0; i < 6; i++) {
    a22C27.push(
      createInstructionIngestion({
        ingestionId: `ing-a22-c27-${i}`,
        sourcePath: `incoming/a22-c27-${i}.md`,
        checksum: sha256(`a22-c27-${i}`),
        status: InstructionIngestionStatus.PENDING_CLASSIFICATION,
        instructionVersion: `v-a22-c27-${i}`,
        fixtureOnly: true,
        createdAtIso: nowIso,
      }),
    );
  }
  if (
    a22C27.every((r) => r.instructionVersion === null) &&
    a22C27[5]!.classifierNotes.some((n) => /Refused instructionVersion/i.test(n))
  ) {
    details.push(
      "A22 bind-c27aaaa0 continue: sext PENDING claim instructionVersion → refused; remains null",
    );
  } else {
    passed = false;
    details.push(
      `A22 sext pending unexpectedly ${JSON.stringify({ last: a22C27[5] })}`,
    );
  }

  const a22W15R6 = [];
  for (let i = 0; i < 6; i++) {
    a22W15R6.push(
      createInstructionIngestion({
        ingestionId: `ing-a22-w15r6-${i}`,
        sourcePath: `incoming/a22-w15r6-${i}.md`,
        checksum: sha256(`a22-w15r6-${i}`),
        status: InstructionIngestionStatus.REJECTED,
        instructionVersion: `v-a22-w15r6-${i}`,
        fixtureOnly: true,
        createdAtIso: nowIso,
      }),
    );
  }
  if (
    a22W15R6.every((r) => r.instructionVersion === null) &&
    a22W15R6[5]!.classifierNotes.some((n) => /Refused instructionVersion/i.test(n))
  ) {
    details.push(
      "A22 wipe15-579ffaf8 edge: sext REJECTED claim instructionVersion → refused; remains null",
    );
  } else {
    passed = false;
    details.push(
      `A22 wipe15 sext rejected unexpectedly ${JSON.stringify({ last: a22W15R6[5] })}`,
    );
  }

  const a22W15Q6 = [];
  for (let i = 0; i < 6; i++) {
    a22W15Q6.push(
      createInstructionIngestion({
        ingestionId: `ing-a22-w15q6-${i}`,
        sourcePath: `incoming/a22-w15q6-${i}.md`,
        checksum: sha256(`a22-w15q6-${i}`),
        status: InstructionIngestionStatus.QUARANTINED,
        instructionVersion: `v-a22-w15q6-${i}`,
        fixtureOnly: true,
        createdAtIso: nowIso,
      }),
    );
  }
  if (
    a22W15Q6.every((r) => r.instructionVersion === null) &&
    a22W15Q6[5]!.classifierNotes.some((n) => /Refused instructionVersion/i.test(n))
  ) {
    details.push(
      "A22 wipe15-579ffaf8 quarantine edge: sext QUARANTINED claim instructionVersion → refused; remains null",
    );
  } else {
    passed = false;
    details.push(
      `A22 wipe15 sext quarantine unexpectedly ${JSON.stringify({ last: a22W15Q6[5] })}`,
    );
  }

  // A22 tip-moved-316 @ 60b4b782 — padded version refuse + multi-channel boundary
  const tip316Statuses = [
    InstructionIngestionStatus.PENDING_CLASSIFICATION,
    InstructionIngestionStatus.REJECTED,
    InstructionIngestionStatus.QUARANTINED,
  ] as const;
  const tip316Padded = tip316Statuses.map((status, i) =>
    createInstructionIngestion({
      ingestionId: `ing-a22-tip316-pad-${i}`,
      sourcePath: `incoming/a22-tip316-pad-${i}.md`,
      checksum: sha256(`a22-tip316-pad-${i}`),
      status,
      instructionVersion: "  v-tip316-pad  ",
      fixtureOnly: true,
      createdAtIso: nowIso,
    }),
  );
  const tip316Whitespace = createInstructionIngestion({
    ingestionId: "ing-a22-tip316-ws",
    sourcePath: "incoming/a22-tip316-ws.md",
    checksum: sha256("a22-tip316-ws"),
    status: InstructionIngestionStatus.PENDING_CLASSIFICATION,
    instructionVersion: " \t  ",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  if (
    tip316Padded.every(
      (r) =>
        r.instructionVersion === null &&
        r.classifierNotes.some((n) => /Refused instructionVersion/i.test(n)),
    ) &&
    tip316Whitespace.instructionVersion === null &&
    tip316Whitespace.status ===
      InstructionIngestionStatus.PENDING_CLASSIFICATION
  ) {
    details.push(
      "A22 tip-moved-316 edge: padded instructionVersion refused across PENDING/REJECTED/QUARANTINED; whitespace-only never pins",
    );
  } else {
    passed = false;
    details.push(
      `A22 tip-moved-316 padded/whitespace unexpectedly ${JSON.stringify({ tip316Padded, tip316Whitespace })}`,
    );
  }

  const tip316Channels = [
    IndirectInjectionChannel.EMAIL,
    IndirectInjectionChannel.WEB,
  ] as const;
  const tip316Boundaries = tip316Channels.map((channel) =>
    evaluateIndirectPromptInjectionBoundary({
      trustLabel: ArtifactTrustLabel.UNTRUSTED_SOURCE,
      channel,
      attemptedEffect: "tool_widening",
    }),
  );
  if (
    tip316Boundaries.every(
      (b) =>
        b.allowed === false &&
        b.code === "UNTRUSTED_SOURCE_NOT_INSTRUCTION" &&
        b.instructionEligible === false &&
        b.externalEffects === "NONE" &&
        b.liveProviderWiring === "NOT_WIRED",
    )
  ) {
    details.push(
      "A22 tip-moved-316 channel edge: untrusted email+web → UNTRUSTED_SOURCE_NOT_INSTRUCTION; externalEffects=NONE; NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(
      `A22 tip-moved-316 channel boundary unexpectedly ${JSON.stringify(tip316Boundaries)}`,
    );
  }

  // A23 bind-bfed7a60 @ bfed7a609 — sept pending refuse + ATTACHMENT channel boundary
  const a23Bfed = [];
  for (let i = 0; i < 7; i++) {
    a23Bfed.push(
      createInstructionIngestion({
        ingestionId: `ing-a23-bfed-${i}`,
        sourcePath: `incoming/a23-bfed-${i}.md`,
        checksum: sha256(`a23-bfed-${i}`),
        status: InstructionIngestionStatus.PENDING_CLASSIFICATION,
        instructionVersion: `v-a23-bfed-${i}`,
        fixtureOnly: true,
        createdAtIso: nowIso,
      }),
    );
  }
  if (
    a23Bfed.every((r) => r.instructionVersion === null) &&
    a23Bfed[6]!.classifierNotes.some((n) => /Refused instructionVersion/i.test(n))
  ) {
    details.push(
      "A23 bind-bfed7a60 continue: sept PENDING claim instructionVersion → refused; remains null",
    );
  } else {
    passed = false;
    details.push(
      `A23 bind-bfed sept pending unexpectedly ${JSON.stringify({ last: a23Bfed[6] })}`,
    );
  }

  const a23Webhook = createInstructionIngestion({
    ingestionId: "ing-a23-webhook-soak",
    sourcePath: "incoming/a23-webhook-sync.json",
    checksum: sha256("a23-webhook-sync"),
    status: InstructionIngestionStatus.REJECTED,
    instructionVersion: "v2.14.0+webhook",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  if (
    a23Webhook.instructionVersion === null &&
    a23Webhook.classifierNotes.some((n) => /Refused instructionVersion/i.test(n))
  ) {
    details.push(
      "A23 integration edge: webhook semver instructionVersion while REJECTED → refused",
    );
  } else {
    passed = false;
    details.push(
      `A23 webhook semver unexpectedly ${JSON.stringify(a23Webhook)}`,
    );
  }

  const a23AttachmentBoundary = evaluateIndirectPromptInjectionBoundary({
    trustLabel: ArtifactTrustLabel.UNTRUSTED_SOURCE,
    channel: IndirectInjectionChannel.ATTACHMENT,
    attemptedEffect: "tool_widening",
  });
  if (
    a23AttachmentBoundary.allowed === false &&
    a23AttachmentBoundary.code === "UNTRUSTED_SOURCE_NOT_INSTRUCTION" &&
    a23AttachmentBoundary.instructionEligible === false &&
    a23AttachmentBoundary.externalEffects === "NONE" &&
    a23AttachmentBoundary.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "A23 bind-bfed7a60 channel edge: untrusted ATTACHMENT → UNTRUSTED_SOURCE_NOT_INSTRUCTION; externalEffects=NONE; NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(
      `A23 ATTACHMENT boundary unexpectedly ${JSON.stringify(a23AttachmentBoundary)}`,
    );
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
