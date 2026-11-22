/**
 * Fixture proof for T-US-006 — Unbound URL: analysis ok, write blocked.
 * External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  ActionClass,
  SoakProofKind,
  createFixturePilotMapping,
  proveFixturePilotWritePath,
  resolvePilotWriteGates,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-006 fixture ACCEPTED.
 */
export function proofUnboundWritePathFailClosed(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const { state, writePathId } = createFixturePilotMapping(nowIso);

  // Analysis/observe on unbound URL remains allowed.
  const observe = resolvePilotWriteGates({
    actionClass: ActionClass.OBSERVE,
    channelId: "owned-site",
    assetId: "page-unbound",
    operation: "fetch_page",
    mapping: state,
  });
  if (
    observe.prerequisiteMissing === false &&
    observe.matchedWritePath === null
  ) {
    details.push(
      "OBSERVE on unbound URL → analysis ok (prerequisiteMissing=false)",
    );
  } else {
    passed = false;
    details.push(`OBSERVE unexpectedly ${JSON.stringify(observe)}`);
  }

  const create = resolvePilotWriteGates({
    actionClass: ActionClass.CREATE,
    channelId: "owned-site",
    assetId: "page-unbound",
    operation: "draft_analysis",
    mapping: state,
  });
  if (
    create.prerequisiteMissing === false &&
    create.matchedWritePath === null
  ) {
    details.push(
      "CREATE on unbound URL → analysis ok (prerequisiteMissing=false)",
    );
  } else {
    passed = false;
    details.push(`CREATE unexpectedly ${JSON.stringify(create)}`);
  }

  // Write to unbound path fails closed.
  const unboundWrite = resolvePilotWriteGates({
    actionClass: ActionClass.ROUTINE_PUBLISH,
    channelId: "owned-site",
    assetId: "page-unbound",
    operation: "publish_page",
    mapping: state,
  });
  if (
    unboundWrite.matchedWritePath === null &&
    unboundWrite.ownershipProven === false &&
    unboundWrite.readEvidencePresent === false &&
    unboundWrite.prerequisiteMissing === true &&
    unboundWrite.details.some((d) => /No pilot write path mapped/.test(d))
  ) {
    details.push(
      "ROUTINE_PUBLISH unbound URL → write blocked (matchedWritePath=null prerequisiteMissing=true)",
    );
  } else {
    passed = false;
    details.push(`Unbound write unexpectedly ${JSON.stringify(unboundWrite)}`);
  }

  // Wrong asset on a known channel also fails closed when writePathId does not match.
  const wrongAsset = resolvePilotWriteGates({
    actionClass: ActionClass.ROUTINE_PUBLISH,
    writePathId,
    channelId: "owned-site",
    assetId: "page-other",
    operation: "publish_page",
    mapping: state,
  });
  if (
    wrongAsset.matchedWritePath === null &&
    wrongAsset.prerequisiteMissing === true
  ) {
    details.push(
      "Write path id present but asset/operation unbound → write blocked",
    );
  } else {
    passed = false;
    details.push(`Wrong-asset write unexpectedly ${JSON.stringify(wrongAsset)}`);
  }

  // Positive control: proven mapped path passes gates.
  const proven = proveFixturePilotWritePath(state, writePathId, nowIso);
  const bound = resolvePilotWriteGates({
    actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
    writePathId,
    channelId: "owned-site",
    assetId: "page-contact",
    operation: "submit_form_canary",
    mapping: proven,
  });
  if (
    bound.matchedWritePath?.writePathId === writePathId &&
    bound.ownershipProven === true &&
    bound.readEvidencePresent === true &&
    bound.prerequisiteMissing === false
  ) {
    details.push(
      "Proven mapped write path → gates pass (positive control; not live)",
    );
  } else {
    passed = false;
    details.push(`Bound write unexpectedly ${JSON.stringify(bound)}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-unbound-write-${randomUUID()}`,
    kind: SoakProofKind.UNBOUND_WRITE_PATH_FAIL_CLOSED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-us006-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
