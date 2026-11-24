/**
 * Fixture proof for T-X061 — Keyboard review and focus restore (A11y).
 * Hillclimb: Escape dismiss restores; Escape-while-closed refuses;
 * liveBrowserWiring=NOT_WIRED; refuse live VERIFIED / Playwright wire;
 * ChatGPT Ads ACCESS_BLOCKED. External effects: NONE.
 * Never invents live VERIFIED.
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
  const details: string[] = [];
  let passed = true;

  const review = evaluateKeyboardFocusRestoreReview({
    triggerId: "btn-keyboard-review",
    dialogFocusables: ["dlg-close", "dlg-primary", "dlg-secondary"],
  });

  if (
    review.passed &&
    review.escaped.code === "FOCUS_RESTORED" &&
    review.restored.code === "FOCUS_RESTORED" &&
    review.lost.code === "FOCUS_LOST" &&
    review.liveBrowserWiring === "NOT_WIRED" &&
    review.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    review.externalEffects === "NONE" &&
    review.liveProviderSuccessClaimed === false
  ) {
    details.push(...review.details);
  } else {
    passed = false;
    details.push(
      `Review unexpectedly passed=${review.passed} escaped=${review.escaped.code} restored=${review.restored.code} lost=${review.lost.code}`,
    );
    details.push(...review.details);
  }

  const liveVerified = evaluateKeyboardFocusRestoreReview({
    triggerId: "btn-keyboard-review",
    dialogFocusables: ["dlg-close", "dlg-primary"],
    claimLiveVerified: true,
  });
  if (
    liveVerified.passed === false &&
    liveVerified.restored.code === "LIVE_BROWSER_CLAIM_REFUSED" &&
    liveVerified.liveBrowserWiring === "NOT_WIRED"
  ) {
    details.push(
      "claimLiveVerified → LIVE_BROWSER_CLAIM_REFUSED (fixture ACCEPTED ≠ VERIFIED)",
    );
  } else {
    passed = false;
    details.push(
      `claimLiveVerified unexpectedly ${JSON.stringify({
        passed: liveVerified.passed,
        code: liveVerified.restored.code,
      })}`,
    );
  }

  const liveWire = evaluateKeyboardFocusRestoreReview({
    triggerId: "btn-keyboard-review",
    dialogFocusables: ["dlg-close", "dlg-primary"],
    requestLiveBrowserWire: true,
  });
  if (
    liveWire.passed === false &&
    liveWire.restored.code === "LIVE_BROWSER_CLAIM_REFUSED" &&
    liveWire.chatgptAdsAccess === "ACCESS_BLOCKED"
  ) {
    details.push(
      "requestLiveBrowserWire → LIVE_BROWSER_CLAIM_REFUSED (Playwright stays NOT_WIRED)",
    );
  } else {
    passed = false;
    details.push(
      `requestLiveBrowserWire unexpectedly ${JSON.stringify({
        passed: liveWire.passed,
        code: liveWire.restored.code,
      })}`,
    );
  }

  details.push(
    "liveProviderSuccessClaimed=false externalEffects=NONE",
    "fixtureOnly keyboard/focus model — not browser VERIFIED",
    "Distinct from T-US-055 (full keyboard journey + reduced motion)",
  );

  return {
    proofId: `proof-kbd-focus-${randomUUID()}`,
    kind: SoakProofKind.KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx061-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
