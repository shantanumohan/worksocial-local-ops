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

  const tabConflict = await expectMismatchConflict(
    "acceptPending tab-padded payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `${digestA}\t`,
        idem,
        nowIso,
      }),
  );
  if (!tabConflict) passed = false;

  const crlfConflict = await expectMismatchConflict(
    "acceptPending CRLF-padded payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `${digestA}\r\n`,
        idem,
        nowIso,
      }),
  );
  if (!crlfConflict) passed = false;

  const leadingPadConflict = await expectMismatchConflict(
    "acceptPending leading-space-padded payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: ` ${digestA}`,
        idem,
        nowIso,
      }),
  );
  if (!leadingPadConflict) passed = false;

  const nbspConflict = await expectMismatchConflict(
    "acceptPending NBSP-padded payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `${digestA}\u00a0`,
        idem,
        nowIso,
      }),
  );
  if (!nbspConflict) passed = false;

  const zwspConflict = await expectMismatchConflict(
    "acceptPending ZWSP-padded payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `${digestA}\u200b`,
        idem,
        nowIso,
      }),
  );
  if (!zwspConflict) passed = false;

  const prefixConflict = await expectMismatchConflict(
    "acceptPending prefix-distinct payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `x${digestA}`,
        idem,
        nowIso,
      }),
  );
  if (!prefixConflict) passed = false;

  const suffixConflict = await expectMismatchConflict(
    "acceptPending suffix-distinct payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `${digestA}-x`,
        idem,
        nowIso,
      }),
  );
  if (!suffixConflict) passed = false;

  const bomConflict = await expectMismatchConflict(
    "acceptPending BOM-prefixed payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `\ufeff${digestA}`,
        idem,
        nowIso,
      }),
  );
  if (!bomConflict) passed = false;

  const doubleSpaceConflict = await expectMismatchConflict(
    "acceptPending double-space-padded payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `${digestA}  `,
        idem,
        nowIso,
      }),
  );
  if (!doubleSpaceConflict) passed = false;

  const vtConflict = await expectMismatchConflict(
    "acceptPending VT-padded payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `${digestA}\v`,
        idem,
        nowIso,
      }),
  );
  if (!vtConflict) passed = false;

  const ffConflict = await expectMismatchConflict(
    "acceptPending FF-padded payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `${digestA}\f`,
        idem,
        nowIso,
      }),
  );
  if (!ffConflict) passed = false;

  const lsConflict = await expectMismatchConflict(
    "acceptPending LS-padded payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `${digestA}\u2028`,
        idem,
        nowIso,
      }),
  );
  if (!lsConflict) passed = false;

  const crOnlyConflict = await expectMismatchConflict(
    "acceptPending CR-only-padded payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `${digestA}\r`,
        idem,
        nowIso,
      }),
  );
  if (!crOnlyConflict) passed = false;

  const psConflict = await expectMismatchConflict(
    "acceptPending PS-padded payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `${digestA}\u2029`,
        idem,
        nowIso,
      }),
  );
  if (!psConflict) passed = false;

  const midNulConflict = await expectMismatchConflict(
    "acceptPending mid-NUL payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `${digestA.slice(0, Math.max(1, digestA.length - 1))}\0${digestA.slice(-1)}`,
        idem,
        nowIso,
      }),
  );
  if (!midNulConflict) passed = false;

  const softHyphenConflict = await expectMismatchConflict(
    "acceptPending soft-hyphen-padded payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `${digestA}\u00ad`,
        idem,
        nowIso,
      }),
  );
  if (!softHyphenConflict) passed = false;

  const lrmConflict = await expectMismatchConflict(
    "acceptPending LRM-padded payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `\u200e${digestA}`,
        idem,
        nowIso,
      }),
  );
  if (!lrmConflict) passed = false;

  const rlmConflict = await expectMismatchConflict(
    "acceptPending RLM-padded payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `${digestA}\u200f`,
        idem,
        nowIso,
      }),
  );
  if (!rlmConflict) passed = false;

  const zwnjConflict = await expectMismatchConflict(
    "acceptPending ZWNJ-padded payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `${digestA}\u200c`,
        idem,
        nowIso,
      }),
  );
  if (!zwnjConflict) passed = false;

  const zwjConflict = await expectMismatchConflict(
    "acceptPending ZWJ-padded payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `${digestA}\u200d`,
        idem,
        nowIso,
      }),
  );
  if (!zwjConflict) passed = false;

  const wjConflict = await expectMismatchConflict(
    "acceptPending WJ-padded payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: `${digestA}\u2060`,
        idem,
        nowIso,
      }),
  );
  if (!wjConflict) passed = false;

  const digestThinSpace = `${digestA}\u2009`;
  const thinSpaceConflict = await expectMismatchConflict(
    "acceptPending thin-space-padded payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: digestThinSpace,
        idem,
        nowIso,
      }),
  );
  if (!thinSpaceConflict) passed = false;

  const digestHairSpace = `${digestA}\u200A`;
  const hairSpaceConflict = await expectMismatchConflict(
    "acceptPending hair-space-padded payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: digestHairSpace,
        idem,
        nowIso,
      }),
  );
  if (!hairSpaceConflict) passed = false;

  const digestNnbsp = `${digestA}\u202F`;
  const nnbspConflict = await expectMismatchConflict(
    "acceptPending NNBSP-padded payloadDigest (byte-exact)",
    details,
    () =>
      accept(svc, {
        operationId,
        bizKey,
        digest: digestNnbsp,
        idem,
        nowIso,
      }),
  );
  if (!nnbspConflict) passed = false;

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

  // Concurrent same-operationId digest-B race — all Conflict; applyCount stays 1.
  const sameOpRaceN = 6;
  const sameOpRaceResults = await Promise.all(
    Array.from({ length: sameOpRaceN }, (_, i) =>
      accept(svc, {
        operationId,
        bizKey,
        digest: digestB,
        idem,
        nowIso,
      })
        .then(() => ({ ok: false as const, i }))
        .catch((err) => ({
          ok: isIdempotencyPayloadMismatchError(err) as boolean,
          i,
        })),
    ),
  );
  const sameOpRaceAllConflict = sameOpRaceResults.every((r) => r.ok);
  const afterSameOpRace = await svc.stores.fakeProvider.getByBusinessKey(bizKey);
  const decisionAfterSameOpRace = await svc.stores.decisions.get(operationId);
  if (
    !sameOpRaceAllConflict ||
    afterSameOpRace?.applyCount !== 1 ||
    afterSameOpRace.payloadDigest !== digestA ||
    decisionAfterSameOpRace?.outcome !== "ACCEPTED_PENDING" ||
    decisionAfterSameOpRace.payloadDigest !== digestA
  ) {
    passed = false;
    details.push(
      `Concurrent same-operationId digest-B race failed: conflicts=${sameOpRaceResults.filter((r) => r.ok).length}/${sameOpRaceN} applyCount=${afterSameOpRace?.applyCount} outcome=${decisionAfterSameOpRace?.outcome}`,
    );
  } else {
    details.push(
      `Concurrent ${sameOpRaceN}-way same-operationId digest-B race → all Conflict; applyCount=1; ACCEPTED_PENDING retains digest A`,
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

  // Positive control: concurrent same-digest new-ops all succeed; applyCount stays 1.
  const sameDigestN = 4;
  const sameDigestIds = Array.from(
    { length: sameDigestN },
    (_, i) => `${operationId}-same-digest-c-${i}`,
  );
  const sameDigestConcurrent = await Promise.all(
    sameDigestIds.map((opId) =>
      accept(svc, {
        operationId: opId,
        bizKey,
        digest: digestA,
        idem: `${idem}-same-c-${opId.slice(-8)}`,
        nowIso,
      })
        .then((r) => ({
          ok:
            r.providerCreated === false &&
            r.provider.applyCount === 1 &&
            r.provider.remoteRef === first.provider.remoteRef &&
            r.provider.payloadDigest === digestA,
        }))
        .catch(() => ({ ok: false })),
    ),
  );
  const sameDigestAllOk = sameDigestConcurrent.every((r) => r.ok);
  if (!sameDigestAllOk) {
    passed = false;
    details.push(
      `Concurrent same-digest positive control failed: ok=${sameDigestConcurrent.filter((r) => r.ok).length}/${sameDigestN}`,
    );
  } else {
    details.push(
      `Concurrent ${sameDigestN}-way same-digest accepts → all replay created=false applyCount=1 (not Conflict)`,
    );
  }

  // Interleaved concurrent mix: same-digest OK + digest-B Conflict; applyCount stays 1.
  const mixN = 4;
  const mixJobs = Array.from({ length: mixN * 2 }, (_, i) => {
    const mismatch = i % 2 === 0;
    const opId = `${operationId}-mix-${i}`;
    return {
      opId,
      mismatch,
      run: () =>
        accept(svc, {
          operationId: opId,
          bizKey,
          digest: mismatch ? digestB : digestA,
          idem: `${idem}-mix-${i}`,
          nowIso,
        }),
    };
  });
  const mixResults = await Promise.all(
    mixJobs.map((job) =>
      job
        .run()
        .then((r) => ({
          mismatch: job.mismatch,
          ok: job.mismatch
            ? false
            : r.providerCreated === false &&
              r.provider.applyCount === 1 &&
              r.provider.payloadDigest === digestA &&
              r.provider.remoteRef === first.provider.remoteRef,
        }))
        .catch((err) => ({
          mismatch: job.mismatch,
          ok: job.mismatch && isIdempotencyPayloadMismatchError(err),
        })),
    ),
  );
  const mixOk = mixResults.every((r) => r.ok);
  const mixOrphans = (
    await Promise.all(
      mixJobs.filter((j) => j.mismatch).map((j) => svc.stores.effects.get(j.opId)),
    )
  ).some((e) => e != null);
  const mixApply = await svc.stores.fakeProvider.getByBusinessKey(bizKey);
  if (!mixOk || mixOrphans || mixApply?.applyCount !== 1) {
    passed = false;
    details.push(
      `Interleaved concurrent mix failed: ok=${mixResults.filter((r) => r.ok).length}/${mixResults.length} orphans=${mixOrphans} applyCount=${mixApply?.applyCount}`,
    );
  } else {
    details.push(
      `Interleaved concurrent mix (${mixN} same-digest + ${mixN} mismatch) → replays OK + Conflicts; no orphans; applyCount=1`,
    );
  }

  // Business-key mismatch is NOT classified as T-X022 payload-mismatch Conflict.
  let bizKeyMismatchOk = false;
  try {
    await accept(svc, {
      operationId,
      bizKey: `${bizKey}-other`,
      digest: digestA,
      idem,
      nowIso,
    });
    details.push(
      "Business-key mismatch: expected throw was not raised (honesty fail)",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      /business idempotency key mismatch/i.test(msg) &&
      !isIdempotencyPayloadMismatchError(err)
    ) {
      bizKeyMismatchOk = true;
      details.push(
        "Business-key mismatch ≠ payload-mismatch Conflict (helper negative)",
      );
    } else {
      details.push(
        `Business-key mismatch unexpected classify: payloadMismatch=${isIdempotencyPayloadMismatchError(err)} msg=${msg}`,
      );
    }
  }
  if (!bizKeyMismatchOk) passed = false;

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

  // Post-VERIFIED concurrent digest-B barrage — all Conflict; outcome stays VERIFIED.
  const verifiedBarrageN = 6;
  const verifiedBarrageIds = Array.from(
    { length: verifiedBarrageN },
    (_, i) => `${operationId}-vbarrage-${i}`,
  );
  const verifiedBarrageResults = await Promise.all(
    verifiedBarrageIds.map((opId) =>
      accept(svc, {
        operationId: opId,
        bizKey,
        digest: digestB,
        idem: `${idem}-vbarrage-${opId.slice(-8)}`,
        nowIso,
      })
        .then(() => ({ ok: false as const }))
        .catch((err) => ({
          ok: isIdempotencyPayloadMismatchError(err) as boolean,
        })),
    ),
  );
  const verifiedBarrageAllConflict = verifiedBarrageResults.every((r) => r.ok);
  const verifiedBarrageOrphans = (
    await Promise.all(verifiedBarrageIds.map((id) => svc.stores.effects.get(id)))
  ).some((e) => e != null);
  const afterVerifiedBarrage = await svc.stores.fakeProvider.getByBusinessKey(
    bizKey,
  );
  const decisionAfterVerifiedBarrage = await svc.stores.decisions.get(
    operationId,
  );
  if (
    !verifiedBarrageAllConflict ||
    verifiedBarrageOrphans ||
    afterVerifiedBarrage?.applyCount !== 1 ||
    decisionAfterVerifiedBarrage?.outcome !== "VERIFIED"
  ) {
    passed = false;
    details.push(
      `Post-VERIFIED concurrent barrage failed: conflicts=${verifiedBarrageResults.filter((r) => r.ok).length}/${verifiedBarrageN} orphans=${verifiedBarrageOrphans} applyCount=${afterVerifiedBarrage?.applyCount} outcome=${decisionAfterVerifiedBarrage?.outcome}`,
    );
  } else {
    details.push(
      `Post-VERIFIED concurrent ${verifiedBarrageN}-way digest-B accepts → all Conflict; no orphans; outcome stays VERIFIED applyCount=1`,
    );
  }

  // Post-VERIFIED concurrent same-digest positive control.
  const verifiedSameN = 4;
  const verifiedSameIds = Array.from(
    { length: verifiedSameN },
    (_, i) => `${operationId}-vsame-${i}`,
  );
  const verifiedSameResults = await Promise.all(
    verifiedSameIds.map((opId) =>
      accept(svc, {
        operationId: opId,
        bizKey,
        digest: digestA,
        idem: `${idem}-vsame-${opId.slice(-8)}`,
        nowIso,
      })
        .then((r) => ({
          ok:
            r.providerCreated === false &&
            r.provider.applyCount === 1 &&
            r.provider.payloadDigest === digestA &&
            r.provider.remoteRef === first.provider.remoteRef,
        }))
        .catch(() => ({ ok: false })),
    ),
  );
  const verifiedSameAllOk = verifiedSameResults.every((r) => r.ok);
  const afterVerifiedSame = await svc.stores.fakeProvider.getByBusinessKey(
    bizKey,
  );
  const decisionAfterVerifiedSame = await svc.stores.decisions.get(operationId);
  if (
    !verifiedSameAllOk ||
    afterVerifiedSame?.applyCount !== 1 ||
    decisionAfterVerifiedSame?.outcome !== "VERIFIED"
  ) {
    passed = false;
    details.push(
      `Post-VERIFIED concurrent same-digest failed: ok=${verifiedSameResults.filter((r) => r.ok).length}/${verifiedSameN} applyCount=${afterVerifiedSame?.applyCount} outcome=${decisionAfterVerifiedSame?.outcome}`,
    );
  } else {
    details.push(
      `Post-VERIFIED concurrent ${verifiedSameN}-way same-digest accepts → all replay applyCount=1; outcome stays VERIFIED`,
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

  // Wrong-digest verifyIndependent on a separate ACCEPTED_PENDING op → FAILED;
  // applyCount stays 1; Independent read mismatch ≠ payload-mismatch Conflict.
  const wrongVerifyOp = `${operationId}-wrong-verify`;
  const wrongVerifyBiz = `${bizKey}-wrong-verify`;
  const wrongVerifyAccept = await accept(svc, {
    operationId: wrongVerifyOp,
    bizKey: wrongVerifyBiz,
    digest: digestA,
    idem: `${idem}-wrong-verify`,
    nowIso,
  });
  let wrongVerifyOk = false;
  try {
    await svc.verifyIndependent({
      operationId: wrongVerifyOp,
      observedDigest: digestB,
      nowIso,
    });
    details.push(
      "Wrong-digest verifyIndependent: expected Independent read mismatch was not thrown",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const afterWrong = await svc.stores.fakeProvider.getByBusinessKey(
      wrongVerifyBiz,
    );
    const decisionWrong = await svc.stores.decisions.get(wrongVerifyOp);
    if (
      /independent read mismatch/i.test(msg) &&
      !isIdempotencyPayloadMismatchError(err) &&
      afterWrong?.applyCount === 1 &&
      afterWrong.payloadDigest === digestA &&
      afterWrong.remoteRef === wrongVerifyAccept.provider.remoteRef &&
      decisionWrong?.outcome === "FAILED"
    ) {
      wrongVerifyOk = true;
      details.push(
        "Wrong-digest verifyIndependent → FAILED applyCount=1; Independent read mismatch ≠ payload-mismatch Conflict",
      );
    } else {
      details.push(
        `Wrong-digest verify unexpected: applyCount=${afterWrong?.applyCount} outcome=${decisionWrong?.outcome} payloadMismatch=${isIdempotencyPayloadMismatchError(err)} msg=${msg}`,
      );
    }
  }
  if (!wrongVerifyOk) passed = false;

  // Post-FAILED acceptPending with digest-B still Conflict; applyCount stays 1.
  const postFailedConflict = await expectMismatchConflict(
    "acceptPending after FAILED + different payloadDigest",
    details,
    () =>
      accept(svc, {
        operationId: wrongVerifyOp,
        bizKey: wrongVerifyBiz,
        digest: digestB,
        idem: `${idem}-wrong-verify-b`,
        nowIso,
      }),
  );
  const afterPostFailed = await svc.stores.fakeProvider.getByBusinessKey(
    wrongVerifyBiz,
  );
  const decisionPostFailed = await svc.stores.decisions.get(wrongVerifyOp);
  let postFailedOk =
    postFailedConflict &&
    afterPostFailed?.applyCount === 1 &&
    afterPostFailed.payloadDigest === digestA &&
    decisionPostFailed?.outcome === "FAILED";
  if (!postFailedOk) {
    passed = false;
    details.push(
      `Post-FAILED digest-B refuse unexpected: conflict=${postFailedConflict} applyCount=${afterPostFailed?.applyCount} outcome=${decisionPostFailed?.outcome}`,
    );
  } else {
    details.push(
      "Post-FAILED digest-B acceptPending → Conflict; applyCount=1; outcome stays FAILED",
    );
  }

  // Post-FAILED concurrent digest-B race — all Conflict; FAILED + applyCount=1 retained.
  const failedRaceN = 6;
  const failedRaceResults = await Promise.all(
    Array.from({ length: failedRaceN }, () =>
      accept(svc, {
        operationId: wrongVerifyOp,
        bizKey: wrongVerifyBiz,
        digest: digestB,
        idem: `${idem}-wrong-verify-race`,
        nowIso,
      })
        .then(() => ({ ok: false as const }))
        .catch((err) => ({
          ok: isIdempotencyPayloadMismatchError(err) as boolean,
        })),
    ),
  );
  const failedRaceAllConflict = failedRaceResults.every((r) => r.ok);
  const afterFailedRace = await svc.stores.fakeProvider.getByBusinessKey(
    wrongVerifyBiz,
  );
  const decisionAfterFailedRace = await svc.stores.decisions.get(wrongVerifyOp);
  let failedRaceOk =
    failedRaceAllConflict &&
    afterFailedRace?.applyCount === 1 &&
    afterFailedRace.payloadDigest === digestA &&
    afterFailedRace.remoteRef === wrongVerifyAccept.provider.remoteRef &&
    decisionAfterFailedRace?.outcome === "FAILED";
  if (!failedRaceOk) {
    passed = false;
    details.push(
      `Post-FAILED concurrent digest-B race failed: conflicts=${failedRaceResults.filter((r) => r.ok).length}/${failedRaceN} applyCount=${afterFailedRace?.applyCount} outcome=${decisionAfterFailedRace?.outcome}`,
    );
  } else {
    details.push(
      `Post-FAILED concurrent ${failedRaceN}-way digest-B race → all Conflict; applyCount=1; outcome stays FAILED`,
    );
  }

  // Explicit effects.countApplyAttempts agrees with provider applyCount=1.
  const applyAttemptsMain = await svc.stores.effects.countApplyAttempts(
    operationId,
  );
  const applyAttemptsFailed = await svc.stores.effects.countApplyAttempts(
    wrongVerifyOp,
  );
  let applyAttemptsOk =
    applyAttemptsMain === 1 &&
    applyAttemptsFailed === 1 &&
    afterVerified?.applyCount === 1 &&
    afterPostFailed?.applyCount === 1;
  if (!applyAttemptsOk) {
    passed = false;
    details.push(
      `countApplyAttempts honesty failed: main=${applyAttemptsMain} failedOp=${applyAttemptsFailed} providerMain=${afterVerified?.applyCount} providerFailed=${afterPostFailed?.applyCount}`,
    );
  } else {
    details.push(
      "effects.countApplyAttempts=1 for main + FAILED ops; provider applyCount=1 (no second remote effect)",
    );
  }

  // Final integrity snapshot: main remoteRef + digests never rematched to B.
  const finalMain = await svc.stores.fakeProvider.getByBusinessKey(bizKey);
  const finalDecision = await svc.stores.decisions.get(operationId);
  const finalEffect = await svc.stores.effects.get(operationId);
  const finalReceipts = await svc.stores.receipts.listForOperation(operationId);
  let finalIntegrityOk =
    finalMain?.applyCount === 1 &&
    finalMain.payloadDigest === digestA &&
    finalMain.remoteRef === first.provider.remoteRef &&
    finalDecision?.payloadDigest === digestA &&
    finalDecision.outcome === "VERIFIED" &&
    finalEffect?.payloadDigest === digestA &&
    !finalReceipts.some((r) => r.observedDigest === digestB);
  if (!finalIntegrityOk) {
    passed = false;
    details.push(
      `Final integrity snapshot failed: applyCount=${finalMain?.applyCount} digest=${finalMain?.payloadDigest} remoteRefMatch=${finalMain?.remoteRef === first.provider.remoteRef} outcome=${finalDecision?.outcome} receiptB=${finalReceipts.some((r) => r.observedDigest === digestB)}`,
    );
  } else {
    details.push(
      "Final integrity snapshot: remoteRef unchanged; decision/effect/provider digest A; outcome VERIFIED; no digest-B receipts",
    );
  }

  // gateDetails marker retained on main decision after all Conflict edges.
  const gateOk =
    Array.isArray(finalDecision?.gateDetails) &&
    finalDecision.gateDetails.includes("idempotency_key_payload_mismatch");
  if (!gateOk) {
    passed = false;
    details.push(
      `gateDetails retention failed: ${JSON.stringify(finalDecision?.gateDetails ?? null)}`,
    );
  } else {
    details.push(
      "gateDetails retains idempotency_key_payload_mismatch after Conflicts",
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
      tabConflict &&
      crlfConflict &&
      leadingPadConflict &&
      nbspConflict &&
      zwspConflict &&
      prefixConflict &&
      suffixConflict &&
      bomConflict &&
      doubleSpaceConflict &&
      vtConflict &&
      ffConflict &&
      lsConflict &&
      crOnlyConflict &&
      psConflict &&
      midNulConflict &&
      softHyphenConflict &&
      lrmConflict &&
      rlmConflict &&
      zwnjConflict &&
      zwjConflict &&
      wjConflict &&
      thinSpaceConflict &&
      hairSpaceConflict &&
      nnbspConflict &&
      barrageAllConflict &&
      !barrageOrphans &&
      sameOpRaceAllConflict &&
      sameDigestAllOk &&
      mixOk &&
      !mixOrphans &&
      bizKeyMismatchOk &&
      verifiedPathConflict &&
      verifiedBarrageAllConflict &&
      !verifiedBarrageOrphans &&
      verifiedSameAllOk &&
      wrongVerifyOk &&
      postFailedOk &&
      failedRaceOk &&
      applyAttemptsOk &&
      finalIntegrityOk &&
      gateOk,
    details,
    applyAttemptCount: afterVerified?.applyCount ?? first.applyAttemptCount,
    operationId,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
