/**
 * Fixture proof for T-X007 — wrong CMS environment → no production op.
 * Domain gate + instrumented staging CMS applyChange refuse mutate
 * (providerMutateCount=0). External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  CmsEnvironment,
  SoakProofKind,
  StagingChangeStatus,
  digestFields,
  validateCmsEnvironmentOperation,
  type SoakProofRecord,
  type StagingCmsPageRecord,
} from "@worksocial/domain";
import { createStagingCmsSimulator } from "@worksocial/provider-adapters";

function seedPage(nowIso: string): StagingCmsPageRecord {
  const fields = {
    title: "Pilot staging title",
    metaDescription: "Pilot meta",
    h1: "Pilot h1",
    bodyExcerpt: "Pilot body",
  };
  return {
    pageId: "page-pilot-tx007",
    siteId: "site-pilot",
    path: "/pilot",
    fields,
    revision: "rev_seed_tx007",
    contentDigest: digestFields(fields),
    updatedAtIso: nowIso,
  };
}

/**
 * Complete expected proof set for T-X007 fixture ACCEPTED.
 */
export function proofWrongCmsEnvironmentNoProductionOp(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const mismatch = validateCmsEnvironmentOperation({
    boundEnvironment: CmsEnvironment.PRODUCTION,
    intendedEnvironment: CmsEnvironment.STAGING,
    operation: "publish",
  });
  if (
    !mismatch.ok &&
    mismatch.code === "WRONG_CMS_ENVIRONMENT" &&
    mismatch.allowProductionOp === false
  ) {
    details.push(
      "Production-bound vs staging-intended publish → WRONG_CMS_ENVIRONMENT; no production op",
    );
  } else {
    passed = false;
    details.push(`Mismatch unexpectedly ${JSON.stringify(mismatch)}`);
  }

  const unrecognized = validateCmsEnvironmentOperation({
    boundEnvironment: "prod",
    intendedEnvironment: "prod",
    operation: "publish",
  });
  if (
    !unrecognized.ok &&
    unrecognized.code === "UNRECOGNIZED_ENVIRONMENT" &&
    unrecognized.allowProductionOp === false
  ) {
    details.push("Matching unrecognized label 'prod' → UNRECOGNIZED_ENVIRONMENT");
  } else {
    passed = false;
    details.push(`Unrecognized unexpectedly ${JSON.stringify(unrecognized)}`);
  }

  const prodMatch = validateCmsEnvironmentOperation({
    boundEnvironment: CmsEnvironment.PRODUCTION,
    intendedEnvironment: CmsEnvironment.PRODUCTION,
    operation: "publish",
  });
  if (
    !prodMatch.ok &&
    prodMatch.code === "PRODUCTION_OP_REFUSED" &&
    prodMatch.allowProductionOp === false
  ) {
    details.push(
      "Matching production publish → PRODUCTION_OP_REFUSED (no production op)",
    );
  } else {
    passed = false;
    details.push(`Prod match unexpectedly ${JSON.stringify(prodMatch)}`);
  }

  const stagingOk = validateCmsEnvironmentOperation({
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    operation: "publish",
  });
  if (stagingOk.ok === true && stagingOk.allowProductionOp === false) {
    details.push(
      "Matching staging publish allowed (fixture/simulator; allowProductionOp=false)",
    );
  } else {
    passed = false;
    details.push(`Staging publish unexpectedly ${JSON.stringify(stagingOk)}`);
  }

  // Instrumented CMS mutation path — refuse wrong env without provider write.
  const cms = createStagingCmsSimulator([seedPage(nowIso)]);
  const before = cms.getPage("page-pilot-tx007")!;
  const refused = cms.applyChange({
    changeId: `chg-wrong-${randomUUID().slice(0, 8)}`,
    missionId: "mis-tx007",
    pageId: "page-pilot-tx007",
    desiredFields: {
      title: "Should not land",
      metaDescription: "blocked",
      h1: "blocked",
      bodyExcerpt: "blocked",
    },
    nowIso,
    boundEnvironment: CmsEnvironment.PRODUCTION,
    intendedEnvironment: CmsEnvironment.STAGING,
  });
  const afterRefuse = cms.getPage("page-pilot-tx007")!;
  if (
    refused.providerMutateCount === 0 &&
    refused.environmentGate.ok === false &&
    !refused.environmentGate.ok &&
    refused.environmentGate.code === "WRONG_CMS_ENVIRONMENT" &&
    refused.change.status === StagingChangeStatus.MISMATCH &&
    afterRefuse.revision === before.revision &&
    afterRefuse.fields.title === before.fields.title
  ) {
    details.push(
      "staging-cms applyChange wrong-env → providerMutateCount=0; page unchanged",
    );
  } else {
    passed = false;
    details.push(
      `Instrumented refuse unexpectedly mutate=${refused.providerMutateCount} gate=${JSON.stringify(refused.environmentGate)} rev=${afterRefuse.revision}`,
    );
  }

  const allowed = cms.applyChange({
    changeId: `chg-ok-${randomUUID().slice(0, 8)}`,
    missionId: "mis-tx007-ok",
    pageId: "page-pilot-tx007",
    desiredFields: {
      title: "Staging apply ok",
      metaDescription: "ok",
      h1: "ok",
      bodyExcerpt: "ok",
    },
    nowIso,
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
  });
  if (
    allowed.providerMutateCount === 1 &&
    allowed.environmentGate.ok === true &&
    allowed.change.status === StagingChangeStatus.APPLIED_PENDING
  ) {
    details.push(
      "staging-cms matching staging apply → providerMutateCount=1 (simulator only)",
    );
  } else {
    passed = false;
    details.push(
      `Instrumented allow unexpectedly mutate=${allowed.providerMutateCount} status=${allowed.change.status}`,
    );
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-cms-env-${randomUUID()}`,
    kind: SoakProofKind.WRONG_CMS_ENVIRONMENT_NO_PRODUCTION_OP,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-cms-env-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
