/**
 * Acceptance evidence compiler — runs selected catalog cases in fixture
 * (declared) environments, emits redacted artifacts, marks ACCEPTED only
 * with the complete expected proof set and no failed related proofs.
 * Never silently VERIFIED for live.
 */

import {
  AcceptanceCaseStatus,
  AcceptanceEnvironment,
  SOAK_FIXTURE_CASE_IDS,
  buildRedactedArtifact,
  expectedProofsForFixtureCase,
  mapProofToFixtureCases,
  soakChatGptAdsBlocked,
  uniqueFixtureEvidenceArtifactId,
  validateAcceptanceCaseStatus,
  type AcceptanceCaseEvidenceRecord,
  type RedactedEvidenceArtifact,
  type SoakProofRecord,
  type SoakFixtureCaseId,
  type SoakProofKindValue,
} from "@worksocial/domain";

export type EvidenceCompileInput = {
  proofs: readonly SoakProofRecord[];
  nowIso: string;
  /** Immutable discriminator so historical run refs keep provenance. */
  runId: string;
  /** Optional override; default is the soak fixture case set. */
  caseIds?: readonly SoakFixtureCaseId[];
};

export type EvidenceCompileResult = {
  artifacts: RedactedEvidenceArtifact[];
  caseResults: AcceptanceCaseEvidenceRecord[];
  chatgptAds: ReturnType<typeof soakChatGptAdsBlocked>;
  blockedLiveVerified: true;
  details: string[];
};

const CASE_TITLES: Record<SoakFixtureCaseId, string> = {
  "T-X014": "Approval wait survives restart",
  "T-X020": "Timeout after provider acceptance",
  "T-US-048": "Unknown remote effects reconciled before resume",
};

function relatedProofsForCase(
  caseId: SoakFixtureCaseId,
  proofs: readonly SoakProofRecord[],
): SoakProofRecord[] {
  return proofs.filter((p) => mapProofToFixtureCases(p.kind).includes(caseId));
}

function hasCompletePassingSet(
  caseId: SoakFixtureCaseId,
  related: readonly SoakProofRecord[],
): { ok: true; passed: SoakProofRecord[] } | { ok: false; reasons: string[] } {
  const expected = expectedProofsForFixtureCase(caseId);
  const reasons: string[] = [];
  if (expected.length === 0) {
    return {
      ok: false,
      reasons: [`No expected proof set configured for ${caseId}`],
    };
  }

  const failed = related.filter((p) => !p.passed);
  if (failed.length > 0) {
    reasons.push(
      `Related proof(s) failed for ${caseId}: ${failed.map((p) => p.kind).join(", ")}`,
    );
  }

  const passedKinds = new Set(
    related.filter((p) => p.passed).map((p) => p.kind),
  );
  const missing: SoakProofKindValue[] = expected.filter(
    (k) => !passedKinds.has(k),
  );
  if (missing.length > 0) {
    reasons.push(
      `Incomplete proof set for ${caseId}; missing: ${missing.join(", ")}`,
    );
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  const passed = related.filter(
    (p) => p.passed && expected.includes(p.kind),
  );
  return { ok: true, passed };
}

export function compileAcceptanceEvidence(
  input: EvidenceCompileInput,
): EvidenceCompileResult {
  const caseIds = input.caseIds ?? [...SOAK_FIXTURE_CASE_IDS];
  const ads = soakChatGptAdsBlocked();
  const details: string[] = [
    "Evidence compiler environment=fixture only",
    "Fixture ≠ sandbox ≠ authorized production",
    "Never silently VERIFIED for live",
    "ACCEPTED requires complete expected proof set with no failed related proofs",
    `ChatGPT Ads blocked: ${ads.reason}`,
    `runId=${input.runId}`,
  ];

  const artifacts: RedactedEvidenceArtifact[] = [];
  const caseResults: AcceptanceCaseEvidenceRecord[] = [];

  for (const caseId of caseIds) {
    const related = relatedProofsForCase(caseId, input.proofs);
    const completeness = hasCompletePassingSet(caseId, related);

    if (!completeness.ok) {
      const hasAny = related.length > 0;
      caseResults.push({
        caseId,
        status: hasAny
          ? AcceptanceCaseStatus.FAILED
          : AcceptanceCaseStatus.NOT_RUN,
        environment: AcceptanceEnvironment.FIXTURE,
        artifactId: null,
        reasons: completeness.reasons,
        updatedAtIso: input.nowIso,
      });
      continue;
    }

    const artifactId = uniqueFixtureEvidenceArtifactId(caseId, input.runId);
    const summary = [
      `Fixture ACCEPTED for ${caseId} (${CASE_TITLES[caseId]})`,
      ...completeness.passed.map(
        (p) =>
          `proof=${p.kind} applyCount=${p.applyAttemptCount ?? "n/a"} :: ${p.details.join(" | ")}`,
      ),
      "liveProviderSuccessClaimed=false externalEffects=NONE",
    ].join("\n");

    const artifact = buildRedactedArtifact({
      artifactId,
      caseId,
      environment: AcceptanceEnvironment.FIXTURE,
      summary,
      proofKinds: completeness.passed.map((p) => p.kind),
      evidenceRef: `soak/evidence/${artifactId}.json`,
      createdAtIso: input.nowIso,
    });

    const statusCheck = validateAcceptanceCaseStatus({
      status: AcceptanceCaseStatus.ACCEPTED,
      environment: AcceptanceEnvironment.FIXTURE,
      evidenceArtifactId: artifactId,
    });
    if (!statusCheck.ok) {
      caseResults.push({
        caseId,
        status: AcceptanceCaseStatus.FAILED,
        environment: AcceptanceEnvironment.FIXTURE,
        artifactId: null,
        reasons: statusCheck.reasons,
        updatedAtIso: input.nowIso,
      });
      continue;
    }

    artifacts.push(artifact);
    caseResults.push({
      caseId,
      status: AcceptanceCaseStatus.ACCEPTED,
      environment: AcceptanceEnvironment.FIXTURE,
      artifactId,
      reasons: [
        `Fixture evidence compiled from complete proof set (${completeness.passed.length})`,
        "Not sandbox-verified; not production-canary-verified",
      ],
      updatedAtIso: input.nowIso,
    });
  }

  // Explicit: T-X066 stays NOT_RUN — no backup/omit-receipt proof mapped.
  details.push(
    `Compiled ${artifacts.length} redacted artifact(s); ACCEPTED=${caseResults.filter((c) => c.status === "ACCEPTED").length}`,
    "T-X066 left NOT_RUN until backup/omit-receipt/reconcile proof exists",
  );

  return {
    artifacts,
    caseResults,
    chatgptAds: ads,
    blockedLiveVerified: true,
    details,
  };
}
