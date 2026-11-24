/**
 * T-X061 — Keyboard review and focus restore (A11y).
 *
 * Pure domain model of dialog/overlay focus lifecycle (no browser):
 * - Opening captures the trigger focus target and moves into the dialog.
 * - While open, Tab / Shift+Tab cycle only among dialog focusables (trap).
 * - Escape and explicit close restore focus to the captured trigger when
 *   it remains restorable; otherwise fail closed as FOCUS_LOST.
 * - Live Playwright / browser wiring stays NOT_WIRED; live VERIFIED claims
 *   are refused. ChatGPT Ads ACCESS_BLOCKED. External effects: NONE.
 *
 * Distinct from T-US-055 (full keyboard journey + reduced motion).
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 */

export const KEYBOARD_FOCUS_LIVE_BROWSER_WIRING = "NOT_WIRED" as const;

export type KeyboardFocusLiveBrowserWiring =
  typeof KEYBOARD_FOCUS_LIVE_BROWSER_WIRING;

export type FocusTargetId = string;

export type KeyboardFocusRestoreCode =
  | "OPENED"
  | "TRAP_CYCLE"
  | "FOCUS_RESTORED"
  | "FOCUS_LOST"
  | "LIVE_BROWSER_CLAIM_REFUSED"
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

export type KeyboardFocusHonesty = {
  externalEffects: "NONE";
  liveBrowserWiring: KeyboardFocusLiveBrowserWiring;
  liveProviderSuccessClaimed: false;
  chatgptAdsAccess: "ACCESS_BLOCKED";
};

export type KeyboardFocusRestoreDecision = {
  code: KeyboardFocusRestoreCode;
  ok: boolean;
  reasons: string[];
  session: FocusSession;
} & KeyboardFocusHonesty;

function baseHonesty(): KeyboardFocusHonesty {
  return {
    externalEffects: "NONE",
    liveBrowserWiring: KEYBOARD_FOCUS_LIVE_BROWSER_WIRING,
    liveProviderSuccessClaimed: false,
    chatgptAdsAccess: "ACCESS_BLOCKED",
  };
}

function withHonesty(
  decision: Omit<KeyboardFocusRestoreDecision, keyof KeyboardFocusHonesty>,
): KeyboardFocusRestoreDecision {
  return { ...decision, ...baseHonesty() };
}

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
    return withHonesty({
      code: null,
      ok: false,
      reasons: [
        "Overlay already open — refuse re-open (preserves savedTrigger; no nested stack)",
      ],
      session: input.session,
    });
  }
  if (input.dialogFocusables.length === 0) {
    return withHonesty({
      code: null,
      ok: false,
      reasons: ["Dialog has no focusable controls — cannot open for keyboard review"],
      session: input.session,
    });
  }
  if (!input.triggerId) {
    return withHonesty({
      code: null,
      ok: false,
      reasons: ["Missing trigger id — cannot capture focus restore target"],
      session: input.session,
    });
  }
  const session: FocusSession = {
    overlayOpen: true,
    savedTriggerId: input.triggerId,
    triggerRestorable: true,
    dialogFocusables: [...input.dialogFocusables],
    activeFocusId: input.dialogFocusables[0]!,
  };
  return withHonesty({
    code: "OPENED",
    ok: true,
    reasons: [
      `Overlay opened; savedTrigger=${input.triggerId}; activeFocus=${session.activeFocusId}`,
      "liveBrowserWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE",
    ],
    session,
  });
}

/**
 * Cycle focus within the open dialog (Tab / Shift+Tab trap).
 */
export function cycleDialogFocus(input: {
  session: FocusSession;
  direction: "forward" | "backward";
}): KeyboardFocusRestoreDecision {
  if (!input.session.overlayOpen) {
    return withHonesty({
      code: null,
      ok: false,
      reasons: ["Overlay not open — cannot trap Tab"],
      session: input.session,
    });
  }
  const list = input.session.dialogFocusables;
  if (list.length === 0) {
    return withHonesty({
      code: null,
      ok: false,
      reasons: ["No dialog focusables"],
      session: input.session,
    });
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
  return withHonesty({
    code: "TRAP_CYCLE",
    ok: true,
    reasons: [
      `Tab ${input.direction}: ${list[currentIdx]} → ${session.activeFocusId} (trap retained)`,
    ],
    session,
  });
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
    return withHonesty({
      code: null,
      ok: false,
      reasons: ["Overlay not open — nothing to restore"],
      session: input.session,
    });
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
    return withHonesty({
      code: "FOCUS_RESTORED",
      ok: true,
      reasons: [
        `Focus restored to trigger ${trigger}`,
        "liveBrowserWiring=NOT_WIRED ACCEPTED≠VERIFIED",
      ],
      session,
    });
  }
  const session: FocusSession = {
    overlayOpen: false,
    savedTriggerId: null,
    triggerRestorable: false,
    dialogFocusables: [],
    activeFocusId: null,
  };
  return withHonesty({
    code: "FOCUS_LOST",
    ok: false,
    reasons: [
      trigger
        ? `Trigger ${trigger} unrestorable — FOCUS_LOST (a11y fail-closed)`
        : "No saved trigger — FOCUS_LOST (a11y fail-closed)",
    ],
    session,
  });
}

/**
 * Escape dismisses the open overlay with the same restore / FOCUS_LOST rules
 * as an explicit close. Escape while closed is refused (no silent restore).
 */
export function dismissOverlayViaEscape(input: {
  session: FocusSession;
}): KeyboardFocusRestoreDecision {
  if (!input.session.overlayOpen) {
    return withHonesty({
      code: null,
      ok: false,
      reasons: [
        "Escape while overlay closed — refuse (no silent focus restore)",
        "liveBrowserWiring=NOT_WIRED externalEffects=NONE",
      ],
      session: input.session,
    });
  }
  const closed = closeOverlayRestoreFocus({ session: input.session });
  return withHonesty({
    ...closed,
    reasons: [
      `Escape dismiss: ${closed.reasons[0] ?? closed.code}`,
      ...closed.reasons.slice(1),
    ],
  });
}

export type KeyboardFocusRestoreReview = {
  passed: boolean;
  details: string[];
  restored: KeyboardFocusRestoreDecision;
  lost: KeyboardFocusRestoreDecision;
  escaped: KeyboardFocusRestoreDecision;
} & KeyboardFocusHonesty;

/**
 * Full keyboard-review sequence used by the soak proof:
 * open → refuse re-open → boundary Tab wraps → Escape restore;
 * plus a negative FOCUS_LOST control and live-browser claim refusals.
 */
export function evaluateKeyboardFocusRestoreReview(input: {
  triggerId: FocusTargetId;
  dialogFocusables: readonly FocusTargetId[];
  /** Forbidden — fixture proofs never claim live VERIFIED. */
  claimLiveVerified?: boolean;
  /** Forbidden — live Playwright / browser wiring stays NOT_WIRED. */
  requestLiveBrowserWire?: boolean;
}): KeyboardFocusRestoreReview {
  const honesty = baseHonesty();

  if (input.claimLiveVerified === true) {
    const refused = withHonesty({
      code: "LIVE_BROWSER_CLAIM_REFUSED",
      ok: false,
      reasons: [
        "Live VERIFIED keyboard/focus claims are forbidden — fixture ACCEPTED only (T-X061)",
        "liveBrowserWiring=NOT_WIRED ACCEPTED≠VERIFIED",
      ],
      session: emptyFocusSession(),
    });
    return {
      passed: false,
      details: [...refused.reasons],
      restored: refused,
      lost: refused,
      escaped: refused,
      ...honesty,
    };
  }

  if (input.requestLiveBrowserWire === true) {
    const refused = withHonesty({
      code: "LIVE_BROWSER_CLAIM_REFUSED",
      ok: false,
      reasons: [
        "Live Playwright / browser wiring remains NOT_WIRED — refuse live browser wire (T-X061)",
        "chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE",
      ],
      session: emptyFocusSession(),
    });
    return {
      passed: false,
      details: [...refused.reasons],
      restored: refused,
      lost: refused,
      escaped: refused,
      ...honesty,
    };
  }

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

  // Escape dismiss restores focus (same honesty path as explicit close).
  const escaped = dismissOverlayViaEscape({ session });
  if (
    !(
      escaped.ok &&
      escaped.code === "FOCUS_RESTORED" &&
      escaped.session.activeFocusId === input.triggerId
    )
  ) {
    passed = false;
    details.push(`Escape restore failed: ${escaped.reasons.join("; ")}`);
  } else {
    details.push(...escaped.reasons);
  }

  // Explicit close after re-open still restores (symmetric to Escape).
  const reopenedForClose = openOverlayFocus({
    session: emptyFocusSession(),
    triggerId: input.triggerId,
    dialogFocusables: list,
  });
  const restored = closeOverlayRestoreFocus({
    session: reopenedForClose.session,
  });
  if (
    !(
      restored.ok &&
      restored.code === "FOCUS_RESTORED" &&
      restored.session.activeFocusId === input.triggerId &&
      restored.liveBrowserWiring === "NOT_WIRED"
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

  // Escape while closed must refuse (no silent restore after dismiss).
  const escapeClosed = dismissOverlayViaEscape({
    session: emptyFocusSession(),
  });
  if (!(escapeClosed.ok === false && escapeClosed.code === null)) {
    passed = false;
    details.push(
      `Escape-while-closed unexpectedly ok=${escapeClosed.ok} code=${escapeClosed.code}`,
    );
  } else {
    details.push("Escape while closed refused (no silent restore)");
  }

  details.push(
    "liveBrowserWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE",
    "Distinct from T-US-055 (full keyboard journey + reduced motion)",
  );

  return {
    passed,
    details,
    restored,
    lost,
    escaped,
    ...honesty,
  };
}

export const KEYBOARD_FOCUS_RESTORE_RELATED_CASE_IDS = ["T-X061"] as const;
