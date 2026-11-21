/**
 * Fixture proof for T-F24 / T-US-047 — recover, rotate, reconcile, offboard.
 *
 * Exercises recovery health timeline + capability stop + unknown-remote
 * reconcile together with credential rotate (no secrets) and offboarding
 * manifest / residual obligations. External effects: NONE.
 * Never invents live VERIFIED; live provider revoke remains NOT_WIRED.
 *
 * Kept out of credential-rotation service.ts / rebind paths to avoid
 * colliding with the T-X029 rebind lane (#43).
 */

import { join } from "node:path";
import {
  SoakProofKind,
  type SoakProofRecord,
} from "@worksocial/domain";
import { createCredentialBroker } from "@worksocial/credential-broker";
import { createCredentialRotationService } from "@worksocial/credential-rotation";
import {
  runHostOutageQueuedWork,
  runProviderOutageCapabilityStop,
  runUnknownRemoteReconcile,
} from "@worksocial/recovery";
import {
  createFileCredentialRotationStore,
  createFileRecoveryStore,
} from "@worksocial/persistence";

function nowPlus(nowIso: string, ms: number): string {
  return new Date(Date.parse(nowIso) + ms).toISOString();
}

/**
 * Complete expected proof set for recover/rotate/reconcile fixture ACCEPTED.
 * Returns a single SoakProofRecord mapped to T-F24 and T-US-047.
 */
export async function proofRecoverRotateReconcile(
  stateDir: string,
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  const proofRoot = join(stateDir, "recover-rotate");
  const recoveryStore = createFileRecoveryStore(join(proofRoot, "recovery"));
  const credStore = createFileCredentialRotationStore(
    join(proofRoot, "credentials"),
  );
  const creds = createCredentialRotationService({
    store: credStore,
    broker: createCredentialBroker(),
  });

  let passed = true;

  // 1–2. Inspect outage / queued work + capability-level stop (health timeline).
  const host = await runHostOutageQueuedWork(recoveryStore, nowIso);
  const provider = await runProviderOutageCapabilityStop(
    recoveryStore,
    nowPlus(nowIso, 100),
  );
  const timeline = await recoveryStore.listTimeline();
  const stops = await recoveryStore.listCapabilityStops();
  const hasHealthTimeline = timeline.length >= 2;
  const hasCapabilityStop = stops.some((s) => !s.resumeAllowed);
  if (!hasHealthTimeline || host.run.status !== "PASSED") {
    passed = false;
    details.push("Health timeline / host outage recovery test incomplete");
  } else {
    details.push(
      `Health timeline events=${timeline.length} hostRun=${host.run.runId} classification=${host.classification}`,
    );
  }
  if (!hasCapabilityStop || provider.run.status !== "PASSED") {
    passed = false;
    details.push("Capability-level stop recovery test incomplete");
  } else {
    details.push(
      `Capability stop recorded stopIds=${stops.map((s) => s.stopId).join(",")}`,
    );
  }

  // 3. Rotate credentials through broker (rotation record without secrets).
  const seeded = await creds.seedFixture({
    nowIso: nowPlus(nowIso, 200),
    withQueuedWork: true,
    secretMaterial: "fixture-secret-material-do-not-leak",
  });
  const rotated = await creds.rotate({
    connectionId: seeded.connection.connectionId,
    approvedBy: "fixture-admin",
    secretMaterial: "rotated-secret-material-do-not-leak",
    nowIso: nowPlus(nowIso, 300),
  });
  if (!rotated.ok) {
    passed = false;
    details.push(`Rotate failed: ${rotated.code} ${rotated.reason}`);
  } else {
    const rotationJson = JSON.stringify(rotated.rotation);
    const secretsLeaked =
      rotationJson.includes("fixture-secret-material-do-not-leak") ||
      rotationJson.includes("rotated-secret-material-do-not-leak") ||
      rotated.rotation.secretsExported;
    if (secretsLeaked) {
      passed = false;
      details.push("Rotation record leaked secret material");
    } else if (rotated.liveProviderRevoke !== "NOT_WIRED") {
      passed = false;
      details.push("Rotate must keep liveProviderRevoke=NOT_WIRED");
    } else if (rotated.externalEffects !== "NONE") {
      passed = false;
      details.push("Rotate must keep externalEffects=NONE");
    } else {
      details.push(
        `Rotation record ${rotated.rotation.rotationId} localSwitchComplete=${rotated.rotation.localSwitchComplete} secretsExported=false liveProviderRevoke=NOT_WIRED`,
      );
    }
  }

  // 4. Reconcile unconfirmed publications (unknown remote — no re-apply).
  const reconcile = await runUnknownRemoteReconcile(
    recoveryStore,
    nowPlus(nowIso, 400),
  );
  if (
    reconcile.run.status !== "PASSED" ||
    reconcile.classification !== "UNKNOWN_REMOTE_OUTCOME"
  ) {
    passed = false;
    details.push("Reconciliation receipts / unknown-remote recovery incomplete");
  } else {
    details.push(
      `Reconciliation receipts artifact=${reconcile.artifact.artifactId} classification=${reconcile.classification} externalEffects=NONE`,
    );
  }

  // 5–6. Offboard → manifest + residual obligations (incl. provider revoke NOT_WIRED).
  const connectionId =
    rotated.ok && rotated.connection
      ? rotated.connection.connectionId
      : seeded.connection.connectionId;
  const offboarded = await creds.offboard({
    connectionId,
    approvedBy: "fixture-admin",
    nowIso: nowPlus(nowIso, 500),
  });
  if (!offboarded.ok) {
    passed = false;
    details.push(`Offboard failed: ${offboarded.code} ${offboarded.reason}`);
  } else {
    const manifest = offboarded.manifest;
    const providerResidual = manifest.residualObligations.find(
      (o) => o.kind === "PROVIDER_REVOKE",
    );
    const auditOk = manifest.auditRetained === true;
    const liveRevokeOk = manifest.liveProviderRevoke === "NOT_WIRED";
    const effectsOk = manifest.externalEffects === "NONE";
    const residualOk =
      providerResidual?.status === "BLOCKED_NOT_WIRED" &&
      manifest.residualObligations.length >= 1;
    // Fixture ACCEPTED is recorded by soak evidence — manifest must not claim live VERIFIED.
    const noLiveVerified = manifest.catalogClaim === "NOT_RUN";
    if (!auditOk || !liveRevokeOk || !effectsOk || !residualOk || !noLiveVerified) {
      passed = false;
      details.push(
        "Offboarding manifest incomplete or over-claimed (live VERIFIED forbidden)",
      );
    } else {
      details.push(
        `Offboarding manifest ${manifest.manifestId} residualObligations=${manifest.residualObligations.length} providerRevoke=BLOCKED_NOT_WIRED catalogClaim=NOT_RUN (fixture ACCEPTED via soak only)`,
      );
    }
  }

  // Recovery test aggregate (scenarios already recorded on the recovery store).
  const recoveryRuns = await recoveryStore.listRuns();
  const recoveryPassed = recoveryRuns.filter((r) => r.status === "PASSED").length;
  if (recoveryPassed < 3) {
    passed = false;
    details.push(`Recovery tests insufficient: passed=${recoveryPassed}`);
  } else {
    details.push(
      `Recovery test runs passed=${recoveryPassed} liveRecoveryClaim=NOT_RUN`,
    );
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-recover-rotate-${seeded.connection.connectionId}`,
    kind: SoakProofKind.RECOVER_ROTATE_RECONCILE,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-recover-rotate-${seeded.connection.connectionId}`,
    createdAtIso: nowPlus(nowIso, 600),
    fixtureOnly: true,
  };
}
