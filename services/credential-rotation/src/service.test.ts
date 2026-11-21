import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EffectState } from "@worksocial/domain";
import { createCredentialBroker } from "@worksocial/credential-broker";
import { createFileCredentialRotationStore } from "@worksocial/persistence";
import { createCredentialRotationService } from "./service.js";

describe("credential-rotation service", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-cred-rot-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function service() {
    return createCredentialRotationService({
      store: createFileCredentialRotationStore(dir),
      broker: createCredentialBroker(),
    });
  }

  it("revoke → cancel eligible queued → audit retained; live revoke NOT_WIRED", async () => {
    const svc = service();
    const seeded = await svc.seedFixture({
      nowIso: "2026-11-21T22:00:00.000Z",
      withQueuedWork: true,
    });

    const leaseBefore = await svc.requestLease({
      connectionId: seeded.connection.connectionId,
      requestedScopes: ["publish"],
      nowIso: "2026-11-21T22:00:30.000Z",
    });
    expect(leaseBefore.ok).toBe(true);

    const revoked = await svc.revoke({
      connectionId: seeded.connection.connectionId,
      approvedBy: "admin",
      nowIso: "2026-11-21T22:01:00.000Z",
    });
    expect(revoked.ok).toBe(true);
    if (!revoked.ok) throw new Error("expected revoke");

    expect(revoked.connection.status).toBe("REVOKED");
    expect(revoked.auditRetained).toBe(true);
    expect(revoked.externalEffects).toBe("NONE");
    expect(revoked.liveProviderRevoke.code).toBe(
      "LIVE_PROVIDER_REVOKE_NOT_WIRED",
    );

    const cancelled = revoked.cancelResults.filter((r) => r.cancelled);
    const retained = revoked.cancelResults.filter((r) => r.retainedForReconcile);
    expect(cancelled.length).toBeGreaterThanOrEqual(2);
    expect(retained.length).toBeGreaterThanOrEqual(1);

    const leaseAfter = await svc.requestLease({
      connectionId: seeded.connection.connectionId,
      requestedScopes: ["publish"],
      nowIso: "2026-11-21T22:02:00.000Z",
    });
    expect(leaseAfter).toMatchObject({ ok: false, code: "CONNECTION_REVOKED" });

    const effect = await svc.requestEffect({
      connectionId: seeded.connection.connectionId,
    });
    expect(effect).toMatchObject({ ok: false, code: "CONNECTION_REVOKED" });

    const queue = await svc.listQueuedWork(seeded.connection.connectionId);
    expect(
      queue.some((w) => w.effectState === EffectState.CANCELLED),
    ).toBe(true);
    expect(
      queue.some(
        (w) => w.effectState === EffectState.UNKNOWN_REMOTE_OUTCOME,
      ),
    ).toBe(true);

    const audit = await svc.listAudit();
    expect(audit.some((a) => a.kind === "REVOKED")).toBe(true);
    expect(audit.some((a) => a.kind === "QUEUED_CANCELLED")).toBe(true);
    expect(audit.some((a) => a.kind === "LIVE_PROVIDER_REVOKE_NOT_WIRED")).toBe(
      true,
    );
    expect(audit.every((a) => a.redacted)).toBe(true);
    expect(JSON.stringify(audit)).not.toMatch(/fixture-secret/);

    const status = await svc.status();
    expect(status.liveWiring.liveProviderRevocation).toBe("NOT_WIRED");
    expect(status.catalogClaim).toBe("NOT_RUN");
    expect(status.externalEffects).toBe("NONE");
    expect(status.relatedCaseIds).toContain("T-F24");
  });

  it("rotate switches reference locally without live provider revoke", async () => {
    const svc = service();
    const seeded = await svc.seedFixture({
      nowIso: "2026-11-21T22:00:00.000Z",
      withQueuedWork: false,
    });
    const rotated = await svc.rotate({
      connectionId: seeded.connection.connectionId,
      approvedBy: "admin",
      secretMaterial: "rotated-secret-material",
      observedAccountLabel: seeded.connection.accountLabel,
      nowIso: "2026-11-21T22:10:00.000Z",
    });
    expect(rotated.ok).toBe(true);
    if (!rotated.ok) throw new Error("expected rotate");
    expect(rotated.liveProviderRevoke).toBe("NOT_WIRED");
    expect(rotated.rotation.secretsExported).toBe(false);
    expect(rotated.connection.referenceId).not.toBe(seeded.referenceId);
    expect(JSON.stringify(rotated.rotation)).not.toContain(
      "rotated-secret-material",
    );
  });

  it("T-X029: blank observedAccountLabel cannot silent-rotate", async () => {
    const svc = service();
    const seeded = await svc.seedFixture({
      accountLabel: "fixture-account-alpha",
      nowIso: "2026-11-21T22:00:00.000Z",
    });
    const blank = await svc.rotate({
      connectionId: seeded.connection.connectionId,
      approvedBy: "admin",
      secretMaterial: "blank-secret",
      observedAccountLabel: "",
      nowIso: "2026-11-21T22:05:00.000Z",
    });
    expect(blank).toMatchObject({
      ok: false,
      code: "ACCOUNT_IDENTITY_REQUIRED",
    });
  });

  it("T-X029: explicit rebind + successor ID collision rejected", async () => {
    const svc = service();
    const seeded = await svc.seedFixture({
      accountLabel: "fixture-account-alpha",
      nowIso: "2026-11-21T22:00:00.000Z",
      withQueuedWork: true,
    });

    const silent = await svc.rotate({
      connectionId: seeded.connection.connectionId,
      approvedBy: "admin",
      secretMaterial: "nope",
      observedAccountLabel: "fixture-account-beta",
      nowIso: "2026-11-21T22:01:00.000Z",
    });
    expect(silent).toMatchObject({ ok: false, code: "REBIND_REQUIRED" });

    const rebound = await svc.rebind({
      connectionId: seeded.connection.connectionId,
      newAccountLabel: "fixture-account-beta",
      approvedBy: "admin",
      secretMaterial: "rebind-secret",
      nowIso: "2026-11-21T22:02:00.000Z",
      newConnectionId: "conn-successor-1",
    });
    expect(rebound.ok).toBe(true);
    if (!rebound.ok) throw new Error("expected rebind");
    expect(rebound.catalogCaseId).toBe("T-X029");
    expect(rebound.oldConnection.status).toBe("ROTATED_AWAY");
    expect(rebound.newConnection.connectionId).toBe("conn-successor-1");
    expect(rebound.externalEffects).toBe("NONE");

    const sameId = await svc.rebind({
      connectionId: rebound.newConnection.connectionId,
      newAccountLabel: "fixture-account-gamma",
      approvedBy: "admin",
      secretMaterial: "collision-secret",
      nowIso: "2026-11-21T22:03:00.000Z",
      newConnectionId: rebound.newConnection.connectionId,
    });
    expect(sameId).toMatchObject({
      ok: false,
      code: "CONNECTION_ID_COLLISION",
    });

    const rebinds = await svc.listRebinds();
    expect(rebinds).toHaveLength(1);
  });

  it("offboard produces manifest with provider-revoke residual NOT_WIRED", async () => {
    const svc = service();
    const seeded = await svc.seedFixture({
      nowIso: "2026-11-21T22:00:00.000Z",
    });
    const result = await svc.offboard({
      connectionId: seeded.connection.connectionId,
      approvedBy: "admin",
      nowIso: "2026-11-21T22:20:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected offboard");
    expect(result.manifest.auditRetained).toBe(true);
    expect(result.manifest.liveProviderRevoke).toBe("NOT_WIRED");
    expect(result.catalogClaim).toBe("NOT_RUN");
    expect(
      result.manifest.residualObligations.some(
        (o) =>
          o.kind === "PROVIDER_REVOKE" && o.status === "BLOCKED_NOT_WIRED",
      ),
    ).toBe(true);

    const live = await svc.liveProviderRevoke({
      connectionId: seeded.connection.connectionId,
    });
    expect(live.code).toBe("LIVE_PROVIDER_REVOKE_NOT_WIRED");
  });
});
