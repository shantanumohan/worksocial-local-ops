/**
 * Fixture proof for T-X050 — public synthetic flag abuse / server grant required.
 *
 * Exercises the browser submission boundary (`runBrowserFormSubmit`):
 * client/public `ws_synthetic` cannot authorize without a server-issued
 * canary grant. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  SyntheticFlagDecisionCode,
  bindSyntheticFromServerGrant,
  parsePublicSyntheticClaim,
  type SoakProofRecord,
} from "@worksocial/domain";
import { runBrowserFormSubmit } from "@worksocial/lead-capture";

/**
 * Complete expected proof set for T-X050 fixture ACCEPTED.
 */
export async function proofPublicSyntheticFlagRequiresServerGrant(
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  let passed = true;
  const correlationId = `corr-tx050-${randomUUID().slice(0, 8)}`;
  const abuseFields = {
    Email: "abuse@example.test",
    Last_Name: "Abuse",
    ws_synthetic: "true",
    ws_correlation_id: correlationId,
  };

  // 1. Browser boundary: public ws_synthetic=true WITHOUT server canary grant.
  const abusedBrowser = await runBrowserFormSubmit({
    correlationId,
    fieldValues: abuseFields,
    serverCanaryGrantPresent: false,
  });
  if (
    !abusedBrowser.ok &&
    abusedBrowser.details.some((d) =>
      /GRANT_MISSING|server canary grant/i.test(d),
    )
  ) {
    details.push(
      "Browser boundary: public ws_synthetic=true without server canary grant → denied GRANT_MISSING",
    );
  } else {
    passed = false;
    details.push(
      `Browser abuse path unexpectedly ok=${abusedBrowser.ok} details=${JSON.stringify(abusedBrowser.details)}`,
    );
  }

  // 2. Same public fields WITH server canary grant → authorized submit.
  const grantedBrowser = await runBrowserFormSubmit({
    correlationId: `${correlationId}-ok`,
    fieldValues: {
      ...abuseFields,
      ws_correlation_id: `${correlationId}-ok`,
    },
    serverCanaryGrantPresent: true,
  });
  if (
    grantedBrowser.ok &&
    grantedBrowser.submittedFields.ws_synthetic === "true"
  ) {
    details.push(
      "Browser boundary: same claim with server canary grant → AUTHORIZED synthetic submit",
    );
  } else {
    passed = false;
    details.push(
      `Granted browser path failed ok=${grantedBrowser.ok} details=${JSON.stringify(grantedBrowser.details)}`,
    );
  }

  // 3. Domain bind mirror + counterfactual (public flag alone would mark synthetic).
  const abuseClaim = parsePublicSyntheticClaim({ ws_synthetic: "true" });
  const abused = bindSyntheticFromServerGrant({
    clientClaimedSynthetic: abuseClaim,
    serverCanaryGrantPresent: false,
  });
  if (
    abuseClaim === true &&
    !abused.synthetic &&
    abused.deniedAbuse &&
    abused.code === SyntheticFlagDecisionCode.GRANT_MISSING
  ) {
    details.push(
      "Domain bind: public claim without grant → GRANT_MISSING (counterfactual public flag alone would mark synthetic)",
    );
  } else {
    passed = false;
    details.push(`Domain abuse bind failed: ${JSON.stringify(abused)}`);
  }

  // 4. Positive control: host grant without client claim still authorizes.
  const hostOnly = bindSyntheticFromServerGrant({
    clientClaimedSynthetic: undefined,
    serverCanaryGrantPresent: true,
  });
  if (
    hostOnly.synthetic &&
    hostOnly.code === SyntheticFlagDecisionCode.AUTHORIZED
  ) {
    details.push(
      "Positive control: server canary grant without client claim → AUTHORIZED",
    );
  } else {
    passed = false;
    details.push(`Positive control failed: ${JSON.stringify(hostOnly)}`);
  }

  // 5. No claim, no grant → not synthetic.
  const quiet = bindSyntheticFromServerGrant({
    clientClaimedSynthetic: parsePublicSyntheticClaim({}),
    serverCanaryGrantPresent: false,
  });
  if (
    !quiet.synthetic &&
    !quiet.deniedAbuse &&
    quiet.code === SyntheticFlagDecisionCode.NO_CLAIM
  ) {
    details.push("No claim + no grant → not synthetic (NO_CLAIM)");
  } else {
    passed = false;
    details.push(`Quiet path failed: ${JSON.stringify(quiet)}`);
  }

  details.push(`proofClock=${nowIso}`);
  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-public-synthetic-flag-${randomUUID()}`,
    kind: SoakProofKind.PUBLIC_SYNTHETIC_FLAG_REQUIRES_SERVER_GRANT,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx050-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
