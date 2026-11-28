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

  it("refuses open without a trigger id", () => {
    const decision = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "",
      dialogFocusables: dialog,
    });
    expect(decision.ok).toBe(false);
    expect(decision.reasons.join(" ")).toMatch(/Missing trigger/i);
    expect(decision.session.overlayOpen).toBe(false);
  });

  it("retains trap with a single dialog focusable (wrap stays in-dialog)", () => {
    const sole = ["dlg-only"] as const;
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: sole,
    });
    const forward = cycleDialogFocus({
      session: opened.session,
      direction: "forward",
    });
    expect(forward.code).toBe("TRAP_CYCLE");
    expect(forward.session.activeFocusId).toBe("dlg-only");
    const backward = cycleDialogFocus({
      session: forward.session,
      direction: "backward",
    });
    expect(backward.session.activeFocusId).toBe("dlg-only");
    expect(backward.session.overlayOpen).toBe(true);
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

  it("preserves savedTrigger across repeated trap cycles until close", () => {
    const three = ["dlg-close", "dlg-primary", "dlg-secondary"] as const;
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: three,
    });
    let session = opened.session;
    for (let i = 0; i < 5; i++) {
      const step = cycleDialogFocus({ session, direction: "forward" });
      expect(step.ok).toBe(true);
      session = step.session;
      expect(session.savedTriggerId).toBe("btn-review");
      expect(session.overlayOpen).toBe(true);
    }
    const closed = closeOverlayRestoreFocus({ session });
    expect(closed.code).toBe("FOCUS_RESTORED");
    expect(closed.session.activeFocusId).toBe("btn-review");
  });

  it("evaluateKeyboardFocusRestoreReview fails closed when dialog has no focusables", () => {
    const result = evaluateKeyboardFocusRestoreReview({
      triggerId: "btn-review",
      dialogFocusables: [],
    });
    expect(result.passed).toBe(false);
    expect(result.details.some((d) => /Open failed/i.test(d))).toBe(true);
  });

  it("evaluateKeyboardFocusRestoreReview fails closed when trigger id is missing", () => {
    const result = evaluateKeyboardFocusRestoreReview({
      triggerId: "",
      dialogFocusables: dialog,
    });
    expect(result.passed).toBe(false);
    expect(result.details.some((d) => /Open failed/i.test(d))).toBe(true);
  });

  it("refuses trap after close until overlay reopens (T43)", () => {
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: dialog,
    });
    const closed = closeOverlayRestoreFocus({ session: opened.session });
    expect(closed.code).toBe("FOCUS_RESTORED");
    const tab = cycleDialogFocus({
      session: closed.session,
      direction: "forward",
    });
    expect(tab.ok).toBe(false);
    expect(tab.reasons.join(" ")).toMatch(/not open/i);
    expect(tab.session.overlayOpen).toBe(false);
  });

  it("openOverlayFocus snapshots dialogFocusables against later mutation (T47)", () => {
    const list = ["dlg-a", "dlg-b"] as const;
    const mutable: string[] = [...list];
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: mutable,
    });
    mutable.push("dlg-injected");
    expect(opened.session.dialogFocusables).toEqual(["dlg-a", "dlg-b"]);
    expect(opened.session.dialogFocusables).not.toContain("dlg-injected");
  });

  it("markTriggerUnrestorable keeps trap active until close (T45)", () => {
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: dialog,
    });
    const marked = markTriggerUnrestorable(opened.session);
    expect(marked.overlayOpen).toBe(true);
    expect(marked.triggerRestorable).toBe(false);
    expect(marked.savedTriggerId).toBe("btn-review");
    const step = cycleDialogFocus({
      session: marked,
      direction: "forward",
    });
    expect(step.ok).toBe(true);
    expect(step.session.overlayOpen).toBe(true);
    const closed = closeOverlayRestoreFocus({ session: step.session });
    expect(closed.code).toBe("FOCUS_LOST");
  });

  it("fails closed FOCUS_LOST when overlay open but savedTrigger cleared (T44)", () => {
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: dialog,
    });
    const corrupt = { ...opened.session, savedTriggerId: null };
    const closed = closeOverlayRestoreFocus({ session: corrupt });
    expect(closed.ok).toBe(false);
    expect(closed.code).toBe("FOCUS_LOST");
    expect(closed.session.overlayOpen).toBe(false);
    expect(closed.session.activeFocusId).toBeNull();
  });

  it("re-anchors backward trap when activeFocusId is stale (T44)", () => {
    const three = ["dlg-close", "dlg-primary", "dlg-secondary"] as const;
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: three,
    });
    const step = cycleDialogFocus({
      session: { ...opened.session, activeFocusId: "dlg-removed" },
      direction: "backward",
    });
    expect(step.ok).toBe(true);
    expect(step.code).toBe("TRAP_CYCLE");
    expect(step.session.activeFocusId).toBe("dlg-secondary");
    expect(step.session.savedTriggerId).toBe("btn-review");
  });

  it("allows fresh open after restore resets overlay session (T43)", () => {
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: dialog,
    });
    const closed = closeOverlayRestoreFocus({ session: opened.session });
    const reopened = openOverlayFocus({
      session: closed.session,
      triggerId: "btn-other",
      dialogFocusables: dialog,
    });
    expect(reopened.ok).toBe(true);
    expect(reopened.code).toBe("OPENED");
    expect(reopened.session.savedTriggerId).toBe("btn-other");
    expect(reopened.session.overlayOpen).toBe(true);
  });

  it("re-anchors trap cycle when activeFocusId is stale (not in dialog list)", () => {
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: dialog,
    });
    const staleSession = {
      ...opened.session,
      activeFocusId: "dlg-removed",
    };
    const step = cycleDialogFocus({
      session: staleSession,
      direction: "forward",
    });
    expect(step.ok).toBe(true);
    expect(step.code).toBe("TRAP_CYCLE");
    expect(step.session.activeFocusId).toBe("dlg-confirm");
    expect(step.session.savedTriggerId).toBe("btn-review");
    expect(step.session.overlayOpen).toBe(true);
  });

  it("evaluateKeyboardFocusRestoreReview passes with single focusable dialog (T48)", () => {
    const result = evaluateKeyboardFocusRestoreReview({
      triggerId: "btn-review",
      dialogFocusables: ["dlg-only"],
    });
    expect(result.passed).toBe(true);
    expect(result.restored.code).toBe("FOCUS_RESTORED");
    expect(result.lost.code).toBe("FOCUS_LOST");
  });

  it("evaluateKeyboardFocusRestoreReview details pin boundary trap lines (T49)", () => {
    const result = evaluateKeyboardFocusRestoreReview({
      triggerId: "btn-review",
      dialogFocusables: dialog,
    });
    expect(result.passed).toBe(true);
    expect(result.details.some((d) => /Tab backward/i.test(d))).toBe(true);
    expect(result.details.some((d) => /Tab forward/i.test(d))).toBe(true);
    expect(result.details.some((d) => /Re-open refused/i.test(d))).toBe(true);
  });

  it("after FOCUS_LOST trap and close refuse until fresh open (T50)", () => {
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: dialog,
    });
    const lost = closeOverlayRestoreFocus({
      session: markTriggerUnrestorable(opened.session),
    });
    expect(lost.code).toBe("FOCUS_LOST");
    expect(lost.session.overlayOpen).toBe(false);
    expect(lost.session.activeFocusId).toBeNull();
    expect(lost.session.savedTriggerId).toBeNull();
    const tab = cycleDialogFocus({
      session: lost.session,
      direction: "forward",
    });
    expect(tab.ok).toBe(false);
    expect(tab.reasons.join(" ")).toMatch(/not open/i);
    const closedAgain = closeOverlayRestoreFocus({ session: lost.session });
    expect(closedAgain.ok).toBe(false);
    expect(closedAgain.reasons.join(" ")).toMatch(/not open/i);
    const reopened = openOverlayFocus({
      session: lost.session,
      triggerId: "btn-other",
      dialogFocusables: dialog,
    });
    expect(reopened.ok).toBe(true);
    expect(reopened.code).toBe("OPENED");
    expect(reopened.session.savedTriggerId).toBe("btn-other");
    expect(reopened.session.triggerRestorable).toBe(true);
  });

  it("evaluateKeyboardFocusRestoreReview details pin Focus restored + FOCUS_LOST (T50)", () => {
    const result = evaluateKeyboardFocusRestoreReview({
      triggerId: "btn-review",
      dialogFocusables: dialog,
    });
    expect(result.passed).toBe(true);
    expect(result.details.some((d) => /Focus restored to trigger/i.test(d))).toBe(
      true,
    );
    expect(result.details.some((d) => /unrestorable — FOCUS_LOST/i.test(d))).toBe(
      true,
    );
  });

  it("refused re-open preserves activeFocus + dialogFocusables + restorable (T52)", () => {
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: dialog,
    });
    const stepped = cycleDialogFocus({
      session: opened.session,
      direction: "forward",
    });
    expect(stepped.session.activeFocusId).toBe("dlg-confirm");
    const refused = openOverlayFocus({
      session: stepped.session,
      triggerId: "btn-other",
      dialogFocusables: ["dlg-injected"],
    });
    expect(refused.ok).toBe(false);
    expect(refused.session).toBe(stepped.session);
    expect(refused.session.savedTriggerId).toBe("btn-review");
    expect(refused.session.activeFocusId).toBe("dlg-confirm");
    expect(refused.session.dialogFocusables).toEqual(["dlg-close", "dlg-confirm"]);
    expect(refused.session.triggerRestorable).toBe(true);
    expect(refused.session.overlayOpen).toBe(true);
  });

  it("markTriggerUnrestorable is idempotent before close (T54)", () => {
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: dialog,
    });
    expect(opened.session.triggerRestorable).toBe(true);
    const once = markTriggerUnrestorable(opened.session);
    expect(once.triggerRestorable).toBe(false);
    expect(once.savedTriggerId).toBe("btn-review");
    expect(once.overlayOpen).toBe(true);
    expect(once.dialogFocusables).toEqual(opened.session.dialogFocusables);
    expect(once.activeFocusId).toBe(opened.session.activeFocusId);
    const twice = markTriggerUnrestorable(once);
    expect(twice).toEqual(once);
    const closed = closeOverlayRestoreFocus({ session: twice });
    expect(closed.code).toBe("FOCUS_LOST");
  });

  it("idempotent mark keeps trap through Tab then FOCUS_LOST close (T55)", () => {
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: dialog,
    });
    const once = markTriggerUnrestorable(opened.session);
    const marked = markTriggerUnrestorable(once);
    expect(marked).toEqual(once);
    const step = cycleDialogFocus({
      session: marked,
      direction: "forward",
    });
    expect(step.ok).toBe(true);
    expect(step.session.overlayOpen).toBe(true);
    const closed = closeOverlayRestoreFocus({ session: step.session });
    expect(closed.code).toBe("FOCUS_LOST");
  });

  it("cycleDialogFocus fails closed when open session has empty focusables (T52)", () => {
    const opened = openOverlayFocus({
      session: emptyFocusSession(),
      triggerId: "btn-review",
      dialogFocusables: dialog,
    });
    const corrupt = { ...opened.session, dialogFocusables: [] as const };
    const tab = cycleDialogFocus({
      session: corrupt,
      direction: "forward",
    });
    expect(tab.ok).toBe(false);
    expect(tab.reasons.join(" ")).toMatch(/no dialog focusables/i);
    expect(tab.session.overlayOpen).toBe(true);
    expect(tab.session.savedTriggerId).toBe("btn-review");
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
