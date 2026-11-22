/**
 * Browser auth-state isolation (T-X065).
 *
 * Workers must not read OS / system-browser authentication state
 * (cookies, profile storage, OAuth callback cookies). The host policy
 * refuses those reads with OS_DENY. Workspace browser partitions remain
 * separate from system Chrome and are only readable by the browser-pool
 * principal after explicit user consent — never by reasoning/workflow
 * workers. Pure domain; no Node/OS I/O. External effects: NONE.
 */

export const BrowserAuthStateKind = {
  SYSTEM_CHROME_COOKIES: "system_chrome_cookies",
  OS_BROWSER_PROFILE: "os_browser_profile",
  OAUTH_CALLBACK_COOKIES: "oauth_callback_cookies",
  WORKSPACE_BROWSER_PARTITION: "workspace_browser_partition",
} as const;

export type BrowserAuthStateKindValue =
  (typeof BrowserAuthStateKind)[keyof typeof BrowserAuthStateKind];

export const BrowserAuthPrincipal = {
  CLAUDE_RUNNER: "claude-runner",
  EVALUATION_WORKER: "evaluation-worker",
  LEARNING_WORKER: "learning-worker",
  WORKFLOW_WORKER: "workflow-worker",
  BROWSER_POOL: "browser-pool",
  HOST_ADMIN: "host-admin",
} as const;

export type BrowserAuthPrincipalValue =
  (typeof BrowserAuthPrincipal)[keyof typeof BrowserAuthPrincipal];

export const BrowserAuthAccessCode = {
  OS_DENY: "OS_DENY",
  ALLOWED: "ALLOWED",
  CONSENT_REQUIRED: "CONSENT_REQUIRED",
} as const;

export type BrowserAuthAccessCodeValue =
  (typeof BrowserAuthAccessCode)[keyof typeof BrowserAuthAccessCode];

/** Reasoning / workflow workers — always OS-denied for browser auth state. */
export const WORKER_BROWSER_AUTH_PRINCIPALS: ReadonlySet<BrowserAuthPrincipalValue> =
  new Set([
    BrowserAuthPrincipal.CLAUDE_RUNNER,
    BrowserAuthPrincipal.EVALUATION_WORKER,
    BrowserAuthPrincipal.LEARNING_WORKER,
    BrowserAuthPrincipal.WORKFLOW_WORKER,
  ]);

/** System / OS browser auth material — never reusable by workers. */
export const SYSTEM_BROWSER_AUTH_STATE_KINDS: ReadonlySet<BrowserAuthStateKindValue> =
  new Set([
    BrowserAuthStateKind.SYSTEM_CHROME_COOKIES,
    BrowserAuthStateKind.OS_BROWSER_PROFILE,
    BrowserAuthStateKind.OAUTH_CALLBACK_COOKIES,
  ]);

export type BrowserAuthStateAccessRequest = {
  principal: BrowserAuthPrincipalValue;
  stateKind: BrowserAuthStateKindValue;
  /** Explicit interactive consent for workspace-partition mount only. */
  explicitUserConsent?: boolean;
};

export type BrowserAuthStateAccessDecision = {
  allowed: boolean;
  code: BrowserAuthAccessCodeValue;
  reason: string;
  /** Never returns cookie/token material — access decision only. */
  authMaterialReturned: false;
  externalEffects: "NONE";
};

/**
 * Evaluate whether a principal may read browser authentication state.
 * Workers always receive OS_DENY. System Chrome / OS profile / OAuth
 * callback cookies stay denied even for browser-pool (no silent reuse).
 */
export function evaluateBrowserAuthStateAccess(
  request: BrowserAuthStateAccessRequest,
): BrowserAuthStateAccessDecision {
  if (WORKER_BROWSER_AUTH_PRINCIPALS.has(request.principal)) {
    return {
      allowed: false,
      code: BrowserAuthAccessCode.OS_DENY,
      reason: `Principal '${request.principal}' is OS-denied from reading browser auth state (${request.stateKind})`,
      authMaterialReturned: false,
      externalEffects: "NONE",
    };
  }

  if (SYSTEM_BROWSER_AUTH_STATE_KINDS.has(request.stateKind)) {
    return {
      allowed: false,
      code: BrowserAuthAccessCode.OS_DENY,
      reason: `System/OS browser auth state '${request.stateKind}' is OS-denied (no silent Chrome/profile reuse)`,
      authMaterialReturned: false,
      externalEffects: "NONE",
    };
  }

  // Workspace partition — browser-pool only, with explicit consent.
  if (
    request.stateKind === BrowserAuthStateKind.WORKSPACE_BROWSER_PARTITION &&
    request.principal === BrowserAuthPrincipal.BROWSER_POOL
  ) {
    if (!request.explicitUserConsent) {
      return {
        allowed: false,
        code: BrowserAuthAccessCode.CONSENT_REQUIRED,
        reason:
          "Workspace browser partition requires explicit user consent before mount",
        authMaterialReturned: false,
        externalEffects: "NONE",
      };
    }
    return {
      allowed: true,
      code: BrowserAuthAccessCode.ALLOWED,
      reason:
        "Browser-pool may mount workspace partition after explicit user consent (not system Chrome)",
      authMaterialReturned: false,
      externalEffects: "NONE",
    };
  }

  if (request.principal === BrowserAuthPrincipal.HOST_ADMIN) {
    // Host admin still cannot silently reuse system Chrome cookies.
    if (SYSTEM_BROWSER_AUTH_STATE_KINDS.has(request.stateKind)) {
      return {
        allowed: false,
        code: BrowserAuthAccessCode.OS_DENY,
        reason: "Host admin cannot silently reuse system/OS browser auth state",
        authMaterialReturned: false,
        externalEffects: "NONE",
      };
    }
  }

  return {
    allowed: false,
    code: BrowserAuthAccessCode.OS_DENY,
    reason: `Browser auth state access denied for principal '${request.principal}' / kind '${request.stateKind}'`,
    authMaterialReturned: false,
    externalEffects: "NONE",
  };
}

/** True when the decision is the catalog OS deny for a worker read attempt. */
export function isWorkerBrowserAuthOsDeny(
  decision: BrowserAuthStateAccessDecision,
): boolean {
  return (
    decision.allowed === false &&
    decision.code === BrowserAuthAccessCode.OS_DENY &&
    decision.authMaterialReturned === false
  );
}
