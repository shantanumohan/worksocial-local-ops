import { describe, expect, it } from "vitest";
import {
  closeOverlayRestoreFocus,
  cycleDialogFocus,
  dismissOverlayViaEscape,
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
    expect(decision.liveBrowserWiring).toBe("NOT_WIRED");
    expect(decision.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(decision.externalEffects).toBe("NONE");
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
    expect(closed.liveBrowserWiring).toBe("NOT_WIRED");
  });

  it("Escape dismiss restores focus to the trigger", () => {
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: dialog,
    });
    const escaped = dismissOverlayViaEscape({ session: opened.session });
    expect(escaped.ok).toBe(true);
    expect(escaped.code).toBe("FOCUS_RESTORED");
    expect(escaped.session.activeFocusId).toBe("btn-review");
    expect(escaped.liveBrowserWiring).toBe("NOT_WIRED");
  });

  it("Escape while closed refuses silent restore", () => {
    const escaped = dismissOverlayViaEscape({ session: emptyFocusSession() });
    expect(escaped.ok).toBe(false);
    expect(escaped.code).toBeNull();
    expect(escaped.externalEffects).toBe("NONE");
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

  it("evaluateKeyboardFocusRestoreReview passes open/trap/escape/restore + lost control", () => {
    const result = evaluateKeyboardFocusRestoreReview({
      triggerId: "btn-review",
      dialogFocusables: dialog,
    });
    expect(result.passed).toBe(true);
    expect(result.restored.code).toBe("FOCUS_RESTORED");
    expect(result.escaped.code).toBe("FOCUS_RESTORED");
    expect(result.lost.code).toBe("FOCUS_LOST");
    expect(result.liveBrowserWiring).toBe("NOT_WIRED");
    expect(result.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(result.liveProviderSuccessClaimed).toBe(false);
    expect(result.externalEffects).toBe("NONE");
  });

  it("refuses live VERIFIED and live browser wire claims", () => {
    const verified = evaluateKeyboardFocusRestoreReview({
      triggerId: "btn-review",
      dialogFocusables: dialog,
      claimLiveVerified: true,
    });
    expect(verified.passed).toBe(false);
    expect(verified.restored.code).toBe("LIVE_BROWSER_CLAIM_REFUSED");
    expect(verified.liveBrowserWiring).toBe("NOT_WIRED");

    const wire = evaluateKeyboardFocusRestoreReview({
      triggerId: "btn-review",
      dialogFocusables: dialog,
      requestLiveBrowserWire: true,
    });
    expect(wire.passed).toBe(false);
    expect(wire.restored.code).toBe("LIVE_BROWSER_CLAIM_REFUSED");
    expect(wire.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
  });
});
