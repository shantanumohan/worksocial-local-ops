import { describe, expect, it } from "vitest";
import { createCredentialBroker } from "./broker.js";

describe("credential-broker isolation", () => {
  it("denies Claude runner mint and reveal of operational secrets", () => {
    const broker = createCredentialBroker();
    const ref = broker.putReference(
      "cms",
      ["publish"],
      "super-secret-token",
      "2026-11-18T12:00:00.000Z",
    );

    const mint = broker.mintScopedHandle({
      principal: "claude-runner",
      referenceId: ref.referenceId,
      requestedScopes: ["publish"],
      nowIso: "2026-11-18T12:00:00.000Z",
    });
    expect(mint.ok).toBe(false);
    if (!mint.ok) {
      expect(mint.code).toBe("PRINCIPAL_DENIED");
    }

    const gatewayMint = broker.mintScopedHandle({
      principal: "action-gateway",
      referenceId: ref.referenceId,
      requestedScopes: ["publish"],
      nowIso: "2026-11-18T12:00:00.000Z",
    });
    expect(gatewayMint.ok).toBe(true);
    if (!gatewayMint.ok) {
      throw new Error("expected gateway mint");
    }

    const runnerReveal = broker.revealForPrincipal(
      gatewayMint.handle.handleId,
      "claude-runner",
      "2026-11-18T12:00:00.000Z",
    );
    expect(runnerReveal.ok).toBe(false);

    const gatewayReveal = broker.revealForPrincipal(
      gatewayMint.handle.handleId,
      "action-gateway",
      "2026-11-18T12:00:00.000Z",
    );
    expect(gatewayReveal.ok).toBe(true);
    if (gatewayReveal.ok) {
      expect(gatewayReveal.secret).toBe("super-secret-token");
    }

    // References never expose raw secrets on the public list.
    expect(JSON.stringify(broker.listReferences())).not.toContain(
      "super-secret-token",
    );
  });

  it("denies evaluation-worker credential mint", () => {
    const broker = createCredentialBroker();
    const ref = broker.putReference(
      "crm",
      ["write"],
      "crm-secret",
      "2026-11-18T12:00:00.000Z",
    );
    const mint = broker.mintScopedHandle({
      principal: "evaluation-worker",
      referenceId: ref.referenceId,
      requestedScopes: ["write"],
      nowIso: "2026-11-18T12:00:00.000Z",
    });
    expect(mint).toMatchObject({ ok: false, code: "PRINCIPAL_DENIED" });
  });

  it("denies learning-worker production effect credential mint and reveal", () => {
    const broker = createCredentialBroker();
    const ref = broker.putReference(
      "publish",
      ["publish"],
      "publish-secret",
      "2026-11-18T12:00:00.000Z",
    );
    const mint = broker.mintScopedHandle({
      principal: "learning-worker",
      referenceId: ref.referenceId,
      requestedScopes: ["publish"],
      nowIso: "2026-11-18T12:00:00.000Z",
    });
    expect(mint).toMatchObject({ ok: false, code: "PRINCIPAL_DENIED" });

    const gatewayMint = broker.mintScopedHandle({
      principal: "action-gateway",
      referenceId: ref.referenceId,
      requestedScopes: ["publish"],
      nowIso: "2026-11-18T12:00:00.000Z",
    });
    expect(gatewayMint.ok).toBe(true);
    if (!gatewayMint.ok) {
      throw new Error("expected gateway mint");
    }
    const reveal = broker.revealForPrincipal(
      gatewayMint.handle.handleId,
      "learning-worker",
      "2026-11-18T12:00:00.000Z",
    );
    expect(reveal.ok).toBe(false);
  });

  it("rejects reveal of an expired handle (F06)", () => {
    const broker = createCredentialBroker();
    const ref = broker.putReference(
      "cms",
      ["publish"],
      "expired-secret",
      "2000-01-01T00:00:00.000Z",
    );
    const mint = broker.mintScopedHandle({
      principal: "action-gateway",
      referenceId: ref.referenceId,
      requestedScopes: ["publish"],
      nowIso: "2000-01-01T00:00:00.000Z",
      ttlMs: 1,
    });
    expect(mint.ok).toBe(true);
    if (!mint.ok) {
      throw new Error("expected mint");
    }
    expect(mint.handle.expiresAtIso <= "2000-01-01T00:00:01.000Z").toBe(true);

    const reveal = broker.revealForPrincipal(
      mint.handle.handleId,
      "action-gateway",
      "2026-11-18T12:00:00.000Z",
    );
    expect(reveal).toMatchObject({ ok: false, code: "HANDLE_EXPIRED" });
  });

  it("revokes reference and denies subsequent mint/reveal (WP10)", () => {
    const broker = createCredentialBroker();
    const ref = broker.putReference(
      "cms",
      ["publish"],
      "to-revoke",
      "2026-11-21T22:00:00.000Z",
    );
    const mintBefore = broker.mintScopedHandle({
      principal: "action-gateway",
      referenceId: ref.referenceId,
      requestedScopes: ["publish"],
      nowIso: "2026-11-21T22:00:00.000Z",
    });
    expect(mintBefore.ok).toBe(true);

    const revoked = broker.revokeReference(
      ref.referenceId,
      "2026-11-21T22:01:00.000Z",
    );
    expect(revoked.ok).toBe(true);
    if (revoked.ok) {
      expect(revoked.reference.status).toBe("REVOKED");
    }

    const mintAfter = broker.mintScopedHandle({
      principal: "action-gateway",
      referenceId: ref.referenceId,
      requestedScopes: ["publish"],
      nowIso: "2026-11-21T22:02:00.000Z",
    });
    expect(mintAfter).toMatchObject({ ok: false, code: "REFERENCE_REVOKED" });

    if (mintBefore.ok) {
      const reveal = broker.revealForPrincipal(
        mintBefore.handle.handleId,
        "action-gateway",
        "2026-11-21T22:02:00.000Z",
      );
      expect(reveal).toMatchObject({ ok: false, code: "REFERENCE_REVOKED" });
    }

    const live = broker.attemptLiveProviderRevoke(ref.referenceId);
    expect(live.code).toBe("LIVE_PROVIDER_REVOKE_NOT_WIRED");
    expect(live.externalEffects).toBe("NONE");
  });

  it("rotates locally without claiming live provider revoke", () => {
    const broker = createCredentialBroker();
    const old = broker.putReference(
      "zoho",
      ["crm_write"],
      "old-secret",
      "2026-11-21T22:00:00.000Z",
    );
    const rotated = broker.rotateReference({
      oldReferenceId: old.referenceId,
      secretMaterial: "new-secret",
      nowIso: "2026-11-21T22:05:00.000Z",
    });
    expect(rotated.ok).toBe(true);
    if (!rotated.ok) throw new Error("expected rotate");
    expect(rotated.liveProviderRevoke).toBe("NOT_WIRED");
    expect(rotated.oldReference.status).toBe("REVOKED");
    expect(rotated.oldReference.rotatedToReferenceId).toBe(
      rotated.newReference.referenceId,
    );
    expect(rotated.newReference.status).toBe("ACTIVE");
    expect(JSON.stringify(broker.listReferences())).not.toContain("old-secret");
    expect(JSON.stringify(broker.listReferences())).not.toContain("new-secret");
  });
});
