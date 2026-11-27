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
      expect(verdict.externalEffects).toBe("NONE");
      expect(verdict.liveProviderWiring).toBe("NOT_WIRED");
    }
  });

  it("refuses blank/whitespace verified root before cwd pollution", () => {
    const blank = evaluateWriteWithinRoot("", "/tmp/x", {
      resolveCanonical: false,
    });
    expect(blank.ok).toBe(false);
    if (!blank.ok) {
      expect(blank.reason).toBe("ROOT_REQUIRED");
      expect(blank.externalEffects).toBe("NONE");
      expect(blank.liveProviderWiring).toBe("NOT_WIRED");
    }
    const ws = evaluateWriteWithinRoot("   ", "/tmp/x", {
      resolveCanonical: false,
    });
    expect(ws.ok).toBe(false);
    if (!ws.ok) {
      expect(ws.reason).toBe("ROOT_REQUIRED");
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
      expect(verdict.externalEffects).toBe("NONE");
      expect(verdict.liveProviderWiring).toBe("NOT_WIRED");
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
      expect(verdict.externalEffects).toBe("NONE");
      expect(verdict.liveProviderWiring).toBe("NOT_WIRED");
    }
  });

  it("denies nested symlink chain that escapes the root", () => {
    const base = mkdtempSync(join(tmpdir(), "ws-symlink-nested-"));
    dirs.push(base);
    const root = join(base, "allowed");
    const outside = join(base, "secret");
    const mid = join(root, "mid");
    mkdirSync(root, { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "leak.txt"), "secret");
    // root/mid → outside; root/hop → mid (nested chain)
    symlinkSync(outside, mid);
    const hop = join(root, "hop");
    symlinkSync(mid, hop);

    const candidate = join(hop, "leak.txt");
    expect(isLogicalPathInsideRoot(candidate, root)).toBe(true);
    const verdict = evaluateWriteWithinRoot(root, candidate);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toBe("SYMLINK_ESCAPE_OUTSIDE_ROOT");
      expect(verdict.liveProviderWiring).toBe("NOT_WIRED");
    }
  });

  it("denies relative .. logical escape and relative-target symlink escape", () => {
    const base = mkdtempSync(join(tmpdir(), "ws-symlink-rel-"));
    dirs.push(base);
    const root = join(base, "allowed");
    const outside = join(base, "secret");
    mkdirSync(root, { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "leak.txt"), "secret");

    const relativeLogical = join(root, "..", "secret", "leak.txt");
    const logicalDeny = evaluateWriteWithinRoot(root, relativeLogical);
    expect(logicalDeny.ok).toBe(false);
    if (!logicalDeny.ok) {
      expect(logicalDeny.reason).toBe("LOGICAL_OUTSIDE_ROOT");
      expect(logicalDeny.externalEffects).toBe("NONE");
    }

    const relLink = join(root, "rel-escape");
    symlinkSync("../secret", relLink);
    const viaRel = join(relLink, "leak.txt");
    expect(isLogicalPathInsideRoot(viaRel, root)).toBe(true);
    const escape = evaluateWriteWithinRoot(root, viaRel);
    expect(escape.ok).toBe(false);
    if (!escape.ok) {
      expect(escape.reason).toBe("SYMLINK_ESCAPE_OUTSIDE_ROOT");
      expect(escape.liveProviderWiring).toBe("NOT_WIRED");
    }
  });

  it("refuses inventing live write when liveProviderWiring=WIRED", () => {
    const base = mkdtempSync(join(tmpdir(), "ws-write-wired-"));
    dirs.push(base);
    const root = join(base, "allowed");
    mkdirSync(root, { recursive: true });
    const target = join(root, "safe.txt");
    writeFileSync(target, "ok");

    const refused = evaluateWriteWithinRoot(root, target, {
      liveProviderWiring: "WIRED",
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.reason).toBe("LIVE_TRANSPORT_NOT_WIRED");
      expect(refused.logicalInsideRoot).toBe(true);
      expect(refused.canonicalInsideRoot).toBe(true);
      expect(refused.externalEffects).toBe("NONE");
      expect(refused.liveProviderWiring).toBe("NOT_WIRED");
    }
  });

  it("refuses authorize when civil verified-until is in America/New_York spring gap (B9)", () => {
    const gap = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
      rootVerification: {
        timeZone: "America/New_York",
        // 2026-03-08 02:30 does not exist (US spring-forward).
        year: 2026,
        month: 3,
        day: 8,
        hour: 2,
        minute: 30,
        asOfInstantIso: "2026-03-08T06:00:00.000Z",
      },
    });
    expect(gap.ok).toBe(false);
    if (!gap.ok) {
      expect(gap.reason).toBe("DST_VERIFICATION_REFUSED");
      expect(gap.externalEffects).toBe("NONE");
      expect(gap.liveProviderWiring).toBe("NOT_WIRED");
    }
  });

  it("refuses inventing until-instant on America/New_York fall-back ambiguity (B9)", () => {
    const amb = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
      rootVerification: {
        timeZone: "America/New_York",
        // 2025-11-02 01:30 is ambiguous (US fall-back).
        year: 2025,
        month: 11,
        day: 2,
        hour: 1,
        minute: 30,
        asOfInstantIso: "2025-11-02T05:00:00.000Z",
      },
    });
    expect(amb.ok).toBe(false);
    if (!amb.ok) {
      expect(amb.reason).toBe("AMBIGUOUS_LOCAL_VERIFICATION");
      expect(amb.liveProviderWiring).toBe("NOT_WIRED");
    }
  });

  it("refuses unsupported verification timezone (B9)", () => {
    const bad = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
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
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reason).toBe("INVALID_TIMEZONE");
    }
  });

  it("refuses blank candidate path before authorize (B13)", () => {
    const blank = evaluateWriteWithinRoot("/var/ws/root", "   ", {
      resolveCanonical: false,
    });
    expect(blank.ok).toBe(false);
    if (!blank.ok) {
      expect(blank.reason).toBe("CANDIDATE_REQUIRED");
      expect(blank.externalEffects).toBe("NONE");
      expect(blank.liveProviderWiring).toBe("NOT_WIRED");
    }
  });

  it("refuses inventing expiry when asOfInstantIso is non-finite (B13)", () => {
    const badAsOf = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
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
    expect(badAsOf.ok).toBe(false);
    if (!badAsOf.ok) {
      expect(badAsOf.reason).toBe("INVALID_AS_OF_INSTANT");
      expect(badAsOf.externalEffects).toBe("NONE");
      expect(badAsOf.liveProviderWiring).toBe("NOT_WIRED");
    }
  });

  it("refuses empty-string asOfInstantIso (B21)", () => {
    const emptyAsOf = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
      rootVerification: {
        timeZone: "America/New_York",
        year: 2026,
        month: 3,
        day: 8,
        hour: 1,
        minute: 30,
        asOfInstantIso: "",
      },
    });
    expect(emptyAsOf.ok).toBe(false);
    if (!emptyAsOf.ok) {
      expect(emptyAsOf.reason).toBe("INVALID_AS_OF_INSTANT");
    }
  });

  it("refuses mixed-whitespace-only asOfInstantIso (B25)", () => {
    const mixAsOf = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
      rootVerification: {
        timeZone: "America/New_York",
        year: 2026,
        month: 3,
        day: 8,
        hour: 1,
        minute: 30,
        asOfInstantIso: " \t\n\r",
      },
    });
    expect(mixAsOf.ok).toBe(false);
    if (!mixAsOf.ok) {
      expect(mixAsOf.reason).toBe("INVALID_AS_OF_INSTANT");
      expect(mixAsOf.liveProviderWiring).toBe("NOT_WIRED");
    }
  });

  it("refuses zero-width-space asOfInstantIso (B26)", () => {
    const zwspAsOf = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
      rootVerification: {
        timeZone: "America/New_York",
        year: 2026,
        month: 3,
        day: 8,
        hour: 1,
        minute: 30,
        asOfInstantIso: "\u200b",
      },
    });
    expect(zwspAsOf.ok).toBe(false);
    if (!zwspAsOf.ok) {
      expect(zwspAsOf.reason).toBe("INVALID_AS_OF_INSTANT");
      expect(zwspAsOf.externalEffects).toBe("NONE");
    }
  });

  it("refuses byte-order-mark-only asOfInstantIso (B27)", () => {
    const bomAsOf = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
      rootVerification: {
        timeZone: "America/New_York",
        year: 2026,
        month: 3,
        day: 8,
        hour: 1,
        minute: 30,
        asOfInstantIso: "\ufeff",
      },
    });
    expect(bomAsOf.ok).toBe(false);
    if (!bomAsOf.ok) {
      expect(bomAsOf.reason).toBe("INVALID_AS_OF_INSTANT");
      expect(bomAsOf.liveProviderWiring).toBe("NOT_WIRED");
    }
  });

  it("refuses zero-width-non-joiner-only asOfInstantIso (B28)", () => {
    const zwnjAsOf = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
      rootVerification: {
        timeZone: "America/New_York",
        year: 2026,
        month: 3,
        day: 8,
        hour: 1,
        minute: 30,
        asOfInstantIso: "\u200c",
      },
    });
    expect(zwnjAsOf.ok).toBe(false);
    if (!zwnjAsOf.ok) {
      expect(zwnjAsOf.reason).toBe("INVALID_AS_OF_INSTANT");
      expect(zwnjAsOf.externalEffects).toBe("NONE");
    }
  });

  it("refuses zero-width-joiner-only asOfInstantIso (B29)", () => {
    const zwjAsOf = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
      rootVerification: {
        timeZone: "America/New_York",
        year: 2026,
        month: 3,
        day: 8,
        hour: 1,
        minute: 30,
        asOfInstantIso: "\u200d",
      },
    });
    expect(zwjAsOf.ok).toBe(false);
    if (!zwjAsOf.ok) {
      expect(zwjAsOf.reason).toBe("INVALID_AS_OF_INSTANT");
      expect(zwjAsOf.liveProviderWiring).toBe("NOT_WIRED");
    }
  });

  it("refuses word-joiner-only asOfInstantIso (B30)", () => {
    const wjAsOf = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
      rootVerification: {
        timeZone: "America/New_York",
        year: 2026,
        month: 3,
        day: 8,
        hour: 1,
        minute: 30,
        asOfInstantIso: "\u2060",
      },
    });
    expect(wjAsOf.ok).toBe(false);
    if (!wjAsOf.ok) {
      expect(wjAsOf.reason).toBe("INVALID_AS_OF_INSTANT");
      expect(wjAsOf.externalEffects).toBe("NONE");
    }
  });

  it("refuses hair-space-only asOfInstantIso (B31)", () => {
    const hairAsOf = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
      rootVerification: {
        timeZone: "America/New_York",
        year: 2026,
        month: 3,
        day: 8,
        hour: 1,
        minute: 30,
        asOfInstantIso: "\u200A",
      },
    });
    expect(hairAsOf.ok).toBe(false);
    if (!hairAsOf.ok) {
      expect(hairAsOf.reason).toBe("INVALID_AS_OF_INSTANT");
      expect(hairAsOf.externalEffects).toBe("NONE");
    }
  });

  it("refuses narrow-no-break-space-only asOfInstantIso (B32)", () => {
    const nnbspAsOf = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
      rootVerification: {
        timeZone: "America/New_York",
        year: 2026,
        month: 3,
        day: 8,
        hour: 1,
        minute: 30,
        asOfInstantIso: "\u202F",
      },
    });
    expect(nnbspAsOf.ok).toBe(false);
    if (!nnbspAsOf.ok) {
      expect(nnbspAsOf.reason).toBe("INVALID_AS_OF_INSTANT");
      expect(nnbspAsOf.externalEffects).toBe("NONE");
    }
  });

  it("refuses no-break-space-only asOfInstantIso (B33)", () => {
    const nbspAsOf = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
      rootVerification: {
        timeZone: "America/New_York",
        year: 2026,
        month: 3,
        day: 8,
        hour: 1,
        minute: 30,
        asOfInstantIso: "\u00A0",
      },
    });
    expect(nbspAsOf.ok).toBe(false);
    if (!nbspAsOf.ok) {
      expect(nbspAsOf.reason).toBe("INVALID_AS_OF_INSTANT");
      expect(nbspAsOf.externalEffects).toBe("NONE");
    }
  });

  it("refuses thin-space-only asOfInstantIso (B34)", () => {
    const thinAsOf = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
      rootVerification: {
        timeZone: "America/New_York",
        year: 2026,
        month: 3,
        day: 8,
        hour: 1,
        minute: 30,
        asOfInstantIso: "\u2009",
      },
    });
    expect(thinAsOf.ok).toBe(false);
    if (!thinAsOf.ok) {
      expect(thinAsOf.reason).toBe("INVALID_AS_OF_INSTANT");
      expect(thinAsOf.externalEffects).toBe("NONE");
    }
  });

  it("refuses punctuation-space-only asOfInstantIso (B35)", () => {
    const punctAsOf = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
      rootVerification: {
        timeZone: "America/New_York",
        year: 2026,
        month: 3,
        day: 8,
        hour: 1,
        minute: 30,
        asOfInstantIso: "\u2008",
      },
    });
    expect(punctAsOf.ok).toBe(false);
    if (!punctAsOf.ok) {
      expect(punctAsOf.reason).toBe("INVALID_AS_OF_INSTANT");
      expect(punctAsOf.externalEffects).toBe("NONE");
    }
  });

  it("refuses figure-space-only asOfInstantIso (B36)", () => {
    const figureAsOf = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
      rootVerification: {
        timeZone: "America/New_York",
        year: 2026,
        month: 3,
        day: 8,
        hour: 1,
        minute: 30,
        asOfInstantIso: "\u2007",
      },
    });
    expect(figureAsOf.ok).toBe(false);
    if (!figureAsOf.ok) {
      expect(figureAsOf.reason).toBe("INVALID_AS_OF_INSTANT");
      expect(figureAsOf.externalEffects).toBe("NONE");
    }
  });

  it("refuses six-per-em-space-only asOfInstantIso (B37)", () => {
    const sixPerEmAsOf = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
      rootVerification: {
        timeZone: "America/New_York",
        year: 2026,
        month: 3,
        day: 8,
        hour: 1,
        minute: 30,
        asOfInstantIso: "\u2006",
      },
    });
    expect(sixPerEmAsOf.ok).toBe(false);
    if (!sixPerEmAsOf.ok) {
      expect(sixPerEmAsOf.reason).toBe("INVALID_AS_OF_INSTANT");
      expect(sixPerEmAsOf.externalEffects).toBe("NONE");
    }
  });

  it("refuses carriage-return-only asOfInstantIso (B24)", () => {
    const crAsOf = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
      rootVerification: {
        timeZone: "America/New_York",
        year: 2026,
        month: 3,
        day: 8,
        hour: 1,
        minute: 30,
        asOfInstantIso: "\r",
      },
    });
    expect(crAsOf.ok).toBe(false);
    if (!crAsOf.ok) {
      expect(crAsOf.reason).toBe("INVALID_AS_OF_INSTANT");
      expect(crAsOf.externalEffects).toBe("NONE");
    }
  });

  it("refuses newline-only asOfInstantIso (B23)", () => {
    const nlAsOf = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
      rootVerification: {
        timeZone: "America/New_York",
        year: 2026,
        month: 3,
        day: 8,
        hour: 1,
        minute: 30,
        asOfInstantIso: "\n",
      },
    });
    expect(nlAsOf.ok).toBe(false);
    if (!nlAsOf.ok) {
      expect(nlAsOf.reason).toBe("INVALID_AS_OF_INSTANT");
      expect(nlAsOf.liveProviderWiring).toBe("NOT_WIRED");
    }
  });

  it("refuses tab-only asOfInstantIso (B22)", () => {
    const tabAsOf = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
      rootVerification: {
        timeZone: "America/New_York",
        year: 2026,
        month: 3,
        day: 8,
        hour: 1,
        minute: 30,
        asOfInstantIso: "\t",
      },
    });
    expect(tabAsOf.ok).toBe(false);
    if (!tabAsOf.ok) {
      expect(tabAsOf.reason).toBe("INVALID_AS_OF_INSTANT");
      expect(tabAsOf.externalEffects).toBe("NONE");
    }
  });

  it("refuses whitespace-only asOfInstantIso (B20)", () => {
    const wsAsOf = evaluateWriteWithinRoot("/var/ws/root", "/var/ws/root/x", {
      resolveCanonical: false,
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
    expect(wsAsOf.ok).toBe(false);
    if (!wsAsOf.ok) {
      expect(wsAsOf.reason).toBe("INVALID_AS_OF_INSTANT");
      expect(wsAsOf.externalEffects).toBe("NONE");
      expect(wsAsOf.liveProviderWiring).toBe("NOT_WIRED");
    }
  });

  it("allows in-root write inside unique civil until; expires after; escape still wins (B9)", () => {
    const base = mkdtempSync(join(tmpdir(), "ws-write-dst-"));
    dirs.push(base);
    const root = join(base, "allowed");
    const outside = join(base, "secret");
    mkdirSync(root, { recursive: true });
    mkdirSync(outside, { recursive: true });
    const target = join(root, "safe.txt");
    writeFileSync(target, "ok");
    writeFileSync(join(outside, "leak.txt"), "secret");
    const escapeLink = join(root, "escape");
    symlinkSync(outside, escapeLink);

    const verification = {
      timeZone: "America/New_York",
      // Unique civil time before spring gap.
      year: 2026,
      month: 3,
      day: 8,
      hour: 1,
      minute: 30,
      asOfInstantIso: "2026-03-08T05:00:00.000Z",
    } as const;

    const allowed = evaluateWriteWithinRoot(root, target, {
      rootVerification: verification,
    });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.externalEffects).toBe("NONE");
    }

    const expired = evaluateWriteWithinRoot(root, target, {
      rootVerification: {
        ...verification,
        asOfInstantIso: "2026-03-08T07:00:00.000Z",
      },
    });
    expect(expired.ok).toBe(false);
    if (!expired.ok) {
      expect(expired.reason).toBe("ROOT_VERIFICATION_EXPIRED");
    }

    const escape = evaluateWriteWithinRoot(
      root,
      join(escapeLink, "leak.txt"),
      { rootVerification: verification },
    );
    expect(escape.ok).toBe(false);
    if (!escape.ok) {
      expect(escape.reason).toBe("SYMLINK_ESCAPE_OUTSIDE_ROOT");
    }
  });
});
