/**
 * Fixture proof for T-X003 — symlink escape after root verification.
 *
 * A path that looks under a verified root via a symlink must not authorize
 * a write whose canonical target escapes outside that root.
 * External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SoakProofKind, type SoakProofRecord } from "@worksocial/domain";
import {
  evaluateWriteWithinRoot,
  isLogicalPathInsideRoot,
} from "@worksocial/persistence";

/**
 * Complete expected proof set for T-X003 fixture ACCEPTED.
 */
export function proofSymlinkEscapeAfterRootVerification(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const base = mkdtempSync(join(tmpdir(), "ws-soak-tx003-"));

  try {
    const root = join(base, "verified-root");
    const outside = join(base, "outside-secret");
    mkdirSync(root, { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "payload.bin"), "outside");

    // 1. Positive control: in-root write allowed after canonical resolve.
    const safePath = join(root, "evidence", "ok.json");
    mkdirSync(join(root, "evidence"), { recursive: true });
    writeFileSync(safePath, "{}");
    const allowed = evaluateWriteWithinRoot(root, safePath);
    if (
      allowed.ok === true &&
      allowed.logicalInsideRoot === true &&
      allowed.canonicalInsideRoot === true
    ) {
      details.push("In-root write allowed after canonical resolve");
    } else {
      passed = false;
      details.push(`In-root write unexpectedly denied: ${JSON.stringify(allowed)}`);
    }

    // 2. Logical path under root via symlink → canonical escapes → DENY.
    const escapeLink = join(root, "escape-link");
    symlinkSync(outside, escapeLink);
    const escapeCandidate = join(escapeLink, "payload.bin");

    if (isLogicalPathInsideRoot(escapeCandidate, root) !== true) {
      passed = false;
      details.push("Expected logical path under root before canonical check");
    } else {
      details.push("Logical path appears under verified root (pre-canonical)");
    }

    const escaped = evaluateWriteWithinRoot(root, escapeCandidate);
    if (
      escaped.ok === false &&
      escaped.reason === "SYMLINK_ESCAPE_OUTSIDE_ROOT" &&
      escaped.logicalInsideRoot === true &&
      escaped.canonicalInsideRoot === false
    ) {
      details.push(
        "Symlink escape denied: SYMLINK_ESCAPE_OUTSIDE_ROOT (write outside root)",
      );
    } else {
      passed = false;
      details.push(
        `Symlink escape unexpectedly allowed or misclassified: ${JSON.stringify(escaped)}`,
      );
    }

    // 3. Sibling / outside path denied at logical check (no false ACCEPTED).
    const outsideDirect = join(outside, "payload.bin");
    const logicalDeny = evaluateWriteWithinRoot(root, outsideDirect);
    if (
      logicalDeny.ok === false &&
      logicalDeny.reason === "LOGICAL_OUTSIDE_ROOT"
    ) {
      details.push("Direct outside path denied: LOGICAL_OUTSIDE_ROOT");
    } else {
      passed = false;
      details.push(
        `Direct outside path unexpectedly allowed: ${JSON.stringify(logicalDeny)}`,
      );
    }

    details.push(
      "liveProviderSuccessClaimed=false externalEffects=NONE",
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }

  return {
    proofId: `proof-symlink-escape-${randomUUID()}`,
    kind: SoakProofKind.SYMLINK_ESCAPE_AFTER_ROOT_VERIFICATION,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx003-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
