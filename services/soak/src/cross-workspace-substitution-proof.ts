/**
 * Fixture proof for T-US-057 — cross-workspace resource substitution rejected.
 *
 * Pilot write gates refuse foreign form/page asset substitution and evidence
 * bound to unrelated resource ids. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  ActionClass,
  AdapterWiring,
  SoakProofKind,
  createFixturePilotMapping,
  createReadEvidence,
  proveFixturePilotWritePath,
  resolvePilotWriteGates,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-057 fixture ACCEPTED.
 */
export function proofCrossWorkspaceResourceSubstitution(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const { state, writePathId } = createFixturePilotMapping(nowIso);
  const proven = proveFixturePilotWritePath(state, writePathId, nowIso);

  // 1. Positive control: mapped in-workspace path passes gates.
  const ok = resolvePilotWriteGates({
    actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
    writePathId,
    channelId: "owned-site",
    assetId: "page-contact",
    operation: "submit_form_canary",
    mapping: proven,
  });
  if (ok.ownershipProven && ok.readEvidencePresent && !ok.prerequisiteMissing) {
    details.push("In-workspace mapped write path gates pass");
  } else {
    passed = false;
    details.push("Positive control write gates failed");
  }

  // 2. Form page/site substituted to foreign workspace asset.
  const wrongForm = {
    ...proven,
    forms: proven.forms.map((f) =>
      f.formId === "form-contact"
        ? { ...f, pageAssetId: "page-other-ws", siteId: "other-ws-site" }
        : f,
    ),
  };
  const formGate = resolvePilotWriteGates({
    actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
    writePathId,
    channelId: "owned-site",
    assetId: "page-contact",
    operation: "submit_form_canary",
    mapping: wrongForm,
  });
  if (
    !formGate.ownershipProven &&
    formGate.details.some((d) => /does not belong to write target/i.test(d))
  ) {
    details.push(
      "Foreign form page/site substitution rejected (ownership unproven)",
    );
  } else {
    passed = false;
    details.push("Foreign form substitution unexpectedly passed ownership");
  }

  // 3. Evidence for unrelated resource id does not unlock the path.
  const withBogusEvidence = {
    ...state,
    writePaths: state.writePaths,
    bindings: state.bindings.map((b) => ({ ...b, ownershipProven: true })),
    crmOwnership: state.crmOwnership.map((c) => ({
      ...c,
      ownershipProven: true,
    })),
    readEvidence: state.writePaths[0]!.requiredEvidenceKinds.map((kind, i) =>
      createReadEvidence({
        evidenceId: `bogus-ws-${i}`,
        writePathId,
        evidenceKind: kind,
        resourceType: "binding",
        resourceId: "not-the-mapped-binding",
        operation: "bogus",
        summary: "unrelated foreign resource",
        fixtureOnly: true,
        observedAtIso: nowIso,
        adapterWiring: AdapterWiring.FIXTURE,
      }),
    ),
  };
  const bogusGate = resolvePilotWriteGates({
    actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
    writePathId,
    channelId: "owned-site",
    assetId: "page-contact",
    operation: "submit_form_canary",
    mapping: withBogusEvidence,
  });
  if (!bogusGate.readEvidencePresent) {
    details.push(
      "Foreign evidence resourceId rejected (read evidence not present)",
    );
  } else {
    passed = false;
    details.push("Bogus foreign evidence unexpectedly satisfied gates");
  }

  // 4. Completely foreign asset/operation has no mapped write path.
  const noPath = resolvePilotWriteGates({
    actionClass: ActionClass.ROUTINE_PUBLISH,
    channelId: "foreign-ws-site",
    assetId: "page-foreign",
    operation: "publish_page",
    mapping: proven,
  });
  if (
    !noPath.ownershipProven &&
    !noPath.readEvidencePresent &&
    noPath.matchedWritePath === null
  ) {
    details.push("Foreign channel/asset has no write path — fail closed");
  } else {
    passed = false;
    details.push("Foreign channel/asset unexpectedly matched a write path");
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-ws-subst-${randomUUID()}`,
    kind: SoakProofKind.CROSS_WORKSPACE_RESOURCE_SUBSTITUTION,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-us057-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
