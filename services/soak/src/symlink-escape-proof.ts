/**
 * Fixture proof for T-X003 — symlink escape after root verification.
 *
 * A path that looks under a verified root via a symlink must not authorize
 * a write whose canonical target escapes outside that root.
 * External effects: NONE. Live provider wiring: NOT_WIRED.
 *
 * Additive hillclimb: honesty fields on every decision; blank root refuse;
 * nested + relative symlink escape; fixture+WIRED refuse; B9 DST/timezone
 * civil verified-until fail-closed; B13 blank candidate + invalid asOf refuse;
 * ACCEPTED≠VERIFIED.
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

    // 0. Blank root refuse (no cwd pollution).
    const blankRoot = evaluateWriteWithinRoot("", join(root, "x"), {
      resolveCanonical: false,
    });
    if (
      blankRoot.ok === false &&
      blankRoot.reason === "ROOT_REQUIRED" &&
      blankRoot.externalEffects === "NONE" &&
      blankRoot.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Blank verified root refused: ROOT_REQUIRED (no cwd pollution); honesty NOT_WIRED/NONE",
      );
    } else {
      passed = false;
      details.push(`Blank root unexpectedly ${JSON.stringify(blankRoot)}`);
    }

    // 1. Positive control: in-root write allowed after canonical resolve.
    const safePath = join(root, "evidence", "ok.json");
    mkdirSync(join(root, "evidence"), { recursive: true });
    writeFileSync(safePath, "{}");
    const allowed = evaluateWriteWithinRoot(root, safePath);
    if (
      allowed.ok === true &&
      allowed.logicalInsideRoot === true &&
      allowed.canonicalInsideRoot === true &&
      allowed.externalEffects === "NONE" &&
      allowed.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "In-root write allowed after canonical resolve; honesty externalEffects=NONE liveProviderWiring=NOT_WIRED",
      );
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
      escaped.canonicalInsideRoot === false &&
      escaped.externalEffects === "NONE" &&
      escaped.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Symlink escape denied: SYMLINK_ESCAPE_OUTSIDE_ROOT (write outside root); honesty NOT_WIRED/NONE",
      );
    } else {
      passed = false;
      details.push(
        `Symlink escape unexpectedly allowed or misclassified: ${JSON.stringify(escaped)}`,
      );
    }

    // 2b. Nested symlink chain escape.
    const mid = join(root, "mid-link");
    const hop = join(root, "hop-link");
    symlinkSync(outside, mid);
    symlinkSync(mid, hop);
    const nested = evaluateWriteWithinRoot(root, join(hop, "payload.bin"));
    if (
      nested.ok === false &&
      nested.reason === "SYMLINK_ESCAPE_OUTSIDE_ROOT"
    ) {
      details.push(
        "Nested symlink chain escape denied: SYMLINK_ESCAPE_OUTSIDE_ROOT",
      );
    } else {
      passed = false;
      details.push(`Nested symlink unexpectedly ${JSON.stringify(nested)}`);
    }

    // 2c. Relative-target symlink escape.
    const relLink = join(root, "rel-escape");
    symlinkSync("../outside-secret", relLink);
    const viaRel = evaluateWriteWithinRoot(root, join(relLink, "payload.bin"));
    if (
      viaRel.ok === false &&
      viaRel.reason === "SYMLINK_ESCAPE_OUTSIDE_ROOT"
    ) {
      details.push(
        "Relative-target symlink escape denied: SYMLINK_ESCAPE_OUTSIDE_ROOT",
      );
    } else {
      passed = false;
      details.push(
        `Relative-target symlink unexpectedly ${JSON.stringify(viaRel)}`,
      );
    }

    // 2d. Logical .. escape.
    const relativeLogical = join(root, "..", "outside-secret", "payload.bin");
    const logicalRel = evaluateWriteWithinRoot(root, relativeLogical);
    if (
      logicalRel.ok === false &&
      logicalRel.reason === "LOGICAL_OUTSIDE_ROOT"
    ) {
      details.push("Relative .. logical escape denied: LOGICAL_OUTSIDE_ROOT");
    } else {
      passed = false;
      details.push(
        `Relative logical escape unexpectedly ${JSON.stringify(logicalRel)}`,
      );
    }

    // 3. Sibling / outside path denied at logical check (no false ACCEPTED).
    const outsideDirect = join(outside, "payload.bin");
    const logicalDeny = evaluateWriteWithinRoot(root, outsideDirect);
    if (
      logicalDeny.ok === false &&
      logicalDeny.reason === "LOGICAL_OUTSIDE_ROOT" &&
      logicalDeny.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push("Direct outside path denied: LOGICAL_OUTSIDE_ROOT");
    } else {
      passed = false;
      details.push(
        `Direct outside path unexpectedly allowed: ${JSON.stringify(logicalDeny)}`,
      );
    }

    // 4. Fixture+WIRED refuse inventing live write.
    const wired = evaluateWriteWithinRoot(root, safePath, {
      liveProviderWiring: "WIRED",
    });
    if (
      wired.ok === false &&
      wired.reason === "LIVE_TRANSPORT_NOT_WIRED" &&
      wired.externalEffects === "NONE" &&
      wired.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Fixture+WIRED refuse LIVE_TRANSPORT_NOT_WIRED; no invented live write",
      );
    } else {
      passed = false;
      details.push(`WIRED refuse unexpectedly ${JSON.stringify(wired)}`);
    }

    // 5. B9 — DST / timezone civil verified-until edges.
    const springGap = evaluateWriteWithinRoot(root, safePath, {
      rootVerification: {
        timeZone: "America/New_York",
        year: 2026,
        month: 3,
        day: 8,
        hour: 2,
        minute: 30,
        asOfInstantIso: "2026-03-08T06:00:00.000Z",
      },
    });
    if (
      springGap.ok === false &&
      springGap.reason === "DST_VERIFICATION_REFUSED"
    ) {
      details.push(
        "America/New_York spring-forward gap verified-until refused: DST_VERIFICATION_REFUSED",
      );
    } else {
      passed = false;
      details.push(`Spring gap unexpectedly ${JSON.stringify(springGap)}`);
    }

    const fallAmb = evaluateWriteWithinRoot(root, safePath, {
      rootVerification: {
        timeZone: "America/New_York",
        year: 2025,
        month: 11,
        day: 2,
        hour: 1,
        minute: 30,
        asOfInstantIso: "2025-11-02T05:00:00.000Z",
      },
    });
    if (
      fallAmb.ok === false &&
      fallAmb.reason === "AMBIGUOUS_LOCAL_VERIFICATION"
    ) {
      details.push(
        "America/New_York fall-back ambiguous verified-until refused: AMBIGUOUS_LOCAL_VERIFICATION",
      );
    } else {
      passed = false;
      details.push(`Fall ambiguity unexpectedly ${JSON.stringify(fallAmb)}`);
    }

    const badZone = evaluateWriteWithinRoot(root, safePath, {
      rootVerification: {
        timeZone: "Not/AZone",
        year: 2026,
        month: 6,
        day: 1,
        hour: 12,
        minute: 0,
        asOfInstantIso: "2026-06-01T16:00:00.000Z",
      },
    });
    if (badZone.ok === false && badZone.reason === "INVALID_TIMEZONE") {
      details.push("Unsupported verification timezone refused: INVALID_TIMEZONE");
    } else {
      passed = false;
      details.push(`Bad zone unexpectedly ${JSON.stringify(badZone)}`);
    }

    const validWindow = {
      timeZone: "America/New_York",
      year: 2026,
      month: 3,
      day: 8,
      hour: 1,
      minute: 30,
      asOfInstantIso: "2026-03-08T05:00:00.000Z",
    } as const;
    const inWindow = evaluateWriteWithinRoot(root, safePath, {
      rootVerification: validWindow,
    });
    if (inWindow.ok === true && inWindow.externalEffects === "NONE") {
      details.push(
        "Unique America/New_York civil verified-until allows in-root write inside window",
      );
    } else {
      passed = false;
      details.push(`Valid window unexpectedly ${JSON.stringify(inWindow)}`);
    }

    const expired = evaluateWriteWithinRoot(root, safePath, {
      rootVerification: {
        ...validWindow,
        asOfInstantIso: "2026-03-08T07:00:00.000Z",
      },
    });
    if (
      expired.ok === false &&
      expired.reason === "ROOT_VERIFICATION_EXPIRED"
    ) {
      details.push(
        "Elapsed civil verified-until refused: ROOT_VERIFICATION_EXPIRED",
      );
    } else {
      passed = false;
      details.push(`Expired window unexpectedly ${JSON.stringify(expired)}`);
    }

    const escapeInWindow = evaluateWriteWithinRoot(root, escapeCandidate, {
      rootVerification: validWindow,
    });
    if (
      escapeInWindow.ok === false &&
      escapeInWindow.reason === "SYMLINK_ESCAPE_OUTSIDE_ROOT"
    ) {
      details.push(
        "Symlink escape still denied under valid civil verified-until window",
      );
    } else {
      passed = false;
      details.push(
        `Escape under valid window unexpectedly ${JSON.stringify(escapeInWindow)}`,
      );
    }

    // B13: blank candidate refuse; invalid asOfInstantIso refuse inventing expiry.
    const blankCandidate = evaluateWriteWithinRoot(root, "  ", {
      resolveCanonical: false,
    });
    if (
      blankCandidate.ok === false &&
      blankCandidate.reason === "CANDIDATE_REQUIRED" &&
      blankCandidate.externalEffects === "NONE" &&
      blankCandidate.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Blank candidate refused: CANDIDATE_REQUIRED (no cwd pollution) (B13)",
      );
    } else {
      passed = false;
      details.push(
        `Blank candidate unexpectedly ${JSON.stringify(blankCandidate)}`,
      );
    }

    const badAsOf = evaluateWriteWithinRoot(root, safePath, {
      rootVerification: {
        timeZone: "America/New_York",
        year: 2026,
        month: 3,
        day: 8,
        hour: 1,
        minute: 30,
        asOfInstantIso: "not-an-instant",
      },
    });
    if (
      badAsOf.ok === false &&
      badAsOf.reason === "INVALID_AS_OF_INSTANT" &&
      badAsOf.externalEffects === "NONE" &&
      badAsOf.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Non-finite asOfInstantIso refused: INVALID_AS_OF_INSTANT (no invented expiry) (B13)",
      );
    } else {
      passed = false;
      details.push(`Invalid asOf unexpectedly ${JSON.stringify(badAsOf)}`);
    }

    const wsAsOf = evaluateWriteWithinRoot(root, safePath, {
      rootVerification: {
        timeZone: "America/New_York",
        year: 2026,
        month: 3,
        day: 8,
        hour: 1,
        minute: 30,
        asOfInstantIso: "   ",
      },
    });
    if (
      wsAsOf.ok === false &&
      wsAsOf.reason === "INVALID_AS_OF_INSTANT" &&
      wsAsOf.externalEffects === "NONE" &&
      wsAsOf.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Whitespace asOfInstantIso refused: INVALID_AS_OF_INSTANT (B20)",
      );
    } else {
      passed = false;
      details.push(`Whitespace asOf unexpectedly ${JSON.stringify(wsAsOf)}`);
    }

    details.push(
      "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE ACCEPTED≠VERIFIED deepen=B13+B20",
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
