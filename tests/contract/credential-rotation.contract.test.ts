/**
 * Contract: WP10 / F24 credential revoke → cancel queued → audit retained.
 * T-X029: different-account token → explicit rebind (not silent rotate).
 * Live provider revoke stays NOT_WIRED. External effects NONE.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EffectState } from "@worksocial/domain";
import { createCredentialBroker } from "@worksocial/credential-broker";
import { createFileCredentialRotationStore } from "@worksocial/persistence";
import { createCredentialRotationService } from "@worksocial/credential-rotation";

describe("contract: WP10 credential rotation / offboarding", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-cred-contract-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("revoke cancels eligible queued work, retains audit, denies leases; live NOT_WIRED", async () => {
    const service = createCredentialRotationService({
      store: createFileCredentialRotationStore(dir),
      broker: createCredentialBroker(),
    });

    const seeded = await service.seedFixture({
      nowIso: "2026-11-21T22:00:00.000Z",
      withQueuedWork: true,
    });

    const revoked = await service.revoke({
      connectionId: seeded.connection.connectionId,
      approvedBy: "admin",
      nowIso: "2026-11-21T22:01:00.000Z",
    });
    expect(revoked.ok).toBe(true);
    if (!revoked.ok) throw new Error("expected revoke");

    expect(revoked.connection.status).toBe("REVOKED");
    expect(revoked.cancelResults.some((r) => r.cancelled)).toBe(true);
    expect(revoked.cancelResults.some((r) => r.retainedForReconcile)).toBe(
      true,
    );
    expect(revoked.auditRetained).toBe(true);
    expect(revoked.externalEffects).toBe("NONE");
    expect(revoked.liveProviderRevoke.code).toBe(
      "LIVE_PROVIDER_REVOKE_NOT_WIRED",
    );

    const lease = await service.requestLease({
      connectionId: seeded.connection.connectionId,
      requestedScopes: ["publish"],
      nowIso: "2026-11-21T22:02:00.000Z",
    });
    expect(lease).toMatchObject({ ok: false, code: "CONNECTION_REVOKED" });

    const queue = await service.listQueuedWork(seeded.connection.connectionId);
    expect(queue.some((w) => w.effectState === EffectState.CANCELLED)).toBe(
      true,
    );
    expect(
      queue.some(
        (w) => w.effectState === EffectState.UNKNOWN_REMOTE_OUTCOME,
      ),
    ).toBe(true);

    const audit = await service.listAudit();
    expect(audit.length).toBeGreaterThan(0);
    expect(audit.every((a) => a.redacted === true)).toBe(true);
    expect(audit.some((a) => a.kind === "REVOKED")).toBe(true);
    expect(audit.some((a) => a.kind === "QUEUED_CANCELLED")).toBe(true);

    const status = await service.status();
    expect(status.liveWiring.localRevoke).toBe("fixture");
    expect(status.liveWiring.liveProviderRevocation).toBe("NOT_WIRED");
    expect(status.catalogClaim).toBe("NOT_RUN");
    expect(status.externalEffects).toBe("NONE");
    expect(status.relatedCaseIds).toContain("T-F24");
    expect(status.relatedCaseIds).toContain("T-X073");
  });

  it("live-revoke endpoint honesty stays NOT_WIRED with no external effects", async () => {
    const service = createCredentialRotationService({
      store: createFileCredentialRotationStore(dir),
      broker: createCredentialBroker(),
    });
    const seeded = await service.seedFixture({ withQueuedWork: false });
    const live = await service.liveProviderRevoke({
      connectionId: seeded.connection.connectionId,
    });
    expect(live.ok).toBe(false);
    expect(live.code).toBe("LIVE_PROVIDER_REVOKE_NOT_WIRED");
    expect(live.externalEffects).toBe("NONE");
  });

  it("T-X029: silent different-account rotate denied; explicit rebind succeeds", async () => {
    const service = createCredentialRotationService({
      store: createFileCredentialRotationStore(dir),
      broker: createCredentialBroker(),
    });
    const seeded = await service.seedFixture({
      accountLabel: "acct-a",
      nowIso: "2026-11-21T22:00:00.000Z",
      withQueuedWork: true,
    });

    const blank = await service.rotate({
      connectionId: seeded.connection.connectionId,
      approvedBy: "admin",
      secretMaterial: "blank",
      observedAccountLabel: "",
      nowIso: "2026-11-21T22:00:30.000Z",
    });
    expect(blank).toMatchObject({
      ok: false,
      code: "ACCOUNT_IDENTITY_REQUIRED",
    });

    const silent = await service.rotate({
      connectionId: seeded.connection.connectionId,
      approvedBy: "admin",
      secretMaterial: "nope",
      observedAccountLabel: "acct-b",
      nowIso: "2026-11-21T22:01:00.000Z",
    });
    expect(silent).toMatchObject({ ok: false, code: "REBIND_REQUIRED" });

    const rebound = await service.rebind({
      connectionId: seeded.connection.connectionId,
      newAccountLabel: "acct-b",
      approvedBy: "admin",
      secretMaterial: "rebind-ok",
      nowIso: "2026-11-21T22:02:00.000Z",
    });
    expect(rebound.ok).toBe(true);
    if (!rebound.ok) throw new Error("expected rebind");
    expect(rebound.catalogCaseId).toBe("T-X029");
    expect(rebound.oldConnection.status).toBe("ROTATED_AWAY");
    expect(rebound.newConnection.accountLabel).toBe("acct-b");
    expect(rebound.externalEffects).toBe("NONE");
    expect(rebound.liveProviderRevoke).toBe("NOT_WIRED");
    expect(rebound.rebind.secretsExported).toBe(false);
    expect(JSON.stringify(rebound)).not.toContain("rebind-ok");
  });
});
