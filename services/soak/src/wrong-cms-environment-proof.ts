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
  evaluateCmsEnvironmentMutateWithLease,
  evaluateCmsLeaseExpireRaceAttackSuite,
  evaluateWrongCmsEnvironmentAttackSuite,
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
 * Hillclimb+deepen: unicode-whitespace/alias normalize; fixtureOnly;
 * lease-expire race + exact-boundary/invalid lease; attack suite; NOT_WIRED/NONE.
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
    mismatch.allowProductionOp === false &&
    mismatch.liveProviderWiring === "NOT_WIRED" &&
    mismatch.externalEffects === "NONE" &&
    mismatch.fixtureOnly === true
  ) {
    details.push(
      "Production-bound vs staging-intended publish → WRONG_CMS_ENVIRONMENT; no production op; NOT_WIRED fixtureOnly",
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
    unrecognized.allowProductionOp === false &&
    unrecognized.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "Matching unrecognized label 'prod' → UNRECOGNIZED_ENVIRONMENT; NOT_WIRED",
    );
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
    prodMatch.allowProductionOp === false &&
    prodMatch.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "Matching production publish → PRODUCTION_OP_REFUSED (no production op); NOT_WIRED",
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
  if (
    stagingOk.ok === true &&
    stagingOk.allowProductionOp === false &&
    stagingOk.liveProviderWiring === "NOT_WIRED" &&
    stagingOk.externalEffects === "NONE"
  ) {
    details.push(
      "Matching staging publish allowed (fixture/simulator; allowProductionOp=false; NOT_WIRED)",
    );
  } else {
    passed = false;
    details.push(`Staging publish unexpectedly ${JSON.stringify(stagingOk)}`);
  }

  // Case + whitespace normalize: " PRODUCTION " vs "Staging" still refuses.
  const paddedMismatch = validateCmsEnvironmentOperation({
    boundEnvironment: " PRODUCTION ",
    intendedEnvironment: "Staging",
    operation: "repair",
  });
  if (
    !paddedMismatch.ok &&
    paddedMismatch.code === "WRONG_CMS_ENVIRONMENT" &&
    paddedMismatch.allowProductionOp === false &&
    paddedMismatch.fixtureOnly === true
  ) {
    details.push(
      "Padded/cased PRODUCTION vs Staging → WRONG_CMS_ENVIRONMENT (normalized)",
    );
  } else {
    passed = false;
    details.push(
      `Padded mismatch unexpectedly ${JSON.stringify(paddedMismatch)}`,
    );
  }

  // Deepen: NBSP/ZWSP cannot invent a production mutate path.
  const unicodeMismatch = validateCmsEnvironmentOperation({
    boundEnvironment: "\u00A0PRODUCTION\u200B",
    intendedEnvironment: "\u200BStaging\u00A0",
    operation: "publish",
  });
  if (
    !unicodeMismatch.ok &&
    unicodeMismatch.code === "WRONG_CMS_ENVIRONMENT" &&
    unicodeMismatch.allowProductionOp === false
  ) {
    details.push(
      "NBSP/ZWSP PRODUCTION vs Staging → WRONG_CMS_ENVIRONMENT (unicode-normalized)",
    );
  } else {
    passed = false;
    details.push(
      `Unicode mismatch unexpectedly ${JSON.stringify(unicodeMismatch)}`,
    );
  }

  const aliasLive = validateCmsEnvironmentOperation({
    boundEnvironment: "live",
    intendedEnvironment: "live",
    operation: "publish",
  });
  if (
    !aliasLive.ok &&
    aliasLive.code === "UNRECOGNIZED_ENVIRONMENT" &&
    aliasLive.allowProductionOp === false
  ) {
    details.push("Alias 'live' → UNRECOGNIZED_ENVIRONMENT (no production op)");
  } else {
    passed = false;
    details.push(`Alias live unexpectedly ${JSON.stringify(aliasLive)}`);
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

  // Deepen: unicode-padded production match still refuses mutate (count=0).
  const beforeUnicode = cms.getPage("page-pilot-tx007")!;
  const unicodeRefuse = cms.applyChange({
    changeId: `chg-unicode-${randomUUID().slice(0, 8)}`,
    missionId: "mis-tx007-unicode",
    pageId: "page-pilot-tx007",
    desiredFields: {
      title: "Should not land unicode",
      metaDescription: "blocked",
      h1: "blocked",
      bodyExcerpt: "blocked",
    },
    nowIso,
    boundEnvironment: "\tProduction\n",
    intendedEnvironment: " PRODUCTION ",
  });
  const afterUnicode = cms.getPage("page-pilot-tx007")!;
  if (
    unicodeRefuse.providerMutateCount === 0 &&
    unicodeRefuse.environmentGate.ok === false &&
    !unicodeRefuse.environmentGate.ok &&
    unicodeRefuse.environmentGate.code === "PRODUCTION_OP_REFUSED" &&
    afterUnicode.revision === beforeUnicode.revision
  ) {
    details.push(
      "staging-cms unicode/tab-padded matching production → providerMutateCount=0",
    );
  } else {
    passed = false;
    details.push(
      `Unicode production refuse unexpectedly mutate=${unicodeRefuse.providerMutateCount} gate=${JSON.stringify(unicodeRefuse.environmentGate)}`,
    );
  }

  // H9: lease-expire race — T0 OK, T1 expired refuses mutate.
  const leaseExpires = new Date(Date.parse(nowIso) + 120_000).toISOString();
  const t1 = new Date(Date.parse(nowIso) + 300_000).toISOString();
  const raceT0 = evaluateCmsEnvironmentMutateWithLease({
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    operation: "publish",
    leaseExpiresAtIso: leaseExpires,
    nowIso,
  });
  const raceT1 = evaluateCmsEnvironmentMutateWithLease({
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    operation: "publish",
    leaseExpiresAtIso: leaseExpires,
    nowIso: t1,
  });
  if (
    raceT0.allowed === true &&
    raceT1.allowed === false &&
    raceT1.code === "LEASE_EXPIRED" &&
    raceT1.providerMutateAllowed === false
  ) {
    details.push(
      "Lease-expire race: T0 staging+valid lease OK; T1 expired → LEASE_EXPIRED (no mutate)",
    );
  } else {
    passed = false;
    details.push(
      `Lease race unexpectedly t0=${JSON.stringify(raceT0)} t1=${JSON.stringify(raceT1)}`,
    );
  }

  const beforeLease = cms.getPage("page-pilot-tx007")!;
  const leaseRefuse = cms.applyChange({
    changeId: `chg-lease-${randomUUID().slice(0, 8)}`,
    missionId: "mis-tx007-lease",
    pageId: "page-pilot-tx007",
    desiredFields: {
      title: "Should not land after lease expire",
      metaDescription: "blocked",
      h1: "blocked",
      bodyExcerpt: "blocked",
    },
    nowIso: t1,
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    leaseExpiresAtIso: leaseExpires,
  });
  const afterLease = cms.getPage("page-pilot-tx007")!;
  if (
    leaseRefuse.providerMutateCount === 0 &&
    leaseRefuse.leaseGate?.allowed === false &&
    leaseRefuse.leaseGate.code === "LEASE_EXPIRED" &&
    afterLease.revision === beforeLease.revision
  ) {
    details.push(
      "staging-cms lease-expire race → providerMutateCount=0; page unchanged",
    );
  } else {
    passed = false;
    details.push(
      `Lease apply unexpectedly mutate=${leaseRefuse.providerMutateCount} leaseGate=${JSON.stringify(leaseRefuse.leaseGate)}`,
    );
  }

  // H12: exact boundary lease + invalid lease via staging-cms → mutate count 0.
  const exactNow = t1;
  const exactRefuse = cms.applyChange({
    changeId: `chg-lease-exact-${randomUUID().slice(0, 8)}`,
    missionId: "mis-tx007-lease-exact",
    pageId: "page-pilot-tx007",
    desiredFields: {
      title: "Exact boundary should not land",
      metaDescription: "blocked",
      h1: "blocked",
      bodyExcerpt: "blocked",
    },
    nowIso: exactNow,
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    leaseExpiresAtIso: exactNow,
  });
  if (
    exactRefuse.providerMutateCount === 0 &&
    exactRefuse.leaseGate?.allowed === false &&
    exactRefuse.leaseGate.code === "LEASE_EXPIRED"
  ) {
    details.push(
      "H12 exact-boundary lease via staging-cms → providerMutateCount=0",
    );
  } else {
    passed = false;
    details.push(
      `Exact-boundary apply unexpectedly mutate=${exactRefuse.providerMutateCount} leaseGate=${JSON.stringify(exactRefuse.leaseGate)}`,
    );
  }

  const invalidRefuse = cms.applyChange({
    changeId: `chg-lease-invalid-${randomUUID().slice(0, 8)}`,
    missionId: "mis-tx007-lease-invalid",
    pageId: "page-pilot-tx007",
    desiredFields: {
      title: "Invalid lease should not land",
      metaDescription: "blocked",
      h1: "blocked",
      bodyExcerpt: "blocked",
    },
    nowIso,
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    leaseExpiresAtIso: "not-a-timestamp",
  });
  if (
    invalidRefuse.providerMutateCount === 0 &&
    invalidRefuse.leaseGate?.allowed === false &&
    invalidRefuse.leaseGate.code === "LEASE_EXPIRED" &&
    invalidRefuse.leaseGate.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "H12 invalid lease timestamp via staging-cms → providerMutateCount=0; NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(
      `Invalid-lease apply unexpectedly mutate=${invalidRefuse.providerMutateCount} leaseGate=${JSON.stringify(invalidRefuse.leaseGate)}`,
    );
  }

  const blankLeaseRefuse = cms.applyChange({
    changeId: `chg-lease-blank-${randomUUID().slice(0, 8)}`,
    missionId: "mis-tx007-lease-blank",
    pageId: "page-pilot-tx007",
    desiredFields: {
      title: "Blank lease should not land",
      metaDescription: "blocked",
      h1: "blocked",
      bodyExcerpt: "blocked",
    },
    nowIso,
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    leaseExpiresAtIso: "  \t  ",
  });
  if (
    blankLeaseRefuse.providerMutateCount === 0 &&
    blankLeaseRefuse.leaseGate?.allowed === false &&
    blankLeaseRefuse.leaseGate.code === "LEASE_EXPIRED" &&
    blankLeaseRefuse.leaseGate.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "H13 whitespace-only lease via staging-cms → providerMutateCount=0; NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(
      `Blank-lease apply unexpectedly mutate=${blankLeaseRefuse.providerMutateCount} leaseGate=${JSON.stringify(blankLeaseRefuse.leaseGate)}`,
    );
  }

  const emptyLeaseRefuse = cms.applyChange({
    changeId: `chg-lease-empty-${randomUUID().slice(0, 8)}`,
    missionId: "mis-tx007-lease-empty",
    pageId: "page-pilot-tx007",
    desiredFields: {
      title: "Empty lease should not land",
      metaDescription: "blocked",
      h1: "blocked",
      bodyExcerpt: "blocked",
    },
    nowIso,
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    leaseExpiresAtIso: "",
  });
  if (
    emptyLeaseRefuse.providerMutateCount === 0 &&
    emptyLeaseRefuse.leaseGate?.allowed === false &&
    emptyLeaseRefuse.leaseGate.code === "LEASE_EXPIRED"
  ) {
    details.push(
      "H14 empty-string lease via staging-cms → providerMutateCount=0",
    );
  } else {
    passed = false;
    details.push(
      `Empty-lease apply unexpectedly mutate=${emptyLeaseRefuse.providerMutateCount} leaseGate=${JSON.stringify(emptyLeaseRefuse.leaseGate)}`,
    );
  }

  const zwspLeaseRefuse = cms.applyChange({
    changeId: `chg-lease-zwsp-${randomUUID().slice(0, 8)}`,
    missionId: "mis-tx007-lease-zwsp",
    pageId: "page-pilot-tx007",
    desiredFields: {
      title: "ZWSP lease should not land",
      metaDescription: "blocked",
      h1: "blocked",
      bodyExcerpt: "blocked",
    },
    nowIso,
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    leaseExpiresAtIso: "\u200b",
  });
  if (
    zwspLeaseRefuse.providerMutateCount === 0 &&
    zwspLeaseRefuse.leaseGate?.allowed === false &&
    zwspLeaseRefuse.leaseGate.code === "LEASE_EXPIRED"
  ) {
    details.push("H15 ZWSP-only lease via staging-cms → providerMutateCount=0");
  } else {
    passed = false;
    details.push(
      `ZWSP-lease apply unexpectedly mutate=${zwspLeaseRefuse.providerMutateCount} leaseGate=${JSON.stringify(zwspLeaseRefuse.leaseGate)}`,
    );
  }

  const doubleZwspLeaseRefuse = cms.applyChange({
    changeId: `chg-lease-dzwsp-${randomUUID().slice(0, 8)}`,
    missionId: "mis-tx007-lease-dzwsp",
    pageId: "page-pilot-tx007",
    desiredFields: {
      title: "double ZWSP lease should not land",
      metaDescription: "blocked",
      h1: "blocked",
      bodyExcerpt: "blocked",
    },
    nowIso,
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    leaseExpiresAtIso: "\u200b\u200b",
  });
  if (
    doubleZwspLeaseRefuse.providerMutateCount === 0 &&
    doubleZwspLeaseRefuse.leaseGate?.allowed === false &&
    doubleZwspLeaseRefuse.leaseGate.code === "LEASE_EXPIRED"
  ) {
    details.push(
      "H16 double-ZWSP-only lease via staging-cms → providerMutateCount=0",
    );
  } else {
    passed = false;
    details.push(
      `Double-ZWSP lease apply unexpectedly mutate=${doubleZwspLeaseRefuse.providerMutateCount} leaseGate=${JSON.stringify(doubleZwspLeaseRefuse.leaseGate)}`,
    );
  }

  const futureLeaseIso = "2099-01-01T00:00:00.000Z";
  const zwspPaddedIsoLeaseRefuse = cms.applyChange({
    changeId: `chg-lease-zwsp-iso-${randomUUID().slice(0, 8)}`,
    missionId: "mis-tx007-lease-zwsp-iso",
    pageId: "page-pilot-tx007",
    desiredFields: {
      title: "ZWSP-padded ISO lease should not land",
      metaDescription: "blocked",
      h1: "blocked",
      bodyExcerpt: "blocked",
    },
    nowIso,
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    leaseExpiresAtIso: `\u200b${futureLeaseIso}\u200b`,
  });
  if (
    zwspPaddedIsoLeaseRefuse.providerMutateCount === 0 &&
    zwspPaddedIsoLeaseRefuse.leaseGate?.allowed === false &&
    zwspPaddedIsoLeaseRefuse.leaseGate.code === "LEASE_EXPIRED"
  ) {
    details.push(
      "H17 ZWSP-padded valid ISO lease via staging-cms → providerMutateCount=0",
    );
  } else {
    passed = false;
    details.push(
      `ZWSP-padded ISO lease apply unexpectedly mutate=${zwspPaddedIsoLeaseRefuse.providerMutateCount} leaseGate=${JSON.stringify(zwspPaddedIsoLeaseRefuse.leaseGate)}`,
    );
  }

  const bomPaddedIsoLeaseRefuse = cms.applyChange({
    changeId: `chg-lease-bom-iso-${randomUUID().slice(0, 8)}`,
    missionId: "mis-tx007-lease-bom-iso",
    pageId: "page-pilot-tx007",
    desiredFields: {
      title: "BOM-padded ISO lease should not land",
      metaDescription: "blocked",
      h1: "blocked",
      bodyExcerpt: "blocked",
    },
    nowIso,
    boundEnvironment: CmsEnvironment.STAGING,
    intendedEnvironment: CmsEnvironment.STAGING,
    leaseExpiresAtIso: `\ufeff${futureLeaseIso}`,
  });
  if (
    bomPaddedIsoLeaseRefuse.providerMutateCount === 0 &&
    bomPaddedIsoLeaseRefuse.leaseGate?.allowed === false &&
    bomPaddedIsoLeaseRefuse.leaseGate.code === "LEASE_EXPIRED"
  ) {
    details.push(
      "H18 BOM-prefixed valid ISO lease via staging-cms → providerMutateCount=0",
    );
  } else {
    passed = false;
    details.push(
      `BOM-padded ISO lease apply unexpectedly mutate=${bomPaddedIsoLeaseRefuse.providerMutateCount} leaseGate=${JSON.stringify(bomPaddedIsoLeaseRefuse.leaseGate)}`,
    );
  }

  // Hillclimb attack suite: mismatch/unrecognized/missing/production + normalize.
  const suite = evaluateWrongCmsEnvironmentAttackSuite();
  if (suite.passed) {
    details.push(...suite.details);
  } else {
    passed = false;
    details.push(`Attack suite failed: ${suite.details.join(" | ")}`);
  }

  const leaseSuite = evaluateCmsLeaseExpireRaceAttackSuite();
  if (leaseSuite.passed) {
    details.push(...leaseSuite.details);
  } else {
    passed = false;
    details.push(`Lease race suite failed: ${leaseSuite.details.join(" | ")}`);
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
