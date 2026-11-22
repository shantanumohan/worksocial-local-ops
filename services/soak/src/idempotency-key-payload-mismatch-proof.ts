/**
 * Fixture proof for T-X022 — idempotency key payload mismatch → Conflict.
 * Same businessIdempotencyKey / operationId with a different payloadDigest is
 * refused through durable acceptPending; apply_count stays 1; no second remote
 * effect. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  type SoakProofRecord,
} from "@worksocial/domain";
import {
  createDurableExecutionService,
  createFileDurableStores,
  newJobId,
  type AcceptPendingInput,
  type DurableExecutionService,
} from "@worksocial/persistence";

function decisionFields(
  operationId: string,
  payloadDigest: string,
  nowIso: string,
): AcceptPendingInput["decision"] {
  return {
    decisionId: `dec-${operationId}-${payloadDigest.slice(0, 8)}`,
    operationId,
    payloadDigest,
    allowed: true,
    code: null,
    reason: "soak T-X022",
    grantId: "grant-soak",
    policyId: "pol-soak",
    decidedAtIso: nowIso,
    writePathId: "wp-soak",
    gateDetails: ["idempotency_key_payload_mismatch"],
  };
}

function jobFields(operationId: string, idem: string) {
  return {
    jobId: newJobId(),
    roleId: "A19" as const,
    workflowId: `wf-${operationId}`,
    siteId: "site-soak",
    assetId: "asset-soak",
    trigger: "soak_harness",
    policyVersion: "m9",
    inputArtifactIds: [] as string[],
    capabilityGrantId: "grant-soak",
    sourceRevision: "rev-soak",
    maxAttempts: 2,
    deadlineSeconds: 600,
    idempotencyKey: idem,
    expectedOutcome: "verified_publish",
  };
}

async function accept(
  svc: DurableExecutionService,
  input: {
    operationId: string;
    bizKey: string;
    digest: string;
    idem: string;
    nowIso: string;
  },
) {
  return svc.acceptPending({
    job: jobFields(input.operationId, input.idem),
    operationId: input.operationId,
    payloadDigest: input.digest,
    businessIdempotencyKey: input.bizKey,
    decision: decisionFields(input.operationId, input.digest, input.nowIso),
    nowIso: input.nowIso,
  });
}

/**
 * Complete expected proof set for T-X022 fixture ACCEPTED.
 * Exercises durable acceptPending (not direct fakeProvider-only).
 */
export async function proofIdempotencyKeyPayloadMismatch(
  stateDir: string,
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  let passed = true;
  const suffix = randomUUID();
  const operationId = `soak-idem-mismatch-${suffix}`;
  const bizKey = `biz-soak-idem-mismatch-${suffix}`;
  const digestA = `digest-a-${suffix}`;
  const digestB = `digest-b-${suffix}`;
  const idem = `soak/idem-mismatch/${suffix}`;

  const svc = createDurableExecutionService(createFileDurableStores(stateDir));

  const first = await accept(svc, {
    operationId,
    bizKey,
    digest: digestA,
    idem,
    nowIso,
  });
  if (first.providerCreated !== true || first.applyAttemptCount !== 1) {
    passed = false;
    details.push(
      `First accept unexpected created=${first.providerCreated} applyCount=${first.applyAttemptCount}`,
    );
  } else {
    details.push(
      `acceptPending bound key with digest A applyCount=1 remoteRef=${first.provider.remoteRef}`,
    );
  }

  let sameOpConflict = false;
  try {
    await accept(svc, {
      operationId,
      bizKey,
      digest: digestB,
      idem,
      nowIso,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/payload mismatch|different payload digest/i.test(msg)) {
      sameOpConflict = true;
      details.push(
        "acceptPending same operationId + different payloadDigest → Conflict",
      );
    } else {
      passed = false;
      details.push(`Same-op unexpected throw: ${msg}`);
    }
  }
  if (!sameOpConflict) {
    passed = false;
    details.push("Expected same-operation digest Conflict was not thrown");
  }

  const altOp = `${operationId}-alt`;
  let sameKeyConflict = false;
  try {
    await accept(svc, {
      operationId: altOp,
      bizKey,
      digest: digestB,
      idem: `${idem}-alt`,
      nowIso,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/different payload digest|payload mismatch/i.test(msg)) {
      sameKeyConflict = true;
      details.push(
        "acceptPending same businessIdempotencyKey + different payloadDigest → Conflict",
      );
    } else {
      passed = false;
      details.push(`Same-key unexpected throw: ${msg}`);
    }
  }
  if (!sameKeyConflict) {
    passed = false;
    details.push("Expected same-business-key digest Conflict was not thrown");
  }

  const after = await svc.stores.fakeProvider.getByBusinessKey(bizKey);
  if (
    !after ||
    after.applyCount !== 1 ||
    after.payloadDigest !== digestA ||
    after.remoteRef !== first.provider.remoteRef
  ) {
    passed = false;
    details.push(
      `Post-conflict state polluted: applyCount=${after?.applyCount} digest=${after?.payloadDigest}`,
    );
  } else {
    details.push(
      "Post-conflict: applyCount=1; original digest/remoteRef retained; no second effect",
    );
  }

  const replay = await accept(svc, {
    operationId,
    bizKey,
    digest: digestA,
    idem,
    nowIso,
  });
  if (replay.providerCreated !== false || replay.applyAttemptCount !== 1) {
    passed = false;
    details.push(
      `Same-digest replay unexpected created=${replay.providerCreated} applyCount=${replay.applyAttemptCount}`,
    );
  } else {
    details.push("Same-digest acceptPending replay: created=false applyCount=1");
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-idem-mismatch-${operationId}`,
    kind: SoakProofKind.IDEMPOTENCY_KEY_PAYLOAD_MISMATCH,
    passed: passed && sameOpConflict && sameKeyConflict,
    details,
    applyAttemptCount: after?.applyCount ?? first.applyAttemptCount,
    operationId,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
