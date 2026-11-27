import { describe, expect, it } from "vitest";
import {
  BROWSER_AUTH_LIVE_WIRING,
  BrowserAuthAccessCode,
  BrowserAuthPrincipal,
  BrowserAuthStateKind,
  SYSTEM_BROWSER_AUTH_STATE_KINDS,
  WORKER_BROWSER_AUTH_PRINCIPALS,
  evaluateBrowserAuthStateAccess,
  isSystemBrowserAuthStateKind,
  isWorkerBrowserAuthOsDeny,
} from "./browser-auth-isolation.js";

describe("browser-auth-isolation (T-X065)", () => {
  it("OS-denies every worker principal reading system Chrome cookies", () => {
    for (const principal of WORKER_BROWSER_AUTH_PRINCIPALS) {
      const decision = evaluateBrowserAuthStateAccess({
        principal,
        stateKind: BrowserAuthStateKind.SYSTEM_CHROME_COOKIES,
        explicitUserConsent: true,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.code).toBe(BrowserAuthAccessCode.OS_DENY);
      expect(decision.authMaterialReturned).toBe(false);
      expect(decision.externalEffects).toBe("NONE");
      expect(decision.liveBrowserAuthWiring).toBe(BROWSER_AUTH_LIVE_WIRING);
      expect(decision.liveBrowserAuthWiring).toBe("NOT_WIRED");
      expect(isWorkerBrowserAuthOsDeny(decision)).toBe(true);
    }
  });

  it("OS-denies workers for OS profile, OAuth cookies, and workspace partition", () => {
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
      expect(decision.liveBrowserAuthWiring).toBe("NOT_WIRED");
    }
  });

  it("OS-denies browser-pool silent reuse of every system/OS auth kind", () => {
    for (const stateKind of SYSTEM_BROWSER_AUTH_STATE_KINDS) {
      expect(isSystemBrowserAuthStateKind(stateKind)).toBe(true);
      const decision = evaluateBrowserAuthStateAccess({
        principal: BrowserAuthPrincipal.BROWSER_POOL,
        stateKind,
        explicitUserConsent: true,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.code).toBe(BrowserAuthAccessCode.OS_DENY);
      expect(decision.authMaterialReturned).toBe(false);
      expect(decision.liveBrowserAuthWiring).toBe("NOT_WIRED");
    }
  });

  it("OS-denies browser-pool system kinds without consent (not CONSENT_REQUIRED)", () => {
    for (const stateKind of SYSTEM_BROWSER_AUTH_STATE_KINDS) {
      const decision = evaluateBrowserAuthStateAccess({
        principal: BrowserAuthPrincipal.BROWSER_POOL,
        stateKind,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.code).toBe(BrowserAuthAccessCode.OS_DENY);
      expect(decision.authMaterialReturned).toBe(false);
    }
  });

  it("requires consent for workspace partition; allows browser-pool with consent", () => {
    const without = evaluateBrowserAuthStateAccess({
      principal: BrowserAuthPrincipal.BROWSER_POOL,
      stateKind: BrowserAuthStateKind.WORKSPACE_BROWSER_PARTITION,
    });
    expect(without.allowed).toBe(false);
    expect(without.code).toBe(BrowserAuthAccessCode.CONSENT_REQUIRED);
    expect(without.liveBrowserAuthWiring).toBe("NOT_WIRED");

    const withConsent = evaluateBrowserAuthStateAccess({
      principal: BrowserAuthPrincipal.BROWSER_POOL,
      stateKind: BrowserAuthStateKind.WORKSPACE_BROWSER_PARTITION,
      explicitUserConsent: true,
    });
    expect(withConsent.allowed).toBe(true);
    expect(withConsent.code).toBe(BrowserAuthAccessCode.ALLOWED);
    expect(withConsent.authMaterialReturned).toBe(false);
    expect(withConsent.externalEffects).toBe("NONE");
    expect(withConsent.liveBrowserAuthWiring).toBe("NOT_WIRED");
  });

  it("OS-denies host-admin silent reuse of system/OS auth state", () => {
    for (const stateKind of SYSTEM_BROWSER_AUTH_STATE_KINDS) {
      const decision = evaluateBrowserAuthStateAccess({
        principal: BrowserAuthPrincipal.HOST_ADMIN,
        stateKind,
        explicitUserConsent: true,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.code).toBe(BrowserAuthAccessCode.OS_DENY);
      expect(decision.authMaterialReturned).toBe(false);
      expect(decision.externalEffects).toBe("NONE");
      expect(decision.liveBrowserAuthWiring).toBe("NOT_WIRED");
    }
  });

  it("denies host-admin workspace partition (not browser-pool)", () => {
    const decision = evaluateBrowserAuthStateAccess({
      principal: BrowserAuthPrincipal.HOST_ADMIN,
      stateKind: BrowserAuthStateKind.WORKSPACE_BROWSER_PARTITION,
      explicitUserConsent: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(BrowserAuthAccessCode.OS_DENY);
    expect(decision.authMaterialReturned).toBe(false);
  });

  it("denies host-admin workspace partition without consent", () => {
    const decision = evaluateBrowserAuthStateAccess({
      principal: BrowserAuthPrincipal.HOST_ADMIN,
      stateKind: BrowserAuthStateKind.WORKSPACE_BROWSER_PARTITION,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(BrowserAuthAccessCode.OS_DENY);
    expect(decision.authMaterialReturned).toBe(false);
  });

  it("marks workspace partition as non-system auth kind", () => {
    expect(
      isSystemBrowserAuthStateKind(
        BrowserAuthStateKind.WORKSPACE_BROWSER_PARTITION,
      ),
    ).toBe(false);
  });

  it("OS-denies worker workspace partition without consent (not CONSENT_REQUIRED)", () => {
    for (const principal of WORKER_BROWSER_AUTH_PRINCIPALS) {
      const decision = evaluateBrowserAuthStateAccess({
        principal,
        stateKind: BrowserAuthStateKind.WORKSPACE_BROWSER_PARTITION,
      });
      expect(isWorkerBrowserAuthOsDeny(decision)).toBe(true);
    }
  });

  it("OS-denies workers on system kinds without consent (M16)", () => {
    const systemKinds = [
      BrowserAuthStateKind.SYSTEM_CHROME_COOKIES,
      BrowserAuthStateKind.OS_BROWSER_PROFILE,
      BrowserAuthStateKind.OAUTH_CALLBACK_COOKIES,
    ] as const;
    for (const principal of WORKER_BROWSER_AUTH_PRINCIPALS) {
      for (const stateKind of systemKinds) {
        const decision = evaluateBrowserAuthStateAccess({
          principal,
          stateKind,
        });
        expect(isWorkerBrowserAuthOsDeny(decision)).toBe(true);
      }
    }
  });

  it("OS-denies full worker × state-kind domain matrix without consent (M17)", () => {
    const stateKinds = [
      BrowserAuthStateKind.SYSTEM_CHROME_COOKIES,
      BrowserAuthStateKind.OS_BROWSER_PROFILE,
      BrowserAuthStateKind.OAUTH_CALLBACK_COOKIES,
      BrowserAuthStateKind.WORKSPACE_BROWSER_PARTITION,
    ] as const;
    for (const principal of WORKER_BROWSER_AUTH_PRINCIPALS) {
      for (const stateKind of stateKinds) {
        const decision = evaluateBrowserAuthStateAccess({
          principal,
          stateKind,
        });
        expect(isWorkerBrowserAuthOsDeny(decision)).toBe(true);
        expect(decision.authMaterialReturned).toBe(false);
        expect(decision.externalEffects).toBe("NONE");
      }
    }
  });

  it("treats explicitUserConsent false as absent consent across matrix (M18)", () => {
    const stateKinds = [
      BrowserAuthStateKind.SYSTEM_CHROME_COOKIES,
      BrowserAuthStateKind.OS_BROWSER_PROFILE,
      BrowserAuthStateKind.OAUTH_CALLBACK_COOKIES,
      BrowserAuthStateKind.WORKSPACE_BROWSER_PARTITION,
    ] as const;
    for (const principal of WORKER_BROWSER_AUTH_PRINCIPALS) {
      for (const stateKind of stateKinds) {
        const decision = evaluateBrowserAuthStateAccess({
          principal,
          stateKind,
          explicitUserConsent: false,
        });
        expect(isWorkerBrowserAuthOsDeny(decision)).toBe(true);
        expect(decision.code).toBe(BrowserAuthAccessCode.OS_DENY);
        expect(decision.code).not.toBe(BrowserAuthAccessCode.CONSENT_REQUIRED);
        expect(decision.authMaterialReturned).toBe(false);
        expect(decision.externalEffects).toBe("NONE");
        expect(decision.liveBrowserAuthWiring).toBe("NOT_WIRED");
      }
    }

    for (const stateKind of SYSTEM_BROWSER_AUTH_STATE_KINDS) {
      const poolSystem = evaluateBrowserAuthStateAccess({
        principal: BrowserAuthPrincipal.BROWSER_POOL,
        stateKind,
        explicitUserConsent: false,
      });
      expect(poolSystem.allowed).toBe(false);
      expect(poolSystem.code).toBe(BrowserAuthAccessCode.OS_DENY);
      expect(poolSystem.authMaterialReturned).toBe(false);
      expect(poolSystem.externalEffects).toBe("NONE");
      expect(poolSystem.liveBrowserAuthWiring).toBe("NOT_WIRED");
    }

    const poolPartition = evaluateBrowserAuthStateAccess({
      principal: BrowserAuthPrincipal.BROWSER_POOL,
      stateKind: BrowserAuthStateKind.WORKSPACE_BROWSER_PARTITION,
      explicitUserConsent: false,
    });
    expect(poolPartition.allowed).toBe(false);
    expect(poolPartition.code).toBe(BrowserAuthAccessCode.CONSENT_REQUIRED);
    expect(poolPartition.authMaterialReturned).toBe(false);
    expect(poolPartition.externalEffects).toBe("NONE");
    expect(poolPartition.liveBrowserAuthWiring).toBe("NOT_WIRED");
  });

  it("locks honesty fields on ALLOWED workspace mount (M18)", () => {
    const allowed = evaluateBrowserAuthStateAccess({
      principal: BrowserAuthPrincipal.BROWSER_POOL,
      stateKind: BrowserAuthStateKind.WORKSPACE_BROWSER_PARTITION,
      explicitUserConsent: true,
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.code).toBe(BrowserAuthAccessCode.ALLOWED);
    expect(allowed.authMaterialReturned).toBe(false);
    expect(allowed.externalEffects).toBe("NONE");
    expect(allowed.liveBrowserAuthWiring).toBe(BROWSER_AUTH_LIVE_WIRING);
    expect(allowed.liveBrowserAuthWiring).toBe("NOT_WIRED");
  });

  it("OS-denies full worker × state-kind domain matrix (M16)", () => {
    const stateKinds = [
      BrowserAuthStateKind.SYSTEM_CHROME_COOKIES,
      BrowserAuthStateKind.OS_BROWSER_PROFILE,
      BrowserAuthStateKind.OAUTH_CALLBACK_COOKIES,
      BrowserAuthStateKind.WORKSPACE_BROWSER_PARTITION,
    ] as const;
    for (const principal of WORKER_BROWSER_AUTH_PRINCIPALS) {
      for (const stateKind of stateKinds) {
        const decision = evaluateBrowserAuthStateAccess({
          principal,
          stateKind,
          explicitUserConsent: true,
        });
        expect(isWorkerBrowserAuthOsDeny(decision)).toBe(true);
        expect(decision.liveBrowserAuthWiring).toBe("NOT_WIRED");
      }
    }
  });
});
