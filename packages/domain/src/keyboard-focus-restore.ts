/**
 * T-X061 — Keyboard review and focus restore (A11y).
 *
 * Pure domain model of dialog/overlay focus lifecycle (no browser):
 * - Opening captures the trigger focus target and moves into the dialog.
 * - While open, Tab / Shift+Tab cycle only among dialog focusables (trap).
 * - Closing restores focus to the captured trigger when it remains restorable.
 * - Closing without a restorable trigger fails closed as FOCUS_LOST.
 *
 * Distinct from T-US-055 (full keyboard journey + reduced motion — still NOT_RUN).
 * External effects: NONE. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 */

export type FocusTargetId = string;

export type KeyboardFocusRestoreCode =
  | "OPENED"
  | "TRAP_CYCLE"
  | "FOCUS_RESTORED"
  | "FOCUS_LOST"
  | null;

export type FocusSession = {
  overlayOpen: boolean;
  /** Trigger that opened the overlay; restored on close when restorable. */
  savedTriggerId: FocusTargetId | null;
  /** Whether the saved trigger remains connected/restorable. */
  triggerRestorable: boolean;
  dialogFocusables: readonly FocusTargetId[];
  activeFocusId: FocusTargetId | null;
};

export type KeyboardFocusRestoreDecision = {
  code: KeyboardFocusRestoreCode;
  ok: boolean;
  reasons: string[];
  session: FocusSession;
};

export function emptyFocusSession(): FocusSession {
  return {
    overlayOpen: false,
    savedTriggerId: null,
    triggerRestorable: false,
    dialogFocusables: [],
    activeFocusId: null,
  };
}

/**
 * Open an overlay/dialog: capture trigger, move focus into first dialog control.
 */
export function openOverlayFocus(input: {
  session: FocusSession;
  triggerId: FocusTargetId;
  dialogFocusables: readonly FocusTargetId[];
}): KeyboardFocusRestoreDecision {
  if (input.session.overlayOpen) {
    return {
      code: null,
      ok: false,
      reasons: [
        "Overlay already open — refuse re-open (preserves savedTrigger; no nested stack)",
      ],
      session: input.session,
    };
  }
  if (input.dialogFocusables.length === 0) {
    return {
      code: null,
      ok: false,
      reasons: ["Dialog has no focusable controls — cannot open for keyboard review"],
      session: input.session,
    };
  }
  if (!input.triggerId) {
    return {
      code: null,
      ok: false,
      reasons: ["Missing trigger id — cannot capture focus restore target"],
      session: input.session,
    };
  }
  const session: FocusSession = {
    overlayOpen: true,
    savedTriggerId: input.triggerId,
    triggerRestorable: true,
    dialogFocusables: [...input.dialogFocusables],
    activeFocusId: input.dialogFocusables[0]!,
  };
  return {
    code: "OPENED",
    ok: true,
    reasons: [
      `Overlay opened; savedTrigger=${input.triggerId}; activeFocus=${session.activeFocusId}`,
    ],
    session,
  };
}

/**
 * Cycle focus within the open dialog (Tab / Shift+Tab trap).
 */
export function cycleDialogFocus(input: {
  session: FocusSession;
  direction: "forward" | "backward";
}): KeyboardFocusRestoreDecision {
  if (!input.session.overlayOpen) {
    return {
      code: null,
      ok: false,
      reasons: ["Overlay not open — cannot trap Tab"],
      session: input.session,
    };
  }
  const list = input.session.dialogFocusables;
  if (list.length === 0) {
    return {
      code: null,
      ok: false,
      reasons: ["No dialog focusables"],
      session: input.session,
    };
  }
  const currentIdx = Math.max(
    0,
    list.indexOf(input.session.activeFocusId ?? list[0]!),
  );
  const nextIdx =
    input.direction === "forward"
      ? (currentIdx + 1) % list.length
      : (currentIdx - 1 + list.length) % list.length;
  const session: FocusSession = {
    ...input.session,
    activeFocusId: list[nextIdx]!,
  };
  return {
    code: "TRAP_CYCLE",
    ok: true,
    reasons: [
      `Tab ${input.direction}: ${list[currentIdx]} → ${session.activeFocusId} (trap retained)`,
    ],
    session,
  };
}

/**
 * Mark the saved trigger as disconnected (e.g. unmounted) before close.
 */
export function markTriggerUnrestorable(session: FocusSession): FocusSession {
  return { ...session, triggerRestorable: false };
}

/**
 * Close overlay and restore focus to the saved trigger when restorable.
 */
export function closeOverlayRestoreFocus(input: {
  session: FocusSession;
}): KeyboardFocusRestoreDecision {
  if (!input.session.overlayOpen) {
    return {
      code: null,
      ok: false,
      reasons: ["Overlay not open — nothing to restore"],
      session: input.session,
    };
  }
  const trigger = input.session.savedTriggerId;
  if (trigger && input.session.triggerRestorable) {
    const session: FocusSession = {
      overlayOpen: false,
      savedTriggerId: null,
      triggerRestorable: false,
      dialogFocusables: [],
      activeFocusId: trigger,
    };
    return {
      code: "FOCUS_RESTORED",
      ok: true,
      reasons: [`Focus restored to trigger ${trigger}`],
      session,
    };
  }
  const session: FocusSession = {
    overlayOpen: false,
    savedTriggerId: null,
    triggerRestorable: false,
    dialogFocusables: [],
    activeFocusId: null,
  };
  return {
    code: "FOCUS_LOST",
    ok: false,
    reasons: [
      trigger
        ? `Trigger ${trigger} unrestorable — FOCUS_LOST (a11y fail-closed)`
        : "No saved trigger — FOCUS_LOST (a11y fail-closed)",
    ],
    session,
  };
}

/**
 * Full keyboard-review sequence used by the soak proof:
 * open → refuse re-open → boundary Tab wraps → close with restore;
 * plus a negative FOCUS_LOST control.
 */
export function evaluateKeyboardFocusRestoreReview(input: {
  triggerId: FocusTargetId;
  dialogFocusables: readonly FocusTargetId[];
}): {
  passed: boolean;
  details: string[];
  restored: KeyboardFocusRestoreDecision;
  lost: KeyboardFocusRestoreDecision;
} {
  const details: string[] = [];
  let passed = true;
  const list = input.dialogFocusables;
  const first = list[0];
  const last = list[list.length - 1];

  const opened = openOverlayFocus({
    session: emptyFocusSession(),
    triggerId: input.triggerId,
    dialogFocusables: list,
  });
  if (!(opened.ok && opened.code === "OPENED" && first != null)) {
    passed = false;
    details.push(`Open failed: ${opened.reasons.join("; ")}`);
  } else {
    details.push(...opened.reasons);
  }

  // Refuse re-open while overlay is already open (preserve savedTrigger).
  const reOpen = openOverlayFocus({
    session: opened.session,
    triggerId: "btn-other",
    dialogFocusables: list,
  });
  if (
    !(
      reOpen.ok === false &&
      reOpen.session.savedTriggerId === input.triggerId &&
      reOpen.session.overlayOpen === true
    )
  ) {
    passed = false;
    details.push(
      `Re-open unexpectedly ok=${reOpen.ok} savedTrigger=${reOpen.session.savedTriggerId}`,
    );
  } else {
    details.push("Re-open refused; savedTrigger preserved");
  }

  let session = opened.session;

  // Boundary: Shift+Tab from first wraps to last.
  const backWrap = cycleDialogFocus({ session, direction: "backward" });
  if (
    !(
      backWrap.ok &&
      backWrap.code === "TRAP_CYCLE" &&
      last != null &&
      backWrap.session.activeFocusId === last
    )
  ) {
    passed = false;
    details.push(`Backward wrap failed: ${backWrap.reasons.join("; ")}`);
  } else {
    details.push(...backWrap.reasons);
  }
  session = backWrap.session;

  // Boundary: Tab from last wraps to first.
  const forwardWrap = cycleDialogFocus({ session, direction: "forward" });
  if (
    !(
      forwardWrap.ok &&
      forwardWrap.code === "TRAP_CYCLE" &&
      first != null &&
      forwardWrap.session.activeFocusId === first
    )
  ) {
    passed = false;
    details.push(`Forward wrap failed: ${forwardWrap.reasons.join("; ")}`);
  } else {
    details.push(...forwardWrap.reasons);
  }
  session = forwardWrap.session;

  const restored = closeOverlayRestoreFocus({ session });
  if (
    !(
      restored.ok &&
      restored.code === "FOCUS_RESTORED" &&
      restored.session.activeFocusId === input.triggerId
    )
  ) {
    passed = false;
    details.push(`Restore failed: ${restored.reasons.join("; ")}`);
  } else {
    details.push(...restored.reasons);
  }

  // Negative control: unrestorable trigger → FOCUS_LOST (must not silently claim restore).
  const reopened = openOverlayFocus({
    session: emptyFocusSession(),
    triggerId: input.triggerId,
    dialogFocusables: list,
  });
  const lost = closeOverlayRestoreFocus({
    session: markTriggerUnrestorable(reopened.session),
  });
  if (!(lost.ok === false && lost.code === "FOCUS_LOST")) {
    passed = false;
    details.push(
      `FOCUS_LOST control unexpectedly ${lost.code} ok=${lost.ok}`,
    );
  } else {
    details.push(...lost.reasons);
  }

  return { passed, details, restored, lost };
}

export const KEYBOARD_FOCUS_RESTORE_RELATED_CASE_IDS = ["T-X061"] as const;
