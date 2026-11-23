/**
 * Fixture proof for T-X051 — wrong Zoho organization / identity mismatch blocks.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  ZohoOrganizationDecisionCode,
  ZohoOrganizationEnvironment,
  validateZohoOrganizationBinding,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X051 fixture ACCEPTED.
 */
export function proofWrongZohoOrganizationIdentityMismatch(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const expectedOrg = "zoho-org-fixture";

  const mismatch = validateZohoOrganizationBinding({
    expectedOrganizationId: expectedOrg,
    observedOrganizationId: "zoho-org-wrong-tenant",
    environment: ZohoOrganizationEnvironment.FIXTURE,
    liveZohoWiring: "NOT_WIRED",
    operation: "crm_write",
  });
  if (
    !mismatch.ok &&
    mismatch.code === ZohoOrganizationDecisionCode.IDENTITY_MISMATCH &&
    mismatch.allowCrmWrite === false
  ) {
    details.push(
      "Wrong Zoho organization → IDENTITY_MISMATCH; CRM write blocked",
    );
  } else {
    passed = false;
    details.push(`Mismatch unexpectedly ${JSON.stringify(mismatch)}`);
  }

  const matched = validateZohoOrganizationBinding({
    expectedOrganizationId: expectedOrg,
    observedOrganizationId: expectedOrg,
    environment: ZohoOrganizationEnvironment.FIXTURE,
    liveZohoWiring: "NOT_WIRED",
    operation: "bind",
  });
  if (
    matched.ok === true &&
    matched.code === ZohoOrganizationDecisionCode.MATCHED_FIXTURE &&
    matched.allowCrmWrite === true
  ) {
    details.push(
      "Matching fixture org → MATCHED_FIXTURE (fixture only; not live VERIFIED)",
    );
  } else {
    passed = false;
    details.push(`Matched fixture unexpectedly ${JSON.stringify(matched)}`);
  }

  const missingObserved = validateZohoOrganizationBinding({
    expectedOrganizationId: expectedOrg,
    observedOrganizationId: "   ",
    environment: ZohoOrganizationEnvironment.FIXTURE,
    liveZohoWiring: "NOT_WIRED",
    operation: "read_identity",
  });
  if (
    !missingObserved.ok &&
    missingObserved.code === ZohoOrganizationDecisionCode.MISSING_OBSERVED_ORG
  ) {
    details.push("Blank observed org → MISSING_OBSERVED_ORG");
  } else {
    passed = false;
    details.push(
      `Missing observed unexpectedly ${JSON.stringify(missingObserved)}`,
    );
  }

  const productionMatch = validateZohoOrganizationBinding({
    expectedOrganizationId: "zoho-org-prod",
    observedOrganizationId: "zoho-org-prod",
    environment: ZohoOrganizationEnvironment.PRODUCTION,
    liveZohoWiring: "NOT_WIRED",
    operation: "crm_write",
  });
  if (
    !productionMatch.ok &&
    productionMatch.code ===
      ZohoOrganizationDecisionCode.LIVE_TRANSPORT_NOT_WIRED &&
    productionMatch.allowCrmWrite === false
  ) {
    details.push(
      "Matching production org with NOT_WIRED → LIVE_TRANSPORT_NOT_WIRED (no invented live write)",
    );
  } else {
    passed = false;
    details.push(
      `Production match unexpectedly ${JSON.stringify(productionMatch)}`,
    );
  }

  const bindMismatch = validateZohoOrganizationBinding({
    expectedOrganizationId: expectedOrg,
    observedOrganizationId: "zoho-org-sandbox-other",
    environment: ZohoOrganizationEnvironment.SANDBOX,
    liveZohoWiring: "NOT_WIRED",
    operation: "bind",
  });
  if (
    !bindMismatch.ok &&
    bindMismatch.code === ZohoOrganizationDecisionCode.IDENTITY_MISMATCH
  ) {
    details.push("Sandbox wrong org bind → IDENTITY_MISMATCH");
  } else {
    passed = false;
    details.push(`Sandbox bind unexpectedly ${JSON.stringify(bindMismatch)}`);
  }

  details.push(`proofClock=${nowIso}`);
  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-wrong-zoho-org-${randomUUID()}`,
    kind: SoakProofKind.WRONG_ZOHO_ORGANIZATION_IDENTITY_MISMATCH,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx051-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
