/**
 * Fixture proof for T-X065 — worker reads browser auth state → OS deny.
 *
 * Exercises the credential-broker browser-auth boundary (not a pure label
 * check alone): fixture vault material exists, workers request a read, the
 * domain OS-deny gate is enforced at the broker, and raw cookie bytes never
 * leave. External effects: NONE. Live browser-auth reads: NOT_WIRED.
 * ACCEPTED ≠ VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  BROWSER_AUTH_LIVE_WIRING,
  BrowserAuthAccessCode,
  BrowserAuthPrincipal,
  BrowserAuthStateKind,
  SoakProofKind,
  SYSTEM_BROWSER_AUTH_STATE_KINDS,
  evaluateBrowserAuthStateAccess,
  isSystemBrowserAuthStateKind,
  isWorkerBrowserAuthOsDeny,
  type SoakProofRecord,
} from "@worksocial/domain";
import { createCredentialBroker } from "@worksocial/credential-broker";

/**
 * Complete expected proof set for T-X065 fixture ACCEPTED.
 * Hillclimb: host-admin deny, full system-kind pool deny, vault integrity,
 * liveBrowserAuthWiring=NOT_WIRED.
 */
export function proofWorkerBrowserAuthStateOsDenied(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const broker = createCredentialBroker();

  const workers = [
    "claude-runner",
    "evaluation-worker",
    "learning-worker",
    "workflow-worker",
  ] as const;

  const systemKinds = [
    BrowserAuthStateKind.SYSTEM_CHROME_COOKIES,
    BrowserAuthStateKind.OS_BROWSER_PROFILE,
    BrowserAuthStateKind.OAUTH_CALLBACK_COOKIES,
  ] as const;

  const workerDomainPrincipals = [
    BrowserAuthPrincipal.CLAUDE_RUNNER,
    BrowserAuthPrincipal.EVALUATION_WORKER,
    BrowserAuthPrincipal.LEARNING_WORKER,
    BrowserAuthPrincipal.WORKFLOW_WORKER,
  ] as const;

  // Snapshot vault presence before denies (isolation ≠ wipe).
  const vaultBefore = Object.fromEntries(
    systemKinds.map((k) => {
      const probe = broker.requestBrowserAuthState({
        principal: "claude-runner",
        stateKind: k,
      });
      return [k, probe.materialPresentInVault];
    }),
  );

  // 1. Every worker × system auth-state kind → OS_DENY via broker boundary
  //    (vault material remains present; authMaterial always null).
  for (const principal of workers) {
    for (const stateKind of systemKinds) {
      const result = broker.requestBrowserAuthState({
        principal,
        stateKind,
        explicitUserConsent: true,
      });
      if (
        result.allowed === false &&
        result.code === BrowserAuthAccessCode.OS_DENY &&
        result.authMaterial === null &&
        result.materialPresentInVault === true &&
        result.sealedRef === null &&
        result.externalEffects === "NONE"
      ) {
        details.push(
          `boundary ${principal} → ${stateKind}: OS_DENY (vault intact, no material returned)`,
        );
      } else {
        passed = false;
        details.push(
          `boundary ${principal} → ${stateKind}: unexpected ${JSON.stringify(result)}`,
        );
      }
    }
  }

  // Domain helper honesty for each worker principal.
  for (const principal of workerDomainPrincipals) {
    const domainDeny = evaluateBrowserAuthStateAccess({
      principal,
      stateKind: BrowserAuthStateKind.SYSTEM_CHROME_COOKIES,
      explicitUserConsent: true,
    });
    if (
      isWorkerBrowserAuthOsDeny(domainDeny) &&
      domainDeny.liveBrowserAuthWiring === BROWSER_AUTH_LIVE_WIRING
    ) {
      details.push(
        `domain ${principal} → system_chrome_cookies: OS_DENY; liveBrowserAuthWiring=NOT_WIRED`,
      );
    } else {
      passed = false;
      details.push(
        `domain ${principal} deny unexpectedly ${JSON.stringify(domainDeny)}`,
      );
    }
  }

  // 2. Worker cannot escalate via forged consent on workspace partition.
  const workerPartition = broker.requestBrowserAuthState({
    principal: "workflow-worker",
    stateKind: BrowserAuthStateKind.WORKSPACE_BROWSER_PARTITION,
    explicitUserConsent: true,
  });
  if (
    workerPartition.allowed === false &&
    workerPartition.code === BrowserAuthAccessCode.OS_DENY &&
    workerPartition.authMaterial === null &&
    workerPartition.materialPresentInVault === true
  ) {
    details.push(
      "boundary workflow-worker → workspace_browser_partition: OS_DENY (consent cannot escalate)",
    );
  } else {
    passed = false;
    details.push(
      `workflow-worker workspace partition unexpectedly ${JSON.stringify(workerPartition)}`,
    );
  }

  // 3. Browser-pool cannot silently reuse any system/OS auth kind.
  for (const stateKind of SYSTEM_BROWSER_AUTH_STATE_KINDS) {
    if (!isSystemBrowserAuthStateKind(stateKind)) {
      passed = false;
      details.push(`isSystemBrowserAuthStateKind(${stateKind}) unexpectedly false`);
      continue;
    }
    const poolDenied = broker.requestBrowserAuthState({
      principal: "browser-pool",
      stateKind,
      explicitUserConsent: true,
    });
    if (
      poolDenied.allowed === false &&
      poolDenied.code === BrowserAuthAccessCode.OS_DENY &&
      poolDenied.authMaterial === null &&
      poolDenied.materialPresentInVault === true
    ) {
      details.push(
        `boundary browser-pool → ${stateKind}: OS_DENY (no silent reuse)`,
      );
    } else {
      passed = false;
      details.push(
        `browser-pool ${stateKind} unexpectedly ${JSON.stringify(poolDenied)}`,
      );
    }
  }

  // 4. Host-admin cannot silently reuse system Chrome / OS profile / OAuth.
  for (const stateKind of systemKinds) {
    const adminDenied = broker.requestBrowserAuthState({
      principal: "host-admin",
      stateKind,
      explicitUserConsent: true,
    });
    if (
      adminDenied.allowed === false &&
      adminDenied.code === BrowserAuthAccessCode.OS_DENY &&
      adminDenied.authMaterial === null &&
      adminDenied.materialPresentInVault === true &&
      adminDenied.externalEffects === "NONE"
    ) {
      details.push(
        `boundary host-admin → ${stateKind}: OS_DENY (no silent reuse)`,
      );
    } else {
      passed = false;
      details.push(
        `host-admin ${stateKind} unexpectedly ${JSON.stringify(adminDenied)}`,
      );
    }
  }

  // 5. Positive control: browser-pool + consent → workspace partition ALLOWED
  //    with sealed ref only (still no raw auth material).
  const poolOk = broker.requestBrowserAuthState({
    principal: "browser-pool",
    stateKind: BrowserAuthStateKind.WORKSPACE_BROWSER_PARTITION,
    explicitUserConsent: true,
  });
  if (
    poolOk.allowed === true &&
    poolOk.code === BrowserAuthAccessCode.ALLOWED &&
    poolOk.authMaterial === null &&
    poolOk.sealedRef !== null &&
    poolOk.materialPresentInVault === true
  ) {
    details.push(
      "Positive control: browser-pool + consent → sealed workspace ref (no material bytes)",
    );
  } else {
    passed = false;
    details.push(
      `Positive control unexpectedly ${JSON.stringify(poolOk)}`,
    );
  }

  // 6. Without consent, workspace partition stays CONSENT_REQUIRED.
  const needsConsent = broker.requestBrowserAuthState({
    principal: "browser-pool",
    stateKind: BrowserAuthStateKind.WORKSPACE_BROWSER_PARTITION,
  });
  if (
    needsConsent.allowed === false &&
    needsConsent.code === BrowserAuthAccessCode.CONSENT_REQUIRED &&
    needsConsent.authMaterial === null
  ) {
    details.push("boundary browser-pool without consent → CONSENT_REQUIRED");
  } else {
    passed = false;
    details.push(
      `Consent gate unexpectedly ${JSON.stringify(needsConsent)}`,
    );
  }

  // 7. Vault still present after all denies (isolation ≠ wipe).
  const vaultIntact = systemKinds.every((k) => {
    const probe = broker.requestBrowserAuthState({
      principal: "claude-runner",
      stateKind: k,
    });
    return vaultBefore[k] === true && probe.materialPresentInVault === true;
  });
  if (vaultIntact) {
    details.push("fixture vault intact after OS_DENY matrix (isolation ≠ wipe)");
  } else {
    passed = false;
    details.push("fixture vault presence regress after OS_DENY matrix");
  }

  details.push(
    "liveBrowserAuthRead=NOT_WIRED liveBrowserAuthWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE",
  );

  return {
    proofId: `proof-browser-auth-${randomUUID()}`,
    kind: SoakProofKind.WORKER_BROWSER_AUTH_STATE_OS_DENIED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx065-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
