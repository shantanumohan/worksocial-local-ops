/**
 * T-X005 — Forged browser / client payload role ignored.
 *
 * API binds gateway actorRole from the authenticated session only.
 * Client-supplied body.actorRole cannot escalate (or otherwise replace)
 * the session role — including whitespace/case-normalized forged
 * administrator claims and alternate client fields (`actor_role`, `role`,
 * header `X-Actor-Role`, query `actor_role` / `actorRole`, cookie
 * `actor_role` / `actorRole`). Non-string client claims (number / object /
 * array / boolean) coerce to null — never invent administrator. Forged
 * operator→admin escalations are also gated by an attempt budget fence
 * (MAX_FORGED_ESCALATION_ATTEMPTS) — further forgeries refuse without
 * inventing administrator SUCCESS (distinct from T-X058 repair ATTEMPT_LIMIT).
 * Live session auth wiring stays NOT_WIRED. External effects: NONE.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 */

import { isLocalRole, type LocalRoleValue } from "./roles.js";

/** Fixture fence: how many forged operator→admin tries may be ignored before refuse. */
export const MAX_FORGED_ESCALATION_ATTEMPTS = 2;

/**
 * Strip NBSP / zero-width chars so Unicode-padded forgeries still normalize.
 * Does not trust the claim — session role still binds.
 */
function stripUnicodePadding(value: string): string {
  return value.replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, "");
}

/**
 * Coerce a raw client role claim to a string or null.
 * Non-strings (number / object / array / boolean) never invent a role.
 */
export function coerceClientActorRoleClaim(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Normalize a client-supplied actorRole claim for forge detection.
 * Trim + lowercase + Unicode padding strip so " Administrator ",
 * "ADMINISTRATOR", and NBSP/ZWSP-padded admin still count as admin forge.
 * Does not trust the claim — session role still binds.
 */
export function normalizeForgedActorRoleClaim(
  bodyActorRole: string | null | undefined,
): string | null {
  const coerced = coerceClientActorRoleClaim(bodyActorRole);
  if (coerced === null) return null;
  const normalized = stripUnicodePadding(coerced).trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Resolve the first non-empty client role claim across alias surfaces.
 * Never trusted for binding — session role still wins. Order: actorRole,
 * actor_role, role, header X-Actor-Role, query, cookie.
 * Non-string candidates are skipped (no invented admin).
 */
export function resolveClientActorRoleClaim(input: {
  bodyActorRole?: unknown;
  bodyActor_role?: unknown;
  bodyRole?: unknown;
  headerActorRole?: unknown;
  queryActorRole?: unknown;
  cookieActorRole?: unknown;
}): string | null {
  for (const candidate of [
    input.bodyActorRole,
    input.bodyActor_role,
    input.bodyRole,
    input.headerActorRole,
    input.queryActorRole,
    input.cookieActorRole,
  ]) {
    const coerced = coerceClientActorRoleClaim(candidate);
    if (coerced !== null && normalizeForgedActorRoleClaim(coerced) !== null) {
      return coerced;
    }
  }
  return null;
}

export type ForgedBrowserRoleCode =
  | "SESSION_ROLE_BOUND"
  | "FORGED_ESCALATION_IGNORED"
  | "BODY_ROLE_IGNORED"
  | "INVALID_SESSION_ROLE"
  | "FORGED_ESCALATION_BUDGET_EXHAUSTED"
  | null;

export type ForgedBrowserRoleDecision = {
  allowed: boolean;
  code: ForgedBrowserRoleCode;
  sessionRole: LocalRoleValue | null;
  effectiveRole: LocalRoleValue | null;
  /** True when a body.actorRole differed from the session and was discarded. */
  forgedPayloadIgnored: boolean;
  reasons: string[];
  liveSessionAuthWiring: "NOT_WIRED";
  liveProviderSuccessClaimed: false;
  externalEffects: "NONE";
};

function honestyBase(): Pick<
  ForgedBrowserRoleDecision,
  "liveSessionAuthWiring" | "liveProviderSuccessClaimed" | "externalEffects"
> {
  return {
    liveSessionAuthWiring: "NOT_WIRED",
    liveProviderSuccessClaimed: false,
    externalEffects: "NONE",
  };
}

/**
 * Mirror apps/api auth-http: actor role comes only from the session.
 * Client-supplied body.actorRole is discarded (never trusted).
 */
export function bindActorRoleFromSession(
  sessionRole: LocalRoleValue,
  _bodyActorRole: string | undefined | null,
): LocalRoleValue {
  return sessionRole;
}

/**
 * Honesty wrapper: session role wins; client role claims never escalate
 * (body.actorRole, alias fields, header, query, and cookie via resolveClientActorRoleClaim).
 */
export function evaluateForgedBrowserRoleHonesty(input: {
  sessionRole: string;
  bodyActorRole?: unknown;
  bodyActor_role?: unknown;
  bodyRole?: unknown;
  headerActorRole?: unknown;
  queryActorRole?: unknown;
  cookieActorRole?: unknown;
}): ForgedBrowserRoleDecision {
  const base = honestyBase();

  if (!isLocalRole(input.sessionRole)) {
    return {
      allowed: false,
      code: "INVALID_SESSION_ROLE",
      sessionRole: null,
      effectiveRole: null,
      forgedPayloadIgnored: false,
      reasons: [
        `Session role '${input.sessionRole}' is not a recognized local role`,
      ],
      ...base,
    };
  }

  const bodyRaw = resolveClientActorRoleClaim({
    ...(input.bodyActorRole !== undefined
      ? { bodyActorRole: input.bodyActorRole }
      : {}),
    ...(input.bodyActor_role !== undefined
      ? { bodyActor_role: input.bodyActor_role }
      : {}),
    ...(input.bodyRole !== undefined ? { bodyRole: input.bodyRole } : {}),
    ...(input.headerActorRole !== undefined
      ? { headerActorRole: input.headerActorRole }
      : {}),
    ...(input.queryActorRole !== undefined
      ? { queryActorRole: input.queryActorRole }
      : {}),
    ...(input.cookieActorRole !== undefined
      ? { cookieActorRole: input.cookieActorRole }
      : {}),
  });
  const bodyNormalized = normalizeForgedActorRoleClaim(bodyRaw);
  const bodyPresent = bodyNormalized !== null;
  const bodyDiffers = bodyPresent && bodyNormalized !== input.sessionRole;
  const effective = bindActorRoleFromSession(
    input.sessionRole,
    bodyPresent ? bodyRaw : undefined,
  );

  if (bodyDiffers) {
    const escalation =
      bodyNormalized === "administrator" && input.sessionRole === "operator";
    return {
      allowed: true,
      code: escalation ? "FORGED_ESCALATION_IGNORED" : "BODY_ROLE_IGNORED",
      sessionRole: input.sessionRole,
      effectiveRole: effective,
      forgedPayloadIgnored: true,
      reasons: [
        escalation
          ? `Forged escalation ignored: session=${input.sessionRole} body=${JSON.stringify(bodyRaw)} normalized=${bodyNormalized} effective=${effective}`
          : `Body actorRole ignored: session=${input.sessionRole} body=${JSON.stringify(bodyRaw)} normalized=${bodyNormalized} effective=${effective}`,
        "liveSessionAuthWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE",
      ],
      ...base,
    };
  }

  return {
    allowed: true,
    code: "SESSION_ROLE_BOUND",
    sessionRole: input.sessionRole,
    effectiveRole: effective,
    forgedPayloadIgnored: false,
    reasons: [
      `Session role bound effective=${effective}; body.actorRole absent or matches session`,
      "liveSessionAuthWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE",
    ],
    ...base,
  };
}

/**
 * True when body claims a higher privilege than the session (operator→admin),
 * after whitespace/case normalization of the client claim.
 */
export function isForgedRoleEscalationAttempt(input: {
  sessionRole: LocalRoleValue;
  bodyActorRole: string | null | undefined;
}): boolean {
  return (
    input.sessionRole === "operator" &&
    normalizeForgedActorRoleClaim(input.bodyActorRole) === "administrator"
  );
}

export type ForgedEscalationBudgetState = {
  forgedEscalationAttemptCount: number;
  maxAttempts: number;
  liveSessionAuthWiring: "NOT_WIRED";
  externalEffects: "NONE";
};

/**
 * Clamp requested maxAttempts to [1, MAX_FORGED_ESCALATION_ATTEMPTS].
 * Never invent a larger forge budget than the fixture fence (distinct from T-X058).
 */
export function clampForgedEscalationMaxAttempts(
  requested: number | null | undefined,
): number {
  if (
    typeof requested !== "number" ||
    !Number.isFinite(requested) ||
    requested < 1
  ) {
    return MAX_FORGED_ESCALATION_ATTEMPTS;
  }
  return Math.min(Math.floor(requested), MAX_FORGED_ESCALATION_ATTEMPTS);
}

export function createForgedEscalationBudgetState(input?: {
  maxAttempts?: number;
}): ForgedEscalationBudgetState {
  return {
    forgedEscalationAttemptCount: 0,
    maxAttempts: clampForgedEscalationMaxAttempts(input?.maxAttempts),
    liveSessionAuthWiring: "NOT_WIRED",
    externalEffects: "NONE",
  };
}

/**
 * Gate only — does not invent SUCCESS or escalate the session role.
 * Distinct from T-X058 repair ATTEMPT_LIMIT.
 */
export function evaluateForgedEscalationBudgetGate(state: ForgedEscalationBudgetState): {
  allowed: boolean;
  code: "WITHIN_BUDGET" | "FORGED_ESCALATION_BUDGET_EXHAUSTED";
  reason: string;
  liveSessionAuthWiring: "NOT_WIRED";
  externalEffects: "NONE";
} {
  if (state.forgedEscalationAttemptCount >= state.maxAttempts) {
    return {
      allowed: false,
      code: "FORGED_ESCALATION_BUDGET_EXHAUSTED",
      reason: `Forged escalation attempt budget exhausted (count=${state.forgedEscalationAttemptCount} max=${state.maxAttempts}) — refuse without inventing administrator SUCCESS`,
      liveSessionAuthWiring: "NOT_WIRED",
      externalEffects: "NONE",
    };
  }
  return {
    allowed: true,
    code: "WITHIN_BUDGET",
    reason: `Forged escalation attempts within budget (count=${state.forgedEscalationAttemptCount} max=${state.maxAttempts})`,
    liveSessionAuthWiring: "NOT_WIRED",
    externalEffects: "NONE",
  };
}

export type ForgedEscalationBudgetResult =
  | {
      ok: true;
      state: ForgedEscalationBudgetState;
      decision: ForgedBrowserRoleDecision;
    }
  | {
      ok: false;
      code: "FORGED_ESCALATION_BUDGET_EXHAUSTED";
      state: ForgedEscalationBudgetState;
      decision: ForgedBrowserRoleDecision;
    };

/**
 * Apply honesty bind under the forged-escalation attempt budget fence.
 * Only forged operator→admin tries consume budget; other binds do not.
 * Exhausted budget refuses without escalating effectiveRole.
 */
export function applyForgedEscalationBudget(
  state: ForgedEscalationBudgetState,
  input: {
    sessionRole: string;
    bodyActorRole?: unknown;
    bodyActor_role?: unknown;
    bodyRole?: unknown;
    headerActorRole?: unknown;
    queryActorRole?: unknown;
    cookieActorRole?: unknown;
  },
): ForgedEscalationBudgetResult {
  const resolvedClaim = resolveClientActorRoleClaim({
    ...(input.bodyActorRole !== undefined
      ? { bodyActorRole: input.bodyActorRole }
      : {}),
    ...(input.bodyActor_role !== undefined
      ? { bodyActor_role: input.bodyActor_role }
      : {}),
    ...(input.bodyRole !== undefined ? { bodyRole: input.bodyRole } : {}),
    ...(input.headerActorRole !== undefined
      ? { headerActorRole: input.headerActorRole }
      : {}),
    ...(input.queryActorRole !== undefined
      ? { queryActorRole: input.queryActorRole }
      : {}),
    ...(input.cookieActorRole !== undefined
      ? { cookieActorRole: input.cookieActorRole }
      : {}),
  });
  const forgedEscalation =
    isLocalRole(input.sessionRole) &&
    isForgedRoleEscalationAttempt({
      sessionRole: input.sessionRole,
      bodyActorRole: resolvedClaim,
    });

  if (forgedEscalation) {
    const gate = evaluateForgedEscalationBudgetGate(state);
    if (!gate.allowed) {
      const sessionRole = input.sessionRole as LocalRoleValue;
      return {
        ok: false,
        code: "FORGED_ESCALATION_BUDGET_EXHAUSTED",
        state,
        decision: {
          allowed: false,
          code: "FORGED_ESCALATION_BUDGET_EXHAUSTED",
          sessionRole,
          effectiveRole: sessionRole,
          forgedPayloadIgnored: true,
          reasons: [
            gate.reason,
            "liveSessionAuthWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE",
          ],
          ...honestyBase(),
        },
      };
    }
    const decision = evaluateForgedBrowserRoleHonesty({
      sessionRole: input.sessionRole,
      bodyActorRole: resolvedClaim,
    });
    return {
      ok: true,
      state: {
        ...state,
        forgedEscalationAttemptCount: state.forgedEscalationAttemptCount + 1,
      },
      decision,
    };
  }

  return {
    ok: true,
    state,
    decision: evaluateForgedBrowserRoleHonesty({
      sessionRole: input.sessionRole,
      bodyActorRole: resolvedClaim,
    }),
  };
}

export const FORGED_BROWSER_ROLE_RELATED_CASE_IDS = ["T-X005"] as const;
