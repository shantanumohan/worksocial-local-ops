/**
 * Fixture proof for T-X061 — Keyboard review and focus restore (A11y).
 * External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateKeyboardFocusRestoreReview,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X061 fixture ACCEPTED.
 */
export function proofKeyboardFocusRestoreAfterDialog(
  nowIso: string,
): SoakProofRecord {
  const review = evaluateKeyboardFocusRestoreReview({
    triggerId: "btn-keyboard-review",
    dialogFocusables: ["dlg-close", "dlg-primary", "dlg-secondary"],
  });

  const details = [
    ...review.details,
    "liveProviderSuccessClaimed=false externalEffects=NONE",
    "fixtureOnly keyboard/focus model — not browser VERIFIED",
  ];

  return {
    proofId: `proof-kbd-focus-${randomUUID()}`,
    kind: SoakProofKind.KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG,
    passed: review.passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx061-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
