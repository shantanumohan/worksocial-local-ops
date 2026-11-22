/**
 * Fixture proof for T-US-006 — Unbound URL: analysis ok, write blocked.
 *
 * Observe/create may proceed without a mapped write path; unbound write
 * targets fail closed via resolvePilotWriteGates. External effects: NONE.
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
  const proven = proveFixturePilotWritePath(state, writePathId, nowIso);

  // 1. Analysis/observe on unbound URL — ok without a mapped write path.
  const observe = resolvePilotWriteGates({
    actionClass: ActionClass.OBSERVE,
    channelId: "unbound-site",
    assetId: "page-unbound",
    operation: "fetch_page",
    mapping: proven,
  });
  if (
    observe.ownershipProven &&
    observe.readEvidencePresent &&
    !observe.prerequisiteMissing &&
    observe.matchedWritePath === null &&
    observe.details.some((d) => /do not require pilot write gates/i.test(d))
  ) {
    details.push(
      "Unbound URL OBSERVE/analysis ok without mapped write path",
    );
  } else {
    passed = false;
    details.push(`OBSERVE unexpectedly ${JSON.stringify(observe)}`);
  }

  // 2. Create-class action also skips write gates (analysis scaffolding).
  const create = resolvePilotWriteGates({
    actionClass: ActionClass.CREATE,
    channelId: "unbound-site",
    assetId: "page-unbound",
    operation: "draft_note",
    mapping: proven,
  });
  if (
    create.ownershipProven &&
    !create.prerequisiteMissing &&
    create.matchedWritePath === null
  ) {
    details.push("CREATE scaffolding ok without mapped write path");
  } else {
    passed = false;
    details.push(`CREATE unexpectedly ${JSON.stringify(create)}`);
  }

  // 3. Unbound write — no path mapped → fail closed.
  const unboundWrite = resolvePilotWriteGates({
    actionClass: ActionClass.ROUTINE_PUBLISH,
    channelId: "unbound-site",
    assetId: "page-unbound",
    operation: "publish_page",
    mapping: proven,
  });
  if (
    !unboundWrite.ownershipProven &&
    !unboundWrite.readEvidencePresent &&
    unboundWrite.prerequisiteMissing &&
    unboundWrite.matchedWritePath === null &&
    unboundWrite.details.some((d) => /No pilot write path mapped/i.test(d))
  ) {
    details.push(
      "Unbound URL write blocked — no pilot write path; fail closed",
    );
  } else {
    passed = false;
    details.push(`Unbound write unexpectedly ${JSON.stringify(unboundWrite)}`);
  }

  // 4. Positive control: mapped+proven path still passes.
  const mapped = resolvePilotWriteGates({
    actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
    writePathId,
    channelId: "owned-site",
    assetId: "page-contact",
    operation: "submit_form_canary",
    mapping: proven,
  });
  if (
    mapped.ownershipProven &&
    mapped.readEvidencePresent &&
    !mapped.prerequisiteMissing &&
    mapped.matchedWritePath?.writePathId === writePathId
  ) {
    details.push("Mapped in-workspace write path gates pass (positive control)");
  } else {
    passed = false;
    details.push("Positive control mapped write gates failed");
  }

  // 5. Mapped path without ownership/evidence still blocks write.
  const unprovenMapped = resolvePilotWriteGates({
    actionClass: ActionClass.ROUTINE_PUBLISH,
    writePathId,
    channelId: "owned-site",
    assetId: "page-contact",
    operation: "submit_form_canary",
    mapping: state,
  });
  if (
    unprovenMapped.matchedWritePath?.writePathId === writePathId &&
    unprovenMapped.prerequisiteMissing &&
    !unprovenMapped.ownershipProven
  ) {
    details.push(
      "Mapped but unproven path remains blocked (ownership/evidence missing)",
    );
  } else {
    passed = false;
    details.push(
      `Unproven mapped write unexpectedly ${JSON.stringify(unprovenMapped)}`,
    );
  }

  details.push(
    "No gateway submitIntent/apply — gate-only deny; applyAttemptCount=0",
  );
  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-unbound-write-${randomUUID()}`,
    kind: SoakProofKind.UNBOUND_WRITE_PATH_FAIL_CLOSED,
    passed,
    details,
    // Gate-only proof: unbound write never reaches submitIntent/apply.
    applyAttemptCount: 0,
    operationId: `op-us006-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
