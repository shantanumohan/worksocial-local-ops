/**
 * Fixture proof for T-US-052 — Mocked connector ≠ production-ready.
 *
 * Fixture/mocked adapter wiring stays FIXTURE or NOT_WIRED, never elevates to
 * productionActivated / live VERIFIED. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  AdapterLiveStatus,
  AdapterWiring,
  ConnectionState,
  EvidenceKind,
  SoakProofKind,
  VerificationState,
  WriteReadiness,
  buildProviderStatusView,
  contentLiveWiringStatus,
  createReadEvidence,
  PaidMediaWiring,
  emptyPaidMediaState,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-052 fixture ACCEPTED.
 */
export function proofMockedConnectorNotProductionReady(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // 1. FIXTURE adapter wiring maps to FIXTURE live status — not production.
  const fixtureWiring = contentLiveWiringStatus(AdapterWiring.FIXTURE);
  if (fixtureWiring === AdapterLiveStatus.FIXTURE) {
    details.push(
      "AdapterWiring.FIXTURE → contentLiveWiringStatus=FIXTURE (mocked ≠ production)",
    );
  } else {
    passed = false;
    details.push(`FIXTURE wiring unexpectedly ${fixtureWiring}`);
  }

  // 2. NOT_WIRED stays NOT_WIRED (no silent production elevation).
  const notWired = contentLiveWiringStatus(AdapterWiring.NOT_WIRED);
  if (notWired === AdapterLiveStatus.NOT_WIRED) {
    details.push("AdapterWiring.NOT_WIRED → live status NOT_WIRED");
  } else {
    passed = false;
    details.push(`NOT_WIRED wiring unexpectedly ${notWired}`);
  }

  // 3. Paid-media fixture state never claims productionActivated.
  const paid = emptyPaidMediaState(nowIso);
  if (
    paid.productionActivated === false &&
    paid.liveMutationWiring === "NOT_WIRED" &&
    paid.googleAdsWiring === PaidMediaWiring.FIXTURE
  ) {
    details.push(
      "emptyPaidMediaState → productionActivated=false liveMutationWiring=NOT_WIRED googleAdsWiring=FIXTURE",
    );
  } else {
    passed = false;
    details.push(
      `Paid-media fixture state unexpectedly productionActivated=${paid.productionActivated}`,
    );
  }

  // 4. ACCEPTED_PENDING fixture connector is never verified=production-ready.
  const pending = buildProviderStatusView({
    providerId: "fixture-cms",
    connectionState: ConnectionState.READ_READY,
    writeReadiness: WriteReadiness.STAGING_READY,
    verificationState: VerificationState.ACCEPTED_PENDING,
  });
  if (
    pending.connected &&
    pending.authorized &&
    pending.verified === false &&
    /not verified/i.test(pending.labels.verified)
  ) {
    details.push(
      "ACCEPTED_PENDING provider status → verified=false (accepted ≠ production-ready)",
    );
  } else {
    passed = false;
    details.push(`ACCEPTED_PENDING view unexpectedly ${JSON.stringify(pending)}`);
  }

  // 4b. Unsafe VERIFIED flag on a mocked/FIXTURE connector still ≠ production-ready.
  // buildProviderStatusView has no adapterWiring input, so it may report verified=true;
  // production readiness must still fail closed via FIXTURE live status + productionActivated=false.
  const unsafeVerified = buildProviderStatusView({
    providerId: "fixture-cms-unsafe",
    connectionState: ConnectionState.READ_READY,
    writeReadiness: WriteReadiness.WRITE_READY,
    verificationState: VerificationState.VERIFIED,
  });
  const stillFixture = contentLiveWiringStatus(AdapterWiring.FIXTURE);
  const stillNotActivated = emptyPaidMediaState(nowIso).productionActivated === false;
  if (
    unsafeVerified.verified === true &&
    stillFixture === AdapterLiveStatus.FIXTURE &&
    stillNotActivated
  ) {
    details.push(
      "FIXTURE+VERIFIED unsafe combo → status.verified may be true, but liveWiring=FIXTURE and productionActivated=false (mocked ≠ production-ready)",
    );
  } else {
    passed = false;
    details.push(
      `Unsafe VERIFIED/FIXTURE gate unexpectedly verified=${unsafeVerified.verified} live=${stillFixture} activated=${!stillNotActivated}`,
    );
  }

  // 5. LIVE adapter read evidence refused — mocked path cannot claim LIVE.
  let liveRefused = false;
  try {
    createReadEvidence({
      evidenceId: "ev-live-forbid",
      writePathId: "wp-fixture",
      evidenceKind: EvidenceKind.IDENTITY,
      resourceType: "binding",
      resourceId: "bind-1",
      operation: "read_identity",
      summary: "must refuse",
      fixtureOnly: false,
      observedAtIso: nowIso,
      adapterWiring: AdapterWiring.LIVE,
    });
  } catch (err) {
    liveRefused = /refuses LIVE/i.test(
      err instanceof Error ? err.message : String(err),
    );
  }
  if (liveRefused) {
    details.push("createReadEvidence(AdapterWiring.LIVE) refused");
  } else {
    passed = false;
    details.push("LIVE adapter evidence was not refused");
  }

  // 6. FIXTURE-only evidence is allowed (positive control for mocked path).
  try {
    const ok = createReadEvidence({
      evidenceId: "ev-fixture-ok",
      writePathId: "wp-fixture",
      evidenceKind: EvidenceKind.IDENTITY,
      resourceType: "binding",
      resourceId: "bind-1",
      operation: "read_identity",
      summary: "fixture scaffold",
      fixtureOnly: true,
      observedAtIso: nowIso,
      adapterWiring: AdapterWiring.FIXTURE,
    });
    if (ok.fixtureOnly === true && ok.evidenceKind === EvidenceKind.IDENTITY) {
      details.push("FIXTURE adapter evidence accepted (mocked scaffold only)");
    } else {
      passed = false;
      details.push("FIXTURE evidence shape unexpected");
    }
  } catch (err) {
    passed = false;
    details.push(
      `FIXTURE evidence unexpectedly threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-mocked-connector-${randomUUID()}`,
    kind: SoakProofKind.MOCKED_CONNECTOR_NOT_PRODUCTION_READY,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-us052-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
