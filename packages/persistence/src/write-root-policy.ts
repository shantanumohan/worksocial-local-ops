/**
 * Write-path confinement: after a logical root check, resolve symlinks/junctions
 * and deny writes whose canonical target escapes the verified root (T-X003).
 */

import { isAbsolute, resolve } from "node:path";
import { normalizePathForPolicy, resolveCanonicalPath } from "./sync-path-policy.js";

export type WriteWithinRootOptions = {
  /**
   * When true (default), also evaluate the canonical/realpath (symlinks/junctions).
   * Pure unit tests may set false to skip filesystem resolution.
   */
  resolveCanonical?: boolean;
};

export type WriteWithinRootVerdict =
  | {
      ok: true;
      root: string;
      logicalPath: string;
      canonicalPath: string;
      logicalInsideRoot: true;
      canonicalInsideRoot: true;
    }
  | {
      ok: false;
      root: string;
      logicalPath: string;
      canonicalPath: string;
      logicalInsideRoot: boolean;
      canonicalInsideRoot: boolean;
      reason: "LOGICAL_OUTSIDE_ROOT" | "SYMLINK_ESCAPE_OUTSIDE_ROOT";
      message: string;
    };

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

/**
 * Authorize a write path under a verified root.
 * 1) Logical path must be inside the root (prefix check).
 * 2) Canonical/realpath must still be inside the root (blocks symlink escape).
 */
export function evaluateWriteWithinRoot(
  rootInput: string,
  candidateInput: string,
  options: WriteWithinRootOptions = {},
): WriteWithinRootVerdict {
  const root = toAbsoluteNormalized(rootInput);
  const logicalPath = toAbsoluteNormalized(candidateInput);
  const logicalInsideRoot = isLogicalPathInsideRoot(logicalPath, root);

  const canonicalPath =
    options.resolveCanonical === false
      ? logicalPath
      : normalizePathForPolicy(resolveCanonicalPath(candidateInput));
  const canonicalInsideRoot = isLogicalPathInsideRoot(canonicalPath, root);

  if (!logicalInsideRoot) {
    return {
      ok: false,
      root,
      logicalPath,
      canonicalPath,
      logicalInsideRoot: false,
      canonicalInsideRoot,
      reason: "LOGICAL_OUTSIDE_ROOT",
      message: `Refusing write outside verified root. logical='${logicalPath}' root='${root}'.`,
    };
  }

  if (!canonicalInsideRoot) {
    return {
      ok: false,
      root,
      logicalPath,
      canonicalPath,
      logicalInsideRoot: true,
      canonicalInsideRoot: false,
      reason: "SYMLINK_ESCAPE_OUTSIDE_ROOT",
      message: `Refusing write: logical path is under root but canonical target escapes. logical='${logicalPath}' canonical='${canonicalPath}' root='${root}'.`,
    };
  }

  return {
    ok: true,
    root,
    logicalPath,
    canonicalPath,
    logicalInsideRoot: true,
    canonicalInsideRoot: true,
  };
}
