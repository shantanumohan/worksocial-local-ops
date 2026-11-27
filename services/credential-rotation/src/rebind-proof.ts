/**
 * T-X029 fixture proof — explicit different-account rebind.
 * Produces a SoakProofRecord for the evidence compiler.
 * External effects: NONE. Live provider revoke: NOT_WIRED.
 * Never claims live VERIFIED. ACCEPTED ≠ VERIFIED.
 *
 * Additive hillclimb: honesty on silent/rebind decisions; whitespace blank;
 * trim/case-fold match; blank newAccountLabel; fixture+WIRED refuse.
 *
 * applyAttemptCount is measured from broker putReference writes during the
 * successful rebind (not hard-coded). Proof fails unless the measured count is 1.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateExplicitRebind,
  evaluateSilentRotateAllowed,
  type SoakProofRecord,
} from "@worksocial/domain";
import {
  createCredentialBroker,
  type CredentialBroker,
} from "@worksocial/credential-broker";
import { createFileCredentialRotationStore } from "@worksocial/persistence";
import { createCredentialRotationService } from "./service.js";

function withPutReferenceCounter(broker: CredentialBroker): {
  broker: CredentialBroker;
  putReferenceCount: () => number;
  resetPutReferenceCount: () => void;
} {
  let count = 0;
  const wrapped: CredentialBroker = {
    putReference: (providerId, scopes, secretMaterial, nowIso) => {
      count += 1;
      return broker.putReference(providerId, scopes, secretMaterial, nowIso);
    },
    mintScopedHandle: (request) => broker.mintScopedHandle(request),
    revealForPrincipal: (handleId, principal, nowIso) =>
      broker.revealForPrincipal(handleId, principal, nowIso),
    revokeReference: (referenceId, nowIso) =>
      broker.revokeReference(referenceId, nowIso),
    rotateReference: (input) => {
      // Count the inner putReference that rotateReference performs.
      count += 1;
      return broker.rotateReference(input);
    },
    getReference: (referenceId) => broker.getReference(referenceId),
    listReferences: () => broker.listReferences(),
    requestBrowserAuthState: (request) =>
      broker.requestBrowserAuthState(request),
    attemptLiveProviderRevoke: (referenceId) =>
      broker.attemptLiveProviderRevoke(referenceId),
  };
  return {
    putReferenceCount: () => count,
    resetPutReferenceCount: () => {
      count = 0;
    },
    broker: wrapped,
  };
}

/**
 * Run the T-X029 explicit-account-rebind fixture path and return a soak proof.
 * Silent rotate of a different-account token must be denied; explicit rebind
 * marks the old connection ROTATED_AWAY and binds a new connection.
 */
export async function runExplicitAccountRebindProof(input: {
  stateDir: string;
  nowIso: string;
}): Promise<SoakProofRecord> {
  const details: string[] = [];
  const operationId = `rebind-${randomUUID().slice(0, 8)}`;
  let measuredApplyAttempts = 0;

  try {
    const store = createFileCredentialRotationStore(input.stateDir);
    const wrapped = withPutReferenceCounter(createCredentialBroker());
    const svc = createCredentialRotationService({
      store,
      broker: wrapped.broker,
    });

    const seeded = await svc.seedFixture({
      connectionId: `conn-old-${operationId}`,
      accountLabel: "fixture-account-alpha",
      nowIso: input.nowIso,
      withQueuedWork: true,
      secretMaterial: `fixture-old-${operationId}`,
    });
    details.push(
      `Seeded connection=${seeded.connection.connectionId} account=${seeded.connection.accountLabel}`,
    );

    // Seed writes are not rebind applies — reset before the rebind path.
    wrapped.resetPutReferenceCount();

    const silentDenied = await svc.rotate({
      connectionId: seeded.connection.connectionId,
      approvedBy: "admin",
      secretMaterial: `silent-attempt-${operationId}`,
      observedAccountLabel: "fixture-account-beta",
      nowIso: input.nowIso,
    });
    if (silentDenied.ok || silentDenied.code !== "REBIND_REQUIRED") {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat([
          `Silent different-account rotate expected REBIND_REQUIRED; got ok=${silentDenied.ok} code=${"code" in silentDenied ? silentDenied.code : "n/a"}`,
        ]),
      );
    }
    if (wrapped.putReferenceCount() !== 0) {
      return failProof(
        operationId,
        input.nowIso,
        wrapped.putReferenceCount(),
        details.concat([
          `Denied silent rotate must not write broker references; measured putReference=${wrapped.putReferenceCount()}`,
        ]),
      );
    }
    details.push(
      "Silent different-account rotate denied (REBIND_REQUIRED) — not treated as transparent refresh",
    );

    const blankDenied = await svc.rotate({
      connectionId: seeded.connection.connectionId,
      approvedBy: "admin",
      secretMaterial: `blank-identity-${operationId}`,
      observedAccountLabel: "",
      nowIso: input.nowIso,
    });
    if (
      blankDenied.ok ||
      blankDenied.code !== "ACCOUNT_IDENTITY_REQUIRED"
    ) {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat([
          `Blank observedAccountLabel expected ACCOUNT_IDENTITY_REQUIRED; got ok=${blankDenied.ok} code=${"code" in blankDenied ? blankDenied.code : "n/a"}`,
        ]),
      );
    }
    details.push(
      "Blank observedAccountLabel denied (ACCOUNT_IDENTITY_REQUIRED) — no silent different-account bind",
    );

    const whitespaceBlank = await svc.rotate({
      connectionId: seeded.connection.connectionId,
      approvedBy: "admin",
      secretMaterial: `ws-blank-${operationId}`,
      observedAccountLabel: "   ",
      nowIso: input.nowIso,
    });
    if (
      whitespaceBlank.ok ||
      whitespaceBlank.code !== "ACCOUNT_IDENTITY_REQUIRED"
    ) {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat([
          `Whitespace blank observedAccountLabel expected ACCOUNT_IDENTITY_REQUIRED; got ok=${whitespaceBlank.ok} code=${"code" in whitespaceBlank ? whitespaceBlank.code : "n/a"}`,
        ]),
      );
    }
    details.push(
      "Whitespace-only observedAccountLabel denied (ACCOUNT_IDENTITY_REQUIRED)",
    );

    const trimSilent = evaluateSilentRotateAllowed({
      previousAccountLabel: "  fixture-account-alpha  ",
      observedAccountLabel: "fixture-account-alpha",
    });
    if (
      !trimSilent.ok ||
      trimSilent.externalEffects !== "NONE" ||
      trimSilent.liveProviderWiring !== "NOT_WIRED"
    ) {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat([
          `Trim same-account silent rotate expected ok+honesty; got ${JSON.stringify(trimSilent)}`,
        ]),
      );
    }
    details.push(
      "Whitespace-trimmed account labels match → silent SAME_ACCOUNT allowed; honesty externalEffects=NONE liveProviderWiring=NOT_WIRED",
    );

    const caseSilent = evaluateSilentRotateAllowed({
      previousAccountLabel: "Fixture-Account-Alpha",
      observedAccountLabel: "FIXTURE-ACCOUNT-ALPHA",
    });
    if (!caseSilent.ok) {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat([
          `Case-fold same-account silent rotate expected ok; got ${JSON.stringify(caseSilent)}`,
        ]),
      );
    }
    details.push(
      "Case-fold account labels match → silent SAME_ACCOUNT (intentional fold)",
    );

    const blankRebindLabel = evaluateExplicitRebind({
      connection: seeded.connection,
      newAccountLabel: "   ",
      approvedBy: "admin",
    });
    if (
      blankRebindLabel.ok ||
      blankRebindLabel.code !== "ACCOUNT_LABEL_REQUIRED" ||
      blankRebindLabel.liveProviderWiring !== "NOT_WIRED"
    ) {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat([
          `Blank newAccountLabel expected ACCOUNT_LABEL_REQUIRED; got ${JSON.stringify(blankRebindLabel)}`,
        ]),
      );
    }
    details.push(
      "Blank/whitespace newAccountLabel denied (ACCOUNT_LABEL_REQUIRED); honesty NOT_WIRED/NONE",
    );

    const wiredRebind = evaluateExplicitRebind({
      connection: seeded.connection,
      newAccountLabel: "fixture-account-beta",
      approvedBy: "admin",
      liveProviderWiring: "WIRED",
    });
    if (
      wiredRebind.ok ||
      wiredRebind.code !== "LIVE_TRANSPORT_NOT_WIRED" ||
      wiredRebind.externalEffects !== "NONE" ||
      wiredRebind.liveProviderWiring !== "NOT_WIRED"
    ) {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat([
          `Fixture+WIRED rebind expected LIVE_TRANSPORT_NOT_WIRED; got ${JSON.stringify(wiredRebind)}`,
        ]),
      );
    }
    details.push(
      "Fixture match with liveProviderWiring=WIRED → LIVE_TRANSPORT_NOT_WIRED; no invented live revoke/rebind",
    );

    const rebound = await svc.rebind({
      connectionId: seeded.connection.connectionId,
      newAccountLabel: "fixture-account-beta",
      approvedBy: "admin",
      secretMaterial: `fixture-new-${operationId}`,
      nowIso: input.nowIso,
      newConnectionId: `conn-new-${operationId}`,
    });
    measuredApplyAttempts = wrapped.putReferenceCount();
    if (!rebound.ok) {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat([
          `Explicit rebind failed: ${rebound.code} ${rebound.reason}`,
        ]),
      );
    }
    if (measuredApplyAttempts !== 1) {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat([
          `Expected exactly one broker putReference during rebind; measured=${measuredApplyAttempts}`,
        ]),
      );
    }
    details.push(
      `Explicit rebind complete old=${rebound.oldConnection.connectionId}→ROTATED_AWAY new=${rebound.newConnection.connectionId} account=${rebound.newConnection.accountLabel}`,
    );
    details.push(
      `silentRefreshRejected=${rebound.rebind.silentRefreshRejected} catalogCaseId=${rebound.rebind.catalogCaseId} liveProviderRevoke=${rebound.liveProviderRevoke} externalEffects=${rebound.externalEffects}`,
    );
    details.push(
      `Measured broker putReference during rebind applyAttemptCount=${measuredApplyAttempts}`,
    );

    const durableRebinds = await svc.listRebinds();
    const thisRebind = durableRebinds.filter(
      (r) => r.rebindId === rebound.rebind.rebindId,
    );
    if (thisRebind.length !== 1) {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat([
          `Expected exactly one durable rebind record for rebindId=${rebound.rebind.rebindId}; matched=${thisRebind.length} total=${durableRebinds.length}`,
        ]),
      );
    }

    const collision = await svc.rebind({
      connectionId: rebound.newConnection.connectionId,
      newAccountLabel: "fixture-account-gamma",
      approvedBy: "admin",
      secretMaterial: `collision-${operationId}`,
      nowIso: input.nowIso,
      newConnectionId: rebound.newConnection.connectionId,
    });
    if (
      collision.ok ||
      collision.code !== "CONNECTION_ID_COLLISION"
    ) {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat([
          `Successor ID collision expected CONNECTION_ID_COLLISION; got ok=${collision.ok} code=${"code" in collision ? collision.code : "n/a"}`,
        ]),
      );
    }
    details.push(
      "Successor connectionId collision rejected (CONNECTION_ID_COLLISION)",
    );

    if (rebound.oldConnection.status !== "ROTATED_AWAY") {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat([
          `Old connection status expected ROTATED_AWAY; got ${rebound.oldConnection.status}`,
        ]),
      );
    }
    if (rebound.newConnection.accountLabel !== "fixture-account-beta") {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat(["New connection account label mismatch"]),
      );
    }
    if (rebound.rebind.secretsExported !== false) {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat(["Rebind record must never export secrets"]),
      );
    }

    const oldLease = await svc.requestLease({
      connectionId: rebound.oldConnection.connectionId,
      requestedScopes: ["publish"],
      nowIso: input.nowIso,
    });
    if (oldLease.ok || oldLease.code !== "CONNECTION_ROTATED_AWAY") {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat([
          `Old connection lease expected CONNECTION_ROTATED_AWAY; got ok=${oldLease.ok} code=${"code" in oldLease ? oldLease.code : "n/a"}`,
        ]),
      );
    }
    details.push("Old connection leases denied (CONNECTION_ROTATED_AWAY)");

    const newLease = await svc.requestLease({
      connectionId: rebound.newConnection.connectionId,
      requestedScopes: ["publish"],
      nowIso: input.nowIso,
    });
    if (!newLease.ok) {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat([`New connection lease failed: ${newLease.code}`]),
      );
    }
    details.push(`New connection lease granted leaseId=${newLease.leaseId}`);

    const sameAccountRebind = await svc.rebind({
      connectionId: rebound.newConnection.connectionId,
      newAccountLabel: "fixture-account-beta",
      approvedBy: "admin",
      secretMaterial: `same-attempt-${operationId}`,
      nowIso: input.nowIso,
    });
    if (sameAccountRebind.ok || sameAccountRebind.code !== "SAME_ACCOUNT") {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat([
          `Same-account rebind expected SAME_ACCOUNT denial; got ok=${sameAccountRebind.ok} code=${"code" in sameAccountRebind ? sameAccountRebind.code : "n/a"}`,
        ]),
      );
    }
    details.push(
      "Same-account rebind correctly denied (use rotate for same-account refresh)",
    );

    const audit = await svc.listAudit();
    if (!audit.every((a) => a.redacted === true)) {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat(["Audit entries must be redacted"]),
      );
    }
    if (
      JSON.stringify(audit).match(
        /fixture-old-|fixture-new-|silent-attempt-|blank-identity-|collision-/,
      )
    ) {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat(["Secret material leaked into audit"]),
      );
    }
    details.push("Audit retained and redacted; no secret material in records");

    const status = await svc.status();
    if (status.liveWiring.liveProviderRevocation !== "NOT_WIRED") {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat(["liveProviderRevocation must stay NOT_WIRED"]),
      );
    }
    if (status.externalEffects !== "NONE") {
      return failProof(
        operationId,
        input.nowIso,
        measuredApplyAttempts,
        details.concat(["externalEffects must be NONE"]),
      );
    }
    details.push(
      "liveProviderRevocation=NOT_WIRED externalEffects=NONE liveProviderWiring=NOT_WIRED ACCEPTED≠VERIFIED — never silently VERIFIED for live",
    );

    return {
      proofId: `proof-rebind-${operationId}`,
      kind: SoakProofKind.EXPLICIT_ACCOUNT_REBIND,
      passed: true,
      details,
      applyAttemptCount: measuredApplyAttempts,
      operationId,
      createdAtIso: input.nowIso,
      fixtureOnly: true,
    };
  } catch (err) {
    return failProof(operationId, input.nowIso, measuredApplyAttempts, [
      ...details,
      `Unhandled error: ${err instanceof Error ? err.message : String(err)}`,
    ]);
  }
}

function failProof(
  operationId: string,
  nowIso: string,
  applyAttemptCount: number,
  details: string[],
): SoakProofRecord {
  return {
    proofId: `proof-rebind-fail-${operationId}`,
    kind: SoakProofKind.EXPLICIT_ACCOUNT_REBIND,
    passed: false,
    details,
    applyAttemptCount,
    operationId,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
