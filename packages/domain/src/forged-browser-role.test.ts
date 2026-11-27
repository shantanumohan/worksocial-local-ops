import { describe, expect, it } from "vitest";
import { LocalRole } from "./roles.js";
import {
  FORGED_BROWSER_ROLE_RELATED_CASE_IDS,
  MAX_FORGED_ESCALATION_ATTEMPTS,
  applyForgedEscalationBudget,
  bindActorRoleFromSession,
  clampForgedEscalationMaxAttempts,
  coerceClientActorRoleClaim,
  createForgedEscalationBudgetState,
  evaluateForgedBrowserRoleHonesty,
  evaluateForgedEscalationBudgetGate,
  isForgedRoleEscalationAttempt,
  normalizeForgedActorRoleClaim,
  resolveClientActorRoleClaim,
} from "./forged-browser-role.js";

describe("forged browser role (T-X005)", () => {
  it("binds actor role from session only; discards forged admin body", () => {
    const effective = bindActorRoleFromSession(
      LocalRole.OPERATOR,
      LocalRole.ADMINISTRATOR,
    );
    expect(effective).toBe(LocalRole.OPERATOR);
    expect(effective).not.toBe(LocalRole.ADMINISTRATOR);
  });

  it("honesty: forged operator→admin escalation ignored with NOT_WIRED/NONE", () => {
    const d = evaluateForgedBrowserRoleHonesty({
      sessionRole: LocalRole.OPERATOR,
      bodyActorRole: LocalRole.ADMINISTRATOR,
    });
    expect(d.allowed).toBe(true);
    expect(d.code).toBe("FORGED_ESCALATION_IGNORED");
    expect(d.forgedPayloadIgnored).toBe(true);
    expect(d.effectiveRole).toBe(LocalRole.OPERATOR);
    expect(d.liveSessionAuthWiring).toBe("NOT_WIRED");
    expect(d.liveProviderSuccessClaimed).toBe(false);
    expect(d.externalEffects).toBe("NONE");
    expect(
      isForgedRoleEscalationAttempt({
        sessionRole: LocalRole.OPERATOR,
        bodyActorRole: LocalRole.ADMINISTRATOR,
      }),
    ).toBe(true);
  });

  it("honesty: null/undefined/matching body does not mark forged", () => {
    for (const body of [null, undefined, "", LocalRole.OPERATOR] as const) {
      const d = evaluateForgedBrowserRoleHonesty({
        sessionRole: LocalRole.OPERATOR,
        bodyActorRole: body,
      });
      expect(d.code).toBe("SESSION_ROLE_BOUND");
      expect(d.forgedPayloadIgnored).toBe(false);
      expect(d.effectiveRole).toBe(LocalRole.OPERATOR);
      expect(d.externalEffects).toBe("NONE");
    }
  });

  it("honesty: unknown body role still ignored (session wins)", () => {
    const d = evaluateForgedBrowserRoleHonesty({
      sessionRole: LocalRole.OPERATOR,
      bodyActorRole: "superadmin",
    });
    expect(d.code).toBe("BODY_ROLE_IGNORED");
    expect(d.forgedPayloadIgnored).toBe(true);
    expect(d.effectiveRole).toBe(LocalRole.OPERATOR);
  });

  it("rejects invalid session role", () => {
    const d = evaluateForgedBrowserRoleHonesty({
      sessionRole: "agent",
      bodyActorRole: LocalRole.ADMINISTRATOR,
    });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("INVALID_SESSION_ROLE");
    expect(d.effectiveRole).toBeNull();
  });

  it("maps only T-X005", () => {
    expect([...FORGED_BROWSER_ROLE_RELATED_CASE_IDS]).toEqual(["T-X005"]);
  });

  it("alias fields and header forged admin still ignored", () => {
    expect(
      resolveClientActorRoleClaim({
        bodyActor_role: "administrator",
      }),
    ).toBe("administrator");
    expect(
      resolveClientActorRoleClaim({
        bodyRole: " ADMINISTRATOR ",
      }),
    ).toBe(" ADMINISTRATOR ");
    expect(
      resolveClientActorRoleClaim({
        headerActorRole: "Administrator",
      }),
    ).toBe("Administrator");
    // actorRole wins over aliases when present.
    expect(
      resolveClientActorRoleClaim({
        bodyActorRole: "operator",
        bodyActor_role: "administrator",
      }),
    ).toBe("operator");

    for (const input of [
      { bodyActor_role: "administrator" },
      { bodyRole: "ADMINISTRATOR" },
      { headerActorRole: " Administrator " },
    ] as const) {
      const d = evaluateForgedBrowserRoleHonesty({
        sessionRole: LocalRole.OPERATOR,
        ...input,
      });
      expect(d.code).toBe("FORGED_ESCALATION_IGNORED");
      expect(d.effectiveRole).toBe(LocalRole.OPERATOR);
      expect(d.forgedPayloadIgnored).toBe(true);
      expect(d.externalEffects).toBe("NONE");
    }

    const budgeted = applyForgedEscalationBudget(
      createForgedEscalationBudgetState(),
      {
        sessionRole: LocalRole.OPERATOR,
        headerActorRole: "administrator",
      },
    );
    expect(budgeted.ok).toBe(true);
    if (!budgeted.ok) throw new Error("expected ok");
    expect(budgeted.state.forgedEscalationAttemptCount).toBe(1);
    expect(budgeted.decision.code).toBe("FORGED_ESCALATION_IGNORED");
  });

  it("query-string forged admin still ignored (budget consumes)", () => {
    expect(
      resolveClientActorRoleClaim({
        queryActorRole: "administrator",
      }),
    ).toBe("administrator");
    // header wins over query when both present.
    expect(
      resolveClientActorRoleClaim({
        headerActorRole: "operator",
        queryActorRole: "administrator",
      }),
    ).toBe("operator");

    const d = evaluateForgedBrowserRoleHonesty({
      sessionRole: LocalRole.OPERATOR,
      queryActorRole: " ADMINISTRATOR ",
    });
    expect(d.code).toBe("FORGED_ESCALATION_IGNORED");
    expect(d.effectiveRole).toBe(LocalRole.OPERATOR);
    expect(d.forgedPayloadIgnored).toBe(true);
    expect(d.liveSessionAuthWiring).toBe("NOT_WIRED");
    expect(d.externalEffects).toBe("NONE");

    const budgeted = applyForgedEscalationBudget(
      createForgedEscalationBudgetState(),
      {
        sessionRole: LocalRole.OPERATOR,
        queryActorRole: "administrator",
      },
    );
    expect(budgeted.ok).toBe(true);
    if (!budgeted.ok) throw new Error("expected ok");
    expect(budgeted.state.forgedEscalationAttemptCount).toBe(1);
    expect(budgeted.decision.code).toBe("FORGED_ESCALATION_IGNORED");
    expect(budgeted.decision.effectiveRole).toBe(LocalRole.OPERATOR);
  });

  it("cookie forged admin still ignored (budget consumes)", () => {
    expect(
      resolveClientActorRoleClaim({
        cookieActorRole: "administrator",
      }),
    ).toBe("administrator");
    // query wins over cookie when both present.
    expect(
      resolveClientActorRoleClaim({
        queryActorRole: "operator",
        cookieActorRole: "administrator",
      }),
    ).toBe("operator");

    const d = evaluateForgedBrowserRoleHonesty({
      sessionRole: LocalRole.OPERATOR,
      cookieActorRole: " ADMINISTRATOR ",
    });
    expect(d.code).toBe("FORGED_ESCALATION_IGNORED");
    expect(d.effectiveRole).toBe(LocalRole.OPERATOR);
    expect(d.forgedPayloadIgnored).toBe(true);
    expect(d.liveSessionAuthWiring).toBe("NOT_WIRED");
    expect(d.externalEffects).toBe("NONE");

    const budgeted = applyForgedEscalationBudget(
      createForgedEscalationBudgetState(),
      {
        sessionRole: LocalRole.OPERATOR,
        cookieActorRole: "administrator",
      },
    );
    expect(budgeted.ok).toBe(true);
    if (!budgeted.ok) throw new Error("expected ok");
    expect(budgeted.state.forgedEscalationAttemptCount).toBe(1);
    expect(budgeted.decision.code).toBe("FORGED_ESCALATION_IGNORED");
    expect(budgeted.decision.effectiveRole).toBe(LocalRole.OPERATOR);
  });

  it("non-string forged claims coerce to null (no invent admin / no budget)", () => {
    expect(coerceClientActorRoleClaim(42)).toBeNull();
    expect(coerceClientActorRoleClaim(true)).toBeNull();
    expect(coerceClientActorRoleClaim({ role: "administrator" })).toBeNull();
    expect(coerceClientActorRoleClaim(["administrator"])).toBeNull();
    expect(coerceClientActorRoleClaim("administrator")).toBe("administrator");

    expect(
      resolveClientActorRoleClaim({
        bodyActorRole: ["administrator"],
      }),
    ).toBeNull();
    expect(
      resolveClientActorRoleClaim({
        headerActorRole: { role: "administrator" },
        queryActorRole: 1,
      }),
    ).toBeNull();

    const d = evaluateForgedBrowserRoleHonesty({
      sessionRole: LocalRole.OPERATOR,
      bodyActorRole: ["administrator"],
    });
    expect(d.code).toBe("SESSION_ROLE_BOUND");
    expect(d.effectiveRole).toBe(LocalRole.OPERATOR);
    expect(d.forgedPayloadIgnored).toBe(false);
    expect(d.liveSessionAuthWiring).toBe("NOT_WIRED");
    expect(d.externalEffects).toBe("NONE");

    const budgeted = applyForgedEscalationBudget(
      createForgedEscalationBudgetState(),
      {
        sessionRole: LocalRole.OPERATOR,
        cookieActorRole: { role: "administrator" },
      },
    );
    expect(budgeted.ok).toBe(true);
    if (!budgeted.ok) throw new Error("expected ok");
    expect(budgeted.state.forgedEscalationAttemptCount).toBe(0);
    expect(budgeted.decision.code).toBe("SESSION_ROLE_BOUND");
  });

  it("normalizes NBSP/ZWSP-padded forged admin claims as escalation", () => {
    const nbspAdmin = "\u00a0ADMINISTRATOR\u00a0";
    const zwspAdmin = "\u200badministrator\u200b";
    expect(normalizeForgedActorRoleClaim(nbspAdmin)).toBe("administrator");
    expect(normalizeForgedActorRoleClaim(zwspAdmin)).toBe("administrator");

    const d = evaluateForgedBrowserRoleHonesty({
      sessionRole: LocalRole.OPERATOR,
      bodyActorRole: nbspAdmin,
    });
    expect(d.code).toBe("FORGED_ESCALATION_IGNORED");
    expect(d.effectiveRole).toBe(LocalRole.OPERATOR);
    expect(d.forgedPayloadIgnored).toBe(true);
    expect(d.liveSessionAuthWiring).toBe("NOT_WIRED");
    expect(d.externalEffects).toBe("NONE");

    const budgeted = applyForgedEscalationBudget(
      createForgedEscalationBudgetState(),
      {
        sessionRole: LocalRole.OPERATOR,
        cookieActorRole: zwspAdmin,
      },
    );
    expect(budgeted.ok).toBe(true);
    if (!budgeted.ok) throw new Error("expected ok");
    expect(budgeted.state.forgedEscalationAttemptCount).toBe(1);
    expect(budgeted.decision.code).toBe("FORGED_ESCALATION_IGNORED");
  });

  it("normalizes whitespace/case forged admin claims as escalation", () => {
    expect(normalizeForgedActorRoleClaim(" Administrator ")).toBe(
      "administrator",
    );
    expect(normalizeForgedActorRoleClaim("ADMINISTRATOR")).toBe(
      "administrator",
    );
    expect(normalizeForgedActorRoleClaim("   ")).toBeNull();

    for (const forged of [" Administrator ", "ADMINISTRATOR", "AdMiNiStRaToR"]) {
      const d = evaluateForgedBrowserRoleHonesty({
        sessionRole: LocalRole.OPERATOR,
        bodyActorRole: forged,
      });
      expect(d.code).toBe("FORGED_ESCALATION_IGNORED");
      expect(d.forgedPayloadIgnored).toBe(true);
      expect(d.effectiveRole).toBe(LocalRole.OPERATOR);
      expect(d.effectiveRole).not.toBe(LocalRole.ADMINISTRATOR);
      expect(
        isForgedRoleEscalationAttempt({
          sessionRole: LocalRole.OPERATOR,
          bodyActorRole: forged,
        }),
      ).toBe(true);
      expect(d.liveSessionAuthWiring).toBe("NOT_WIRED");
      expect(d.externalEffects).toBe("NONE");
    }

    // Normalized forge also consumes the attempt budget.
    let budget = createForgedEscalationBudgetState();
    const first = applyForgedEscalationBudget(budget, {
      sessionRole: LocalRole.OPERATOR,
      bodyActorRole: " ADMINISTRATOR ",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("expected ok");
    expect(first.state.forgedEscalationAttemptCount).toBe(1);
    expect(first.decision.code).toBe("FORGED_ESCALATION_IGNORED");
  });

  it("clamps maxAttempts — never invents a larger forge budget than MAX", () => {
    expect(clampForgedEscalationMaxAttempts(99)).toBe(
      MAX_FORGED_ESCALATION_ATTEMPTS,
    );
    expect(clampForgedEscalationMaxAttempts(-1)).toBe(
      MAX_FORGED_ESCALATION_ATTEMPTS,
    );
    expect(clampForgedEscalationMaxAttempts(Number.POSITIVE_INFINITY)).toBe(
      MAX_FORGED_ESCALATION_ATTEMPTS,
    );
    expect(clampForgedEscalationMaxAttempts(Number.NEGATIVE_INFINITY)).toBe(
      MAX_FORGED_ESCALATION_ATTEMPTS,
    );
    expect(clampForgedEscalationMaxAttempts(-0)).toBe(
      MAX_FORGED_ESCALATION_ATTEMPTS,
    );
    expect(clampForgedEscalationMaxAttempts(0)).toBe(
      MAX_FORGED_ESCALATION_ATTEMPTS,
    );
    expect(clampForgedEscalationMaxAttempts(Number.NaN)).toBe(
      MAX_FORGED_ESCALATION_ATTEMPTS,
    );
    expect(clampForgedEscalationMaxAttempts(1)).toBe(1);
    expect(clampForgedEscalationMaxAttempts(1.9)).toBe(1);
    expect(clampForgedEscalationMaxAttempts(Number.MAX_SAFE_INTEGER)).toBe(
      MAX_FORGED_ESCALATION_ATTEMPTS,
    );
    expect(clampForgedEscalationMaxAttempts(2.999)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(2.7)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(2.01)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(1.001)).toBe(1);
    expect(clampForgedEscalationMaxAttempts(0.999)).toBe(MAX_FORGED_ESCALATION_ATTEMPTS);
    expect(clampForgedEscalationMaxAttempts(3.01)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(3.99)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(4.5)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(5.1)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(6.001)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(7.999)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(8.5)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(9.25)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(10.01)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(10.5)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(11.01)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(11.5)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(12.001)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(12.5)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(12.999)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(13.01)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(13.99)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(14.01)).toBe(2);
    expect(clampForgedEscalationMaxAttempts(undefined)).toBe(
      MAX_FORGED_ESCALATION_ATTEMPTS,
    );

    const inflated = createForgedEscalationBudgetState({ maxAttempts: 99 });
    expect(inflated.maxAttempts).toBe(MAX_FORGED_ESCALATION_ATTEMPTS);
    expect(inflated.liveSessionAuthWiring).toBe("NOT_WIRED");
    expect(inflated.externalEffects).toBe("NONE");

    // Inflated request still exhausts at MAX=2 — no invented extra forgeries.
    let budget = inflated;
    for (let i = 0; i < MAX_FORGED_ESCALATION_ATTEMPTS; i++) {
      const r = applyForgedEscalationBudget(budget, {
        sessionRole: LocalRole.OPERATOR,
        bodyActorRole: "administrator",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error("expected ok");
      budget = r.state;
    }
    const exhausted = applyForgedEscalationBudget(budget, {
      sessionRole: LocalRole.OPERATOR,
      bodyActorRole: "administrator",
    });
    expect(exhausted.ok).toBe(false);
    if (exhausted.ok) throw new Error("expected exhausted");
    expect(exhausted.code).toBe("FORGED_ESCALATION_BUDGET_EXHAUSTED");
    expect(exhausted.decision.effectiveRole).toBe(LocalRole.OPERATOR);
  });

  it("forged-escalation attempt budget fence refuses without inventing admin", () => {
    expect(MAX_FORGED_ESCALATION_ATTEMPTS).toBe(2);
    let budget = createForgedEscalationBudgetState();
    expect(evaluateForgedEscalationBudgetGate(budget).code).toBe("WITHIN_BUDGET");

    // Non-forged bind does not consume budget.
    const matching = applyForgedEscalationBudget(budget, {
      sessionRole: LocalRole.OPERATOR,
      bodyActorRole: LocalRole.OPERATOR,
    });
    expect(matching.ok).toBe(true);
    if (!matching.ok) throw new Error("expected ok");
    expect(matching.state.forgedEscalationAttemptCount).toBe(0);
    budget = matching.state;

    for (let i = 0; i < MAX_FORGED_ESCALATION_ATTEMPTS; i++) {
      const r = applyForgedEscalationBudget(budget, {
        sessionRole: LocalRole.OPERATOR,
        bodyActorRole: LocalRole.ADMINISTRATOR,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error("expected within budget");
      expect(r.decision.code).toBe("FORGED_ESCALATION_IGNORED");
      expect(r.decision.effectiveRole).toBe(LocalRole.OPERATOR);
      budget = r.state;
    }
    expect(budget.forgedEscalationAttemptCount).toBe(2);
    expect(evaluateForgedEscalationBudgetGate(budget).allowed).toBe(false);

    const denied = applyForgedEscalationBudget(budget, {
      sessionRole: LocalRole.OPERATOR,
      bodyActorRole: LocalRole.ADMINISTRATOR,
    });
    expect(denied.ok).toBe(false);
    if (denied.ok) throw new Error("expected budget exhausted");
    expect(denied.code).toBe("FORGED_ESCALATION_BUDGET_EXHAUSTED");
    expect(denied.decision.code).toBe("FORGED_ESCALATION_BUDGET_EXHAUSTED");
    expect(denied.decision.allowed).toBe(false);
    expect(denied.decision.effectiveRole).toBe(LocalRole.OPERATOR);
    expect(denied.decision.effectiveRole).not.toBe(LocalRole.ADMINISTRATOR);
    expect(denied.state.forgedEscalationAttemptCount).toBe(2);
    expect(denied.decision.liveSessionAuthWiring).toBe("NOT_WIRED");
    expect(denied.decision.externalEffects).toBe("NONE");
  });
});
