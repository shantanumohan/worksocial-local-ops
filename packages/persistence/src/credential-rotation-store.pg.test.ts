/**
 * Postgres credential-rotation store: audit/revoke persistence + honesty seals.
 * Requires DATABASE_URL or WORKSOCIAL_DATABASE_URL.
 */

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  CredentialAuditKind,
  CredentialConnectionStatus,
  EffectState,
} from "@worksocial/domain";
import { createPgCredentialRotationStore } from "./credential-rotation-store.js";
import type { PgPool } from "./pg/client.js";
import { createMigratedTestPool, pgConfigured } from "./pg-test-harness.js";

const describePg = pgConfigured() ? describe : describe.skip;

async function truncateCredentialTables(pool: PgPool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      credential_queued_work,
      credential_audit_entries,
      credential_rotations,
      credential_offboarding_manifests,
      credential_connections
    RESTART IDENTITY CASCADE
  `);
  await pool.query(`
    UPDATE credential_rotation_state
    SET updated_at = now()
    WHERE singleton_id = 'default'
  `);
}

describePg("credential-rotation store (postgres)", () => {
  let pool: PgPool;
  const now = "2026-11-21T23:00:00.000Z";

  beforeAll(async () => {
    pool = await createMigratedTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateCredentialTables(pool);
  });

  it("persists connection + revoke audit across store instances", async () => {
    const suffix = randomBytes(3).toString("hex");
    const connectionId = `conn-${suffix}`;
    const first = createPgCredentialRotationStore(pool);

    await first.upsertConnection({
      connectionId,
      providerId: "cms",
      referenceId: `ref-${suffix}`,
      accountLabel: "fixture-account",
      status: CredentialConnectionStatus.ACTIVE,
      connectionState: "READ_READY",
      writeReadiness: "WRITE_READY",
      verificationState: "VERIFIED",
      scopes: ["publish"],
      createdAtIso: now,
      revokedAtIso: null,
      rotatedToReferenceId: null,
      approvedBy: null,
    });
    await first.upsertQueuedWork([
      {
        workId: `qw-${suffix}`,
        connectionId,
        capabilityId: "cms_publish",
        operationId: null,
        effectState: EffectState.QUEUED,
        queuedAtIso: now,
        summary: "fixture queued",
      },
    ]);
    await first.appendAudit({
      entryId: `aud-${suffix}`,
      kind: CredentialAuditKind.REVOKED,
      connectionId,
      referenceId: `ref-${suffix}`,
      summary: "local revoke",
      redacted: true,
      recordedAtIso: now,
      details: { approvedBy: "admin" },
    });

    const second = createPgCredentialRotationStore(pool);
    const state = await second.read();
    expect(state.connections.map((c) => c.connectionId)).toContain(connectionId);
    expect(state.queuedWork).toHaveLength(1);
    expect(state.audit.some((a) => a.kind === "REVOKED")).toBe(true);
    expect(state.liveWiring.liveProviderRevocation).toBe("NOT_WIRED");
    expect(state.externalEffects).toBe("NONE");
    expect(state.catalogClaim).toBe("NOT_RUN");

    const status = await second.status();
    expect(status.backend).toBe("postgres");
    expect(status.honestNote).toMatch(/NOT_WIRED|NOT_RUN/);
    expect(JSON.stringify(state.audit)).not.toMatch(/secret/i);
  });

  it("forces liveProviderRevoke NOT_WIRED even if row claimed otherwise", async () => {
    const suffix = randomBytes(2).toString("hex");
    const store = createPgCredentialRotationStore(pool);
    await store.upsertConnection({
      connectionId: `conn-${suffix}`,
      providerId: "cms",
      referenceId: `ref-${suffix}`,
      accountLabel: "fixture",
      status: "ACTIVE",
      connectionState: "READ_READY",
      writeReadiness: "WRITE_READY",
      verificationState: "VERIFIED",
      scopes: [],
      createdAtIso: now,
      revokedAtIso: null,
      rotatedToReferenceId: null,
      approvedBy: null,
    });
    await pool.query(
      `INSERT INTO credential_rotations (
         rotation_id, connection_id, old_reference_id, new_reference_id,
         approved_by, local_switch_complete, live_provider_revoke,
         secrets_exported, created_at_iso, summary
       ) VALUES (
         $1, $2, 'old', 'new', 'admin', true, 'CLAIMED_COMPLETE',
         true, $3::timestamptz, 'tampered'
       )`,
      [`rot-${suffix}`, `conn-${suffix}`, now],
    );

    const rotations = await store.listRotations();
    expect(rotations[0]?.liveProviderRevoke).toBe("NOT_WIRED");
    expect(rotations[0]?.secretsExported).toBe(false);
    expect((await store.read()).liveWiring.liveProviderRevocation).toBe(
      "NOT_WIRED",
    );
  });
});
