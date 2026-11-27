import { describe, expect, it } from "vitest";
import {
  closeOverlayRestoreFocus,
  cycleDialogFocus,
  emptyFocusSession,
  evaluateKeyboardFocusRestoreReview,
  markTriggerUnrestorable,
  openOverlayFocus,
} from "./keyboard-focus-restore.js";

describe("keyboard focus restore (T-X061)", () => {
  const dialog = ["dlg-close", "dlg-confirm"] as const;

  it("opens overlay and moves focus into the dialog", () => {
    const decision = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: dialog,
    });
    expect(decision.ok).toBe(true);
    expect(decision.code).toBe("OPENED");
    expect(decision.session.savedTriggerId).toBe("btn-review");
    expect(decision.session.activeFocusId).toBe("dlg-close");
    expect(decision.session.overlayOpen).toBe(true);
  });

  it("refuses re-open while overlay is already open", () => {
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: dialog,
    });
    const again = openOverlayFocus({
      session: opened.session,
      triggerId: "btn-other",
      dialogFocusables: dialog,
    });
    expect(again.ok).toBe(false);
    expect(again.session.savedTriggerId).toBe("btn-review");
    expect(again.session.overlayOpen).toBe(true);
  });

  it("traps Tab between adjacent focusables without closing the overlay", () => {
    const three = ["dlg-close", "dlg-primary", "dlg-secondary"] as const;
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: three,
    });
    const mid = cycleDialogFocus({
      session: opened.session,
      direction: "forward",
    });
    expect(mid.code).toBe("TRAP_CYCLE");
    expect(mid.session.activeFocusId).toBe("dlg-primary");
    expect(mid.session.overlayOpen).toBe(true);
    expect(mid.session.savedTriggerId).toBe("btn-review");
    const back = cycleDialogFocus({
      session: mid.session,
      direction: "backward",
    });
    expect(back.session.activeFocusId).toBe("dlg-close");
    expect(back.session.overlayOpen).toBe(true);
  });

  it("traps Tab wrap at both dialog boundaries", () => {
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: dialog,
    });
    const backWrap = cycleDialogFocus({
      session: opened.session,
      direction: "backward",
    });
    expect(backWrap.code).toBe("TRAP_CYCLE");
    expect(backWrap.session.activeFocusId).toBe("dlg-confirm");
    const forwardWrap = cycleDialogFocus({
      session: backWrap.session,
      direction: "forward",
    });
    expect(forwardWrap.session.activeFocusId).toBe("dlg-close");
  });

  it("restores focus to the trigger on close", () => {
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: dialog,
    });
    const closed = closeOverlayRestoreFocus({ session: opened.session });
    expect(closed.ok).toBe(true);
    expect(closed.code).toBe("FOCUS_RESTORED");
    expect(closed.session.activeFocusId).toBe("btn-review");
    expect(closed.session.overlayOpen).toBe(false);
  });

  it("fails closed as FOCUS_LOST when trigger is unrestorable", () => {
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: dialog,
    });
    const closed = closeOverlayRestoreFocus({
      session: markTriggerUnrestorable(opened.session),
    });
    expect(closed.ok).toBe(false);
    expect(closed.code).toBe("FOCUS_LOST");
    expect(closed.session.activeFocusId).toBeNull();
  });

  it("refuses open when dialog has no focusables", () => {
    const decision = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: [],
    });
    expect(decision.ok).toBe(false);
    expect(decision.code).toBeNull();
    expect(decision.session.overlayOpen).toBe(false);
  });

  it("refuses Tab trap and close when overlay is not open", () => {
    const session = emptyFocusSession();
    const tab = cycleDialogFocus({ session, direction: "forward" });
    expect(tab.ok).toBe(false);
    expect(tab.session.overlayOpen).toBe(false);
    const closed = closeOverlayRestoreFocus({ session });
    expect(closed.ok).toBe(false);
    expect(closed.code).toBeNull();
  });

  it("evaluateKeyboardFocusRestoreReview passes open/trap/restore + lost control", () => {
    const result = evaluateKeyboardFocusRestoreReview({
      triggerId: "btn-review",
      dialogFocusables: dialog,
    });
    expect(result.passed).toBe(true);
    expect(result.restored.code).toBe("FOCUS_RESTORED");
    expect(result.lost.code).toBe("FOCUS_LOST");
  });
});
