import { describe, expect, it } from "vitest";
import {
  EffectState,
  canTransition,
  transition,
} from "./effect-state-machine.js";

describe("effect state machine", () => {
  it("allows the happy path", () => {
    let state = EffectState.QUEUED;
    for (const next of [
      EffectState.LEASED,
      EffectState.RUNNING,
      EffectState.VALIDATING,
      EffectState.AUTHORIZED,
      EffectState.APPLYING,
      EffectState.VERIFYING,
      EffectState.COMPLETE,
    ] as const) {
      expect(canTransition(state, next)).toBe(true);
      state = transition(state, next);
    }
    expect(state).toBe(EffectState.COMPLETE);
  });

  it("rejects illegal jumps", () => {
    expect(canTransition(EffectState.QUEUED, EffectState.COMPLETE)).toBe(false);
    expect(() =>
      transition(EffectState.QUEUED, EffectState.COMPLETE),
    ).toThrow(/Invalid effect transition/);
  });

  it("routes apply timeout to UNKNOWN_REMOTE_OUTCOME", () => {
    expect(
      transition(EffectState.APPLYING, EffectState.UNKNOWN_REMOTE_OUTCOME),
    ).toBe(EffectState.UNKNOWN_REMOTE_OUTCOME);
  });
});
