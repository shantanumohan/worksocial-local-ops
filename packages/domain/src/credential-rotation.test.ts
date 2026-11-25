import { describe, expect, it } from "vitest";
import { EffectState } from "./effect-state-machine.js";
import { ConnectionState, WriteReadiness } from "./connection-status.js";
import {
  attemptLiveProviderRevoke,
  assertOffboardActiveTokenResidualHonest,
  assertOffboardActiveTokenResidualReclaimIdempotent,
  reclaimOffboardActiveTokenResidual,
  buildOffboardingManifest,
  buildRebindRecord,
  buildRotationRecord,
  cancelEligibleQueuedWork,
  applyQueuedCancelResults,
  classifyAccountTokenChange,
  connectionStatusView,
  createAuditEntry,
  evaluateCredentialLease,
  evaluateExplicitRebind,
  evaluateSendTimeEffect,
  evaluateSilentRotateAllowed,
  markConnectionRevoked,
  markConnectionRotatedAway,
  seedFixtureConnection,
  AccountTokenChange,
  CredentialConnectionStatus,
  CredentialAuditKind,
  ResidualObligationStatus,
} from "./credential-rotation.js";

const NOW = "2026-11-21T22:00:00.000Z";

function activeConnection() {
  return seedFixtureConnection({
    connectionId: "conn-1",
    providerId: "cms",
    referenceId: "cred-aaa",
    accountLabel: "fixture-cms",
    scopes: ["publish"],
    nowIso: NOW,
  });
}

describe("credential rotation / revoke honesty", () => {
  it("marks connection revoked and denies leases + send-time effects", () => {
    const active = activeConnection();
    const revoked = markConnectionRevoked(active, NOW, "admin");
    expect(revoked.status).toBe(CredentialConnectionStatus.REVOKED);
    expect(revoked.connectionState).toBe(ConnectionState.REVOKED);
    expect(revoked.writeReadiness).toBe(WriteReadiness.BLOCKED);

    const view = connectionStatusView(revoked);
    expect(view.connected).toBe(false);
    expect(view.authorized).toBe(false);

    const lease = evaluateCredentialLease({
      connection: revoked,
      requestedScopes: ["publish"],
      leaseId: "lease-1",
      nowIso: NOW,
    });
    expect(lease).toMatchObject({ ok: false, code: "CONNECTION_REVOKED" });

    const effect = evaluateSendTimeEffect({ connection: revoked });
    expect(effect).toMatchObject({ ok: false, code: "CONNECTION_REVOKED" });
  });

  it("grants lease on active connection and denies missing scope", () => {
    const conn = activeConnection();
    const ok = evaluateCredentialLease({
      connection: conn,
      requestedScopes: ["publish"],
      leaseId: "lease-ok",
      nowIso: NOW,
      ttlMs: 1000,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.referenceId).toBe("cred-aaa");
    }

    const denied = evaluateCredentialLease({
      connection: conn,
      requestedScopes: ["admin"],
      leaseId: "lease-bad",
      nowIso: NOW,
    });
    expect(denied).toMatchObject({ ok: false, code: "SCOPE_DENIED" });
  });

  it("cancels eligible queued work and retains post-apply for reconcile", () => {
    const items = [
      {
        workId: "qw-1",
        connectionId: "conn-1",
        capabilityId: "cms_publish",
        operationId: "op-1",
        effectState: EffectState.QUEUED,
        queuedAtIso: NOW,
        summary: "queued publish",
      },
      {
        workId: "qw-2",
        connectionId: "conn-1",
        capabilityId: "cms_publish",
        operationId: "op-2",
        effectState: EffectState.WAITING_AUTHENTICATION,
        queuedAtIso: NOW,
        summary: "waiting auth",
      },
      {
        workId: "qw-3",
        connectionId: "conn-1",
        capabilityId: "cms_publish",
        operationId: "op-3",
        effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
        queuedAtIso: NOW,
        summary: "ambiguous apply",
      },
      {
        workId: "qw-4",
        connectionId: "conn-1",
        capabilityId: "cms_publish",
        operationId: "op-4",
        effectState: EffectState.COMPLETE,
        queuedAtIso: NOW,
        summary: "already complete",
      },
    ];

    const results = cancelEligibleQueuedWork(items);
    expect(results.filter((r) => r.cancelled)).toHaveLength(2);
    expect(results.filter((r) => r.retainedForReconcile)).toHaveLength(2);

    const updated = applyQueuedCancelResults(items, results);
    expect(updated.find((w) => w.workId === "qw-1")?.effectState).toBe(
      EffectState.CANCELLED,
    );
    expect(updated.find((w) => w.workId === "qw-2")?.effectState).toBe(
      EffectState.CANCELLED,
    );
    expect(updated.find((w) => w.workId === "qw-3")?.effectState).toBe(
      EffectState.UNKNOWN_REMOTE_OUTCOME,
    );
  });

  it("builds rotation record without secrets and keeps live revoke NOT_WIRED", () => {
    const record = buildRotationRecord({
      rotationId: "rot-1",
      connectionId: "conn-1",
      oldReferenceId: "cred-old",
      newReferenceId: "cred-new",
      approvedBy: "admin",
      nowIso: NOW,
    });
    expect(record.secretsExported).toBe(false);
    expect(record.sameAccount).toBe(true);
    expect(record.liveProviderRevoke).toBe("NOT_WIRED");
    // Opaque reference ids only — never raw vault material.
    expect(JSON.stringify(record)).not.toMatch(
      /super-secret|raw-token|password=/i,
    );
    expect(record.oldReferenceId).toBe("cred-old");
    expect(record.newReferenceId).toBe("cred-new");

    const live = attemptLiveProviderRevoke({
      connectionId: "conn-1",
      referenceId: "cred-old",
    });
    expect(live.ok).toBe(false);
    expect(live.code).toBe("LIVE_PROVIDER_REVOKE_NOT_WIRED");
    expect(live.liveProviderRevoke).toBe("NOT_WIRED");
    expect(live.liveProviderSuccessClaimed).toBe(false);
    expect(live.externalEffects).toBe("NONE");
    expect(live.reason).toMatch(/ACCEPTED≠VERIFIED/);
  });

  it("T-X029: different-account token requires explicit rebind; silent rotate denied", () => {
    expect(
      classifyAccountTokenChange({
        previousAccountLabel: "fixture-account-alpha",
        observedAccountLabel: "fixture-account-beta",
      }),
    ).toBe(AccountTokenChange.DIFFERENT_ACCOUNT);

    expect(
      classifyAccountTokenChange({
        previousAccountLabel: "Fixture-Account-Alpha",
        observedAccountLabel: "fixture-account-alpha",
      }),
    ).toBe(AccountTokenChange.SAME_ACCOUNT);

    const silent = evaluateSilentRotateAllowed({
      previousAccountLabel: "fixture-account-alpha",
      observedAccountLabel: "fixture-account-beta",
    });
    expect(silent).toMatchObject({ ok: false, code: "REBIND_REQUIRED" });

    const sameOk = evaluateSilentRotateAllowed({
      previousAccountLabel: "fixture-account-alpha",
      observedAccountLabel: "fixture-account-alpha",
    });
    expect(sameOk.ok).toBe(true);

    const noClaim = evaluateSilentRotateAllowed({
      previousAccountLabel: "fixture-account-alpha",
      observedAccountLabel: undefined,
    });
    expect(noClaim).toMatchObject({
      ok: false,
      code: "ACCOUNT_IDENTITY_REQUIRED",
    });

    const blankClaim = evaluateSilentRotateAllowed({
      previousAccountLabel: "fixture-account-alpha",
      observedAccountLabel: "   ",
    });
    expect(blankClaim).toMatchObject({
      ok: false,
      code: "ACCOUNT_IDENTITY_REQUIRED",
    });

    const conn = activeConnection();
    const rebindOk = evaluateExplicitRebind({
      connection: conn,
      newAccountLabel: "fixture-account-beta",
      approvedBy: "admin",
    });
    expect(rebindOk).toMatchObject({
      ok: true,
      change: AccountTokenChange.DIFFERENT_ACCOUNT,
    });

    const sameDenied = evaluateExplicitRebind({
      connection: conn,
      newAccountLabel: "fixture-cms",
      approvedBy: "admin",
    });
    expect(sameDenied).toMatchObject({ ok: false, code: "SAME_ACCOUNT" });

    const rotatedAway = markConnectionRotatedAway(
      conn,
      NOW,
      "admin",
      "cred-new",
    );
    expect(rotatedAway.status).toBe(CredentialConnectionStatus.ROTATED_AWAY);
    expect(rotatedAway.rotatedToReferenceId).toBe("cred-new");
    expect(
      evaluateCredentialLease({
        connection: rotatedAway,
        requestedScopes: ["publish"],
        leaseId: "lease-x",
        nowIso: NOW,
      }),
    ).toMatchObject({ ok: false, code: "CONNECTION_ROTATED_AWAY" });

    const record = buildRebindRecord({
      rebindId: "reb-1",
      oldConnectionId: "conn-1",
      newConnectionId: "conn-2",
      oldAccountLabel: "fixture-account-alpha",
      newAccountLabel: "fixture-account-beta",
      oldReferenceId: "cred-old",
      newReferenceId: "cred-new",
      approvedBy: "admin",
      nowIso: NOW,
    });
    expect(record.explicitRebind).toBe(true);
    expect(record.silentRefreshRejected).toBe(true);
    expect(record.catalogCaseId).toBe("T-X029");
    expect(record.externalEffects).toBe("NONE");
    expect(record.liveProviderRevoke).toBe("NOT_WIRED");
    expect(record.secretsExported).toBe(false);
    expect(JSON.stringify(record)).not.toMatch(/super-secret|raw-token/i);
  });

  it("offboarding retains audit obligations and flags provider revoke residual", () => {
    const cancelResults = cancelEligibleQueuedWork([
      {
        workId: "qw-1",
        connectionId: "conn-1",
        capabilityId: "cms_publish",
        operationId: null,
        effectState: EffectState.QUEUED,
        queuedAtIso: NOW,
        summary: "q",
      },
      {
        workId: "qw-2",
        connectionId: "conn-1",
        capabilityId: "cms_publish",
        operationId: null,
        effectState: EffectState.APPLYING,
        queuedAtIso: NOW,
        summary: "applying",
      },
    ]);

    const manifest = buildOffboardingManifest({
      manifestId: "ob-1",
      connectionId: "conn-1",
      cancelResults,
      hasActiveTokenResidual: true,
      nowIso: NOW,
    });

    expect(manifest.revokedLocally).toBe(true);
    expect(manifest.auditRetained).toBe(true);
    expect(manifest.queuedCancelledCount).toBe(1);
    expect(manifest.queuedRetainedPostApplyCount).toBe(1);
    expect(manifest.liveProviderRevoke).toBe("NOT_WIRED");
    expect(manifest.catalogClaim).toBe("NOT_RUN");
    expect(manifest.externalEffects).toBe("NONE");

    const providerObl = manifest.residualObligations.find(
      (o) => o.kind === "PROVIDER_REVOKE",
    );
    expect(providerObl?.status).toBe(ResidualObligationStatus.BLOCKED_NOT_WIRED);

    const tokenObl = manifest.residualObligations.find(
      (o) => o.kind === "ACTIVE_TOKEN",
    );
    expect(tokenObl?.status).toBe(ResidualObligationStatus.BLOCKED_NOT_WIRED);
    expect(tokenObl?.summary).toMatch(/ACCEPTED≠VERIFIED/);
    expect(manifest.summary).toMatch(/ACCEPTED≠VERIFIED/);

    const honesty = assertOffboardActiveTokenResidualHonest(manifest);
    expect(honesty.ok).toBe(true);
    expect(honesty.code).toBe("OFFBOARD_RESIDUAL_HONEST");
    expect(honesty.liveProviderRevoke).toBe("NOT_WIRED");
    expect(honesty.externalEffects).toBe("NONE");

    const dishonest = assertOffboardActiveTokenResidualHonest({
      ...manifest,
      liveProviderRevoke: "WIRED" as "NOT_WIRED",
    });
    expect(dishonest.ok).toBe(false);
    expect(dishonest.code).toBe("OFFBOARD_RESIDUAL_DISHONEST");

    const inventLive = assertOffboardActiveTokenResidualHonest({
      ...manifest,
      summary: "Offboarding is now live VERIFIED",
    });
    expect(inventLive.ok).toBe(false);
    expect(inventLive.code).toBe("OFFBOARD_RESIDUAL_DISHONEST");

    const inventRevoke = assertOffboardActiveTokenResidualHonest({
      ...manifest,
      summary: "Live provider revoke completed",
    });
    expect(inventRevoke.ok).toBe(false);
    expect(inventRevoke.code).toBe("OFFBOARD_RESIDUAL_DISHONEST");

    const doubleLive = attemptLiveProviderRevoke({
      connectionId: "conn-1",
      referenceId: "cred-aaa",
    });
    expect(doubleLive.liveProviderSuccessClaimed).toBe(false);
    expect(doubleLive.liveProviderRevoke).toBe("NOT_WIRED");

    const blankConn = attemptLiveProviderRevoke({
      connectionId: "   ",
      referenceId: "",
    });
    expect(blankConn.ok).toBe(false);
    expect(blankConn.code).toBe("LIVE_PROVIDER_REVOKE_NOT_WIRED");
    expect(blankConn.liveProviderSuccessClaimed).toBe(false);

    const claimLive = attemptLiveProviderRevoke({
      connectionId: "conn-1",
      referenceId: "cred-aaa",
      claimLiveVerified: true,
    });
    expect(claimLive.ok).toBe(false);
    expect(claimLive.code).toBe("LIVE_CLAIM_REFUSED");
    expect(claimLive.liveProviderRevoke).toBe("NOT_WIRED");

    const forceComplete = attemptLiveProviderRevoke({
      connectionId: "conn-1",
      referenceId: "cred-aaa",
      forceCompleteRemoteRevoke: true,
    });
    expect(forceComplete.code).toBe("LIVE_CLAIM_REFUSED");

    const dualClaim = attemptLiveProviderRevoke({
      connectionId: "conn-1",
      referenceId: "cred-aaa",
      claimLiveVerified: true,
      forceCompleteRemoteRevoke: true,
    });
    expect(dualClaim.code).toBe("LIVE_CLAIM_REFUSED");
    expect(dualClaim.liveProviderSuccessClaimed).toBe(false);

    const paddedConn = attemptLiveProviderRevoke({
      connectionId: "  conn-1  ",
      referenceId: "cred-aaa",
    });
    expect(paddedConn.code).toBe("LIVE_PROVIDER_REVOKE_NOT_WIRED");
    expect(paddedConn.liveProviderSuccessClaimed).toBe(false);

    const paddedRef = attemptLiveProviderRevoke({
      connectionId: "conn-1",
      referenceId: "  cred-aaa  ",
    });
    expect(paddedRef.code).toBe("LIVE_PROVIDER_REVOKE_NOT_WIRED");

    const satisfiedToken = assertOffboardActiveTokenResidualHonest({
      ...manifest,
      residualObligations: manifest.residualObligations.map((o) =>
        o.kind === "ACTIVE_TOKEN"
          ? { ...o, status: ResidualObligationStatus.SATISFIED }
          : o,
      ),
    });
    expect(satisfiedToken.ok).toBe(false);

    const prodOn = assertOffboardActiveTokenResidualHonest({
      ...manifest,
      productionActivated: true,
    });
    expect(prodOn.ok).toBe(false);

    const noLocalRevoke = assertOffboardActiveTokenResidualHonest({
      ...manifest,
      revokedLocally: false as true,
    });
    expect(noLocalRevoke.ok).toBe(false);

    const missingToken = assertOffboardActiveTokenResidualHonest(
      buildOffboardingManifest({
        manifestId: "ob-no-token",
        connectionId: "conn-1",
        cancelResults,
        hasActiveTokenResidual: false,
        nowIso: NOW,
      }),
    );
    expect(missingToken.ok).toBe(false);

    const r1 = reclaimOffboardActiveTokenResidual(manifest);
    const r2 = reclaimOffboardActiveTokenResidual(manifest);
    const r3 = reclaimOffboardActiveTokenResidual(manifest);
    const reclaimIdem = assertOffboardActiveTokenResidualReclaimIdempotent({
      first: r1,
      second: r2,
    });
    const reclaimTrip = assertOffboardActiveTokenResidualReclaimIdempotent({
      first: r1,
      second: r3,
    });
    expect(reclaimIdem.ok).toBe(true);
    expect(reclaimIdem.code).toBe("OFFBOARD_RECLAIM_IDEMPOTENT");
    expect(reclaimTrip.ok).toBe(true);
    expect(r1.priorLiveRevokeInvented).toBe(false);

    // I12: claim wins over padded id; PROVIDER_REVOKE SATISFIED dishonest;
    // invent ACTIVE_TOKEN closed; honest+dishonest reclaim → DRIFT.
    const claimOnPadded = attemptLiveProviderRevoke({
      connectionId: "  conn-1  ",
      referenceId: "cred-aaa",
      claimLiveVerified: true,
    });
    expect(claimOnPadded.code).toBe("LIVE_CLAIM_REFUSED");
    expect(claimOnPadded.liveProviderSuccessClaimed).toBe(false);

    const providerSatisfied = assertOffboardActiveTokenResidualHonest({
      ...manifest,
      residualObligations: manifest.residualObligations.map((o) =>
        o.kind === "PROVIDER_REVOKE"
          ? { ...o, status: ResidualObligationStatus.SATISFIED }
          : o,
      ),
    });
    expect(providerSatisfied.ok).toBe(false);

    const inventTokenClosed = assertOffboardActiveTokenResidualHonest({
      ...manifest,
      summary: "ACTIVE_TOKEN residual satisfied after remote revoke",
    });
    expect(inventTokenClosed.ok).toBe(false);

    const dishonestReclaim = reclaimOffboardActiveTokenResidual({
      ...manifest,
      liveProviderRevoke: "WIRED" as "NOT_WIRED",
    });
    const reclaimDrift = assertOffboardActiveTokenResidualReclaimIdempotent({
      first: r1,
      second: dishonestReclaim,
    });
    expect(reclaimDrift.ok).toBe(false);
    expect(reclaimDrift.code).toBe("OFFBOARD_RECLAIM_DRIFT");

    // I14: force-on-padded refuse; invent all-residuals-closed / SCHEDULE re-enabled;
    // reclaim priorLiveRevokeInvented forge → DRIFT.
    const forceOnPadded = attemptLiveProviderRevoke({
      connectionId: "conn-1",
      referenceId: "  cred-aaa  ",
      forceCompleteRemoteRevoke: true,
    });
    expect(forceOnPadded.code).toBe("LIVE_CLAIM_REFUSED");
    expect(forceOnPadded.liveProviderSuccessClaimed).toBe(false);

    const dualOnPadded = attemptLiveProviderRevoke({
      connectionId: "  conn-1  ",
      referenceId: "  cred-aaa  ",
      claimLiveVerified: true,
      forceCompleteRemoteRevoke: true,
    });
    expect(dualOnPadded.code).toBe("LIVE_CLAIM_REFUSED");

    const inventAllClosed = assertOffboardActiveTokenResidualHonest({
      ...manifest,
      summary: "all residuals are now closed after remote revoke",
    });
    expect(inventAllClosed.ok).toBe(false);
    expect(inventAllClosed.code).toBe("OFFBOARD_RESIDUAL_DISHONEST");

    const inventScheduleLive = assertOffboardActiveTokenResidualHonest({
      ...manifest,
      summary: "SCHEDULE residual re-enabled live after offboard",
    });
    expect(inventScheduleLive.ok).toBe(false);

    const inventPrior = {
      ...r1,
      priorLiveRevokeInvented: true as false,
    };
    const priorDrift = assertOffboardActiveTokenResidualReclaimIdempotent({
      first: r1,
      second: inventPrior,
    });
    expect(priorDrift.ok).toBe(false);
    expect(priorDrift.code).toBe("OFFBOARD_RECLAIM_DRIFT");

    // I15: blank-id claim refuse; invent QUEUED_WORK live-delivered /
    // offboarding-complete / AUDIT purged; catalogClaim ACCEPTED dishonest.
    const claimOnBlank = attemptLiveProviderRevoke({
      connectionId: "",
      referenceId: "cred-aaa",
      claimLiveVerified: true,
    });
    expect(claimOnBlank.code).toBe("LIVE_CLAIM_REFUSED");
    expect(claimOnBlank.liveProviderSuccessClaimed).toBe(false);

    const inventQueuedLive = assertOffboardActiveTokenResidualHonest({
      ...manifest,
      summary: "QUEUED_WORK residual delivered live after offboard",
    });
    expect(inventQueuedLive.ok).toBe(false);
    expect(inventQueuedLive.code).toBe("OFFBOARD_RESIDUAL_DISHONEST");

    const inventComplete = assertOffboardActiveTokenResidualHonest({
      ...manifest,
      summary: "offboarding is now complete; residual is cleared",
    });
    expect(inventComplete.ok).toBe(false);

    const inventAuditPurged = assertOffboardActiveTokenResidualHonest({
      ...manifest,
      summary: "AUDIT_RETENTION residual purged live",
    });
    expect(inventAuditPurged.ok).toBe(false);

    const inventCatalogAccepted = assertOffboardActiveTokenResidualHonest({
      ...manifest,
      catalogClaim: "ACCEPTED" as "NOT_RUN",
    });
    expect(inventCatalogAccepted.ok).toBe(false);

    // I16: blank-id force refuse; invent BACKUP_COPY closed live /
    // secrets exported live / ACCEPTED=VERIFIED / liveProviderRevoke WIRED.
    const forceOnBlank = attemptLiveProviderRevoke({
      connectionId: "",
      referenceId: "cred-aaa",
      forceCompleteRemoteRevoke: true,
    });
    expect(forceOnBlank.code).toBe("LIVE_CLAIM_REFUSED");
    expect(forceOnBlank.liveProviderSuccessClaimed).toBe(false);

    const inventBackup = assertOffboardActiveTokenResidualHonest({
      ...manifest,
      summary: "BACKUP_COPY residual completed remotely",
    });
    expect(inventBackup.ok).toBe(false);
    expect(inventBackup.code).toBe("OFFBOARD_RESIDUAL_DISHONEST");

    const inventSecrets = assertOffboardActiveTokenResidualHonest({
      ...manifest,
      summary: "secrets were exported live after offboard",
    });
    expect(inventSecrets.ok).toBe(false);

    const inventEqualsVerified = assertOffboardActiveTokenResidualHonest({
      ...manifest,
      summary: "catalogClaim ACCEPTED=VERIFIED after remote revoke",
    });
    expect(inventEqualsVerified.ok).toBe(false);

    const inventWired = assertOffboardActiveTokenResidualHonest({
      ...manifest,
      summary: "liveProviderRevoke is now WIRED",
    });
    expect(inventWired.ok).toBe(false);

    const audit = createAuditEntry({
      entryId: "aud-1",
      kind: CredentialAuditKind.OFFBOARDED,
      connectionId: "conn-1",
      referenceId: "cred-aaa",
      summary: "offboarded",
      nowIso: NOW,
    });
    expect(audit.redacted).toBe(true);
  });
});
