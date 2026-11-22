/**
 * Browser auth-state boundary (T-X065).
 *
 * Workers request browser auth state through this broker boundary — not by
 * reading OS/Chrome profiles directly. The domain OS-deny gate is enforced
 * here before any fixture vault material can leave. Raw cookie/token bytes
 * are never returned to workers. External effects: NONE.
 */

import {
  BrowserAuthAccessCode,
  BrowserAuthPrincipal,
  BrowserAuthStateKind,
  evaluateBrowserAuthStateAccess,
  type BrowserAuthAccessCodeValue,
  type BrowserAuthPrincipalValue,
  type BrowserAuthStateKindValue,
} from "@worksocial/domain";

/** Principals that may attempt a browser-auth read via this boundary. */
export type BrowserAuthBoundaryPrincipal =
  | "claude-runner"
  | "evaluation-worker"
  | "learning-worker"
  | "workflow-worker"
  | "browser-pool"
  | "host-admin";

export type BrowserAuthBoundaryRequest = {
  principal: BrowserAuthBoundaryPrincipal;
  stateKind: BrowserAuthStateKindValue;
  explicitUserConsent?: boolean;
};

export type BrowserAuthBoundaryResult = {
  allowed: boolean;
  code: BrowserAuthAccessCodeValue;
  reason: string;
  /** Fixture vault still holds the material — deny ≠ wipe. */
  materialPresentInVault: boolean;
  /** Always null for workers / OS_DENY; never returns cookie bytes. */
  authMaterial: null;
  sealedRef: string | null;
  externalEffects: "NONE";
};

const PRINCIPAL_MAP: Record<
  BrowserAuthBoundaryPrincipal,
  BrowserAuthPrincipalValue
> = {
  "claude-runner": BrowserAuthPrincipal.CLAUDE_RUNNER,
  "evaluation-worker": BrowserAuthPrincipal.EVALUATION_WORKER,
  "learning-worker": BrowserAuthPrincipal.LEARNING_WORKER,
  "workflow-worker": BrowserAuthPrincipal.WORKFLOW_WORKER,
  "browser-pool": BrowserAuthPrincipal.BROWSER_POOL,
  "host-admin": BrowserAuthPrincipal.HOST_ADMIN,
};

/**
 * Fixture OS / workspace browser auth vault. Material exists so a deny
 * proves isolation (not absence). Values never leave on OS_DENY.
 */
export type BrowserAuthFixtureVault = {
  readonly materialByKind: ReadonlyMap<BrowserAuthStateKindValue, string>;
};

export function createBrowserAuthFixtureVault(): BrowserAuthFixtureVault {
  const materialByKind = new Map<BrowserAuthStateKindValue, string>([
    [
      BrowserAuthStateKind.SYSTEM_CHROME_COOKIES,
      "fixture-system-chrome-cookie-jar-NEVER-RETURN-TO-WORKER",
    ],
    [
      BrowserAuthStateKind.OS_BROWSER_PROFILE,
      "fixture-os-browser-profile-NEVER-RETURN-TO-WORKER",
    ],
    [
      BrowserAuthStateKind.OAUTH_CALLBACK_COOKIES,
      "fixture-oauth-callback-cookie-NEVER-RETURN-TO-WORKER",
    ],
    [
      BrowserAuthStateKind.WORKSPACE_BROWSER_PARTITION,
      "fixture-workspace-partition-sealed-only",
    ],
  ]);
  return { materialByKind };
}

/**
 * Attempt to read browser auth state through the broker boundary.
 * Enforces domain OS deny before any vault access. Never returns raw
 * cookie/token material — even on ALLOWED (sealed ref only).
 */
export function requestBrowserAuthState(
  vault: BrowserAuthFixtureVault,
  request: BrowserAuthBoundaryRequest,
): BrowserAuthBoundaryResult {
  const decision = evaluateBrowserAuthStateAccess({
    principal: PRINCIPAL_MAP[request.principal],
    stateKind: request.stateKind,
    ...(request.explicitUserConsent !== undefined
      ? { explicitUserConsent: request.explicitUserConsent }
      : {}),
  });

  const materialPresentInVault = vault.materialByKind.has(request.stateKind);

  if (!decision.allowed) {
    return {
      allowed: false,
      code: decision.code,
      reason: decision.reason,
      materialPresentInVault,
      authMaterial: null,
      sealedRef: null,
      externalEffects: "NONE",
    };
  }

  // ALLOWED path: sealed ref only — never raw vault bytes (fixture honesty).
  const sealedRef = `sealed://browser-auth/${request.stateKind}`;
  return {
    allowed: true,
    code: BrowserAuthAccessCode.ALLOWED,
    reason: decision.reason,
    materialPresentInVault,
    authMaterial: null,
    sealedRef,
    externalEffects: "NONE",
  };
}
