import { describe, expect, it } from "vitest";
import {
  BrowserAuthAccessCode,
  BrowserAuthPrincipal,
  BrowserAuthStateKind,
  evaluateBrowserAuthStateAccess,
  isWorkerBrowserAuthOsDeny,
} from "./browser-auth-isolation.js";

describe("browser-auth-isolation (T-X065)", () => {
  it("OS-denies every worker principal reading system Chrome cookies", () => {
    for (const principal of [
      BrowserAuthPrincipal.CLAUDE_RUNNER,
      BrowserAuthPrincipal.EVALUATION_WORKER,
      BrowserAuthPrincipal.LEARNING_WORKER,
      BrowserAuthPrincipal.WORKFLOW_WORKER,
    ] as const) {
      const decision = evaluateBrowserAuthStateAccess({
        principal,
        stateKind: BrowserAuthStateKind.SYSTEM_CHROME_COOKIES,
        explicitUserConsent: true,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.code).toBe(BrowserAuthAccessCode.OS_DENY);
      expect(decision.authMaterialReturned).toBe(false);
      expect(decision.externalEffects).toBe("NONE");
      expect(isWorkerBrowserAuthOsDeny(decision)).toBe(true);
    }
  });

  it("OS-denies workers for OS profile and OAuth callback cookies", () => {
    for (const stateKind of [
      BrowserAuthStateKind.OS_BROWSER_PROFILE,
      BrowserAuthStateKind.OAUTH_CALLBACK_COOKIES,
      BrowserAuthStateKind.WORKSPACE_BROWSER_PARTITION,
    ] as const) {
      const decision = evaluateBrowserAuthStateAccess({
        principal: BrowserAuthPrincipal.CLAUDE_RUNNER,
        stateKind,
      });
      expect(isWorkerBrowserAuthOsDeny(decision)).toBe(true);
    }
  });

  it("OS-denies browser-pool silent reuse of system Chrome / OS profile", () => {
    const chrome = evaluateBrowserAuthStateAccess({
      principal: BrowserAuthPrincipal.BROWSER_POOL,
      stateKind: BrowserAuthStateKind.SYSTEM_CHROME_COOKIES,
      explicitUserConsent: true,
    });
    expect(chrome.allowed).toBe(false);
    expect(chrome.code).toBe(BrowserAuthAccessCode.OS_DENY);

    const profile = evaluateBrowserAuthStateAccess({
      principal: BrowserAuthPrincipal.BROWSER_POOL,
      stateKind: BrowserAuthStateKind.OS_BROWSER_PROFILE,
    });
    expect(profile.code).toBe(BrowserAuthAccessCode.OS_DENY);
  });

  it("requires consent for workspace partition; allows browser-pool with consent", () => {
    const without = evaluateBrowserAuthStateAccess({
      principal: BrowserAuthPrincipal.BROWSER_POOL,
      stateKind: BrowserAuthStateKind.WORKSPACE_BROWSER_PARTITION,
    });
    expect(without.allowed).toBe(false);
    expect(without.code).toBe(BrowserAuthAccessCode.CONSENT_REQUIRED);

    const withConsent = evaluateBrowserAuthStateAccess({
      principal: BrowserAuthPrincipal.BROWSER_POOL,
      stateKind: BrowserAuthStateKind.WORKSPACE_BROWSER_PARTITION,
      explicitUserConsent: true,
    });
    expect(withConsent.allowed).toBe(true);
    expect(withConsent.code).toBe(BrowserAuthAccessCode.ALLOWED);
    expect(withConsent.authMaterialReturned).toBe(false);
  });
});
