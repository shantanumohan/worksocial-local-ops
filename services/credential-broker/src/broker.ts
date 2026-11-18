/**
 * Credential broker — vault reference isolation (R1-02).
 * Gateway/adapters may mint narrow scoped handles.
 * Reasoning / learning workers (claude-runner, evaluation, learning-worker)
 * never receive blanket secrets or production effect credentials.
 */

import { createHash, randomBytes } from "node:crypto";

export type BrokerPrincipal =
  | "action-gateway"
  | "provider-adapter"
  | "claude-runner"
  | "evaluation-worker"
  | "learning-worker"
  | "api"
  | "console";

export type CredentialReference = {
  referenceId: string;
  providerId: string;
  /** Never the raw secret — opaque vault pointer only. */
  vaultPointer: string;
  scopes: string[];
  createdAtIso: string;
};

export type ScopedCredentialHandle = {
  handleId: string;
  referenceId: string;
  principal: BrokerPrincipal;
  scopes: string[];
  expiresAtIso: string;
  /** Masked display only — no raw secret material. */
  maskedLabel: string;
};

export type BrokerMintRequest = {
  principal: BrokerPrincipal;
  referenceId: string;
  requestedScopes: string[];
  nowIso: string;
  ttlMs?: number;
};

export type BrokerMintResult =
  | { ok: true; handle: ScopedCredentialHandle }
  | {
      ok: false;
      code: "PRINCIPAL_DENIED" | "REFERENCE_MISSING" | "SCOPE_DENIED";
      reason: string;
    };

const REASONING_PRINCIPALS: ReadonlySet<BrokerPrincipal> = new Set([
  "claude-runner",
  "evaluation-worker",
  "learning-worker",
]);

const EFFECT_PRINCIPALS: ReadonlySet<BrokerPrincipal> = new Set([
  "action-gateway",
  "provider-adapter",
]);

export type CredentialBroker = {
  putReference(
    providerId: string,
    scopes: string[],
    secretMaterial: string,
    nowIso: string,
  ): CredentialReference;
  mintScopedHandle(request: BrokerMintRequest): BrokerMintResult;
  /** Raw secret material is never returned to callers outside the vault map. */
  revealForPrincipal(
    handleId: string,
    principal: BrokerPrincipal,
  ): { ok: true; secret: string } | { ok: false; code: string; reason: string };
  listReferences(): CredentialReference[];
};

export function createCredentialBroker(): CredentialBroker {
  const references = new Map<string, CredentialReference>();
  const secrets = new Map<string, string>();
  const handles = new Map<string, ScopedCredentialHandle>();

  const putReference = (
    providerId: string,
    scopes: string[],
    secretMaterial: string,
    nowIso: string,
  ): CredentialReference => {
    const referenceId = `cred-${randomBytes(6).toString("hex")}`;
    const vaultPointer = createHash("sha256")
      .update(secretMaterial)
      .digest("hex")
      .slice(0, 16);
    const ref: CredentialReference = {
      referenceId,
      providerId,
      vaultPointer: `vault://${vaultPointer}`,
      scopes: [...scopes],
      createdAtIso: nowIso,
    };
    references.set(referenceId, ref);
    secrets.set(referenceId, secretMaterial);
    return ref;
  };

  const mintScopedHandle = (request: BrokerMintRequest): BrokerMintResult => {
    if (REASONING_PRINCIPALS.has(request.principal)) {
      return {
        ok: false,
        code: "PRINCIPAL_DENIED",
        reason:
          "Reasoning workers cannot mint or receive operational credential handles",
      };
    }
    if (!EFFECT_PRINCIPALS.has(request.principal) && request.principal !== "api") {
      return {
        ok: false,
        code: "PRINCIPAL_DENIED",
        reason: `Principal '${request.principal}' is not permitted to mint credentials`,
      };
    }

    const ref = references.get(request.referenceId);
    if (!ref) {
      return {
        ok: false,
        code: "REFERENCE_MISSING",
        reason: "Unknown credential reference",
      };
    }

    for (const scope of request.requestedScopes) {
      if (!ref.scopes.includes(scope) && !ref.scopes.includes("*")) {
        return {
          ok: false,
          code: "SCOPE_DENIED",
          reason: `Scope '${scope}' is not present on the credential reference`,
        };
      }
    }

    const ttlMs = request.ttlMs ?? 60_000;
    const handle: ScopedCredentialHandle = {
      handleId: `hdl-${randomBytes(6).toString("hex")}`,
      referenceId: ref.referenceId,
      principal: request.principal,
      scopes: [...request.requestedScopes],
      expiresAtIso: new Date(Date.parse(request.nowIso) + ttlMs).toISOString(),
      maskedLabel: `${ref.providerId}::${ref.vaultPointer}`,
    };
    handles.set(handle.handleId, handle);
    return { ok: true, handle };
  };

  const revealForPrincipal = (
    handleId: string,
    principal: BrokerPrincipal,
  ): { ok: true; secret: string } | { ok: false; code: string; reason: string } => {
    if (REASONING_PRINCIPALS.has(principal)) {
      return {
        ok: false,
        code: "PRINCIPAL_DENIED",
        reason:
          "Claude runner / evaluation / learning-worker never receive raw secrets",
      };
    }
    const handle = handles.get(handleId);
    if (!handle) {
      return { ok: false, code: "HANDLE_MISSING", reason: "Unknown handle" };
    }
    if (handle.principal !== principal) {
      return {
        ok: false,
        code: "PRINCIPAL_MISMATCH",
        reason: "Handle was minted for a different principal",
      };
    }
    if (!EFFECT_PRINCIPALS.has(principal)) {
      return {
        ok: false,
        code: "PRINCIPAL_DENIED",
        reason: "Only gateway/adapter principals may reveal secrets",
      };
    }
    const secret = secrets.get(handle.referenceId);
    if (!secret) {
      return { ok: false, code: "SECRET_MISSING", reason: "Vault entry missing" };
    }
    return { ok: true, secret };
  };

  return {
    putReference,
    mintScopedHandle,
    revealForPrincipal,
    listReferences: () => [...references.values()],
  };
}
