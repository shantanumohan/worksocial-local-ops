import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  evaluateWriteWithinRoot,
  isLogicalPathInsideRoot,
} from "./write-root-policy.js";

describe("write-root-policy", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts logical descendants of the root", () => {
    expect(
      isLogicalPathInsideRoot("/var/ws/root/a/b.txt", "/var/ws/root"),
    ).toBe(true);
    expect(isLogicalPathInsideRoot("/var/ws/root", "/var/ws/root")).toBe(true);
  });

  it("rejects logical paths outside the root (including sibling prefix tricks)", () => {
    expect(
      isLogicalPathInsideRoot("/var/ws/root-evil/x", "/var/ws/root"),
    ).toBe(false);
    expect(
      isLogicalPathInsideRoot("/var/ws/other/a.txt", "/var/ws/root"),
    ).toBe(false);
  });

  it("denies logical paths outside the root without resolving", () => {
    const verdict = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/other/x", {
      resolveCanonical: false,
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toBe("LOGICAL_OUTSIDE_ROOT");
    }
  });

  it("allows in-root writes after canonical resolve", () => {
    const base = mkdtempSync(join(tmpdir(), "ws-write-root-"));
    dirs.push(base);
    const root = join(base, "allowed");
    mkdirSync(root, { recursive: true });
    const target = join(root, "safe.txt");
    writeFileSync(target, "ok");

    const verdict = evaluateWriteWithinRoot(root, target);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.logicalInsideRoot).toBe(true);
      expect(verdict.canonicalInsideRoot).toBe(true);
    }
  });

  it("denies symlink escape after root verification (T-X003)", () => {
    const base = mkdtempSync(join(tmpdir(), "ws-symlink-escape-"));
    dirs.push(base);
    const root = join(base, "allowed");
    const outside = join(base, "secret");
    mkdirSync(root, { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "leak.txt"), "secret");

    const escapeLink = join(root, "escape");
    symlinkSync(outside, escapeLink);

    const logicalUnderRoot = join(escapeLink, "leak.txt");
    expect(isLogicalPathInsideRoot(logicalUnderRoot, root)).toBe(true);

    const verdict = evaluateWriteWithinRoot(root, logicalUnderRoot);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toBe("SYMLINK_ESCAPE_OUTSIDE_ROOT");
      expect(verdict.logicalInsideRoot).toBe(true);
      expect(verdict.canonicalInsideRoot).toBe(false);
      expect(verdict.canonicalPath).toContain("secret");
    }
  });
});
