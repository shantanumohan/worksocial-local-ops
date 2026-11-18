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
    );
    expect(runnerReveal.ok).toBe(false);

    const gatewayReveal = broker.revealForPrincipal(
      gatewayMint.handle.handleId,
      "action-gateway",
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
    );
    expect(reveal.ok).toBe(false);
  });
});
