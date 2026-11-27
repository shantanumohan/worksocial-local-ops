/**
 * Write-path confinement: after a logical root check, resolve symlinks/junctions
 * and deny writes whose canonical target escapes the verified root (T-X003).
 *
 * Honesty: every decision carries externalEffects=NONE + liveProviderWiring=NOT_WIRED.
 * Blank/invalid roots refuse before cwd pollution. Blank candidates refuse
 * (B13). Fixture+WIRED refuses inventing live write success
 * (LIVE_TRANSPORT_NOT_WIRED). Optional civil verified-until in an IANA zone
 * fails closed across DST gap / fall-back ambiguity / bad zone / expiry (B9)
 * and non-finite asOfInstantIso → INVALID_AS_OF_INSTANT (B13; do not invent
 * expiry). ACCEPTED ≠ sandbox/prod VERIFIED.
 */

import { isAbsolute, resolve } from "node:path";
import {
  LocalCivilResolveCode,
  resolveLocalCivilTime,
} from "@worksocial/domain";
import { normalizePathForPolicy, resolveCanonicalPath } from "./sync-path-policy.js";

export type RootVerificationCivilUntil = {
  /** IANA zone for the civil verified-until wall time (e.g. America/New_York). */
  timeZone: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** Instant when the write authorize is evaluated (UTC ISO). */
  asOfInstantIso: string;
};

export type WriteWithinRootOptions = {
  /**
   * When true (default), also evaluate the canonical/realpath (symlinks/junctions).
   * Pure unit tests may set false to skip filesystem resolution.
   */
  resolveCanonical?: boolean;
  /** Live write transport wiring — fixture proofs keep NOT_WIRED. */
  liveProviderWiring?: "NOT_WIRED" | "WIRED";
  /**
   * Optional civil verified-until for the root (B9 timezone edge).
   * Spring-forward gap / fall-back ambiguous / unsupported zone refuse authorize
   * (fail closed — do not invent a unique until-instant). Expired until refuses.
   * Symlink escape still denies even when the window is valid.
   */
  rootVerification?: RootVerificationCivilUntil;
};

type WriteRootHonesty = {
  externalEffects: "NONE";
  liveProviderWiring: "NOT_WIRED";
};

function writeRootHonesty(): WriteRootHonesty {
  return {
    externalEffects: "NONE",
    liveProviderWiring: "NOT_WIRED",
  };
}

export type WriteWithinRootDenyReason =
  | "LOGICAL_OUTSIDE_ROOT"
  | "SYMLINK_ESCAPE_OUTSIDE_ROOT"
  | "ROOT_REQUIRED"
  | "CANDIDATE_REQUIRED"
  | "LIVE_TRANSPORT_NOT_WIRED"
  | "DST_VERIFICATION_REFUSED"
  | "AMBIGUOUS_LOCAL_VERIFICATION"
  | "INVALID_TIMEZONE"
  | "INVALID_AS_OF_INSTANT"
  | "ROOT_VERIFICATION_EXPIRED";

export type WriteWithinRootVerdict =
  | ({
      ok: true;
      root: string;
      logicalPath: string;
      canonicalPath: string;
      logicalInsideRoot: true;
      canonicalInsideRoot: true;
    } & WriteRootHonesty)
  | ({
      ok: false;
      root: string;
      logicalPath: string;
      canonicalPath: string;
      logicalInsideRoot: boolean;
      canonicalInsideRoot: boolean;
      reason: WriteWithinRootDenyReason;
      message: string;
    } & WriteRootHonesty);

function toAbsoluteNormalized(pathInput: string): string {
  const absolute = isAbsolute(pathInput) ? pathInput : resolve(pathInput);
  return normalizePathForPolicy(absolute);
}

/**
 * True when candidate is the root itself or a descendant (string-prefix after normalize).
 * Does not follow symlinks — pair with canonical checks for T-X003.
 */
export function isLogicalPathInsideRoot(
  candidateInput: string,
  rootInput: string,
): boolean {
  const candidate = toAbsoluteNormalized(candidateInput);
  const root = toAbsoluteNormalized(rootInput);
  if (!candidate || !root) {
    return false;
  }
  if (candidate === root) {
    return true;
  }
  const rootPrefix = root.endsWith("/") ? root : `${root}/`;
  return candidate.startsWith(rootPrefix);
}

function deny(
  partial: Omit<
    Extract<WriteWithinRootVerdict, { ok: false }>,
    "ok" | "externalEffects" | "liveProviderWiring"
  >,
): WriteWithinRootVerdict {
  return {
    ok: false,
    ...partial,
    ...writeRootHonesty(),
  };
}

/**
 * Authorize a write path under a verified root.
 * 1) Verified root must be non-blank (refuse cwd pollution).
 * 2) Candidate path must be non-blank (B13).
 * 3) Optional civil verified-until resolves fail-closed across DST/timezone edges.
 * 4) Logical path must be inside the root (prefix check).
 * 5) Canonical/realpath must still be inside the root (blocks symlink escape).
 * 6) Invalid asOfInstantIso refuses inventing expiry (B13); expired civil until
 *    refuses (after escape checks so escape still wins).
 * 7) Claimed WIRED paths refuse inventing live write success.
 */
export function evaluateWriteWithinRoot(
  rootInput: string,
  candidateInput: string,
  options: WriteWithinRootOptions = {},
): WriteWithinRootVerdict {
  if (typeof rootInput !== "string" || rootInput.trim() === "") {
    return deny({
      root: "",
      logicalPath: typeof candidateInput === "string" ? candidateInput : "",
      canonicalPath: typeof candidateInput === "string" ? candidateInput : "",
      logicalInsideRoot: false,
      canonicalInsideRoot: false,
      reason: "ROOT_REQUIRED",
      message:
        "Verified write root is required — refuse blank/whitespace root before authorize (T-X003); no cwd pollution",
    });
  }

  if (typeof candidateInput !== "string" || candidateInput.trim() === "") {
    return deny({
      root: toAbsoluteNormalized(rootInput),
      logicalPath: "",
      canonicalPath: "",
      logicalInsideRoot: false,
      canonicalInsideRoot: false,
      reason: "CANDIDATE_REQUIRED",
      message:
        "Write candidate path is required — refuse blank/whitespace candidate before authorize (T-X003); no cwd pollution",
    });
  }

  let verifiedUntilIso: string | null = null;
  const verification = options.rootVerification;
  if (verification) {
    const asOfMsEarly = Date.parse(verification.asOfInstantIso);
    if (!Number.isFinite(asOfMsEarly)) {
      return deny({
        root: toAbsoluteNormalized(rootInput),
        logicalPath: candidateInput,
        canonicalPath: candidateInput,
        logicalInsideRoot: false,
        canonicalInsideRoot: false,
        reason: "INVALID_AS_OF_INSTANT",
        message:
          "Root verification asOfInstantIso must be a finite UTC instant — refuse inventing expiry or authorize (T-X003)",
      });
    }
    const resolved = resolveLocalCivilTime({
      timeZone: verification.timeZone,
      year: verification.year,
      month: verification.month,
      day: verification.day,
      hour: verification.hour,
      minute: verification.minute,
    });
    if (!resolved.ok) {
      if (resolved.code === LocalCivilResolveCode.NONEXISTENT_LOCAL_TIME) {
        return deny({
          root: toAbsoluteNormalized(rootInput),
          logicalPath: candidateInput,
          canonicalPath: candidateInput,
          logicalInsideRoot: false,
          canonicalInsideRoot: false,
          reason: "DST_VERIFICATION_REFUSED",
          message:
            "Root verification civil until falls in a DST spring-forward gap — refuse authorize (T-X003); no invented until-instant",
        });
      }
      return deny({
        root: toAbsoluteNormalized(rootInput),
        logicalPath: candidateInput,
        canonicalPath: candidateInput,
        logicalInsideRoot: false,
        canonicalInsideRoot: false,
        reason: "INVALID_TIMEZONE",
        message:
          "Root verification timezone/civil until invalid — refuse authorize (T-X003); no invented until-instant",
      });
    }
    if (resolved.ambiguous) {
      return deny({
        root: toAbsoluteNormalized(rootInput),
        logicalPath: candidateInput,
        canonicalPath: candidateInput,
        logicalInsideRoot: false,
        canonicalInsideRoot: false,
        reason: "AMBIGUOUS_LOCAL_VERIFICATION",
        message:
          "Root verification civil until is ambiguous across DST fall-back — refuse inventing which offset (T-X003)",
      });
    }
    verifiedUntilIso = resolved.fireAtIso;
  }

  const root = toAbsoluteNormalized(rootInput);
  const logicalPath = toAbsoluteNormalized(candidateInput);
  const logicalInsideRoot = isLogicalPathInsideRoot(logicalPath, root);

  const canonicalPath =
    options.resolveCanonical === false
      ? logicalPath
      : normalizePathForPolicy(resolveCanonicalPath(candidateInput));
  const canonicalInsideRoot = isLogicalPathInsideRoot(canonicalPath, root);

  if (!logicalInsideRoot) {
    return deny({
      root,
      logicalPath,
      canonicalPath,
      logicalInsideRoot: false,
      canonicalInsideRoot,
      reason: "LOGICAL_OUTSIDE_ROOT",
      message: `Refusing write outside verified root. logical='${logicalPath}' root='${root}'.`,
    });
  }

  if (!canonicalInsideRoot) {
    return deny({
      root,
      logicalPath,
      canonicalPath,
      logicalInsideRoot: true,
      canonicalInsideRoot: false,
      reason: "SYMLINK_ESCAPE_OUTSIDE_ROOT",
      message: `Refusing write: logical path is under root but canonical target escapes. logical='${logicalPath}' canonical='${canonicalPath}' root='${root}'.`,
    });
  }

  if (verifiedUntilIso !== null && verification) {
    // asOfInstantIso already validated finite above.
    const asOfMs = Date.parse(verification.asOfInstantIso);
    const untilMs = Date.parse(verifiedUntilIso);
    if (asOfMs >= untilMs) {
      return deny({
        root,
        logicalPath,
        canonicalPath,
        logicalInsideRoot: true,
        canonicalInsideRoot: true,
        reason: "ROOT_VERIFICATION_EXPIRED",
        message:
          "Root verification civil until has elapsed at asOfInstant — refuse authorize (T-X003); no invented extension",
      });
    }
  }

  if ((options.liveProviderWiring ?? "NOT_WIRED") !== "NOT_WIRED") {
    return deny({
      root,
      logicalPath,
      canonicalPath,
      logicalInsideRoot: true,
      canonicalInsideRoot: true,
      reason: "LIVE_TRANSPORT_NOT_WIRED",
      message:
        "Write within root refused while liveProviderWiring=WIRED — live transport NOT_WIRED; no invented live write success (T-X003)",
    });
  }

  return {
    ok: true,
    root,
    logicalPath,
    canonicalPath,
    logicalInsideRoot: true,
    canonicalInsideRoot: true,
    ...writeRootHonesty(),
  };
}
