/**
 * Fixture proof for T-X051 — wrong Zoho organization / identity mismatch blocks.
 * Additive hillclimb: liveProviderWiring=NOT_WIRED + externalEffects=NONE on
 * every decision; fixture+WIRED refuse; trim match; case-differ mismatch.
 * Never invents live VERIFIED.
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
    mismatch.allowCrmWrite === false &&
    mismatch.externalEffects === "NONE" &&
    mismatch.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "Wrong Zoho organization → IDENTITY_MISMATCH; CRM write blocked; liveProviderWiring=NOT_WIRED",
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
    matched.allowCrmWrite === true &&
    matched.externalEffects === "NONE" &&
    matched.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "Matching fixture org → MATCHED_FIXTURE (fixture only; not live VERIFIED); liveProviderWiring=NOT_WIRED",
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
    missingObserved.code === ZohoOrganizationDecisionCode.MISSING_OBSERVED_ORG &&
    missingObserved.liveProviderWiring === "NOT_WIRED"
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
    productionMatch.allowCrmWrite === false &&
    productionMatch.externalEffects === "NONE"
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

  // Hillclimb: trimmed match.
  const trimmed = validateZohoOrganizationBinding({
    expectedOrganizationId: `  ${expectedOrg}  `,
    observedOrganizationId: expectedOrg,
    environment: ZohoOrganizationEnvironment.FIXTURE,
    liveZohoWiring: "NOT_WIRED",
    operation: "bind",
  });
  if (
    trimmed.ok &&
    trimmed.code === ZohoOrganizationDecisionCode.MATCHED_FIXTURE &&
    trimmed.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push("Whitespace-trimmed org ids match → MATCHED_FIXTURE");
  } else {
    passed = false;
    details.push(`Trim match unexpectedly ${JSON.stringify(trimmed)}`);
  }

  // Hillclimb: case-differ ≠ match.
  const caseDiffer = validateZohoOrganizationBinding({
    expectedOrganizationId: expectedOrg,
    observedOrganizationId: expectedOrg.toUpperCase(),
    environment: ZohoOrganizationEnvironment.FIXTURE,
    liveZohoWiring: "NOT_WIRED",
    operation: "crm_write",
  });
  if (
    !caseDiffer.ok &&
    caseDiffer.code === ZohoOrganizationDecisionCode.IDENTITY_MISMATCH
  ) {
    details.push("Case-differing org ids → IDENTITY_MISMATCH (no silent fold)");
  } else {
    passed = false;
    details.push(`Case differ unexpectedly ${JSON.stringify(caseDiffer)}`);
  }

  // Hillclimb: fixture + WIRED refused.
  const wired = validateZohoOrganizationBinding({
    expectedOrganizationId: expectedOrg,
    observedOrganizationId: expectedOrg,
    environment: ZohoOrganizationEnvironment.FIXTURE,
    liveZohoWiring: "WIRED",
    operation: "crm_write",
  });
  if (
    !wired.ok &&
    wired.code === ZohoOrganizationDecisionCode.LIVE_TRANSPORT_NOT_WIRED &&
    wired.allowCrmWrite === false &&
    wired.liveProviderWiring === "NOT_WIRED" &&
    wired.externalEffects === "NONE"
  ) {
    details.push(
      "Fixture match with liveZohoWiring=WIRED → LIVE_TRANSPORT_NOT_WIRED; no invented live write",
    );
  } else {
    passed = false;
    details.push(`WIRED fixture unexpectedly ${JSON.stringify(wired)}`);
  }

  details.push(`proofClock=${nowIso}`);
  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE ACCEPTED≠VERIFIED",
  );

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
