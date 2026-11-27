/**
 * Contract: T-X061 keyboard focus restore (recently landed #107).
 * Additive coverage around domain + soak map honesty.
 * ACCEPTED ≠ VERIFIED. External effects NONE. Live wiring NOT_WIRED.
 * Distinct from T-US-055 (full keyboard journey — still NOT_RUN).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AcceptanceCaseStatus,
  AcceptanceEnvironment,
  KEYBOARD_FOCUS_RESTORE_RELATED_CASE_IDS,
  SoakProofKind,
  closeOverlayRestoreFocus,
  cycleDialogFocus,
  emptyFocusSession,
  evaluateKeyboardFocusRestoreReview,
  expectedProofsForFixtureCase,
  mapProofToFixtureCases,
  markTriggerUnrestorable,
  openOverlayFocus,
} from "@worksocial/domain";
import { createFileSoakStore } from "@worksocial/persistence";
import {
  compileAcceptanceEvidence,
  createSoakService,
  runSoakRecoveryHarness,
} from "@worksocial/soak";

/** Same fixture clock as m9 soak contracts (after-hours coverage windows). */
const now = "2026-11-21T19:00:00.000Z";
const dialog = ["dlg-close", "dlg-primary", "dlg-secondary"] as const;

describe("contract: T-X061 keyboard focus restore", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-tx061-contract-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("opens, traps Tab at boundaries, restores focus, and fails closed on lost trigger", () => {
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-keyboard-review",
      dialogFocusables: dialog,
    });
    expect(opened.ok).toBe(true);
    expect(opened.code).toBe("OPENED");
    expect(opened.session.savedTriggerId).toBe("btn-keyboard-review");
    expect(opened.session.activeFocusId).toBe("dlg-close");

    const reOpen = openOverlayFocus({
      session: opened.session,
      triggerId: "btn-other",
      dialogFocusables: dialog,
    });
    expect(reOpen.ok).toBe(false);
    expect(reOpen.session.savedTriggerId).toBe("btn-keyboard-review");

    const backWrap = cycleDialogFocus({
      session: opened.session,
      direction: "backward",
    });
    expect(backWrap.code).toBe("TRAP_CYCLE");
    expect(backWrap.session.activeFocusId).toBe("dlg-secondary");

    const forwardWrap = cycleDialogFocus({
      session: backWrap.session,
      direction: "forward",
    });
    expect(forwardWrap.session.activeFocusId).toBe("dlg-close");

    const restored = closeOverlayRestoreFocus({ session: forwardWrap.session });
    expect(restored.ok).toBe(true);
    expect(restored.code).toBe("FOCUS_RESTORED");
    expect(restored.session.activeFocusId).toBe("btn-keyboard-review");

    const reopened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-keyboard-review",
      dialogFocusables: dialog,
    });
    const lost = closeOverlayRestoreFocus({
      session: markTriggerUnrestorable(reopened.session),
    });
    expect(lost.ok).toBe(false);
    expect(lost.code).toBe("FOCUS_LOST");
    expect(lost.session.activeFocusId).toBeNull();
  });

  it("cycleDialogFocus fails closed when overlay is not open", () => {
    const tab = cycleDialogFocus({
      session: emptyFocusSession(),
      direction: "forward",
    });
    expect(tab.ok).toBe(false);
    expect(tab.reasons.join(" ")).toMatch(/not open/i);
  });

  it("openOverlayFocus fails closed on empty dialog (externalEffects NONE model)", () => {
    const decision = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-keyboard-review",
      dialogFocusables: [],
    });
    expect(decision.ok).toBe(false);
    expect(decision.reasons.join(" ")).toMatch(/no focusable/i);
  });

  it("evaluateKeyboardFocusRestoreReview passes and maps T-X061 only", () => {
    const review = evaluateKeyboardFocusRestoreReview({
      triggerId: "btn-keyboard-review",
      dialogFocusables: dialog,
    });
    expect(review.passed).toBe(true);
    expect(review.restored.code).toBe("FOCUS_RESTORED");
    expect(review.lost.code).toBe("FOCUS_LOST");

    expect([...KEYBOARD_FOCUS_RESTORE_RELATED_CASE_IDS]).toEqual(["T-X061"]);
    expect(expectedProofsForFixtureCase("T-X061")).toEqual([
      SoakProofKind.KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG),
    ).toEqual(["T-X061"]);
  });

  it("harness + compiler mark T-X061 fixture ACCEPTED, never VERIFIED", async () => {
    const harness = await runSoakRecoveryHarness({
      stateDir: dir,
      nowIso: now,
    });
    expect(harness.allPassed).toBe(true);
    const proof = harness.proofs.find(
      (p) => p.kind === SoakProofKind.KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG,
    );
    expect(proof).toBeDefined();
    expect(proof?.passed).toBe(true);
    expect(proof?.fixtureOnly).toBe(true);
    expect(
      proof?.details.some((d) => /externalEffects=NONE/i.test(d)),
    ).toBe(true);

    const compiled = compileAcceptanceEvidence({
      proofs: harness.proofs,
      nowIso: "2026-11-21T19:01:00.000Z",
      runId: "soak-tx061-contract",
    });
    const row = compiled.caseResults.find((c) => c.caseId === "T-X061");
    expect(row?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(row?.environment).toBe(AcceptanceEnvironment.FIXTURE);
    expect(String(row?.status).toUpperCase()).not.toBe("VERIFIED");
    expect(compiled.chatgptAds.allowed).toBe(false);
    expect(compiled.blockedLiveVerified).toBe(true);

    const soak = createSoakService(createFileSoakStore(dir));
    const run = await soak.runFixtureSoak({ harnessNowIso: now });
    expect(run.ok).toBe(true);
    expect(run.run.externalEffects).toBe("NONE");
    expect(run.run.liveWiring.cms).toBe("NOT_WIRED");
    const tx061 = run.run.caseResults.find((c) => c.caseId === "T-X061");
    expect(tx061?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(tx061?.environment).toBe(AcceptanceEnvironment.FIXTURE);
    expect(String(tx061?.status).toUpperCase()).not.toBe("VERIFIED");
  });
});
