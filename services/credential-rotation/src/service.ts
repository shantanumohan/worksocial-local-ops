/**
 * WP10 credential rotation / offboarding service — fixture honesty paths.
 * External effects: NONE. Live provider revoke: NOT_WIRED. Catalog: NOT_RUN.
 */

import { randomUUID } from "node:crypto";
import {
  CREDENTIAL_ROTATION_RELATED_CASE_IDS,
  CredentialAuditKind,
  CredentialConnectionStatus,
  EffectState,
  applyQueuedCancelResults,
  attemptLiveProviderRevoke,
  buildOffboardingManifest,
  buildRotationRecord,
  cancelEligibleQueuedWork,
  connectionStatusView,
  createAuditEntry,
  evaluateCredentialLease,
  evaluateSendTimeEffect,
  markConnectionRevoked,
  seedFixtureConnection,
  type CredentialLeaseDecision,
  type CredentialEffectDecision,
  type FixtureCredentialConnection,
  type OffboardingManifest,
  type CredentialRotationRecord,
} from "@worksocial/domain";
import type { CredentialBroker } from "@worksocial/credential-broker";
import type { CredentialRotationStore } from "@worksocial/persistence";

export type CredentialRotationService = {
  status(): ReturnType<CredentialRotationStore["status"]> & {
    relatedCaseIds: readonly string[];
    principal: "credential-rotation";
  };
  listConnections(): Array<
    FixtureCredentialConnection & {
      statusView: ReturnType<typeof connectionStatusView>;
    }
  >;
  listQueuedWork(connectionId?: string): ReturnType<
    CredentialRotationStore["listQueuedWork"]
  >;
  listAudit(limit?: number): ReturnType<CredentialRotationStore["listAudit"]>;
  listRotations(limit?: number): ReturnType<
    CredentialRotationStore["listRotations"]
  >;
  listManifests(limit?: number): ReturnType<
    CredentialRotationStore["listManifests"]
  >;
  seedFixture(input?: {
    connectionId?: string;
    providerId?: string;
    accountLabel?: string;
    scopes?: string[];
    secretMaterial?: string;
    nowIso?: string;
    withQueuedWork?: boolean;
  }): {
    connection: FixtureCredentialConnection;
    referenceId: string;
    queuedWorkIds: string[];
  };
  requestLease(input: {
    connectionId: string;
    requestedScopes: string[];
    nowIso?: string;
    ttlMs?: number;
  }): CredentialLeaseDecision & { auditEntryId: string | null };
  requestEffect(input: {
    connectionId: string;
  }): CredentialEffectDecision & { auditEntryId: string | null };
  revoke(input: {
    connectionId: string;
    approvedBy?: string;
    nowIso?: string;
  }):
    | {
        ok: true;
        connection: FixtureCredentialConnection;
        cancelResults: ReturnType<typeof cancelEligibleQueuedWork>;
        liveProviderRevoke: ReturnType<typeof attemptLiveProviderRevoke>;
        auditRetained: true;
        externalEffects: "NONE";
      }
    | { ok: false; code: string; reason: string };
  rotate(input: {
    connectionId: string;
    approvedBy: string;
    secretMaterial: string;
    nowIso?: string;
  }):
    | {
        ok: true;
        connection: FixtureCredentialConnection;
        rotation: CredentialRotationRecord;
        liveProviderRevoke: "NOT_WIRED";
        externalEffects: "NONE";
      }
    | { ok: false; code: string; reason: string };
  offboard(input: {
    connectionId: string;
    approvedBy?: string;
    nowIso?: string;
  }):
    | {
        ok: true;
        connection: FixtureCredentialConnection;
        manifest: OffboardingManifest;
        cancelResults: ReturnType<typeof cancelEligibleQueuedWork>;
        auditRetained: true;
        externalEffects: "NONE";
        catalogClaim: "NOT_RUN";
      }
    | { ok: false; code: string; reason: string };
  liveProviderRevoke(input: {
    connectionId: string;
  }): ReturnType<typeof attemptLiveProviderRevoke> & {
    connectionId: string;
  };
};

export function createCredentialRotationService(input: {
  store: CredentialRotationStore;
  broker: CredentialBroker;
}): CredentialRotationService {
  const { store, broker } = input;

  return {
    status() {
      return {
        ...store.status(),
        relatedCaseIds: CREDENTIAL_ROTATION_RELATED_CASE_IDS,
        principal: "credential-rotation",
      };
    },

    listConnections() {
      return store.listConnections().map((c) => ({
        ...c,
        statusView: connectionStatusView(c),
      }));
    },

    listQueuedWork(connectionId) {
      return store.listQueuedWork(connectionId);
    },

    listAudit(limit) {
      return store.listAudit(limit);
    },

    listRotations(limit) {
      return store.listRotations(limit);
    },

    listManifests(limit) {
      return store.listManifests(limit);
    },

    seedFixture(opts = {}) {
      const nowIso = opts.nowIso ?? new Date().toISOString();
      const secret = opts.secretMaterial ?? `fixture-secret-${randomUUID()}`;
      const ref = broker.putReference(
        opts.providerId ?? "cms",
        opts.scopes ?? ["publish"],
        secret,
        nowIso,
      );
      const connection = seedFixtureConnection({
        connectionId: opts.connectionId ?? `conn-${randomUUID()}`,
        providerId: opts.providerId ?? "cms",
        referenceId: ref.referenceId,
        accountLabel: opts.accountLabel ?? "fixture-account",
        scopes: opts.scopes ?? ["publish"],
        nowIso,
      });
      store.upsertConnection(connection);
      store.appendAudit(
        createAuditEntry({
          entryId: `aud-${randomUUID()}`,
          kind: CredentialAuditKind.CONNECTION_SEEDED,
          connectionId: connection.connectionId,
          referenceId: connection.referenceId,
          summary: `Seeded fixture connection ${connection.connectionId}`,
          nowIso,
          details: { providerId: connection.providerId },
        }),
      );

      const queuedWorkIds: string[] = [];
      if (opts.withQueuedWork !== false) {
        const items = [
          {
            workId: `qw-${randomUUID()}`,
            connectionId: connection.connectionId,
            capabilityId: "cms_publish",
            operationId: `op-${randomUUID()}`,
            effectState: EffectState.QUEUED,
            queuedAtIso: nowIso,
            summary: "Fixture queued publish (eligible for cancel on revoke)",
          },
          {
            workId: `qw-${randomUUID()}`,
            connectionId: connection.connectionId,
            capabilityId: "cms_publish",
            operationId: `op-${randomUUID()}`,
            effectState: EffectState.WAITING_AUTHENTICATION,
            queuedAtIso: nowIso,
            summary: "Fixture waiting-auth work (eligible for cancel)",
          },
          {
            workId: `qw-${randomUUID()}`,
            connectionId: connection.connectionId,
            capabilityId: "cms_publish",
            operationId: `op-${randomUUID()}`,
            effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
            queuedAtIso: nowIso,
            summary: "Fixture URO — retained for reconcile on revoke",
          },
        ];
        store.upsertQueuedWork(items);
        queuedWorkIds.push(...items.map((i) => i.workId));
      }

      return {
        connection,
        referenceId: ref.referenceId,
        queuedWorkIds,
      };
    },

    requestLease(req) {
      const nowIso = req.nowIso ?? new Date().toISOString();
      const connection = store.getConnection(req.connectionId);
      const decision = evaluateCredentialLease({
        connection,
        requestedScopes: req.requestedScopes,
        leaseId: `lease-${randomUUID()}`,
        nowIso,
        ...(req.ttlMs !== undefined ? { ttlMs: req.ttlMs } : {}),
      });

      // Also deny via broker when connection maps to a revoked reference.
      if (decision.ok && connection) {
        const mint = broker.mintScopedHandle({
          principal: "action-gateway",
          referenceId: connection.referenceId,
          requestedScopes: req.requestedScopes,
          nowIso,
          ...(req.ttlMs !== undefined ? { ttlMs: req.ttlMs } : {}),
        });
        if (!mint.ok) {
          const audit = createAuditEntry({
            entryId: `aud-${randomUUID()}`,
            kind: CredentialAuditKind.LEASE_DENIED,
            connectionId: req.connectionId,
            referenceId: connection.referenceId,
            summary: `Broker denied lease: ${mint.code}`,
            nowIso,
            details: { code: mint.code },
          });
          store.appendAudit(audit);
          return {
            ok: false as const,
            code:
              mint.code === "REFERENCE_REVOKED"
                ? ("CONNECTION_REVOKED" as const)
                : mint.code === "SCOPE_DENIED"
                  ? ("SCOPE_DENIED" as const)
                  : ("CONNECTION_MISSING" as const),
            reason: mint.reason,
            auditEntryId: audit.entryId,
          };
        }
      }

      const audit = createAuditEntry({
        entryId: `aud-${randomUUID()}`,
        kind: decision.ok
          ? CredentialAuditKind.LEASE_GRANTED
          : CredentialAuditKind.LEASE_DENIED,
        connectionId: req.connectionId,
        referenceId: connection?.referenceId ?? null,
        summary: decision.ok
          ? `Lease granted ${decision.leaseId}`
          : `Lease denied: ${decision.code}`,
        nowIso,
        details: decision.ok
          ? { leaseId: decision.leaseId }
          : { code: decision.code },
      });
      store.appendAudit(audit);
      return { ...decision, auditEntryId: audit.entryId };
    },

    requestEffect(req) {
      const nowIso = new Date().toISOString();
      const connection = store.getConnection(req.connectionId);
      const decision = evaluateSendTimeEffect({ connection });
      const audit = createAuditEntry({
        entryId: `aud-${randomUUID()}`,
        kind: decision.ok
          ? CredentialAuditKind.LEASE_GRANTED
          : CredentialAuditKind.EFFECT_DENIED,
        connectionId: req.connectionId,
        referenceId: connection?.referenceId ?? null,
        summary: decision.ok
          ? "Send-time effect allowed"
          : `Send-time effect denied: ${decision.code}`,
        nowIso,
        details: decision.ok ? {} : { code: decision.code },
      });
      store.appendAudit(audit);
      return { ...decision, auditEntryId: audit.entryId };
    },

    revoke(req) {
      const nowIso = req.nowIso ?? new Date().toISOString();
      const existing = store.getConnection(req.connectionId);
      if (!existing) {
        return {
          ok: false,
          code: "CONNECTION_MISSING",
          reason: "Unknown credential connection",
        };
      }
      if (existing.status === CredentialConnectionStatus.REVOKED) {
        return {
          ok: false,
          code: "ALREADY_REVOKED",
          reason: "Connection is already revoked",
        };
      }

      const revoked = markConnectionRevoked(
        existing,
        nowIso,
        req.approvedBy ?? null,
      );
      store.upsertConnection(revoked);
      broker.revokeReference(existing.referenceId, nowIso);

      const queued = store.listQueuedWork(existing.connectionId);
      const cancelResults = cancelEligibleQueuedWork(queued);
      const updatedQueue = applyQueuedCancelResults(queued, cancelResults);
      store.upsertQueuedWork(updatedQueue);

      for (const result of cancelResults) {
        store.appendAudit(
          createAuditEntry({
            entryId: `aud-${randomUUID()}`,
            kind: result.cancelled
              ? CredentialAuditKind.QUEUED_CANCELLED
              : result.retainedForReconcile
                ? CredentialAuditKind.QUEUED_RETAINED_POST_APPLY
                : CredentialAuditKind.QUEUED_CANCELLED,
            connectionId: existing.connectionId,
            referenceId: existing.referenceId,
            summary: `${result.workId}: ${result.reason}`,
            nowIso,
            details: {
              workId: result.workId,
              fromState: result.fromState,
              toState: result.toState,
              cancelled: result.cancelled,
            },
          }),
        );
      }

      store.appendAudit(
        createAuditEntry({
          entryId: `aud-${randomUUID()}`,
          kind: CredentialAuditKind.REVOKED,
          connectionId: revoked.connectionId,
          referenceId: revoked.referenceId,
          summary: `Connection ${revoked.connectionId} revoked locally`,
          nowIso,
          details: { approvedBy: req.approvedBy ?? null },
        }),
      );

      const live = attemptLiveProviderRevoke({
        connectionId: revoked.connectionId,
        referenceId: revoked.referenceId,
      });
      store.appendAudit(
        createAuditEntry({
          entryId: `aud-${randomUUID()}`,
          kind: CredentialAuditKind.LIVE_PROVIDER_REVOKE_NOT_WIRED,
          connectionId: revoked.connectionId,
          referenceId: revoked.referenceId,
          summary: live.reason,
          nowIso,
          details: { code: live.code },
        }),
      );

      return {
        ok: true,
        connection: revoked,
        cancelResults,
        liveProviderRevoke: live,
        auditRetained: true,
        externalEffects: "NONE",
      };
    },

    rotate(req) {
      const nowIso = req.nowIso ?? new Date().toISOString();
      const existing = store.getConnection(req.connectionId);
      if (!existing) {
        return {
          ok: false,
          code: "CONNECTION_MISSING",
          reason: "Unknown credential connection",
        };
      }
      if (existing.status !== CredentialConnectionStatus.ACTIVE) {
        return {
          ok: false,
          code: "CONNECTION_NOT_ACTIVE",
          reason: `Cannot rotate connection in status ${existing.status}`,
        };
      }

      const rotated = broker.rotateReference({
        oldReferenceId: existing.referenceId,
        secretMaterial: req.secretMaterial,
        nowIso,
        scopes: existing.scopes,
      });
      if (!rotated.ok) {
        return {
          ok: false,
          code: rotated.code,
          reason: rotated.reason,
        };
      }

      const nextConnection: FixtureCredentialConnection = {
        ...existing,
        referenceId: rotated.newReference.referenceId,
        rotatedToReferenceId: rotated.newReference.referenceId,
        approvedBy: req.approvedBy,
      };
      store.upsertConnection(nextConnection);

      const rotation = buildRotationRecord({
        rotationId: `rot-${randomUUID()}`,
        connectionId: existing.connectionId,
        oldReferenceId: rotated.oldReference.referenceId,
        newReferenceId: rotated.newReference.referenceId,
        approvedBy: req.approvedBy,
        nowIso,
      });
      store.addRotation(rotation);
      store.appendAudit(
        createAuditEntry({
          entryId: `aud-${randomUUID()}`,
          kind: CredentialAuditKind.ROTATED,
          connectionId: existing.connectionId,
          referenceId: rotated.newReference.referenceId,
          summary: rotation.summary,
          nowIso,
          details: {
            oldReferenceId: rotated.oldReference.referenceId,
            newReferenceId: rotated.newReference.referenceId,
            approvedBy: req.approvedBy,
            liveProviderRevoke: "NOT_WIRED",
          },
        }),
      );

      return {
        ok: true,
        connection: nextConnection,
        rotation,
        liveProviderRevoke: "NOT_WIRED",
        externalEffects: "NONE",
      };
    },

    offboard(req) {
      const nowIso = req.nowIso ?? new Date().toISOString();
      const existing = store.getConnection(req.connectionId);
      if (!existing) {
        return {
          ok: false,
          code: "CONNECTION_MISSING",
          reason: "Unknown credential connection",
        };
      }

      let connection = existing;
      if (existing.status === CredentialConnectionStatus.ACTIVE) {
        const revoked = this.revoke({
          connectionId: existing.connectionId,
          ...(req.approvedBy !== undefined
            ? { approvedBy: req.approvedBy }
            : {}),
          nowIso,
        });
        if (!revoked.ok) {
          return revoked;
        }
        connection = revoked.connection;
      }

      const queued = store.listQueuedWork(connection.connectionId);
      const cancelResults = cancelEligibleQueuedWork(queued);
      // Queue already updated by revoke when we revoked above; ensure cancel applied.
      store.upsertQueuedWork(applyQueuedCancelResults(queued, cancelResults));

      const manifest = buildOffboardingManifest({
        manifestId: `ob-${randomUUID()}`,
        connectionId: connection.connectionId,
        cancelResults,
        hasActiveTokenResidual: true,
        nowIso,
      });
      store.addManifest(manifest);
      store.appendAudit(
        createAuditEntry({
          entryId: `aud-${randomUUID()}`,
          kind: CredentialAuditKind.OFFBOARDED,
          connectionId: connection.connectionId,
          referenceId: connection.referenceId,
          summary: manifest.summary,
          nowIso,
          details: {
            manifestId: manifest.manifestId,
            liveProviderRevoke: "NOT_WIRED",
          },
        }),
      );

      return {
        ok: true,
        connection,
        manifest,
        cancelResults,
        auditRetained: true,
        externalEffects: "NONE",
        catalogClaim: "NOT_RUN",
      };
    },

    liveProviderRevoke(req) {
      const connection = store.getConnection(req.connectionId);
      const result = attemptLiveProviderRevoke({
        connectionId: req.connectionId,
        referenceId: connection?.referenceId ?? "unknown",
      });
      store.appendAudit(
        createAuditEntry({
          entryId: `aud-${randomUUID()}`,
          kind: CredentialAuditKind.LIVE_PROVIDER_REVOKE_NOT_WIRED,
          connectionId: req.connectionId,
          referenceId: connection?.referenceId ?? null,
          summary: result.reason,
          nowIso: new Date().toISOString(),
          details: { code: result.code },
        }),
      );
      if (connection) {
        broker.attemptLiveProviderRevoke(connection.referenceId);
      }
      return { ...result, connectionId: req.connectionId };
    },
  };
}
