/**
 * Fixture proof for T-X022 — idempotency key payload mismatch → Conflict.
 * Same businessIdempotencyKey / operationId with a different payloadDigest is
 * refused through durable acceptPending (ACCEPTED_PENDING and VERIFIED paths);
 * apply_count stays 1; no second remote effect. Decision/effect/provider stores
 * retain the original digest. Live provider wiring: NOT_WIRED. External
 * effects: NONE. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  type SoakProofRecord,
} from "@worksocial/domain";
import {
  createDurableExecutionService,
  createFileDurableStores,
  IDEMPOTENCY_PAYLOAD_MISMATCH_ADS_SOFT_SKIP,
  IDEMPOTENCY_PAYLOAD_MISMATCH_LIVE_WIRING,
  isIdempotencyPayloadMismatchError,
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

async function expectMismatchConflict(
  label: string,
  details: string[],
  fn: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await fn();
    details.push(`${label}: expected Conflict was not thrown`);
    return false;
  } catch (err) {
    if (isIdempotencyPayloadMismatchError(err)) {
      details.push(`${label} → Conflict`);
      return true;
    }
    const msg = err instanceof Error ? err.message : String(err);
    details.push(`${label}: unexpected throw: ${msg}`);
    return false;
  }
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
  const digestWs = `digest-a-${suffix} `;
  const digestCase = digestA.toUpperCase();
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
  if (first.decision.outcome !== "ACCEPTED_PENDING") {
    passed = false;
    details.push(
      `First accept unexpected outcome=${first.decision.outcome} (expected ACCEPTED_PENDING ≠ VERIFIED)`,
    );
  }

  const sameOpConflict = await expectMismatchConflict(
    "acceptPending same operationId + different payloadDigest",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: digestB,
        idem,
        nowIso,
      }),
  );
  if (!sameOpConflict) passed = false;

  const altOp = `${operationId}-alt`;
  const sameKeyConflict = await expectMismatchConflict(
    "acceptPending same businessIdempotencyKey + different payloadDigest",
    details,
    () =>
      accept(svc, {
        operationId: altOp,
        bizKey,
        digest: digestB,
        idem: `${idem}-alt`,
        nowIso,
      }),
  );
  if (!sameKeyConflict) passed = false;

  const altEffect = await svc.stores.effects.get(altOp);
  const altDecision = await svc.stores.decisions.get(altOp);
  const effectList = await svc.stores.effects.list();
  const orphanDigestB = effectList.some(
    (e) =>
      e.payloadDigest === digestB ||
      (e.businessIdempotencyKey === bizKey && e.operationId === altOp),
  );
  const altJob = await svc.stores.jobs.getByIdempotencyKey(`${idem}-alt`);
  if (altEffect != null || altDecision != null || orphanDigestB || altJob != null) {
    passed = false;
    details.push(
      `Alt-op partial write after Conflict: effect=${altEffect?.payloadDigest ?? "none"} decision=${altDecision?.outcome ?? "none"} orphanDigestB=${orphanDigestB} altJob=${altJob?.jobId ?? "none"}`,
    );
  } else {
    details.push(
      "Alt-op Conflict left no orphan effect/decision/job (digest B not recorded)",
    );
  }

  const wsConflict = await expectMismatchConflict(
    "acceptPending whitespace-distinct payloadDigest",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: digestWs,
        idem,
        nowIso,
      }),
  );
  if (!wsConflict) passed = false;

  const emptyConflict = await expectMismatchConflict(
    "acceptPending empty payloadDigest",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: "",
        idem,
        nowIso,
      }),
  );
  if (!emptyConflict) passed = false;

  const nulConflict = await expectMismatchConflict(
    "acceptPending NUL-suffix payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `${digestA}\0`,
        idem,
        nowIso,
      }),
  );
  if (!nulConflict) passed = false;

  const caseConflict =
    digestCase !== digestA
      ? await expectMismatchConflict(
          "acceptPending case-distinct payloadDigest (byte-exact)",
          details,
          () =>
            accept(svc, {
              operationId,
              bizKey,
              digest: digestCase,
              idem,
              nowIso,
            }),
        )
      : true;
  if (!caseConflict) passed = false;

  // Concurrent multi-alt digest-B barrage — all Conflict; no orphans; applyCount=1.
  const barrageN = 8;
  const barrageIds = Array.from(
    { length: barrageN },
    (_, i) => `${operationId}-barrage-${i}`,
  );
  const barrageResults = await Promise.all(
    barrageIds.map((opId) =>
      accept(svc, {
        operationId: opId,
        bizKey,
        digest: digestB,
        idem: `${idem}-barrage-${opId.slice(-8)}`,
        nowIso,
      })
        .then(() => ({ opId, ok: false as const }))
        .catch((err) => ({
          opId,
          ok: isIdempotencyPayloadMismatchError(err) as boolean,
        })),
    ),
  );
  const barrageAllConflict = barrageResults.every((r) => r.ok);
  const barrageOrphans = (
    await Promise.all(barrageIds.map((id) => svc.stores.effects.get(id)))
  ).some((e) => e != null);
  if (!barrageAllConflict || barrageOrphans) {
    passed = false;
    details.push(
      `Concurrent digest-B barrage failed: conflicts=${barrageResults.filter((r) => r.ok).length}/${barrageN} orphans=${barrageOrphans}`,
    );
  } else {
    details.push(
      `Concurrent ${barrageN}-way digest-B accepts → all Conflict; no orphan intents; applyCount stays 1`,
    );
  }

  // Negative control: same digest + new operationId is provider replay, not Conflict.
  const sameDigestNewOp = await accept(svc, {
    operationId: `${operationId}-same-digest`,
    bizKey,
    digest: digestA,
    idem: `${idem}-same-digest`,
    nowIso,
  });
  if (
    sameDigestNewOp.providerCreated !== false ||
    sameDigestNewOp.provider.applyCount !== 1 ||
    sameDigestNewOp.provider.remoteRef !== first.provider.remoteRef ||
    sameDigestNewOp.provider.payloadDigest !== digestA
  ) {
    passed = false;
    details.push(
      `Same-digest new-op unexpected created=${sameDigestNewOp.providerCreated} providerApplyCount=${sameDigestNewOp.provider.applyCount}`,
    );
  } else {
    details.push(
      "Same-digest new operationId control: created=false providerApplyCount=1 (replay, not Conflict)",
    );
  }

  const afterPending = await svc.stores.fakeProvider.getByBusinessKey(bizKey);
  const decisionPending = await svc.stores.decisions.get(operationId);
  const effectPending = await svc.stores.effects.get(operationId);
  if (
    !afterPending ||
    afterPending.applyCount !== 1 ||
    afterPending.payloadDigest !== digestA ||
    afterPending.remoteRef !== first.provider.remoteRef ||
    decisionPending?.payloadDigest !== digestA ||
    decisionPending?.outcome !== "ACCEPTED_PENDING" ||
    effectPending?.payloadDigest !== digestA
  ) {
    passed = false;
    details.push(
      `Post-conflict ACCEPTED_PENDING stores polluted: applyCount=${afterPending?.applyCount} providerDigest=${afterPending?.payloadDigest} decisionDigest=${decisionPending?.payloadDigest} outcome=${decisionPending?.outcome} effectDigest=${effectPending?.payloadDigest}`,
    );
  } else {
    details.push(
      "Post-conflict ACCEPTED_PENDING: applyCount=1; decision/effect/provider retain digest A; outcome ACCEPTED_PENDING≠VERIFIED; no second effect",
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

  const verified = await svc.verifyIndependent({
    operationId,
    observedDigest: digestA,
    nowIso,
  });
  if (verified.decision.outcome !== "VERIFIED" || verified.applyAttemptCount !== 1) {
    passed = false;
    details.push(
      `verifyIndependent unexpected outcome=${verified.decision.outcome} applyCount=${verified.applyAttemptCount}`,
    );
  } else {
    details.push("verifyIndependent → VERIFIED applyCount=1 (ack≠verified until independent read)");
  }

  const verifiedPathConflict = await expectMismatchConflict(
    "acceptPending after VERIFIED + different payloadDigest",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: digestB,
        idem,
        nowIso,
      }),
  );
  if (!verifiedPathConflict) passed = false;

  const afterVerified = await svc.stores.fakeProvider.getByBusinessKey(bizKey);
  const decisionVerified = await svc.stores.decisions.get(operationId);
  if (
    !afterVerified ||
    afterVerified.applyCount !== 1 ||
    afterVerified.payloadDigest !== digestA ||
    afterVerified.remoteRef !== first.provider.remoteRef ||
    decisionVerified?.payloadDigest !== digestA ||
    decisionVerified?.outcome !== "VERIFIED"
  ) {
    passed = false;
    details.push(
      `Post-VERIFIED-conflict stores polluted: applyCount=${afterVerified?.applyCount} digest=${afterVerified?.payloadDigest} outcome=${decisionVerified?.outcome}`,
    );
  } else {
    details.push(
      "Post-VERIFIED-conflict: applyCount=1; original digest/remoteRef retained; outcome stays VERIFIED (fixture ACCEPTED≠live VERIFIED)",
    );
  }

  // Receipt integrity: no digest-B observations recorded after Conflicts.
  const receipts = await svc.stores.receipts.listForOperation(operationId);
  const receiptDigestB = receipts.some((r) => r.observedDigest === digestB);
  const receiptHasA = receipts.some((r) => r.observedDigest === digestA);
  if (receiptDigestB || !receiptHasA) {
    passed = false;
    details.push(
      `Receipt integrity failed: hasDigestA=${receiptHasA} hasDigestB=${receiptDigestB} count=${receipts.length}`,
    );
  } else {
    details.push(
      "Receipt integrity: provider_ack/verification retain digest A only; no digest-B receipts",
    );
  }

  // Re-verify after VERIFIED-path Conflict — still applyCount=1.
  const reverify = await svc.verifyIndependent({
    operationId,
    observedDigest: digestA,
    nowIso,
  });
  if (
    reverify.decision.outcome !== "VERIFIED" ||
    reverify.applyAttemptCount !== 1 ||
    reverify.matched !== true
  ) {
    passed = false;
    details.push(
      `Re-verify after Conflict unexpected outcome=${reverify.decision.outcome} applyCount=${reverify.applyAttemptCount} matched=${reverify.matched}`,
    );
  } else {
    details.push(
      "Re-verify after VERIFIED Conflict: outcome VERIFIED applyCount=1 matched=true",
    );
  }

  details.push(
    `liveProviderSuccessClaimed=false liveProviderWiring=${IDEMPOTENCY_PAYLOAD_MISMATCH_LIVE_WIRING} externalEffects=NONE ACCEPTED≠VERIFIED chatgptAdsConnectSoftSkip=${IDEMPOTENCY_PAYLOAD_MISMATCH_ADS_SOFT_SKIP.join(",")} ACCESS_BLOCKED`,
  );
  if (IDEMPOTENCY_PAYLOAD_MISMATCH_LIVE_WIRING !== "NOT_WIRED") {
    passed = false;
    details.push("liveProviderWiring must be NOT_WIRED");
  }

  return {
    proofId: `proof-idem-mismatch-${operationId}`,
    kind: SoakProofKind.IDEMPOTENCY_KEY_PAYLOAD_MISMATCH,
    passed:
      passed &&
      sameOpConflict &&
      sameKeyConflict &&
      wsConflict &&
      emptyConflict &&
      nulConflict &&
      caseConflict &&
      barrageAllConflict &&
      !barrageOrphans &&
      verifiedPathConflict,
    details,
    applyAttemptCount: afterVerified?.applyCount ?? first.applyAttemptCount,
    operationId,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
