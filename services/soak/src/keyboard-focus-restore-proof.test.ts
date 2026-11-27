import { describe, expect, it } from "vitest";
import { SoakProofKind } from "@worksocial/domain";
import { proofKeyboardFocusRestoreAfterDialog } from "./keyboard-focus-restore-proof.js";

describe("T-X061 soak proof builder", () => {
  const now = "2026-11-21T19:00:00.000Z";

  it("emits KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG with fixtureOnly and no live claims", () => {
    const proof = proofKeyboardFocusRestoreAfterDialog(now);
    expect(proof.passed).toBe(true);
    expect(proof.kind).toBe(SoakProofKind.KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG);
    expect(proof.fixtureOnly).toBe(true);
    expect(proof.applyAttemptCount).toBe(1);
    expect(
      proof.details.some((d) => /externalEffects=NONE/i.test(d)),
    ).toBe(true);
    expect(
      proof.details.some((d) => /liveProviderSuccessClaimed=false/i.test(d)),
    ).toBe(true);
    expect(proof.details.some((d) => /not browser VERIFIED/i.test(d))).toBe(
      true,
    );
  });
});