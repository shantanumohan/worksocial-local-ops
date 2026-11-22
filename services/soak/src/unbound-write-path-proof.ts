/**
 * Fixture proof for T-US-006 — Unbound URL: analysis ok, write blocked.
 *
 * Observe/create skip pilot write gates; unmapped write paths fail closed
 * with prerequisiteMissing. External effects: NONE.
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

  // 1. Analysis/observe on an unbound URL is allowed (gates skipped).
  const observeUnbound = resolvePilotWriteGates({
    actionClass: ActionClass.OBSERVE,
    channelId: "unbound-site",
    assetId: "page-unbound",
    operation: "fetch_page",
    mapping: proven,
  });
  if (
    !observeUnbound.prerequisiteMissing &&
    observeUnbound.matchedWritePath === null &&
    observeUnbound.details.some((d) =>
      /Observe\/create actions do not require pilot write gates/i.test(d),
    )
  ) {
    details.push(
      "Unbound URL OBSERVE → analysis ok (pilot write gates skipped)",
    );
  } else {
    passed = false;
    details.push(
      `Unbound OBSERVE unexpectedly ${JSON.stringify(observeUnbound)}`,
    );
  }

  // 2. Write to unbound URL / unmapped path fails closed.
  const writeUnbound = resolvePilotWriteGates({
    actionClass: ActionClass.ROUTINE_PUBLISH,
    channelId: "unbound-site",
    assetId: "page-unbound",
    operation: "publish_page",
    mapping: proven,
  });
  if (
    writeUnbound.prerequisiteMissing &&
    writeUnbound.matchedWritePath === null &&
    !writeUnbound.ownershipProven &&
    !writeUnbound.readEvidencePresent &&
    writeUnbound.details.some((d) =>
      /No pilot write path mapped for unbound-site\/page-unbound\/publish_page/i.test(
        d,
      ),
    )
  ) {
    details.push(
      "Unbound URL ROUTINE_PUBLISH → write blocked (prerequisiteMissing; no matched path)",
    );
  } else {
    passed = false;
    details.push(
      `Unbound write unexpectedly ${JSON.stringify(writeUnbound)}`,
    );
  }

  // 3. Positive control: mapped+proven path still passes write gates.
  const writeMapped = resolvePilotWriteGates({
    actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
    writePathId,
    channelId: "owned-site",
    assetId: "page-contact",
    operation: "submit_form_canary",
    mapping: proven,
  });
  if (
    writeMapped.ownershipProven &&
    writeMapped.readEvidencePresent &&
    !writeMapped.prerequisiteMissing &&
    writeMapped.matchedWritePath?.writePathId === writePathId
  ) {
    details.push("Mapped proven write path gates pass (positive control)");
  } else {
    passed = false;
    details.push("Positive control mapped write gates failed");
  }

  // 4. CREATE also skips gates (analysis-adjacent; no write path required).
  const createUnbound = resolvePilotWriteGates({
    actionClass: ActionClass.CREATE,
    channelId: "unbound-site",
    assetId: "page-unbound",
    operation: "draft_note",
    mapping: proven,
  });
  if (!createUnbound.prerequisiteMissing) {
    details.push("CREATE on unbound URL skips pilot write gates");
  } else {
    passed = false;
    details.push("CREATE unexpectedly required pilot write gates");
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
