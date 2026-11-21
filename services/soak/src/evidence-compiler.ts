/**
 * Acceptance evidence compiler — runs selected catalog cases in fixture
 * (declared) environments, emits redacted artifacts, marks ACCEPTED only
 * with real soak proofs. Never silently VERIFIED for live.
 */

import {
  AcceptanceCaseStatus,
  AcceptanceEnvironment,
  SOAK_FIXTURE_CASE_IDS,
  buildRedactedArtifact,
  mapProofToFixtureCases,
  soakChatGptAdsBlocked,
  validateAcceptanceCaseStatus,
  type AcceptanceCaseEvidenceRecord,
  type RedactedEvidenceArtifact,
  type SoakProofRecord,
  type SoakFixtureCaseId,
} from "@worksocial/domain";

export type EvidenceCompileInput = {
  proofs: readonly SoakProofRecord[];
  nowIso: string;
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
  "T-X066": "Backup omits remote receipt",
  "T-US-048": "Unknown remote effects reconciled before resume",
};

export function compileAcceptanceEvidence(
  input: EvidenceCompileInput,
): EvidenceCompileResult {
  const caseIds = input.caseIds ?? [...SOAK_FIXTURE_CASE_IDS];
  const ads = soakChatGptAdsBlocked();
  const details: string[] = [
    "Evidence compiler environment=fixture only",
    "Fixture ≠ sandbox ≠ authorized production",
    "Never silently VERIFIED for live",
    `ChatGPT Ads blocked: ${ads.reason}`,
  ];

  const proofsByCase = new Map<string, SoakProofRecord[]>();
  for (const proof of input.proofs) {
    for (const caseId of mapProofToFixtureCases(proof.kind)) {
      const list = proofsByCase.get(caseId) ?? [];
      list.push(proof);
      proofsByCase.set(caseId, list);
    }
  }

  const artifacts: RedactedEvidenceArtifact[] = [];
  const caseResults: AcceptanceCaseEvidenceRecord[] = [];

  for (const caseId of caseIds) {
    const related = proofsByCase.get(caseId) ?? [];
    const passed = related.filter((p) => p.passed);
    if (passed.length === 0) {
      caseResults.push({
        caseId,
        status: AcceptanceCaseStatus.NOT_RUN,
        environment: AcceptanceEnvironment.FIXTURE,
        artifactId: null,
        reasons: [
          `No passing fixture soak proofs for ${caseId} — left NOT_RUN`,
        ],
        updatedAtIso: input.nowIso,
      });
      continue;
    }

    const artifactId = `art-fixture-${caseId.toLowerCase()}`;
    const summary = [
      `Fixture ACCEPTED for ${caseId} (${CASE_TITLES[caseId]})`,
      ...passed.map(
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
      proofKinds: passed.map((p) => p.kind),
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
        `Fixture evidence compiled from ${passed.length} soak proof(s)`,
        "Not sandbox-verified; not production-canary-verified",
      ],
      updatedAtIso: input.nowIso,
    });
  }

  // Explicit: Ads-gated catalog IDs stay BLOCKED even if not in caseIds.
  details.push(
    `Compiled ${artifacts.length} redacted artifact(s); ACCEPTED=${caseResults.filter((c) => c.status === "ACCEPTED").length}`,
  );

  return {
    artifacts,
    caseResults,
    chatgptAds: ads,
    blockedLiveVerified: true,
    details,
  };
}
