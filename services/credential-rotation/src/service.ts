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
  buildRebindRecord,
  buildRotationRecord,
  cancelEligibleQueuedWork,
  connectionStatusView,
  createAuditEntry,
  evaluateCredentialLease,
  evaluateExplicitRebind,
  evaluateSendTimeEffect,
  evaluateSilentRotateAllowed,
  markConnectionRevoked,
  markConnectionRotatedAway,
  seedFixtureConnection,
  type CredentialLeaseDecision,
  type CredentialEffectDecision,
  type FixtureCredentialConnection,
  type OffboardingManifest,
  type CredentialRebindRecord,
  type CredentialRotationRecord,
} from "@worksocial/domain";
import type { CredentialBroker } from "@worksocial/credential-broker";
import type { CredentialRotationStore } from "@worksocial/persistence";

export type CredentialRotationService = {
  status(): Promise<
    Awaited<ReturnType<CredentialRotationStore["status"]>> & {
      relatedCaseIds: readonly string[];
      principal: "credential-rotation";
    }
  >;
  listConnections(): Promise<
    Array<
      FixtureCredentialConnection & {
        statusView: ReturnType<typeof connectionStatusView>;
      }
    >
  >;
  listQueuedWork(
    connectionId?: string,
  ): Promise<Awaited<ReturnType<CredentialRotationStore["listQueuedWork"]>>>;
  listAudit(
    limit?: number,
  ): Promise<Awaited<ReturnType<CredentialRotationStore["listAudit"]>>>;
  listRotations(
    limit?: number,
  ): Promise<Awaited<ReturnType<CredentialRotationStore["listRotations"]>>>;
  listRebinds(
    limit?: number,
  ): Promise<Awaited<ReturnType<CredentialRotationStore["listRebinds"]>>>;
  listManifests(
    limit?: number,
  ): Promise<Awaited<ReturnType<CredentialRotationStore["listManifests"]>>>;
  seedFixture(input?: {
    connectionId?: string;
    providerId?: string;
    accountLabel?: string;
    scopes?: string[];
    secretMaterial?: string;
    nowIso?: string;
    withQueuedWork?: boolean;
  }): Promise<{
    connection: FixtureCredentialConnection;
    referenceId: string;
    queuedWorkIds: string[];
  }>;
  requestLease(input: {
    connectionId: string;
    requestedScopes: string[];
    nowIso?: string;
    ttlMs?: number;
  }): Promise<CredentialLeaseDecision & { auditEntryId: string | null }>;
  requestEffect(input: {
    connectionId: string;
  }): Promise<CredentialEffectDecision & { auditEntryId: string | null }>;
  revoke(input: {
    connectionId: string;
    approvedBy?: string;
    nowIso?: string;
  }): Promise<
    | {
        ok: true;
        connection: FixtureCredentialConnection;
        cancelResults: ReturnType<typeof cancelEligibleQueuedWork>;
        liveProviderRevoke: ReturnType<typeof attemptLiveProviderRevoke>;
        auditRetained: true;
        externalEffects: "NONE";
      }
    | { ok: false; code: string; reason: string }
  >;
  rotate(input: {
    connectionId: string;
    approvedBy: string;
    secretMaterial: string;
    /** Required non-empty identity proof — blank cannot authorize silent rotate (T-X029). */
    observedAccountLabel: string;
    nowIso?: string;
  }): Promise<
    | {
        ok: true;
        connection: FixtureCredentialConnection;
        rotation: CredentialRotationRecord;
        liveProviderRevoke: "NOT_WIRED";
        externalEffects: "NONE";
      }
    | { ok: false; code: string; reason: string }
  >;
  /**
   * Explicit different-account rebind (T-X029).
   * Old connection → ROTATED_AWAY; new connection for the new account.
   * Never treats different-account tokens as transparent refresh.
   */
  rebind(input: {
    connectionId: string;
    newAccountLabel: string;
    approvedBy: string;
    secretMaterial: string;
    nowIso?: string;
    newConnectionId?: string;
  }): Promise<
    | {
        ok: true;
        oldConnection: FixtureCredentialConnection;
        newConnection: FixtureCredentialConnection;
        rebind: CredentialRebindRecord;
        cancelResults: ReturnType<typeof cancelEligibleQueuedWork>;
        liveProviderRevoke: "NOT_WIRED";
        externalEffects: "NONE";
        catalogCaseId: "T-X029";
      }
    | { ok: false; code: string; reason: string }
  >;
  offboard(input: {
    connectionId: string;
    approvedBy?: string;
    nowIso?: string;
  }): Promise<
    | {
        ok: true;
        connection: FixtureCredentialConnection;
        manifest: OffboardingManifest;
        cancelResults: ReturnType<typeof cancelEligibleQueuedWork>;
        auditRetained: true;
        externalEffects: "NONE";
        catalogClaim: "NOT_RUN";
      }
    | { ok: false; code: string; reason: string }
  >;
  liveProviderRevoke(input: {
    connectionId: string;
  }): Promise<
    ReturnType<typeof attemptLiveProviderRevoke> & {
      connectionId: string;
    }
  >;
};

export function createCredentialRotationService(input: {
  store: CredentialRotationStore;
  broker: CredentialBroker;
}): CredentialRotationService {
  const { store, broker } = input;

  const service: CredentialRotationService = {
    async status() {
      return {
        ...(await store.status()),
        relatedCaseIds: CREDENTIAL_ROTATION_RELATED_CASE_IDS,
        principal: "credential-rotation",
      };
    },

    async listConnections() {
      return (await store.listConnections()).map((c) => ({
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

    listRebinds(limit) {
      return store.listRebinds(limit);
    },

    listManifests(limit) {
      return store.listManifests(limit);
    },

    async seedFixture(opts = {}) {
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
      await store.upsertConnection(connection);
      await store.appendAudit(
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
        await store.upsertQueuedWork(items);
        queuedWorkIds.push(...items.map((i) => i.workId));
      }

      return {
        connection,
        referenceId: ref.referenceId,
        queuedWorkIds,
      };
    },

    async requestLease(req) {
      const nowIso = req.nowIso ?? new Date().toISOString();
      const connection = await store.getConnection(req.connectionId);
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
          await store.appendAudit(audit);
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
      await store.appendAudit(audit);
      return { ...decision, auditEntryId: audit.entryId };
    },

    async requestEffect(req) {
      const nowIso = new Date().toISOString();
      const connection = await store.getConnection(req.connectionId);
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
      await store.appendAudit(audit);
      return { ...decision, auditEntryId: audit.entryId };
    },

    async revoke(req) {
      const nowIso = req.nowIso ?? new Date().toISOString();
      const existing = await store.getConnection(req.connectionId);
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
      await store.upsertConnection(revoked);
      broker.revokeReference(existing.referenceId, nowIso);

      const queued = await store.listQueuedWork(existing.connectionId);
      const cancelResults = cancelEligibleQueuedWork(queued);
      const updatedQueue = applyQueuedCancelResults(queued, cancelResults);
      await store.upsertQueuedWork(updatedQueue);

      for (const result of cancelResults) {
        await store.appendAudit(
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

      await store.appendAudit(
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
      await store.appendAudit(
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

    async rotate(req) {
      const nowIso = req.nowIso ?? new Date().toISOString();
      const existing = await store.getConnection(req.connectionId);
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

      const silent = evaluateSilentRotateAllowed({
        previousAccountLabel: existing.accountLabel,
        observedAccountLabel: req.observedAccountLabel,
      });
      if (!silent.ok) {
        await store.appendAudit(
          createAuditEntry({
            entryId: `aud-${randomUUID()}`,
            kind: CredentialAuditKind.REBIND_REQUIRED,
            connectionId: existing.connectionId,
            referenceId: existing.referenceId,
            summary: silent.reason,
            nowIso,
            details: {
              code: silent.code,
              previousAccountLabel: existing.accountLabel,
              observedAccountLabel: req.observedAccountLabel ?? null,
            },
          }),
        );
        return {
          ok: false,
          code: silent.code,
          reason: silent.reason,
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
      await store.upsertConnection(nextConnection);

      const rotation = buildRotationRecord({
        rotationId: `rot-${randomUUID()}`,
        connectionId: existing.connectionId,
        oldReferenceId: rotated.oldReference.referenceId,
        newReferenceId: rotated.newReference.referenceId,
        approvedBy: req.approvedBy,
        nowIso,
      });
      await store.addRotation(rotation);
      await store.appendAudit(
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
            sameAccount: true,
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

    async rebind(req) {
      const nowIso = req.nowIso ?? new Date().toISOString();
      const existing = await store.getConnection(req.connectionId);
      const decision = evaluateExplicitRebind({
        connection: existing,
        newAccountLabel: req.newAccountLabel,
        approvedBy: req.approvedBy,
      });
      if (!decision.ok) {
        if (
          decision.code === "SAME_ACCOUNT" ||
          decision.code === "APPROVAL_REQUIRED"
        ) {
          await store.appendAudit(
            createAuditEntry({
              entryId: `aud-${randomUUID()}`,
              kind: CredentialAuditKind.REBIND_REQUIRED,
              connectionId: existing?.connectionId ?? null,
              referenceId: existing?.referenceId ?? null,
              summary: decision.reason,
              nowIso,
              details: { code: decision.code },
            }),
          );
        }
        return {
          ok: false,
          code: decision.code,
          reason: decision.reason,
        };
      }
      if (!existing) {
        return {
          ok: false,
          code: "CONNECTION_MISSING",
          reason: "Unknown credential connection",
        };
      }

      let newConnectionId = req.newConnectionId?.trim() || `conn-${randomUUID()}`;
      if (newConnectionId === existing.connectionId) {
        return {
          ok: false,
          code: "CONNECTION_ID_COLLISION",
          reason:
            "Successor connectionId must differ from the connection being rebound",
        };
      }
      const colliding = await store.getConnection(newConnectionId);
      if (colliding) {
        return {
          ok: false,
          code: "CONNECTION_ID_COLLISION",
          reason: `Successor connectionId '${newConnectionId}' already exists`,
        };
      }

      const newRef = broker.putReference(
        existing.providerId,
        existing.scopes,
        req.secretMaterial,
        nowIso,
      );
      broker.revokeReference(existing.referenceId, nowIso);

      const oldRotatedAway = markConnectionRotatedAway(
        existing,
        nowIso,
        req.approvedBy,
        newRef.referenceId,
      );
      await store.upsertConnection(oldRotatedAway);

      const queued = await store.listQueuedWork(existing.connectionId);
      const cancelResults = cancelEligibleQueuedWork(queued);
      await store.upsertQueuedWork(
        applyQueuedCancelResults(queued, cancelResults),
      );

      for (const result of cancelResults) {
        await store.appendAudit(
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

      const newConnection = seedFixtureConnection({
        connectionId: newConnectionId,
        providerId: existing.providerId,
        referenceId: newRef.referenceId,
        accountLabel: decision.newAccountLabel,
        scopes: existing.scopes,
        nowIso,
      });
      await store.upsertConnection({
        ...newConnection,
        approvedBy: req.approvedBy,
      });
      const rebind = buildRebindRecord({
        rebindId: `reb-${randomUUID()}`,
        oldConnectionId: existing.connectionId,
        newConnectionId: newConnection.connectionId,
        oldAccountLabel: decision.oldAccountLabel,
        newAccountLabel: decision.newAccountLabel,
        oldReferenceId: existing.referenceId,
        newReferenceId: newRef.referenceId,
        approvedBy: req.approvedBy,
        nowIso,
      });
      await store.addRebind(rebind);
      await store.appendAudit(
        createAuditEntry({
          entryId: `aud-${randomUUID()}`,
          kind: CredentialAuditKind.REBOUND,
          connectionId: newConnection.connectionId,
          referenceId: newRef.referenceId,
          summary: rebind.summary,
          nowIso,
          details: {
            rebindId: rebind.rebindId,
            oldConnectionId: existing.connectionId,
            newConnectionId: newConnection.connectionId,
            oldAccountLabel: decision.oldAccountLabel,
            newAccountLabel: decision.newAccountLabel,
            catalogCaseId: "T-X029",
            liveProviderRevoke: "NOT_WIRED",
            externalEffects: "NONE",
          },
        }),
      );

      return {
        ok: true,
        oldConnection: oldRotatedAway,
        newConnection: { ...newConnection, approvedBy: req.approvedBy },
        rebind,
        cancelResults,
        liveProviderRevoke: "NOT_WIRED",
        externalEffects: "NONE",
        catalogCaseId: "T-X029",
      };
    },

    async offboard(req) {
      const nowIso = req.nowIso ?? new Date().toISOString();
      const existing = await store.getConnection(req.connectionId);
      if (!existing) {
        return {
          ok: false,
          code: "CONNECTION_MISSING",
          reason: "Unknown credential connection",
        };
      }

      let connection = existing;
      if (existing.status === CredentialConnectionStatus.ACTIVE) {
        const revoked = await service.revoke({
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

      const queued = await store.listQueuedWork(connection.connectionId);
      const cancelResults = cancelEligibleQueuedWork(queued);
      // Queue already updated by revoke when we revoked above; ensure cancel applied.
      await store.upsertQueuedWork(
        applyQueuedCancelResults(queued, cancelResults),
      );

      const manifest = buildOffboardingManifest({
        manifestId: `ob-${randomUUID()}`,
        connectionId: connection.connectionId,
        cancelResults,
        hasActiveTokenResidual: true,
        nowIso,
      });
      await store.addManifest(manifest);
      await store.appendAudit(
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

    async liveProviderRevoke(req) {
      const connection = await store.getConnection(req.connectionId);
      const result = attemptLiveProviderRevoke({
        connectionId: req.connectionId,
        referenceId: connection?.referenceId ?? "unknown",
      });
      await store.appendAudit(
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

  return service;
}
