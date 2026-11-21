import { describe, expect, it } from "vitest";
import { EffectState } from "./effect-state-machine.js";
import { ConnectionState, WriteReadiness } from "./connection-status.js";
import {
  attemptLiveProviderRevoke,
  buildOffboardingManifest,
  buildRotationRecord,
  cancelEligibleQueuedWork,
  applyQueuedCancelResults,
  connectionStatusView,
  createAuditEntry,
  evaluateCredentialLease,
  evaluateSendTimeEffect,
  markConnectionRevoked,
  seedFixtureConnection,
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
    expect(live.externalEffects).toBe("NONE");
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
