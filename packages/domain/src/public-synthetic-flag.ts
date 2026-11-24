/**
 * T-X050 — Public synthetic flag abuse: server grant required.
 *
 * A client/public claim of `ws_synthetic` / `is_synthetic` must never
 * authorize synthetic labeling by itself. Only a server-issued canary
 * grant binds `synthetic=true`. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 */

/** Decision codes for synthetic-flag bind outcomes. */
export const SyntheticFlagDecisionCode = {
  /** Server canary grant present — synthetic authorized. */
  AUTHORIZED: "AUTHORIZED",
  /** Client claimed synthetic without a server canary grant. */
  GRANT_MISSING: "GRANT_MISSING",
  /** No client claim and no grant — not synthetic (no abuse). */
  NO_CLAIM: "NO_CLAIM",
} as const;

export type SyntheticFlagDecisionCodeValue =
  (typeof SyntheticFlagDecisionCode)[keyof typeof SyntheticFlagDecisionCode];

export type BindSyntheticFromServerGrantInput = {
  /**
   * Public/client body claim (`ws_synthetic` / `is_synthetic`).
   * Never trusted alone — discarded unless a server grant is present.
   */
  clientClaimedSynthetic: boolean | undefined;
  /** Server-issued canary grant / host marker present. */
  serverCanaryGrantPresent: boolean;
};

export type BindSyntheticFromServerGrantResult = {
  /** Effective synthetic labeling after server bind. */
  synthetic: boolean;
  /** True when the client claimed synthetic without a server grant. */
  deniedAbuse: boolean;
  code: SyntheticFlagDecisionCodeValue;
  reason: string;
  /** Honesty: fixture/domain path never claims live provider success. */
  liveProviderWiring: "NOT_WIRED";
  externalEffects: "NONE";
};

const PUBLIC_SYNTHETIC_KEYS = ["ws_synthetic", "is_synthetic"] as const;

function normalizePublicSyntheticToken(
  raw: string | undefined | null,
): "true" | "false" | "unknown" | null {
  if (raw === undefined || raw === null) return null;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized.length === 0) return null;
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return "true";
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return "false";
  }
  return "unknown";
}

/**
 * Parse a public form/body synthetic claim from common field names.
 * Returns undefined when neither field is present (or only whitespace).
 *
 * Any positive claim on either `ws_synthetic` or `is_synthetic` wins
 * (OR semantics) so a false on one field cannot mask abuse on the other.
 */
export function parsePublicSyntheticClaim(
  fields: Readonly<Record<string, string | undefined | null>>,
): boolean | undefined {
  let sawFalse = false;
  for (const key of PUBLIC_SYNTHETIC_KEYS) {
    const token = normalizePublicSyntheticToken(fields[key]);
    if (token === null) continue;
    if (token === "true" || token === "unknown") {
      return true;
    }
    if (token === "false") {
      sawFalse = true;
    }
  }
  if (sawFalse) return false;
  return undefined;
}

/**
 * Bind synthetic labeling from a server canary grant only.
 * Client/public synthetic flags are ignored without a grant.
 */
export function bindSyntheticFromServerGrant(
  input: BindSyntheticFromServerGrantInput,
): BindSyntheticFromServerGrantResult {
  const honesty = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
  };

  if (input.serverCanaryGrantPresent) {
    return {
      synthetic: true,
      deniedAbuse: false,
      code: SyntheticFlagDecisionCode.AUTHORIZED,
      reason: "Server canary grant authorizes synthetic marker",
      ...honesty,
    };
  }

  const claimed = input.clientClaimedSynthetic === true;
  if (claimed) {
    return {
      synthetic: false,
      deniedAbuse: true,
      code: SyntheticFlagDecisionCode.GRANT_MISSING,
      reason:
        "Public synthetic flag without server canary grant — GRANT_MISSING",
      ...honesty,
    };
  }

  return {
    synthetic: false,
    deniedAbuse: false,
    code: SyntheticFlagDecisionCode.NO_CLAIM,
    reason: "No client synthetic claim and no server grant — not synthetic",
    ...honesty,
  };
}
