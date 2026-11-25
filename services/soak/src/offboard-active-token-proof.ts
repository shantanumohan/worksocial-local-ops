/**
 * Fixture proof for T-X073 — offboarding retains active provider token residual.
 * Hillclimb deepen I15: blank-id claim → LIVE_CLAIM_REFUSED; invent
 * QUEUED_WORK live-delivered / offboarding-complete / AUDIT purged /
 * catalogClaim ACCEPTED dishonest.
 * I14: force/dual-on-padded; invent all-closed / SCHEDULE re-enabled;
 * priorLiveRevoke invent DRIFT. I12 claim-on-padded; I11 dual/padded;
 * I9 reclaim; re-offboard / double live-revoke stay NOT_WIRED;
 * ACCEPTED≠VERIFIED; secrets never leak. External effects: NONE.
 * Does not touch rebind / #43 lane.
 */

import { join } from "node:path";
import {
  ResidualObligationStatus,
  SoakProofKind,
  assertOffboardActiveTokenResidualHonest,
  assertOffboardActiveTokenResidualReclaimIdempotent,
  attemptLiveProviderRevoke,
  reclaimOffboardActiveTokenResidual,
  type SoakProofRecord,
} from "@worksocial/domain";
import { createCredentialBroker } from "@worksocial/credential-broker";
import { createCredentialRotationService } from "@worksocial/credential-rotation";
import { createFileCredentialRotationStore } from "@worksocial/persistence";

function nowPlus(nowIso: string, ms: number): string {
  return new Date(Date.parse(nowIso) + ms).toISOString();
}

/**
 * Complete expected proof set for T-X073 fixture ACCEPTED.
 */
export async function proofOffboardActiveTokenResidual(
  stateDir: string,
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  let passed = true;
  const proofRoot = join(stateDir, "offboard-active-token");
  const store = createFileCredentialRotationStore(proofRoot);
  const creds = createCredentialRotationService({
    store,
    broker: createCredentialBroker(),
  });

  const seeded = await creds.seedFixture({
    nowIso,
    withQueuedWork: true,
    secretMaterial: "fixture-tx073-secret-do-not-leak",
  });

  const leaseBefore = await creds.requestLease({
    connectionId: seeded.connection.connectionId,
    requestedScopes: ["publish"],
    nowIso: nowPlus(nowIso, 100),
  });
  if (!leaseBefore.ok) {
    passed = false;
    details.push(`Pre-offboard lease unexpectedly denied: ${leaseBefore.code}`);
  } else {
    details.push(`Pre-offboard lease granted leaseId=${leaseBefore.leaseId}`);
  }

  const offboarded = await creds.offboard({
    connectionId: seeded.connection.connectionId,
    approvedBy: "fixture-admin",
    nowIso: nowPlus(nowIso, 200),
  });
  if (!offboarded.ok) {
    passed = false;
    details.push(`Offboard failed: ${offboarded.code} ${offboarded.reason}`);
    return {
      proofId: `proof-offboard-token-fail-${seeded.connection.connectionId}`,
      kind: SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL,
      passed: false,
      details,
      applyAttemptCount: 1,
      operationId: `op-tx073-${seeded.connection.connectionId}`,
      createdAtIso: nowPlus(nowIso, 200),
      fixtureOnly: true,
    };
  }

  const manifest = offboarded.manifest;
  const activeToken = manifest.residualObligations.find(
    (o) => o.kind === "ACTIVE_TOKEN",
  );
  const providerRevoke = manifest.residualObligations.find(
    (o) => o.kind === "PROVIDER_REVOKE",
  );
  const manifestJson = JSON.stringify(manifest);

  if (activeToken?.status !== "BLOCKED_NOT_WIRED") {
    passed = false;
    details.push(
      `ACTIVE_TOKEN residual missing or wrong status=${activeToken?.status ?? "absent"}`,
    );
  } else {
    details.push(
      `ACTIVE_TOKEN residual BLOCKED_NOT_WIRED summary=${activeToken.summary}`,
    );
  }

  if (providerRevoke?.status !== "BLOCKED_NOT_WIRED") {
    passed = false;
    details.push(
      `PROVIDER_REVOKE residual missing or wrong status=${providerRevoke?.status ?? "absent"}`,
    );
  } else {
    details.push("PROVIDER_REVOKE residual BLOCKED_NOT_WIRED");
  }

  if (manifest.liveProviderRevoke !== "NOT_WIRED") {
    passed = false;
    details.push(
      `Manifest liveProviderRevoke must be NOT_WIRED got=${manifest.liveProviderRevoke}`,
    );
  }
  if (manifest.externalEffects !== "NONE") {
    passed = false;
    details.push("Manifest externalEffects must be NONE");
  }
  if (manifest.catalogClaim !== "NOT_RUN") {
    passed = false;
    details.push(
      `Manifest catalogClaim must stay NOT_RUN (fixture ACCEPTED via soak only) got=${manifest.catalogClaim}`,
    );
  }
  if (
    manifestJson.includes("fixture-tx073-secret-do-not-leak") ||
    !manifest.auditRetained
  ) {
    passed = false;
    details.push("Manifest leaked secrets or dropped audit retention");
  } else {
    details.push(
      `Offboarding incomplete-until-revoked: manifest=${manifest.manifestId} catalogClaim=NOT_RUN auditRetained=true secretsExported=false`,
    );
  }

  const leaseAfter = await creds.requestLease({
    connectionId: seeded.connection.connectionId,
    requestedScopes: ["publish"],
    nowIso: nowPlus(nowIso, 300),
  });
  if (leaseAfter.ok || leaseAfter.code !== "CONNECTION_REVOKED") {
    passed = false;
    details.push(
      `Post-offboard lease must be CONNECTION_REVOKED got ok=${leaseAfter.ok} code=${"code" in leaseAfter ? leaseAfter.code : "n/a"}`,
    );
  } else {
    details.push("Post-offboard lease denied CONNECTION_REVOKED");
  }

  const honesty = assertOffboardActiveTokenResidualHonest(manifest);
  if (!honesty.ok) {
    passed = false;
    details.push(`residual honesty failed: ${honesty.reasons.join("; ")}`);
  } else {
    details.push(
      `assertOffboardActiveTokenResidualHonest → ${honesty.code}; ACCEPTED≠VERIFIED`,
    );
  }

  // Hillclimb: re-offboard after local revoke — residuals stay BLOCKED_NOT_WIRED.
  // Runs before liveProviderRevoke audits so fixture clocks stay monotonic.
  const reOffboard = await creds.offboard({
    connectionId: seeded.connection.connectionId,
    approvedBy: "fixture-admin-reoffboard",
    nowIso: nowPlus(nowIso, 350),
  });
  if (!reOffboard.ok) {
    // Already-revoked may fail closed — still honest if not inventing live success.
    details.push(
      `Re-offboard after revoke: ${reOffboard.code} (fail-closed ok if no live VERIFIED)`,
    );
    const reBlob = JSON.stringify(reOffboard)
      .replace(/ACCEPTED\s*≠\s*VERIFIED/gi, "")
      .replace(/NOT_VERIFIED/g, "");
    if (/\bVERIFIED\b|COMPLETED|live\s+revoke\s+success/i.test(reBlob)) {
      passed = false;
      details.push("Re-offboard must not invent live VERIFIED/COMPLETED revoke");
    }
  } else {
    const reHonesty = assertOffboardActiveTokenResidualHonest(reOffboard.manifest);
    if (!reHonesty.ok || reOffboard.manifest.liveProviderRevoke !== "NOT_WIRED") {
      passed = false;
      details.push(
        `Re-offboard residual dishonest: ${reHonesty.reasons.join("; ")}`,
      );
    } else {
      details.push(
        "Re-offboard after local revoke → ACTIVE_TOKEN+PROVIDER_REVOKE still BLOCKED_NOT_WIRED",
      );
    }
  }

  // Live revoke uses fixture clock so audits stay monotonic with offboard timestamps.
  const live = await creds.liveProviderRevoke({
    connectionId: seeded.connection.connectionId,
    nowIso: nowPlus(nowIso, 400),
  });
  if (
    live.code !== "LIVE_PROVIDER_REVOKE_NOT_WIRED" ||
    live.liveProviderRevoke !== "NOT_WIRED" ||
    live.liveProviderSuccessClaimed !== false ||
    live.externalEffects !== "NONE"
  ) {
    passed = false;
    details.push(`liveProviderRevoke unexpected ${JSON.stringify(live)}`);
  } else {
    details.push(
      "liveProviderRevoke=NOT_WIRED liveProviderSuccessClaimed=false — T-X073 incomplete until external revoke",
    );
  }

  // Hillclimb: double liveProviderRevoke — both stay NOT_WIRED, never success.
  const live2 = await creds.liveProviderRevoke({
    connectionId: seeded.connection.connectionId,
    nowIso: nowPlus(nowIso, 450),
  });
  if (
    live2.code !== "LIVE_PROVIDER_REVOKE_NOT_WIRED" ||
    live2.liveProviderSuccessClaimed !== false ||
    live2.externalEffects !== "NONE"
  ) {
    passed = false;
    details.push(`double liveProviderRevoke unexpected ${JSON.stringify(live2)}`);
  } else {
    details.push(
      "double liveProviderRevoke → NOT_WIRED twice (no invent remote success)",
    );
  }

  // I9/I11 edge honesty: claim/force/dual refuse; blank + padded ids still NOT_WIRED.
  const claimLive = attemptLiveProviderRevoke({
    connectionId: seeded.connection.connectionId,
    referenceId: "fixture-ref",
    claimLiveVerified: true,
  });
  const forceComplete = attemptLiveProviderRevoke({
    connectionId: seeded.connection.connectionId,
    referenceId: "fixture-ref",
    forceCompleteRemoteRevoke: true,
  });
  const dualClaim = attemptLiveProviderRevoke({
    connectionId: seeded.connection.connectionId,
    referenceId: "fixture-ref",
    claimLiveVerified: true,
    forceCompleteRemoteRevoke: true,
  });
  const blankId = attemptLiveProviderRevoke({
    connectionId: "   ",
    referenceId: "",
  });
  const paddedConn = attemptLiveProviderRevoke({
    connectionId: `  ${seeded.connection.connectionId}  `,
    referenceId: "fixture-ref",
  });
  const paddedRef = attemptLiveProviderRevoke({
    connectionId: seeded.connection.connectionId,
    referenceId: "  fixture-ref  ",
  });
  if (
    claimLive.code === "LIVE_CLAIM_REFUSED" &&
    claimLive.liveProviderRevoke === "NOT_WIRED" &&
    forceComplete.code === "LIVE_CLAIM_REFUSED" &&
    dualClaim.code === "LIVE_CLAIM_REFUSED" &&
    blankId.code === "LIVE_PROVIDER_REVOKE_NOT_WIRED" &&
    blankId.liveProviderSuccessClaimed === false &&
    paddedConn.code === "LIVE_PROVIDER_REVOKE_NOT_WIRED" &&
    paddedRef.code === "LIVE_PROVIDER_REVOKE_NOT_WIRED"
  ) {
    details.push(
      "claim/force/dual → LIVE_CLAIM_REFUSED; blank+padded ids still NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(
      `edge claim/blank/padded unexpectedly claim=${JSON.stringify(claimLive)} force=${JSON.stringify(forceComplete)} dual=${JSON.stringify(dualClaim)} blank=${JSON.stringify(blankId)} padC=${JSON.stringify(paddedConn)} padR=${JSON.stringify(paddedRef)}`,
    );
  }

  // I9/I11: idempotent residual reclaim — double+triple honesty agrees; no invent live revoke.
  const reclaim1 = reclaimOffboardActiveTokenResidual(manifest);
  const reclaim2 = reclaimOffboardActiveTokenResidual(manifest);
  const reclaim3 = reclaimOffboardActiveTokenResidual(manifest);
  const reclaimIdem = assertOffboardActiveTokenResidualReclaimIdempotent({
    first: reclaim1,
    second: reclaim2,
  });
  const reclaimTrip = assertOffboardActiveTokenResidualReclaimIdempotent({
    first: reclaim1,
    second: reclaim3,
  });
  if (
    reclaimIdem.ok &&
    reclaimIdem.code === "OFFBOARD_RECLAIM_IDEMPOTENT" &&
    reclaimTrip.ok &&
    reclaim1.honesty.ok &&
    reclaim1.priorLiveRevokeInvented === false
  ) {
    details.push(
      "idempotent reclaim: residual honesty agrees twice+triple; no invent live revoke",
    );
  } else {
    passed = false;
    details.push(
      `idempotent reclaim unexpectedly idem=${JSON.stringify(reclaimIdem)} trip=${JSON.stringify(reclaimTrip)} r1=${JSON.stringify(reclaim1)}`,
    );
  }

  // I12: claim-on-padded refuse; invent ACTIVE_TOKEN closed dishonest; reclaim drift.
  const claimOnPadded = attemptLiveProviderRevoke({
    connectionId: `  ${seeded.connection.connectionId}  `,
    referenceId: "fixture-ref",
    claimLiveVerified: true,
  });
  const inventClosed = assertOffboardActiveTokenResidualHonest({
    ...manifest,
    summary: "ACTIVE_TOKEN residual satisfied after remote revoke",
  });
  const providerSatisfied = assertOffboardActiveTokenResidualHonest({
    ...manifest,
    residualObligations: manifest.residualObligations.map((o) =>
      o.kind === "PROVIDER_REVOKE"
        ? { ...o, status: ResidualObligationStatus.SATISFIED }
        : o,
    ),
  });
  const dishonestReclaim = reclaimOffboardActiveTokenResidual({
    ...manifest,
    liveProviderRevoke: "WIRED" as "NOT_WIRED",
  });
  const reclaimDrift = assertOffboardActiveTokenResidualReclaimIdempotent({
    first: reclaim1,
    second: dishonestReclaim,
  });
  if (
    claimOnPadded.code === "LIVE_CLAIM_REFUSED" &&
    claimOnPadded.liveProviderSuccessClaimed === false &&
    !inventClosed.ok &&
    !providerSatisfied.ok &&
    !reclaimDrift.ok &&
    reclaimDrift.code === "OFFBOARD_RECLAIM_DRIFT"
  ) {
    details.push(
      "I12 edges: claim-on-padded LIVE_CLAIM_REFUSED; invent ACTIVE_TOKEN closed dishonest; PROVIDER_REVOKE SATISFIED dishonest; honest+dishonest reclaim DRIFT",
    );
  } else {
    passed = false;
    details.push(
      `I12 edges unexpectedly claimPad=${JSON.stringify(claimOnPadded)} invent=${JSON.stringify(inventClosed)} sat=${JSON.stringify(providerSatisfied)} drift=${JSON.stringify(reclaimDrift)}`,
    );
  }

  // I14: force-on-padded / dual-on-padded; invent all-closed / SCHEDULE re-enabled; prior invent DRIFT.
  const forceOnPadded = attemptLiveProviderRevoke({
    connectionId: seeded.connection.connectionId,
    referenceId: "  fixture-ref  ",
    forceCompleteRemoteRevoke: true,
  });
  const dualOnPadded = attemptLiveProviderRevoke({
    connectionId: `  ${seeded.connection.connectionId}  `,
    referenceId: "  fixture-ref  ",
    claimLiveVerified: true,
    forceCompleteRemoteRevoke: true,
  });
  const inventAllClosed = assertOffboardActiveTokenResidualHonest({
    ...manifest,
    summary: "all residuals are now closed after remote revoke",
  });
  const inventScheduleLive = assertOffboardActiveTokenResidualHonest({
    ...manifest,
    summary: "SCHEDULE residual re-enabled live after offboard",
  });
  const inventPrior = {
    ...reclaim1,
    priorLiveRevokeInvented: true as false,
  };
  const priorDrift = assertOffboardActiveTokenResidualReclaimIdempotent({
    first: reclaim1,
    second: inventPrior,
  });
  if (
    forceOnPadded.code === "LIVE_CLAIM_REFUSED" &&
    forceOnPadded.liveProviderSuccessClaimed === false &&
    dualOnPadded.code === "LIVE_CLAIM_REFUSED" &&
    !inventAllClosed.ok &&
    inventAllClosed.code === "OFFBOARD_RESIDUAL_DISHONEST" &&
    !inventScheduleLive.ok &&
    !priorDrift.ok &&
    priorDrift.code === "OFFBOARD_RECLAIM_DRIFT"
  ) {
    details.push(
      "I14 edges: force/dual-on-padded LIVE_CLAIM_REFUSED; invent all-residuals-closed / SCHEDULE re-enabled dishonest; forged priorLiveRevoke invent DRIFT",
    );
  } else {
    passed = false;
    details.push(
      `I14 edges unexpectedly force=${JSON.stringify(forceOnPadded)} dual=${JSON.stringify(dualOnPadded)} allClosed=${JSON.stringify(inventAllClosed)} sched=${JSON.stringify(inventScheduleLive)} prior=${JSON.stringify(priorDrift)}`,
    );
  }

  // I15: blank-id claim; invent QUEUED_WORK live-delivered / complete / audit purged / catalog ACCEPTED.
  const claimOnBlank = attemptLiveProviderRevoke({
    connectionId: "",
    referenceId: "fixture-ref",
    claimLiveVerified: true,
  });
  const inventQueuedLive = assertOffboardActiveTokenResidualHonest({
    ...manifest,
    summary: "QUEUED_WORK residual delivered live after offboard",
  });
  const inventComplete = assertOffboardActiveTokenResidualHonest({
    ...manifest,
    summary: "offboarding is now complete; residual is cleared",
  });
  const inventAuditPurged = assertOffboardActiveTokenResidualHonest({
    ...manifest,
    summary: "AUDIT_RETENTION residual purged live",
  });
  const inventCatalogAccepted = assertOffboardActiveTokenResidualHonest({
    ...manifest,
    catalogClaim: "ACCEPTED" as "NOT_RUN",
  });
  if (
    claimOnBlank.code === "LIVE_CLAIM_REFUSED" &&
    claimOnBlank.liveProviderSuccessClaimed === false &&
    !inventQueuedLive.ok &&
    inventQueuedLive.code === "OFFBOARD_RESIDUAL_DISHONEST" &&
    !inventComplete.ok &&
    !inventAuditPurged.ok &&
    !inventCatalogAccepted.ok
  ) {
    details.push(
      "I15 edges: blank-id claim LIVE_CLAIM_REFUSED; invent QUEUED_WORK live-delivered / offboarding-complete / AUDIT purged / catalogClaim ACCEPTED dishonest",
    );
  } else {
    passed = false;
    details.push(
      `I15 edges unexpectedly blank=${JSON.stringify(claimOnBlank)} queued=${JSON.stringify(inventQueuedLive)} complete=${JSON.stringify(inventComplete)} audit=${JSON.stringify(inventAuditPurged)} catalog=${JSON.stringify(inventCatalogAccepted)}`,
    );
  }

  details.push(
    "liveProviderSuccessClaimed=false externalEffects=NONE catalogClaim=ACCEPTED≠VERIFIED",
  );

  return {
    proofId: `proof-offboard-token-${seeded.connection.connectionId}`,
    kind: SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx073-${seeded.connection.connectionId}`,
    createdAtIso: nowPlus(nowIso, 500),
    fixtureOnly: true,
  };
}
