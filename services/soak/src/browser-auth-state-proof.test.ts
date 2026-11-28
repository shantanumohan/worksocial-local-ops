/**
 * T-X065 worker browser auth — soak proof (M16+ / M18 / M19 edge deepen).
 */

import { describe, expect, it } from "vitest";
import { SoakProofKind } from "@worksocial/domain";
import { proofWorkerBrowserAuthStateOsDenied } from "./browser-auth-state-proof.js";

describe("proofWorkerBrowserAuthStateOsDenied (T-X065 M16+)", () => {
  it("passes with full domain matrix and worker partition escalation denies", () => {
    const proof = proofWorkerBrowserAuthStateOsDenied(
      "2026-11-27T18:30:00.000Z",
    );

    expect(proof.kind).toBe(SoakProofKind.WORKER_BROWSER_AUTH_STATE_OS_DENIED);
    expect(proof.passed).toBe(true);
    expect(proof.fixtureOnly).toBe(true);

    const joined = proof.details.join(" | ");
    expect(joined).toMatch(
      /domain workflow-worker → workspace_browser_partition: OS_DENY \(no-consent domain path\)/,
    );
    expect(joined).toMatch(
      /domain workflow-worker → workspace_browser_partition: OS_DENY; liveBrowserAuthWiring=NOT_WIRED/,
    );
    expect(joined).toMatch(
      /boundary claude-runner → workspace_browser_partition: OS_DENY \(consent cannot escalate\)/,
    );
    expect(joined).toMatch(
      /boundary workflow-worker → system_chrome_cookies: OS_DENY \(no-consent path\)/,
    );
    expect(joined).toMatch(
      /boundary workflow-worker → os_browser_profile: OS_DENY \(no-consent path\)/,
    );
    expect(joined).toMatch(
      /boundary evaluation-worker → oauth_callback_cookies: OS_DENY \(no-consent path\)/,
    );
    expect(joined).toMatch(
      /boundary host-admin → oauth_callback_cookies: OS_DENY \(no-consent path\)/,
    );
    expect(joined).toMatch(
      /boundary browser-pool → os_browser_profile: OS_DENY \(no-consent path\)/,
    );
    expect(joined).toMatch(
      /boundary learning-worker → workspace_browser_partition: OS_DENY \(no-consent path\)/,
    );
    expect(joined).toMatch(
      /boundary host-admin → workspace_browser_partition: OS_DENY \(not browser-pool\)/,
    );
    expect(joined).toMatch(
      /boundary host-admin → workspace_browser_partition: OS_DENY \(no-consent path\)/,
    );
    expect(joined).toMatch(
      /domain workflow-worker → workspace_browser_partition: OS_DENY \(explicitUserConsent=false\)/,
    );
    expect(joined).toMatch(
      /domain browser-pool → system_chrome_cookies: OS_DENY \(explicitUserConsent=false\)/,
    );
    expect(joined).toMatch(
      /domain browser-pool → workspace_browser_partition: CONSENT_REQUIRED \(explicitUserConsent=false\)/,
    );
    expect(joined).toMatch(
      /domain browser-pool → workspace_browser_partition: ALLOWED honesty locked \(no material; NOT_WIRED; NONE\)/,
    );
    expect(joined).toMatch(
      /boundary workflow-worker → system_chrome_cookies: OS_DENY \(explicitUserConsent=false\)/,
    );
    expect(joined).toMatch(
      /boundary browser-pool → workspace_browser_partition: CONSENT_REQUIRED \(explicitUserConsent=false\)/,
    );
    expect(joined).toMatch(
      /boundary host-admin → oauth_callback_cookies: OS_DENY \(explicitUserConsent=false\)/,
    );
    expect(joined).toMatch(
      /boundary host-admin → workspace_browser_partition: OS_DENY \(explicitUserConsent=false\)/,
    );
    expect(joined).toMatch(/fixture vault intact after OS_DENY matrix/);
    expect(joined).toMatch(/liveBrowserAuthWiring=NOT_WIRED/);
    expect(joined).toMatch(/externalEffects=NONE/);
  });
});