/**
 * Credential broker — vault reference isolation (R1-02).
 * Gateway/adapters may mint narrow scoped handles.
 * Reasoning / learning workers (claude-runner, evaluation, learning-worker)
 * never receive blanket secrets or production effect credentials.
 *
 * T-X065: browser auth-state reads go through requestBrowserAuthState —
 * workers are OS-denied; raw cookie material never leaves the fixture vault.
 *
 * WP10: local revoke marks references revoked and denies mint/reveal.
 * Live provider revoke stays NOT_WIRED — never invents remote token revocation.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  createBrowserAuthFixtureVault,
  requestBrowserAuthState,
  type BrowserAuthBoundaryRequest,
  type BrowserAuthBoundaryResult,
  type BrowserAuthFixtureVault,
} from "./browser-auth-boundary.js";

export type BrokerPrincipal =
  | "action-gateway"
  | "provider-adapter"
  | "claude-runner"
  | "evaluation-worker"
  | "learning-worker"
  | "api"
  | "console";

export type CredentialReferenceStatus = "ACTIVE" | "REVOKED";

export type CredentialReference = {
  referenceId: string;
  providerId: string;
  /** Never the raw secret — opaque vault pointer only. */
  vaultPointer: string;
  scopes: string[];
  status: CredentialReferenceStatus;
  createdAtIso: string;
  revokedAtIso: string | null;
  /** Successor after local rotation (fixture). */
  rotatedToReferenceId: string | null;
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
      code:
        | "PRINCIPAL_DENIED"
        | "REFERENCE_MISSING"
        | "REFERENCE_REVOKED"
        | "SCOPE_DENIED";
      reason: string;
    };

export type BrokerRevokeResult =
  | { ok: true; reference: CredentialReference }
  | { ok: false; code: "REFERENCE_MISSING" | "ALREADY_REVOKED"; reason: string };

export type BrokerRotateResult =
  | {
      ok: true;
      oldReference: CredentialReference;
      newReference: CredentialReference;
      liveProviderRevoke: "NOT_WIRED";
    }
  | {
      ok: false;
      code: "REFERENCE_MISSING" | "REFERENCE_REVOKED";
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
    nowIso: string,
  ): { ok: true; secret: string } | { ok: false; code: string; reason: string };
  /** Local revoke — does not call the live provider. */
  revokeReference(
    referenceId: string,
    nowIso: string,
  ): BrokerRevokeResult;
  /**
   * Local rotation: new reference, mark old revoked.
   * Live provider revoke of the old credential stays NOT_WIRED.
   */
  rotateReference(input: {
    oldReferenceId: string;
    secretMaterial: string;
    nowIso: string;
    scopes?: string[];
  }): BrokerRotateResult;
  getReference(referenceId: string): CredentialReference | null;
  listReferences(): CredentialReference[];
  /**
   * Worker/browser-pool attempt to read OS or workspace browser auth state.
   * Enforces domain OS deny; never returns raw cookie bytes (T-X065).
   */
  requestBrowserAuthState(
    request: BrowserAuthBoundaryRequest,
  ): BrowserAuthBoundaryResult;
  /** Honest live provider revoke — always NOT_WIRED. */
  attemptLiveProviderRevoke(referenceId: string): {
    ok: false;
    code: "LIVE_PROVIDER_REVOKE_NOT_WIRED";
    liveProviderRevoke: "NOT_WIRED";
    externalEffects: "NONE";
    reason: string;
  };
};

export function createCredentialBroker(): CredentialBroker {
  const references = new Map<string, CredentialReference>();
  const secrets = new Map<string, string>();
  const handles = new Map<string, ScopedCredentialHandle>();
  const browserAuthVault: BrowserAuthFixtureVault =
    createBrowserAuthFixtureVault();

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
      status: "ACTIVE",
      createdAtIso: nowIso,
      revokedAtIso: null,
      rotatedToReferenceId: null,
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
    if (ref.status === "REVOKED") {
      return {
        ok: false,
        code: "REFERENCE_REVOKED",
        reason:
          "Credential reference is revoked — new leases denied (local honesty; live provider revoke may still be outstanding)",
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
    nowIso: string,
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
    const ref = references.get(handle.referenceId);
    if (ref?.status === "REVOKED") {
      return {
        ok: false,
        code: "REFERENCE_REVOKED",
        reason: "Credential reference was revoked — reveal denied",
      };
    }
    if (Date.parse(handle.expiresAtIso) <= Date.parse(nowIso)) {
      return {
        ok: false,
        code: "HANDLE_EXPIRED",
        reason: "Credential handle has expired",
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

  const revokeReference = (
    referenceId: string,
    nowIso: string,
  ): BrokerRevokeResult => {
    const ref = references.get(referenceId);
    if (!ref) {
      return {
        ok: false,
        code: "REFERENCE_MISSING",
        reason: "Unknown credential reference",
      };
    }
    if (ref.status === "REVOKED") {
      return {
        ok: false,
        code: "ALREADY_REVOKED",
        reason: "Credential reference is already revoked",
      };
    }
    const revoked: CredentialReference = {
      ...ref,
      status: "REVOKED",
      revokedAtIso: nowIso,
    };
    references.set(referenceId, revoked);
    // Drop secret material from vault on local revoke (audit retains reference ids only).
    secrets.delete(referenceId);
    return { ok: true, reference: revoked };
  };

  const rotateReference = (input: {
    oldReferenceId: string;
    secretMaterial: string;
    nowIso: string;
    scopes?: string[];
  }): BrokerRotateResult => {
    const old = references.get(input.oldReferenceId);
    if (!old) {
      return {
        ok: false,
        code: "REFERENCE_MISSING",
        reason: "Unknown credential reference",
      };
    }
    if (old.status === "REVOKED") {
      return {
        ok: false,
        code: "REFERENCE_REVOKED",
        reason: "Cannot rotate an already-revoked reference",
      };
    }
    const scopes = input.scopes ?? old.scopes;
    const next = putReference(
      old.providerId,
      scopes,
      input.secretMaterial,
      input.nowIso,
    );
    const revokedOld: CredentialReference = {
      ...old,
      status: "REVOKED",
      revokedAtIso: input.nowIso,
      rotatedToReferenceId: next.referenceId,
    };
    references.set(old.referenceId, revokedOld);
    secrets.delete(old.referenceId);
    return {
      ok: true,
      oldReference: revokedOld,
      newReference: next,
      liveProviderRevoke: "NOT_WIRED",
    };
  };

  return {
    putReference,
    mintScopedHandle,
    revealForPrincipal,
    revokeReference,
    rotateReference,
    getReference: (referenceId) => references.get(referenceId) ?? null,
    listReferences: () => [...references.values()],
    requestBrowserAuthState: (request) =>
      requestBrowserAuthState(browserAuthVault, request),
    attemptLiveProviderRevoke: (referenceId) => ({
      ok: false,
      code: "LIVE_PROVIDER_REVOKE_NOT_WIRED",
      liveProviderRevoke: "NOT_WIRED",
      externalEffects: "NONE",
      reason: `Live provider revoke for ${referenceId} is NOT_WIRED — local revoke may already mark the connection revoked`,
    }),
  };
}
